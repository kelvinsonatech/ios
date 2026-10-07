import Foundation

@MainActor
final class LiveQuizRepository {
    private let client: SupabaseClient
    private let realtime: RealtimeClient

    init(client: SupabaseClient, realtime: RealtimeClient) {
        self.client = client
        self.realtime = realtime
    }

    func upcoming(limit: Int = 10) async throws -> [LiveQuiz] {
        struct Params: Encodable { let pageLimit: Int }
        return try await client.rpc("upcoming_live_quizzes", params: Params(pageLimit: limit))
    }

    func join(quizId: UUID) async throws {
        struct Params: Encodable { let quizId: UUID }
        try await client.rpcVoid("join_live_quiz", params: Params(quizId: quizId))
    }

    func state(quizId: UUID) async throws -> LiveQuizState {
        struct Params: Encodable { let quizId: UUID }
        return try await client.rpc("live_quiz_state", params: Params(quizId: quizId))
    }

    /// Points are computed by the database from its own clock; the client only sends its choice.
    func submit(quizId: UUID, position: Int, choiceId: String) async throws -> LiveAnswerResult {
        struct Params: Encodable { let quizId: UUID; let position: Int; let choiceId: String }
        return try await client.rpc("submit_live_answer", params: Params(quizId: quizId, position: position, choiceId: choiceId))
    }

    func leaderboard(quizId: UUID) async throws -> [LiveQuizParticipant] {
        try await client.from("live_quiz_participants")
            .select("user_id,display_name,avatar_url,score,correct_count")
            .eq("quiz_id", quizId)
            .order("score", ascending: false)
            .limit(100)
            .execute()
    }

    func participantChanges(quizId: UUID) async -> AsyncStream<PostgresChange> {
        await realtime.changes(table: "live_quiz_participants", filter: "quiz_id=eq.\(quizId)", topic: "live-quiz-\(quizId)")
    }
}
