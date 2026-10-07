import Foundation

enum TutorMode: String, Codable, CaseIterable, Identifiable, Sendable {
    case explain, simplify, quiz, examiner, socratic

    var id: String { rawValue }
    var title: String {
        switch self {
        case .explain: "Explain"
        case .simplify: "Simplify"
        case .quiz: "Quiz Me"
        case .examiner: "Examiner"
        case .socratic: "Socratic"
        }
    }
    var symbol: String {
        switch self {
        case .explain: "text.book.closed"
        case .simplify: "wand.and.stars"
        case .quiz: "questionmark.bubble"
        case .examiner: "checklist"
        case .socratic: "point.3.connected.trianglepath.dotted"
        }
    }
    var hint: String {
        switch self {
        case .explain: "Clear, structured explanations with examples."
        case .simplify: "The simplest possible version, no jargon."
        case .quiz: "Practice questions generated from your topic."
        case .examiner: "One question at a time, graded like a real exam."
        case .socratic: "Guided questions that lead you to the answer."
        }
    }
    var placeholder: String {
        switch self {
        case .explain: "What would you like explained?"
        case .simplify: "Paste a topic or paragraph to simplify…"
        case .quiz: "Which topic should I quiz you on?"
        case .examiner: "Name a topic to start your exam…"
        case .socratic: "Ask a question you're stuck on…"
        }
    }
}

enum ChatRole: String, Codable, Sendable { case user, assistant }

struct ChatMessage: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let role: ChatRole
    var content: String
    let createdAt: Date

    init(id: UUID = UUID(), role: ChatRole, content: String, createdAt: Date = .now) {
        self.id = id
        self.role = role
        self.content = content
        self.createdAt = createdAt
    }
}

struct TutorConversation: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var title: String
    let mode: TutorMode
    let lessonId: UUID?
    let updatedAt: Date
}

/// Context handed to the tutor, e.g. from "Ask AI about this lesson".
struct TutorContext: Hashable, Sendable, Identifiable {
    var id: String { [lessonId?.uuidString, questionId?.uuidString, seedPrompt].compactMap { $0 }.joined(separator: "|") }
    var lessonId: UUID?
    var lessonTitle: String?
    var questionId: UUID?
    var submittedAnswer: AnswerSubmission?
    var seedPrompt: String?
    var mode: TutorMode = .explain
}

/// Final summary the examiner emits as a fenced ```lumen-exam-summary JSON block.
struct ExaminerSummary: Codable, Hashable, Sendable {
    let score: Int
    let total: Int
    let correct: [String]
    let incorrect: [String]
    let weakAreas: [String]
    let suggestedLessons: [String]
}

/// Server-sent event emitted by the `ai-tutor` Edge Function.
struct TutorStreamEvent: Decodable, Sendable {
    let type: String
    let text: String?
    let conversationId: UUID?
    let message: String?
}
