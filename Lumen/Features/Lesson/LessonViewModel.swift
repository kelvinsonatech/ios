import Foundation
import AVKit
import SwiftData
import Observation

@MainActor
@Observable
final class LessonViewModel {
    private(set) var lessonId: UUID
    let courseId: UUID

    private(set) var lesson: Loadable<Lesson> = .idle
    private(set) var content: LessonContent?
    private(set) var contentLocked = false
    private(set) var attachments: [LessonAttachment] = []
    private(set) var previous: Lesson?
    private(set) var next: Lesson?
    private(set) var courseTitle = ""
    private(set) var isCompleted = false
    private(set) var player: AVPlayer?
    private(set) var isMarkingComplete = false
    private(set) var isBookmarked = false
    var reward: ProgressReward?
    var errorMessage: String?

    @ObservationIgnored let env: AppEnvironment
    @ObservationIgnored private let context: ModelContext
    @ObservationIgnored private var timeObserver: Any?
    @ObservationIgnored private var lastSyncedPosition: Double = 0
    @ObservationIgnored private var appearedAt = Date()
    @ObservationIgnored private var watchedSeconds = 0

    init(env: AppEnvironment, lessonId: UUID, courseId: UUID) {
        self.env = env
        self.lessonId = lessonId
        self.courseId = courseId
        self.context = ModelContext(env.modelContainer)
    }

    var isDownloaded: Bool { env.downloads.isDownloaded(.lessonNotes, id: lessonId) }

    // MARK: Loading

    func load() async {
        lesson = .loading
        appearedAt = .now
        do {
            let modules = try await env.courses.curriculum(courseId: courseId)
            let lessons = modules.flatMap(\.lessons)
            guard let index = lessons.firstIndex(where: { $0.id == lessonId }) else { throw APIError.notFound }
            let current = lessons[index]
            previous = index > 0 ? lessons[index - 1] : nil
            next = index + 1 < lessons.count ? lessons[index + 1] : nil
            courseTitle = (try? await env.courses.course(id: courseId))?.title ?? ""
            lesson = .loaded(current)

            await loadContent(for: current)
            attachments = (try? await env.courses.attachments(lessonId: lessonId)) ?? []
            let progress = (try? await env.courses.lessonProgress(courseId: courseId))?.first { $0.lessonId == lessonId }
            isCompleted = progress?.isCompleted ?? false
            isBookmarked = await env.progress.isBookmarked(.lesson, id: lessonId)
            await preparePlayer(for: current, serverPosition: progress?.playbackPosition ?? 0)
        } catch {
            lesson = .failed(.from(error))
        }
    }

    private func loadContent(for lesson: Lesson) async {
        if lesson.isPremium && !env.session.isPremium {
            contentLocked = true
            return
        }
        do {
            content = try await env.courses.lessonContent(lessonId: lesson.id)
            contentLocked = content == nil && lesson.isPremium
        } catch {
            // Offline: use the downloaded notes snapshot if available.
            content = env.downloads.offlinePayload(.lessonNotes, id: lesson.id, as: LessonContent.self)
            if content == nil { errorMessage = APIError.from(error).localizedDescription }
        }
    }

    // MARK: Playback

    private func preparePlayer(for lesson: Lesson, serverPosition: Double) async {
        teardownPlayer()
        guard let path = lesson.videoPath, !contentLocked else { return }
        let url: URL
        if let local = env.downloads.localVideoURL(lessonId: lesson.id) {
            url = local
        } else {
            do { url = try await env.courses.mediaURL(path: path) }
            catch {
                if APIError.from(error) == .forbidden { contentLocked = true }
                return
            }
        }
        let item = AVPlayerItem(url: url)
        let player = AVPlayer(playerItem: item)
        player.allowsExternalPlayback = true
        player.appliesMediaSelectionCriteriaAutomatically = true

        let resume = max(localPosition(), serverPosition)
        if resume > 5, Double(lesson.durationSeconds) - resume > 10 {
            await player.seek(to: CMTime(seconds: resume, preferredTimescale: 600))
        }
        lastSyncedPosition = resume
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 5, preferredTimescale: 600), queue: .main) { [weak self] time in
            MainActor.assumeIsolated { self?.handleTick(time.seconds) }
        }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        self.player = player
    }

    private func handleTick(_ seconds: Double) {
        guard seconds.isFinite, let lesson = lesson.value else { return }
        if player?.timeControlStatus == .playing { watchedSeconds += 5 }
        savePositionLocally(seconds, lesson: lesson)
        if abs(seconds - lastSyncedPosition) >= 30 {
            lastSyncedPosition = seconds
            Task { await syncProgress(position: seconds, completed: false) }
        }
        // Auto-complete when 90% of the video has been watched.
        if !isCompleted, lesson.durationSeconds > 0, seconds / Double(lesson.durationSeconds) >= 0.9 {
            Task { await markCompleted() }
        }
    }

    private func localPosition() -> Double {
        let id = lessonId
        let descriptor = FetchDescriptor<PlaybackPosition>(predicate: #Predicate { $0.lessonId == id })
        return (try? context.fetch(descriptor).first?.seconds) ?? 0
    }

    private func savePositionLocally(_ seconds: Double, lesson: Lesson) {
        let id = lesson.id
        let descriptor = FetchDescriptor<PlaybackPosition>(predicate: #Predicate { $0.lessonId == id })
        if let existing = try? context.fetch(descriptor).first {
            existing.seconds = seconds
            existing.updatedAt = .now
        } else {
            context.insert(PlaybackPosition(lessonId: id, courseId: lesson.courseId, seconds: seconds))
        }
        try? context.save()
    }

    private func syncProgress(position: Double, completed: Bool) async {
        let payload = LessonProgressPayload(lessonId: lessonId, position: position, secondsWatched: watchedSeconds,
                                            completed: completed, clientUpdatedAt: .now)
        watchedSeconds = 0
        if let reward = await env.progress.recordLessonProgress(payload), completed, reward.xpAwarded > 0 {
            self.reward = reward
        }
    }

    func markCompleted() async {
        guard !isCompleted else { return }
        isMarkingComplete = true
        defer { isMarkingComplete = false }
        isCompleted = true
        Haptics.success()
        await syncProgress(position: player?.currentTime().seconds ?? 0, completed: true)
        await env.session.refreshProfile()
    }

    func toggleBookmark() async {
        if let state = try? await env.progress.toggleBookmark(.lesson, id: lessonId) {
            isBookmarked = state
            Haptics.tap()
        }
    }

    func download() {
        guard let lesson = lesson.value else { return }
        env.downloads.downloadLesson(lesson, courseTitle: courseTitle)
        if let error = env.downloads.lastError { errorMessage = error }
    }

    func askAI() {
        guard let lesson = lesson.value else { return }
        env.router.askTutor(TutorContext(lessonId: lesson.id, lessonTitle: lesson.title,
                                         seedPrompt: "Help me understand the lesson \"\(lesson.title)\".", mode: .explain))
    }

    /// Called when the view disappears: flush position and study time.
    func leave() async {
        player?.pause()
        if let seconds = player?.currentTime().seconds, seconds.isFinite, seconds > 0 {
            await syncProgress(position: seconds, completed: false)
        }
        let minutes = Int(Date().timeIntervalSince(appearedAt) / 60)
        await env.progress.logStudyMinutes(minutes, source: "lesson")
        teardownPlayer()
    }

    private func teardownPlayer() {
        if let timeObserver { player?.removeTimeObserver(timeObserver) }
        timeObserver = nil
        player?.pause()
        player = nil
    }
}
