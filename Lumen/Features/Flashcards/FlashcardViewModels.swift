import Foundation
import Observation

@MainActor
@Observable
final class DeckListViewModel {
    private(set) var decks: Loadable<[FlashcardDeck]> = .idle
    var newTitle = ""
    var newCards: [NewFlashcard] = [NewFlashcard(front: "", back: "")]
    var generateTopic = ""
    private(set) var isGenerating = false
    private(set) var isSaving = false
    var errorMessage: String?

    @ObservationIgnored let env: AppEnvironment

    init(env: AppEnvironment) { self.env = env }

    var canSave: Bool {
        !newTitle.trimmingCharacters(in: .whitespaces).isEmpty && validCards.count >= 1
    }

    private var validCards: [NewFlashcard] {
        newCards.filter { !$0.front.trimmingCharacters(in: .whitespaces).isEmpty && !$0.back.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    func load() async {
        if decks.value == nil { decks = .loading }
        do { decks = .loaded(try await env.flashcards.decks()) }
        catch { decks = .failed(.from(error)) }
    }

    func generate() async {
        let topic = generateTopic.trimmingCharacters(in: .whitespaces)
        guard !topic.isEmpty else { return }
        isGenerating = true
        defer { isGenerating = false }
        do {
            newCards = try await env.tutor.generateFlashcards(topic: topic)
            if newTitle.isEmpty { newTitle = topic }
        } catch {
            errorMessage = APIError.from(error).localizedDescription
        }
    }

    func save() async -> Bool {
        isSaving = true
        defer { isSaving = false }
        do {
            _ = try await env.flashcards.createDeck(title: newTitle, description: nil, courseId: nil, cards: validCards)
            newTitle = ""
            newCards = [NewFlashcard(front: "", back: "")]
            generateTopic = ""
            await load()
            Haptics.success()
            return true
        } catch {
            errorMessage = APIError.from(error).localizedDescription
            return false
        }
    }

    func delete(_ deck: FlashcardDeck) async {
        try? await env.flashcards.deleteDeck(id: deck.id)
        await load()
    }
}

@MainActor
@Observable
final class FlashcardStudyViewModel {
    let deck: FlashcardDeck
    private(set) var queue: Loadable<[Flashcard]> = .idle
    private(set) var index = 0
    var isFlipped = false
    private(set) var reviewedCount = 0
    private(set) var againCount = 0

    @ObservationIgnored let env: AppEnvironment

    init(env: AppEnvironment, deck: FlashcardDeck) {
        self.env = env
        self.deck = deck
    }

    var current: Flashcard? {
        guard let cards = queue.value, cards.indices.contains(index) else { return nil }
        return cards[index]
    }

    var isComplete: Bool { queue.value != nil && current == nil }
    var remaining: Int { max((queue.value?.count ?? 0) - index, 0) }

    func load() async {
        queue = .loading
        do {
            let cards = try await env.flashcards.cards(deckId: deck.id)
            // Study due cards first; if nothing is due, review the whole deck.
            let due = cards.filter { ($0.dueAt ?? .distantPast) <= .now }
            queue = .loaded(due.isEmpty ? cards.shuffled() : due)
        } catch {
            queue = .failed(.from(error))
        }
    }

    func grade(_ grade: RecallGrade) async {
        guard let card = current, var cards = queue.value else { return }
        Haptics.selection()
        reviewedCount += 1
        // Failed cards are re-queued at the end of this session.
        if grade == .again {
            againCount += 1
            cards.append(card)
            queue = .loaded(cards)
        }
        isFlipped = false
        index += 1
        await env.flashcards.review(cardId: card.id, grade: grade)
    }

    /// Preview of the next interval shown on each grade button.
    func intervalLabel(for grade: RecallGrade) -> String {
        guard let card = current else { return "" }
        let state = SpacedRepetition.State(ease: card.ease ?? 2.5, intervalDays: card.intervalDays ?? 0, repetitions: card.repetitions ?? 0)
        let days = SpacedRepetition.next(after: state, grade: grade).intervalDays
        if days < 1 { return "<10m" }
        if days < 30 { return "\(Int(days))d" }
        return "\(Int(days / 30))mo"
    }
}
