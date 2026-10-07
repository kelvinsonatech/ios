import Foundation

struct Exam: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let courseId: UUID?
    let title: String
    let subject: String
    let description: String?
    let instructions: [String]
    let timeLimitSeconds: Int
    let questionCount: Int
    let passPercentage: Int
    let isPremium: Bool
}

/// Returned by `start_exam`: an attempt with a server-side deadline and its questions.
struct ExamSession: Codable, Hashable, Sendable {
    let attemptId: UUID
    let startedAt: Date
    let deadline: Date
    let questions: [Question]
}

struct ExamAnswer: Codable, Hashable, Sendable {
    let questionId: UUID
    var choiceIds: [String]
    var text: String
}

struct ExamResult: Codable, Hashable, Sendable {
    struct Review: Codable, Hashable, Sendable, Identifiable {
        var id: UUID { questionId }
        let questionId: UUID
        let prompt: String
        let isCorrect: Bool
        let submitted: AnswerSubmission?
        let correctChoiceIds: [String]
        let acceptedAnswer: String?
        let explanation: String?
        let choices: [QuestionChoice]
    }

    let attemptId: UUID
    let score: Int
    let total: Int
    let percentage: Double
    let passed: Bool
    let timeSpentSeconds: Int
    let topicBreakdown: [TopicPerformance]
    let recommendedLessons: [RecommendedLesson]
    let review: [Review]
    let xpAwarded: Int

    var incorrect: Int { total - score }
}

struct RecommendedLesson: Codable, Hashable, Identifiable, Sendable {
    let id: UUID
    let courseId: UUID
    let title: String
    let topicName: String?
}
