import SwiftUI
import AVFoundation

/// Hands-free tutoring. The microphone is only on while the student is actively
/// speaking (tap to start, tap to send); nothing is recorded or stored.
struct VoiceTutorView: View {
    let tutor: TutorViewModel
    @State private var recognizer = SpeechRecognizer()
    @State private var speaker = SpeechSynthesizer()
    @State private var hasConsented = UserDefaults.standard.bool(forKey: "voice.consented")
    @State private var autoSpeak = true
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        NavigationStack {
            VStack(spacing: Theme.Spacing.xl) {
                if !hasConsented {
                    consent
                } else {
                    transcriptArea
                    Spacer()
                    playbackControls
                    micButton
                    statusText
                }
            }
            .pagePadding()
            .padding(.vertical, Theme.Spacing.xl)
            .background(Theme.Palette.background)
            .navigationTitle("Voice tutor")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { recognizer.stop(); speaker.stop(); dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Toggle("Read replies aloud", isOn: $autoSpeak)
                        Picker("Voice", selection: $speaker.voiceIdentifier) {
                            Text("System default").tag(String?.none)
                            ForEach(speaker.availableVoices, id: \.identifier) { voice in
                                Text("\(voice.name)\(voice.quality == .enhanced || voice.quality == .premium ? " (Enhanced)" : "")")
                                    .tag(String?.some(voice.identifier))
                            }
                        }
                        Picker("Speed", selection: $speaker.rate) {
                            Text("Slower").tag(AVSpeechUtteranceDefaultSpeechRate * 0.8)
                            Text("Normal").tag(AVSpeechUtteranceDefaultSpeechRate)
                            Text("Faster").tag(AVSpeechUtteranceDefaultSpeechRate * 1.15)
                        }
                    } label: { Image(systemName: "slider.horizontal.3") }
                    .accessibilityLabel("Voice settings")
                }
            }
            .onChange(of: tutor.isStreaming) { wasStreaming, isStreaming in
                guard wasStreaming, !isStreaming, autoSpeak,
                      let reply = tutor.messages.last(where: { $0.role == .assistant }), !reply.content.isEmpty else { return }
                speaker.speak(TutorViewModel.displayText(reply.content))
            }
            .onDisappear { recognizer.stop(); speaker.stop() }
        }
    }

    private var consent: some View {
        VStack(spacing: Theme.Spacing.lg) {
            Spacer()
            Image(systemName: "mic.badge.plus").font(.system(size: 56)).foregroundStyle(Theme.Palette.brand)
            Text("Talk to your tutor").font(Theme.Typography.title)
            Text("Lumen listens only while the microphone button is active. Speech is transcribed on your device when possible, and audio is never saved. Only the transcribed text is sent to your tutor.")
                .multilineTextAlignment(.center)
                .font(Theme.Typography.callout)
                .foregroundStyle(Theme.Palette.textSecondary)
            Spacer()
            Button("Allow voice tutoring") {
                UserDefaults.standard.set(true, forKey: "voice.consented")
                hasConsented = true
            }
            .buttonStyle(.primary)
            Button("Not now") { dismiss() }.buttonStyle(.secondary)
        }
    }

    private var transcriptArea: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                if let reply = tutor.messages.last(where: { $0.role == .assistant }) {
                    MessageBubble(message: reply, isStreaming: tutor.isStreaming)
                }
                if !recognizer.transcript.isEmpty {
                    Text(recognizer.transcript)
                        .font(Theme.Typography.title)
                        .foregroundStyle(Theme.Palette.textPrimary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityLabel("You said: \(recognizer.transcript)")
                } else if tutor.messages.isEmpty {
                    Text("Tap the microphone and ask a question out loud.")
                        .font(Theme.Typography.title)
                        .foregroundStyle(Theme.Palette.textTertiary)
                }
            }
        }
    }

    @ViewBuilder private var playbackControls: some View {
        if speaker.state != .idle {
            HStack(spacing: Theme.Spacing.xl) {
                Button {
                    speaker.state == .paused ? speaker.resume() : speaker.pause()
                } label: {
                    Image(systemName: speaker.state == .paused ? "play.fill" : "pause.fill").font(.title2)
                }
                .accessibilityLabel(speaker.state == .paused ? "Resume speech" : "Pause speech")
                Button { speaker.stop() } label: { Image(systemName: "stop.fill").font(.title2) }
                    .accessibilityLabel("Stop speech")
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.vertical, Theme.Spacing.md)
            .background(Theme.Palette.surfaceMuted, in: Capsule())
        }
    }

    private var micButton: some View {
        let listening = recognizer.status == .listening
        return Button {
            if listening {
                let text = recognizer.stop()
                if !text.isEmpty { tutor.send(text) }
            } else {
                speaker.stop()
                Task { await recognizer.start() }
            }
        } label: {
            ZStack {
                Circle()
                    .fill(listening ? Theme.Palette.danger.opacity(0.15) : Theme.Palette.brandSoft)
                    .frame(width: 140, height: 140)
                    .scaleEffect(listening && !reduceMotion ? 1 + CGFloat(recognizer.level) * 0.4 : 1)
                    .animation(.easeOut(duration: 0.1), value: recognizer.level)
                Circle()
                    .fill(listening ? Theme.Palette.danger : Theme.Palette.brand)
                    .frame(width: 96, height: 96)
                Image(systemName: listening ? "paperplane.fill" : "mic.fill")
                    .font(.system(size: 36, weight: .semibold))
                    .foregroundStyle(.white)
            }
        }
        .buttonStyle(.plain)
        .disabled(tutor.isStreaming)
        .accessibilityLabel(listening ? "Send question" : "Start speaking")
        .sensoryFeedback(.impact, trigger: listening)
    }

    @ViewBuilder private var statusText: some View {
        switch recognizer.status {
        case .listening: Text("Listening… tap to send").foregroundStyle(Theme.Palette.danger)
        case .denied: Text("Microphone or speech access is off. Enable it in Settings to use voice.").foregroundStyle(Theme.Palette.danger)
        case .unavailable: Text("Speech recognition isn't available for your language right now.")
        case .failed(let message): Text(message).foregroundStyle(Theme.Palette.danger)
        case .requestingPermission: Text("Requesting permission…")
        case .idle: Text(tutor.isStreaming ? "Your tutor is thinking…" : "Tap to speak")
        }
    }
}
