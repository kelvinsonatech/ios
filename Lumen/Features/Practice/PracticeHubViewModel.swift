import Foundation
import Observation

@MainActor
@Observable
final class PracticeHubViewModel {
    private(set) var subjects: [String] = []
    private(set) var topics: Loadable<[Topic]> = .idle
    private(set) var performance: [TopicPerformance] = []
    private(set) var enrolledCourses: [EnrolledCourse] = []

    // Custom practice configuration
    var customSubject: String?
    var customTopicId: UUID?
    var customDifficulty: Int?
    var customCount = 10

    @ObservationIgnored let env: AppEnvironment

    init(env: AppEnvironment) { self.env = env }

    var weakestTopics: [TopicPerformance] {
        performance.filter { $0.total >= 3 }.sorted { $0.accuracy < $1.accuracy }.prefix(3).map { $0 }
    }

    func load() async {
        async let subjectsResult = env.questions.subjects()
        async let performanceResult = env.questions.topicPerformance()
        async let coursesResult = env.courses.enrolledCourses()
        subjects = (try? await subjectsResult) ?? subjects
        performance = (try? await performanceResult) ?? performance
        enrolledCourses = (try? await coursesResult) ?? enrolledCourses
    }

    func loadTopics(subject: String?) async {
        topics = .loading
        do { topics = .loaded(try await env.questions.topics(subject: subject)) }
        catch { topics = .failed(.from(error)) }
    }

    func request(for mode: PracticeMode) -> PracticeRequest {
        switch mode {
        case .custom:
            PracticeRequest(mode: .custom, topicId: customTopicId, subject: customSubject,
                            difficulty: customDifficulty, count: customCount)
        default:
            PracticeRequest(mode: mode, count: 10)
        }
    }
}
