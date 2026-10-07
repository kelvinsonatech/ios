import Foundation

@MainActor
final class CourseRepository {
    private let client: SupabaseClient
    private let cache: ResponseCache
    static let courseSelect = "*,instructor:instructors(*)"

    init(client: SupabaseClient, cache: ResponseCache) {
        self.client = client
        self.cache = cache
    }

    func categories() async throws -> [Category] {
        try await cache.fetch("categories") {
            try await client.from("categories").select().order("sort_order").execute()
        }
    }

    func search(_ filter: CourseFilter, limit: Int = 30, offset: Int = 0) async throws -> [Course] {
        struct Params: Encodable {
            let q: String?
            let categoryId: String?
            let level: String?
            let freeOnly: Bool
            let downloadableOnly: Bool
            let sort: String
            let pageLimit: Int
            let pageOffset: Int
        }
        let query = filter.query.trimmingCharacters(in: .whitespacesAndNewlines)
        let params = Params(
            q: query.isEmpty ? nil : query, categoryId: filter.categoryId, level: filter.level?.rawValue,
            freeOnly: filter.freeOnly, downloadableOnly: filter.downloadableOnly,
            sort: filter.sort.rawValue, pageLimit: limit, pageOffset: offset
        )
        let isDefault = query.isEmpty && filter.categoryId == nil && offset == 0
        guard isDefault else { return try await client.rpc("search_courses", params: params) }
        return try await cache.fetch("courses.default.\(filter.sort.rawValue)") {
            try await client.rpc("search_courses", params: params)
        }
    }

    func course(id: UUID) async throws -> Course {
        try await cache.fetch("course.\(id)") {
            try await client.from("courses").select(Self.courseSelect).eq("id", id).single()
        }
    }

    func curriculum(courseId: UUID) async throws -> [CourseModule] {
        try await cache.fetch("curriculum.\(courseId)") {
            try await client.from("modules")
                .select("*,lessons(*)")
                .eq("course_id", courseId)
                .order("position")
                .filter("lessons.order", "position", "asc")
                .execute()
        }
    }

    func lessonContent(lessonId: UUID) async throws -> LessonContent? {
        try await client.from("lesson_contents").select().eq("lesson_id", lessonId).maybeSingle()
    }

    func attachments(lessonId: UUID) async throws -> [LessonAttachment] {
        try await client.from("lesson_attachments").select().eq("lesson_id", lessonId).order("title").execute()
    }

    func resources(courseId: UUID) async throws -> [CourseResource] {
        try await client.from("course_resources").select().eq("course_id", courseId).order("title").execute()
    }

    func recommended(limit: Int = 10) async throws -> [Course] {
        struct Params: Encodable { let pageLimit: Int }
        return try await cache.fetch("courses.recommended") {
            try await client.rpc("recommended_courses", params: Params(pageLimit: limit))
        }
    }

    func enroll(courseId: UUID) async throws {
        struct Params: Encodable { let courseId: UUID }
        try await client.rpcVoid("enroll_course", params: Params(courseId: courseId))
    }

    func enrollment(courseId: UUID) async throws -> Enrollment? {
        guard let userId = await client.auth.userID else { return nil }
        return try await client.from("enrollments").select()
            .eq("user_id", userId).eq("course_id", courseId).maybeSingle()
    }

    func enrolledCourses() async throws -> [EnrolledCourse] {
        struct Row: Codable {
            let userId: UUID
            let courseId: UUID
            let enrolledAt: Date
            let lastLessonId: UUID?
            let progress: Double
            let completedAt: Date?
            let lastActivityAt: Date?
            let course: Course
            let lastLesson: Lesson?
        }
        guard let userId = await client.auth.userID else { return [] }
        let rows: [Row] = try await cache.fetch("enrollments.\(userId)") {
            try await client.from("enrollments")
                .select("*,course:courses(\(Self.courseSelect)),last_lesson:lessons!enrollments_last_lesson_id_fkey(*)")
                .eq("user_id", userId)
                .order("last_activity_at", ascending: false)
                .execute()
        }
        return rows.map { row in
            EnrolledCourse(
                course: row.course,
                enrollment: Enrollment(userId: row.userId, courseId: row.courseId, enrolledAt: row.enrolledAt,
                                       lastLessonId: row.lastLessonId, progress: row.progress,
                                       completedAt: row.completedAt, lastActivityAt: row.lastActivityAt),
                currentLesson: row.lastLesson
            )
        }
    }

    func lessonProgress(courseId: UUID) async throws -> [LessonProgress] {
        guard let userId = await client.auth.userID else { return [] }
        return try await cache.fetch("lesson-progress.\(courseId)") {
            try await client.from("lesson_progress").select("lesson_id,course_id,playback_position,completed_at,updated_at")
                .eq("user_id", userId).eq("course_id", courseId).execute()
        }
    }

    /// Signed URL for a lesson's video; Storage RLS refuses premium media without entitlement.
    func mediaURL(path: String) async throws -> URL {
        try await client.signedURL(bucket: "lesson-media", path: path, expiresIn: 4 * 3600)
    }
}
