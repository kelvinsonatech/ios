import Foundation
import Observation

@MainActor
@Observable
final class ExamListViewModel {
    let courseId: UUID?
    private(set) var exams: Loadable<[Exam]> = .idle
    @ObservationIgnored let env: AppEnvironment

    init(env: AppEnvironment, courseId: UUID?) {
        self.env = env
        self.courseId = courseId
    }

    func load() async {
        if exams.value == nil { exams = .loading }
        do { exams = .loaded(try await env.exams.exams(courseId: courseId)) }
        catch { exams = .failed(.from(error)) }
    }
}

@MainActor
@Observable
final class ExamViewModel {
    enum Phase: Equatable { case starting, inProgress, submitting, finished, failed(String) }

    let exam: Exam
    private(set) var phase: Phase = .starting
    private(set) var session: ExamSession?
    private(set) var answers: [UUID: AnswerSubmission] = [:]
    private(set) var flagged: Set<UUID> = []
    private(set) var result: ExamResult?
    var index = 0
    var showNavigator = false
    var confirmSubmit = false

    @ObservationIgnored let env: AppEnvironment
    @ObservationIgnored private var deadlineTask: Task<Void, Never>?

    init(env: AppEnvironment, exam: Exam) {
        self.env = env
        self.exam = exam
    }

    var questions: [Question] { session?.questions ?? [] }
    var current: Question? { questions.indices.contains(index) ? questions[index] : nil }
    var answeredCount: Int { answers.values.filter { !$0.isEmpty }.count }
    var unansweredCount: Int { questions.count - answeredCount }

    func answerBinding(for id: UUID) -> AnswerSubmission {
        answers[id] ?? AnswerSubmission()
    }

    func setAnswer(_ answer: AnswerSubmission, for id: UUID) {
        answers[id] = answer
    }

    func start() async {
        guard session == nil else { return }
        if exam.isPremium && !env.session.isPremium {
            phase = .failed("This exam is part of Lumen Premium.")
            env.router.showPaywall()
            return
        }
        do {
            let session = try await env.exams.start(examId: exam.id)
            self.session = session
            phase = .inProgress
            scheduleAutoSubmit(at: session.deadline)
        } catch {
            phase = .failed(APIError.from(error).localizedDescription)
        }
    }

    func toggleFlag() {
        guard let id = current?.id else { return }
        if flagged.contains(id) { flagged.remove(id) } else { flagged.insert(id) }
        Haptics.tap()
    }

    func go(to newIndex: Int) {
        guard questions.indices.contains(newIndex) else { return }
        Haptics.selection()
        index = newIndex
        showNavigator = false
    }

    func submit() async {
        guard let session, phase == .inProgress else { return }
        phase = .submitting
        deadlineTask?.cancel()
        let payload = session.questions.map { q in
            let a = answers[q.id] ?? AnswerSubmission()
            return ExamAnswer(questionId: q.id, choiceIds: a.choiceIds, text: a.text)
        }
        // Retry transient failures: an exam submission must not be lost.
        for attempt in 0..<3 {
            do {
                result = try await env.exams.submit(attemptId: session.attemptId, answers: payload)
                phase = .finished
                Haptics.success()
                await env.session.refreshProfile()
                return
            } catch {
                let apiError = APIError.from(error)
                if !apiError.isRetryable || attempt == 2 {
                    phase = .failed(apiError.localizedDescription)
                    return
                }
                try? await Task.sleep(for: .seconds(Double(attempt + 1) * 2))
            }
        }
    }

    func askAI(about review: ExamResult.Review) {
        env.router.askTutor(TutorContext(
            questionId: review.questionId, submittedAnswer: review.submitted,
            seedPrompt: "I got this exam question wrong. Explain the correct answer and where my thinking went wrong.",
            mode: .explain
        ))
    }

    private func scheduleAutoSubmit(at deadline: Date) {
        deadlineTask?.cancel()
        deadlineTask = Task { [weak self] in
            let interval = deadline.timeIntervalSinceNow
            if interval > 0 { try? await Task.sleep(for: .seconds(interval)) }
            guard !Task.isCancelled else { return }
            Haptics.warning()
            await self?.submit()
        }
    }
}
