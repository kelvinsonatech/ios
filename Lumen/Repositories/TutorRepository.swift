import Foundation

@MainActor
final class TutorRepository {
    private let client: SupabaseClient

    init(client: SupabaseClient) { self.client = client }

    func conversations() async throws -> [TutorConversation] {
        try await client.from("tutor_conversations").select("id,title,mode,lesson_id,updated_at")
            .order("updated_at", ascending: false).limit(50).execute()
    }

    func messages(conversationId: UUID) async throws -> [ChatMessage] {
        try await client.from("tutor_messages").select("id,role,content,created_at")
            .eq("conversation_id", conversationId).order("created_at").execute()
    }

    func deleteConversation(id: UUID) async throws {
        try await client.from("tutor_conversations").eq("id", id).delete()
    }

    struct SendRequest: Encodable {
        let conversationId: UUID?
        let mode: TutorMode
        let message: String
        let lessonId: UUID?
        let questionId: UUID?
        let submittedAnswer: AnswerSubmission?
        let language: String?
    }

    /// Streams the tutor's reply token by token. The server persists both turns.
    func send(_ request: SendRequest) -> AsyncThrowingStream<TutorStreamEvent, Error> {
        let raw = client.stream(function: "ai-tutor", body: request)
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    for try await line in raw {
                        guard let data = line.data(using: .utf8),
                              let event = try? JSONCoding.decoder.decode(TutorStreamEvent.self, from: data) else { continue }
                        if event.type == "error" {
                            throw APIError.server(status: 500, message: event.message)
                        }
                        continuation.yield(event)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    func generateFlashcards(topic: String, count: Int = 12) async throws -> [NewFlashcard] {
        struct Body: Encodable { let task: String; let topic: String; let count: Int }
        struct Response: Decodable { let cards: [NewFlashcard] }
        let response: Response = try await client.invoke(function: "ai-tutor", body: Body(task: "flashcards", topic: topic, count: count))
        return response.cards
    }
}
