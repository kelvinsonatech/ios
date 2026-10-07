import Foundation

/// A question bundled with its answer key, only for downloadable practice sets.
struct OfflineQuestion: Codable, Hashable, Sendable {
    let question: Question
    let correctChoiceIds: [String]
    let acceptedAnswers: [String]
    let explanation: String?

    func grade(_ submission: AnswerSubmission) -> AnswerResult {
        let correct: Bool
        if question.kind.usesChoices {
            correct = Set(submission.choiceIds) == Set(correctChoiceIds)
        } else {
            let normalized = AnswerNormalizer.normalize(submission.text)
            correct = acceptedAnswers.contains { AnswerNormalizer.normalize($0) == normalized }
        }
        return AnswerResult(isCorrect: correct, correctChoiceIds: correctChoiceIds,
                            acceptedAnswer: acceptedAnswers.first, explanation: explanation, xpAwarded: 0)
    }
}

/// Mirrors the server's `normalize_answer` so offline grading matches online grading.
enum AnswerNormalizer {
    static func normalize(_ text: String) -> String {
        text.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.union(.init(charactersIn: ".-/")).inverted)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }
}

@MainActor
final class QuestionRepository {
    private let client: SupabaseClient
    private let cache: ResponseCache

    init(client: SupabaseClient, cache: ResponseCache) {
        self.client = client
        self.cache = cache
    }

    func subjects() async throws -> [String] {
        try await cache.fetch("question-subjects") { try await client.rpc("question_subjects") }
    }

    func topics(courseId: UUID? = nil, subject: String? = nil) async throws -> [Topic] {
        struct Params: Encodable { let courseId: UUID?; let subject: String? }
        return try await client.rpc("topics_with_counts", params: Params(courseId: courseId, subject: subject))
    }

    func practiceQuestions(_ request: PracticeRequest) async throws -> [Question] {
        try await client.rpc("practice_questions", params: request)
    }

    func check(questionId: UUID, submission: AnswerSubmission, context: String) async throws -> AnswerResult {
        struct Params: Encodable { let questionId: UUID; let answer: AnswerSubmission; let context: String }
        return try await client.rpc("check_answer", params: Params(questionId: questionId, answer: submission, context: context))
    }

    func dailyChallenge() async throws -> DailyChallenge? {
        struct Params: Encodable { let day: String }
        let result: [DailyChallenge] = try await client.rpc("daily_challenge", params: Params(day: PostgresDate.dayString()))
        return result.first
    }

    func submitDailyChallenge(day: String, submission: AnswerSubmission) async throws -> AnswerResult {
        struct Params: Encodable { let day: String; let answer: AnswerSubmission }
        return try await client.rpc("submit_daily_challenge", params: Params(day: day, answer: submission))
    }

    func bookmarkedQuestions() async throws -> [Question] {
        try await client.rpc("bookmarked_questions")
    }

    func topicPerformance() async throws -> [TopicPerformance] {
        try await cache.fetch("topic-performance") { try await client.rpc("topic_performance") }
    }

    func offlineQuizSet(courseId: UUID) async throws -> [OfflineQuestion] {
        struct Params: Encodable { let courseId: UUID }
        return try await client.rpc("offline_quiz_set", params: Params(courseId: courseId))
    }
}
