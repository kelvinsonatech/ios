import Foundation

@MainActor
final class ExamRepository {
    private let client: SupabaseClient

    init(client: SupabaseClient) { self.client = client }

    func exams(courseId: UUID? = nil) async throws -> [Exam] {
        var query = client.from("exams").select().eq("is_published", true)
        if let courseId { query = query.eq("course_id", courseId) }
        return try await query.order("title").execute()
    }

    /// Creates an attempt with a server-enforced deadline. Questions arrive without answer keys.
    func start(examId: UUID) async throws -> ExamSession {
        struct Params: Encodable { let examId: UUID }
        return try await client.rpc("start_exam", params: Params(examId: examId))
    }

    func submit(attemptId: UUID, answers: [ExamAnswer]) async throws -> ExamResult {
        struct Params: Encodable { let attemptId: UUID; let answers: [ExamAnswer] }
        return try await client.rpc("submit_exam", params: Params(attemptId: attemptId, answers: answers))
    }
}
