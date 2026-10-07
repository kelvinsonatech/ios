import Foundation
import Observation

@MainActor
@Observable
final class HomeViewModel {
    private(set) var enrolled: Loadable<[EnrolledCourse]> = .idle
    private(set) var recommended: Loadable<[Course]> = .idle
    private(set) var stats: Loadable<DailyStats> = .idle
    private(set) var liveQuizzes: Loadable<[LiveQuiz]> = .idle
    private(set) var challenge: Loadable<DailyChallenge?> = .idle
    private(set) var unreadNotifications = 0

    var challengeAnswer = AnswerSubmission()
    private(set) var challengeResult: AnswerResult?
    private(set) var isSubmittingChallenge = false
    var rewardXP: Int?

    @ObservationIgnored let env: AppEnvironment

    init(env: AppEnvironment) { self.env = env }

    var profile: Profile? { env.session.profile }

    var greeting: String {
        let hour = Calendar.current.component(.hour, from: .now)
        let part = switch hour {
        case 5..<12: "Good morning"
        case 12..<17: "Good afternoon"
        case 17..<22: "Good evening"
        default: "Hello"
        }
        guard let name = profile?.firstName, !name.isEmpty else { return part }
        return "\(part), \(name)"
    }

    /// The most recently active, unfinished course.
    var continueLearning: EnrolledCourse? {
        enrolled.value?.first { $0.enrollment.completedAt == nil } ?? enrolled.value?.first
    }

    func load() async {
        if enrolled.value == nil { enrolled = .loading }
        if recommended.value == nil { recommended = .loading }
        if stats.value == nil { stats = .loading }
        if liveQuizzes.value == nil { liveQuizzes = .loading }
        if challenge.value == nil { challenge = .loading }

        async let enrolledResult = env.courses.enrolledCourses()
        async let recommendedResult = env.courses.recommended()
        async let statsResult = env.progress.todayStats()
        async let liveResult = env.liveQuizzes.upcoming(limit: 5)
        async let challengeResult = env.questions.dailyChallenge()
        async let notificationsResult = env.progress.notifications()

        do { enrolled = .loaded(try await enrolledResult) } catch { enrolled = .failed(.from(error)) }
        do { recommended = .loaded(try await recommendedResult) } catch { recommended = .failed(.from(error)) }
        do { stats = .loaded(try await statsResult) } catch { stats = .failed(.from(error)) }
        do { liveQuizzes = .loaded(try await liveResult) } catch { liveQuizzes = .failed(.from(error)) }
        do { challenge = .loaded(try await challengeResult) } catch { challenge = .failed(.from(error)) }
        unreadNotifications = ((try? await notificationsResult) ?? []).filter { $0.readAt == nil }.count
        await env.session.refreshProfile()
    }

    func submitChallenge() async {
        guard case .loaded(let maybe) = challenge, let daily = maybe, !challengeAnswer.isEmpty else { return }
        isSubmittingChallenge = true
        defer { isSubmittingChallenge = false }
        do {
            let result = try await env.questions.submitDailyChallenge(day: daily.day, submission: challengeAnswer)
            challengeResult = result
            if result.isCorrect { Haptics.success() } else { Haptics.warning() }
            if result.xpAwarded > 0 { rewardXP = result.xpAwarded }
            stats = (try? await env.progress.todayStats()).map(Loadable.loaded) ?? stats
            await env.session.refreshProfile()
        } catch {
            Haptics.error()
        }
    }

    func join(_ quiz: LiveQuiz) async {
        do {
            try await env.liveQuizzes.join(quizId: quiz.id)
            await env.notifications.scheduleLiveQuizReminder(quiz)
            liveQuizzes = (try? await env.liveQuizzes.upcoming(limit: 5)).map(Loadable.loaded) ?? liveQuizzes
            Haptics.success()
        } catch let error as APIError where error == .premiumRequired {
            env.router.showPaywall()
        } catch {
            Haptics.error()
        }
    }
}
