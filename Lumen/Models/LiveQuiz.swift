import Foundation

struct LiveQuiz: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let title: String
    let subject: String
    let description: String?
    let startsAt: Date
    let questionCount: Int
    let questionSeconds: Int
    let revealSeconds: Int
    let xpPrize: Int
    let playerCount: Int
    let isJoined: Bool

    var endsAt: Date {
        startsAt.addingTimeInterval(TimeInterval(questionCount * (questionSeconds + revealSeconds)))
    }
}

enum LiveQuizPhase: String, Codable, Sendable {
    case lobby, question, reveal, finished
}

/// Authoritative state computed on the server from its own clock.
struct LiveQuizState: Codable, Hashable, Sendable {
    let phase: LiveQuizPhase
    let position: Int
    let questionCount: Int
    let serverTime: Date
    let phaseEndsAt: Date?
    let question: Question?
    let answeredChoiceId: String?
    let correctChoiceId: String?
}

struct LiveQuizParticipant: Codable, Identifiable, Hashable, Sendable {
    var id: UUID { userId }
    let userId: UUID
    let displayName: String
    let avatarUrl: URL?
    var score: Int
    var correctCount: Int
}

struct LiveAnswerResult: Codable, Hashable, Sendable {
    let accepted: Bool
    let isCorrect: Bool?
    let points: Int
}
