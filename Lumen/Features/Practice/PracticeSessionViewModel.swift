import Foundation
import Observation

@MainActor
@Observable
final class PracticeSessionViewModel {
    let title: String
    let request: PracticeRequest

    private(set) var questions: Loadable<[Question]> = .idle
    private(set) var index = 0
    var answer = AnswerSubmission()
    private(set) var result: AnswerResult?
    private(set) var isChecking = false
    private(set) var correctCount = 0
    private(set) var xpEarned = 0
    private(set) var isFinished = false
    private(set) var bookmarked: Set<UUID> = []
    var errorMessage: String?

    @ObservationIgnored let env: AppEnvironment
    @ObservationIgnored private var offlineKeys: [UUID: OfflineQuestion] = [:]
    @ObservationIgnored private let startedAt = Date()

    init(env: AppEnvironment, request: PracticeRequest, title: String) {
        self.env = env
        self.request = request
        self.title = title
    }

    var current: Question? {
        guard let list = questions.value, list.indices.contains(index) else { return nil }
        return list[index]
    }

    var total: Int { questions.value?.count ?? 0 }
    var progress: Double { total == 0 ? 0 : Double(index + (result == nil ? 0 : 1)) / Double(total) }
    var isOfflineSession: Bool { !offlineKeys.isEmpty }

    func load() async {
        guard questions.value == nil else { return }
        questions = .loading
        do {
            let list = try await env.questions.practiceQuestions(request)
            questions = list.isEmpty
                ? .failed(.server(status: 404, message: "No questions match this selection yet. Try a broader filter."))
                : .loaded(list)
        } catch {
            // Offline: fall back to a downloaded quiz set when one exists.
            if let offline = offlineSet(), !offline.isEmpty {
                offlineKeys = Dictionary(uniqueKeysWithValues: offline.map { ($0.question.id, $0) })
                questions = .loaded(Array(offline.shuffled().prefix(request.count)).map(\.question))
            } else {
                questions = .failed(.from(error))
            }
        }
    }

    func check() async {
        guard let question = current, !answer.isEmpty, result == nil else { return }
        isChecking = true
        defer { isChecking = false }
        if let offline = offlineKeys[question.id] {
            apply(offline.grade(answer))
            return
        }
        do {
            apply(try await env.questions.check(questionId: question.id, submission: answer, context: "practice"))
        } catch {
            errorMessage = APIError.from(error).localizedDescription
        }
    }

    func next() {
        guard result != nil else { return }
        if index + 1 >= total {
            finish()
        } else {
            index += 1
            answer = AnswerSubmission()
            result = nil
        }
    }

    func toggleBookmark() async {
        guard let id = current?.id else { return }
        do {
            let isOn = try await env.progress.toggleBookmark(.question, id: id)
            if isOn { bookmarked.insert(id) } else { bookmarked.remove(id) }
            Haptics.tap()
        } catch {
            errorMessage = APIError.from(error).localizedDescription
        }
    }

    func askAI() {
        guard let question = current else { return }
        env.router.askTutor(TutorContext(
            questionId: question.id, submittedAnswer: answer,
            seedPrompt: result?.isCorrect == false ? "I got this question wrong. Can you help me understand why?" : "Can you explain this question?",
            mode: .explain
        ))
    }

    private func apply(_ result: AnswerResult) {
        self.result = result
        if result.isCorrect {
            correctCount += 1
            Haptics.success()
        } else {
            Haptics.warning()
        }
        xpEarned += result.xpAwarded
    }

    private func finish() {
        isFinished = true
        let minutes = Int(Date().timeIntervalSince(startedAt) / 60)
        Task { await env.progress.logStudyMinutes(minutes, source: "practice") }
    }

    private func offlineSet() -> [OfflineQuestion]? {
        if let courseId = request.courseId {
            return env.downloads.offlinePayload(.quizSet, id: courseId, as: [OfflineQuestion].self)
        }
        // Any downloaded set will do for quick practice offline.
        return env.downloads.items
            .filter { $0.kind == .quizSet && $0.state == .completed }
            .compactMap { env.downloads.offlinePayload(.quizSet, id: $0.remoteId, as: [OfflineQuestion].self) }
            .flatMap { $0 }
    }
}
