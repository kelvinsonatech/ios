import Foundation

enum QuestionKind: String, Codable, Sendable {
    case multipleChoice = "multiple_choice"
    case trueFalse = "true_false"
    case shortAnswer = "short_answer"
    case fillBlank = "fill_blank"

    var title: String {
        switch self {
        case .multipleChoice: "Multiple choice"
        case .trueFalse: "True or false"
        case .shortAnswer: "Short answer"
        case .fillBlank: "Fill in the blank"
        }
    }

    var usesChoices: Bool { self == .multipleChoice || self == .trueFalse }
}

struct QuestionChoice: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let text: String
}

/// A question as delivered to the client. Correct answers are never included;
/// they live in `question_keys`, readable only by server-side functions.
struct Question: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let courseId: UUID?
    let topicId: UUID?
    let topicName: String?
    let lessonId: UUID?
    let kind: QuestionKind
    let difficulty: Int
    let prompt: String
    let choices: [QuestionChoice]
    let allowsMultiple: Bool

    var difficultyLabel: String {
        switch difficulty {
        case ...1: "Easy"
        case 2: "Medium"
        default: "Hard"
        }
    }
}

struct Topic: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let courseId: UUID
    let subject: String
    let name: String
    let questionCount: Int
}

/// What the student submitted.
struct AnswerSubmission: Codable, Hashable, Sendable {
    var choiceIds: [String] = []
    var text: String = ""

    var isEmpty: Bool { choiceIds.isEmpty && text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}

/// Server verdict returned by `check_answer`.
struct AnswerResult: Codable, Hashable, Sendable {
    let isCorrect: Bool
    let correctChoiceIds: [String]
    let acceptedAnswer: String?
    let explanation: String?
    let xpAwarded: Int
}

enum PracticeMode: String, CaseIterable, Identifiable, Codable, Sendable {
    case quick, topic, weakAreas = "weak_areas", revision, custom
    var id: String { rawValue }
    var title: String {
        switch self {
        case .quick: "Quick Practice"
        case .topic: "Topic Practice"
        case .weakAreas: "Weak Areas"
        case .revision: "Revision"
        case .custom: "Custom Practice"
        }
    }
    var subtitle: String {
        switch self {
        case .quick: "10 random questions"
        case .topic: "Focus on one topic"
        case .weakAreas: "Target what you find hardest"
        case .revision: "From lessons you've finished"
        case .custom: "Choose subject, topic and difficulty"
        }
    }
    var symbol: String {
        switch self {
        case .quick: "bolt"
        case .topic: "scope"
        case .weakAreas: "target"
        case .revision: "arrow.counterclockwise"
        case .custom: "slider.horizontal.3"
        }
    }
}

struct PracticeRequest: Codable, Hashable, Sendable {
    var mode: PracticeMode
    var courseId: UUID?
    var topicId: UUID?
    var subject: String?
    var difficulty: Int?
    var count: Int = 10
}

struct DailyChallenge: Codable, Hashable, Sendable {
    let day: String
    let question: Question
    let xpReward: Int
    let completed: Bool
    let wasCorrect: Bool?
}

struct TopicPerformance: Codable, Hashable, Identifiable, Sendable {
    var id: UUID { topicId }
    let topicId: UUID
    let topicName: String
    let correct: Int
    let total: Int
    var accuracy: Double { total > 0 ? Double(correct) / Double(total) : 0 }
}
