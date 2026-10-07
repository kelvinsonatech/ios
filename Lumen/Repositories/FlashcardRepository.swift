import Foundation

@MainActor
final class FlashcardRepository {
    private let client: SupabaseClient
    private let sync: SyncEngine

    init(client: SupabaseClient, sync: SyncEngine) {
        self.client = client
        self.sync = sync
    }

    func decks() async throws -> [FlashcardDeck] {
        try await client.rpc("my_flashcard_decks")
    }

    /// Cards joined with the student's review schedule; due cards first.
    func cards(deckId: UUID) async throws -> [Flashcard] {
        struct Params: Encodable { let deckId: UUID }
        return try await client.rpc("deck_cards", params: Params(deckId: deckId))
    }

    func createDeck(title: String, description: String?, courseId: UUID?, cards: [NewFlashcard]) async throws -> UUID {
        struct Params: Encodable { let title: String; let description: String?; let courseId: UUID?; let cards: [NewFlashcard] }
        return try await client.rpc("create_flashcard_deck", params: Params(title: title, description: description, courseId: courseId, cards: cards))
    }

    func deleteDeck(id: UUID) async throws {
        try await client.from("flashcard_decks").eq("id", id).delete()
    }

    func review(cardId: UUID, grade: RecallGrade) async {
        let payload = FlashcardReviewPayload(cardId: cardId, grade: grade.rawValue, reviewedAt: .now)
        do { try await client.rpcVoid("review_flashcard", params: payload) }
        catch { if APIError.from(error).isRetryable { sync.enqueue(.flashcardReview, payload) } }
    }
}
