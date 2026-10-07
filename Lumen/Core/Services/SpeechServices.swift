import Foundation
import AVFoundation
import Speech
import Observation

/// On-device-preferred live transcription. The microphone is only active while
/// `start()` is running; audio buffers are streamed to the recognizer and never stored.
@Observable
@MainActor
final class SpeechRecognizer {
    enum Status: Equatable { case idle, requestingPermission, listening, denied, unavailable, failed(String) }

    private(set) var transcript = ""
    private(set) var status: Status = .idle
    private(set) var level: Float = 0

    @ObservationIgnored private let audioEngine = AVAudioEngine()
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?
    @ObservationIgnored private var recognizer = SFSpeechRecognizer(locale: Locale.current)

    func setLocale(_ locale: Locale) {
        recognizer = SFSpeechRecognizer(locale: locale)
    }

    func start() async {
        guard status != .listening else { return }
        status = .requestingPermission
        guard await Self.requestPermissions() else { status = .denied; return }
        guard let recognizer, recognizer.isAvailable else { status = .unavailable; return }

        transcript = ""
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker, .allowBluetooth])
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
            request.addsPunctuation = true
            self.request = request

            let input = audioEngine.inputNode
            let format = input.outputFormat(forBus: 0)
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                request.append(buffer)
                let level = Self.rms(buffer)
                Task { @MainActor in self?.level = level }
            }
            audioEngine.prepare()
            try audioEngine.start()
            status = .listening

            task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                let text = result?.bestTranscription.formattedString
                let isFinal = result?.isFinal ?? false
                Task { @MainActor in
                    guard let self else { return }
                    if let text { self.transcript = text }
                    if error != nil || isFinal { self.stopAudio() }
                }
            }
        } catch {
            stopAudio()
            status = .failed(error.localizedDescription)
        }
    }

    /// Stops listening and returns the final transcript.
    @discardableResult
    func stop() -> String {
        request?.endAudio()
        stopAudio()
        return transcript
    }

    private func stopAudio() {
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        task?.finish()
        task = nil
        request = nil
        level = 0
        if status == .listening { status = .idle }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private static func requestPermissions() async -> Bool {
        let speech = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) }
        }
        guard speech else { return false }
        return await AVAudioApplication.requestRecordPermission()
    }

    nonisolated private static func rms(_ buffer: AVAudioPCMBuffer) -> Float {
        guard let data = buffer.floatChannelData?[0] else { return 0 }
        let count = Int(buffer.frameLength)
        guard count > 0 else { return 0 }
        var sum: Float = 0
        for i in 0..<count { sum += data[i] * data[i] }
        return min(1, (sum / Float(count)).squareRoot() * 8)
    }
}

/// Text-to-speech for tutor replies with pause/resume/stop and voice selection.
@Observable
@MainActor
final class SpeechSynthesizer: NSObject, AVSpeechSynthesizerDelegate {
    enum State { case idle, speaking, paused }

    private(set) var state: State = .idle
    var rate: Float = AVSpeechUtteranceDefaultSpeechRate
    var voiceIdentifier: String? {
        didSet { UserDefaults.standard.set(voiceIdentifier, forKey: "tutor.voice") }
    }

    @ObservationIgnored private let synthesizer = AVSpeechSynthesizer()

    override init() {
        voiceIdentifier = UserDefaults.standard.string(forKey: "tutor.voice")
        super.init()
        synthesizer.delegate = self
    }

    /// Voices for the current language, best quality first.
    var availableVoices: [AVSpeechSynthesisVoice] {
        let language = Locale.current.language.languageCode?.identifier ?? "en"
        return AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.hasPrefix(language) }
            .sorted { $0.quality.rawValue > $1.quality.rawValue }
    }

    func speak(_ text: String) {
        stop()
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? session.setActive(true)
        let utterance = AVSpeechUtterance(string: Self.plainText(from: text))
        utterance.rate = rate
        if let voiceIdentifier, let voice = AVSpeechSynthesisVoice(identifier: voiceIdentifier) {
            utterance.voice = voice
        } else {
            utterance.voice = availableVoices.first ?? AVSpeechSynthesisVoice(language: Locale.current.identifier)
        }
        synthesizer.speak(utterance)
        state = .speaking
    }

    func pause() {
        if synthesizer.pauseSpeaking(at: .word) { state = .paused }
    }

    func resume() {
        if synthesizer.continueSpeaking() { state = .speaking }
    }

    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
        state = .idle
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.state = .idle }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.state = .idle }
    }

    /// Strips Markdown so the voice doesn't read symbols aloud.
    static func plainText(from markdown: String) -> String {
        var text = markdown
        text = text.replacingOccurrences(of: "```[\\s\\S]*?```", with: " ", options: .regularExpression)
        for token in ["**", "__", "`", "#", ">", "*"] { text = text.replacingOccurrences(of: token, with: "") }
        text = text.replacingOccurrences(of: "\\[(.*?)\\]\\(.*?\\)", with: "$1", options: .regularExpression)
        return text
    }
}
