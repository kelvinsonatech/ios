import Foundation

struct FlashcardDeck: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let ownerId: UUID?
    let courseId: UUID?
    let title: String
    let description: String?
    let cardCount: Int
    let dueCount: Int

    var isOfficial: Bool { ownerId == nil }
}

struct Flashcard: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let deckId: UUID
    var front: String
    var back: String
    let position: Int
    var dueAt: Date?
    var intervalDays: Double?
    var ease: Double?
    var repetitions: Int?
}

struct NewFlashcard: Codable, Hashable, Sendable {
    var front: String
    var back: String
}

/// How well the student recalled a card.
enum RecallGrade: Int, CaseIterable, Identifiable, Sendable {
    case again = 1, hard = 3, good = 4, easy = 5
    var id: Int { rawValue }
    var title: String {
        switch self {
        case .again: "Again"
        case .hard: "Hard"
        case .good: "Good"
        case .easy: "Easy"
        }
    }
}

/// SM-2 spaced-repetition scheduling. Runs on device for instant feedback and
/// offline study; the same state is persisted server-side by `review_flashcard`.
struct SpacedRepetition {
    struct State: Equatable {
        var ease: Double = 2.5
        var intervalDays: Double = 0
        var repetitions: Int = 0
    }

    static func next(after state: State, grade: RecallGrade) -> State {
        var s = state
        let q = Double(grade.rawValue)
        if grade == .again {
            s.repetitions = 0
            s.intervalDays = 10.0 / (24 * 60) // relearn in ~10 minutes
        } else {
            s.repetitions += 1
            switch s.repetitions {
            case 1: s.intervalDays = 1
            case 2: s.intervalDays = grade == .hard ? 3 : 6
            default: s.intervalDays = (s.intervalDays * s.ease * (grade == .hard ? 0.8 : 1) * (grade == .easy ? 1.3 : 1)).rounded()
            }
        }
        s.ease = max(1.3, s.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
        return s
    }
}
