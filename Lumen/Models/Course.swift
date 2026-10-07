import Foundation

enum Difficulty: String, Codable, CaseIterable, Identifiable, Sendable {
    case beginner, intermediate, advanced
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
}

struct Instructor: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let title: String?
    let bio: String?
    let avatarUrl: URL?
}

struct Course: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let slug: String
    let title: String
    let subtitle: String?
    let description: String
    let categoryId: String
    let level: Difficulty
    let thumbnailUrl: URL?
    let coverUrl: URL?
    let isPremium: Bool
    let isDownloadable: Bool
    let estimatedMinutes: Int
    let lessonCount: Int
    let rating: Double?
    let ratingCount: Int
    let studentCount: Int
    let tags: [String]
    let instructor: Instructor?
    let publishedAt: Date?

    var formattedDuration: String { Duration.seconds(estimatedMinutes * 60).studyLabel }
}

struct CourseModule: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let courseId: UUID
    let title: String
    let position: Int
    var lessons: [Lesson]
}

struct Lesson: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let moduleId: UUID
    let courseId: UUID
    let title: String
    let summary: String?
    let position: Int
    let durationSeconds: Int
    let videoPath: String?
    let captionsPath: String?
    let isPremium: Bool
    let isDownloadable: Bool
    let hasPractice: Bool

    var hasVideo: Bool { videoPath != nil }
}

struct KeyTerm: Codable, Hashable, Sendable, Identifiable {
    var id: String { term }
    let term: String
    let definition: String
}

struct WorkedExample: Codable, Hashable, Sendable, Identifiable {
    var id: String { title }
    let title: String
    let body: String
}

/// Premium-gated lesson body (RLS hides it from non-entitled students).
struct LessonContent: Codable, Hashable, Sendable {
    let lessonId: UUID
    let notesMarkdown: String
    let keyTerms: [KeyTerm]
    let examples: [WorkedExample]
    let imageUrls: [URL]
}

struct LessonAttachment: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let lessonId: UUID
    let title: String
    let filePath: String
    let mimeType: String
    let byteSize: Int64
}

struct CourseResource: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let courseId: UUID
    let title: String
    let kind: String
    let filePath: String?
    let url: URL?
}

struct Enrollment: Codable, Hashable, Sendable {
    let userId: UUID
    let courseId: UUID
    let enrolledAt: Date
    var lastLessonId: UUID?
    var progress: Double
    var completedAt: Date?
    var lastActivityAt: Date?
}

/// An enrolled course joined with the student's progress, used on Home.
struct EnrolledCourse: Identifiable, Hashable, Sendable {
    var id: UUID { course.id }
    let course: Course
    let enrollment: Enrollment
    let currentLesson: Lesson?
}

struct LessonProgress: Codable, Hashable, Sendable {
    let lessonId: UUID
    let courseId: UUID
    var playbackPosition: Double
    var completedAt: Date?
    var updatedAt: Date?

    var isCompleted: Bool { completedAt != nil }
}

enum CourseSort: String, CaseIterable, Identifiable, Sendable {
    case relevance, popular, rating, newest, shortest
    var id: String { rawValue }
    var title: String {
        switch self {
        case .relevance: "Best match"
        case .popular: "Most popular"
        case .rating: "Highest rated"
        case .newest: "Newest"
        case .shortest: "Shortest"
        }
    }
}

struct CourseFilter: Equatable, Sendable {
    var query = ""
    var categoryId: String?
    var level: Difficulty?
    var freeOnly = false
    var downloadableOnly = false
    var sort: CourseSort = .relevance
}

extension Duration {
    /// "45 min", "3 h 20 min"
    var studyLabel: String {
        let minutes = Int(components.seconds / 60)
        if minutes < 60 { return "\(max(minutes, 1)) min" }
        let h = minutes / 60, m = minutes % 60
        return m == 0 ? "\(h) h" : "\(h) h \(m) min"
    }
}
