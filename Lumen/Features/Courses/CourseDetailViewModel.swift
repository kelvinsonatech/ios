import Foundation
import Observation

@MainActor
@Observable
final class CourseDetailViewModel {
    enum Section: String, CaseIterable, Identifiable {
        case overview, lessons, resources, practice
        var id: String { rawValue }
        var title: String { rawValue.capitalized }
    }

    let courseId: UUID
    var section: Section = .lessons
    private(set) var course: Loadable<Course> = .idle
    private(set) var modules: [CourseModule] = []
    private(set) var resources: [CourseResource] = []
    private(set) var exams: [Exam] = []
    private(set) var topics: [Topic] = []
    private(set) var enrollment: Enrollment?
    private(set) var progressByLesson: [UUID: LessonProgress] = [:]
    private(set) var isEnrolling = false
    private(set) var isBookmarked = false
    var errorMessage: String?

    @ObservationIgnored let env: AppEnvironment

    init(env: AppEnvironment, courseId: UUID) {
        self.env = env
        self.courseId = courseId
    }

    var allLessons: [Lesson] { modules.flatMap(\.lessons) }
    var completedCount: Int { allLessons.filter { progressByLesson[$0.id]?.isCompleted == true }.count }
    var progress: Double { enrollment?.progress ?? 0 }
    var isEnrolled: Bool { enrollment != nil }

    /// First incomplete lesson, or the enrollment's last lesson.
    var nextLesson: Lesson? {
        if let last = enrollment?.lastLessonId, let lesson = allLessons.first(where: { $0.id == last }),
           progressByLesson[last]?.isCompleted != true { return lesson }
        return allLessons.first { progressByLesson[$0.id]?.isCompleted != true } ?? allLessons.first
    }

    func isLocked(_ lesson: Lesson) -> Bool {
        lesson.isPremium && !env.session.isPremium
    }

    func load() async {
        if course.value == nil { course = .loading }
        do {
            course = .loaded(try await env.courses.course(id: courseId))
        } catch {
            course = .failed(.from(error))
            return
        }
        async let modulesResult = env.courses.curriculum(courseId: courseId)
        async let enrollmentResult = env.courses.enrollment(courseId: courseId)
        async let progressResult = env.courses.lessonProgress(courseId: courseId)
        async let resourcesResult = env.courses.resources(courseId: courseId)
        async let examsResult = env.exams.exams(courseId: courseId)
        async let topicsResult = env.questions.topics(courseId: courseId)
        async let bookmarkResult = env.progress.isBookmarked(.course, id: courseId)

        modules = (try? await modulesResult) ?? modules
        enrollment = (try? await enrollmentResult) ?? enrollment
        let progressList = (try? await progressResult) ?? []
        progressByLesson = Dictionary(progressList.map { ($0.lessonId, $0) }, uniquingKeysWith: { a, _ in a })
        resources = (try? await resourcesResult) ?? resources
        exams = (try? await examsResult) ?? exams
        topics = (try? await topicsResult) ?? topics
        isBookmarked = await bookmarkResult
    }

    func enroll() async {
        guard let course = course.value else { return }
        if course.isPremium && !env.session.isPremium {
            env.router.showPaywall()
            return
        }
        isEnrolling = true
        defer { isEnrolling = false }
        do {
            try await env.courses.enroll(courseId: courseId)
            enrollment = try await env.courses.enrollment(courseId: courseId)
            Haptics.success()
        } catch let error as APIError where error == .premiumRequired {
            env.router.showPaywall()
        } catch {
            errorMessage = APIError.from(error).localizedDescription
        }
    }

    func toggleBookmark() async {
        if let state = try? await env.progress.toggleBookmark(.course, id: courseId) {
            isBookmarked = state
            Haptics.tap()
        }
    }

    func downloadCourse() {
        guard let course = course.value, course.isDownloadable else { return }
        if course.isPremium && !env.session.isPremium { env.router.showPaywall(); return }
        for lesson in allLessons where lesson.isDownloadable { env.downloads.downloadLesson(lesson, courseTitle: course.title) }
        env.downloads.downloadQuizSet(course: course)
        if let error = env.downloads.lastError { errorMessage = error }
    }
}
