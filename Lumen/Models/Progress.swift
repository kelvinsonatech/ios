import Foundation

struct DailyStats: Codable, Hashable, Sendable {
    let day: String
    let minutesStudied: Int
    let lessonsCompleted: Int
    let questionsAnswered: Int
    let xpEarned: Int
    let currentStreak: Int
    let dailyGoalMinutes: Int

    static let empty = DailyStats(day: PostgresDate.dayString(), minutesStudied: 0, lessonsCompleted: 0,
                                  questionsAnswered: 0, xpEarned: 0, currentStreak: 0, dailyGoalMinutes: 15)
}

struct ActivityDay: Codable, Hashable, Identifiable, Sendable {
    var id: String { day }
    let day: String
    let minutesStudied: Int
    let xpEarned: Int
}

struct Achievement: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let description: String
    let symbol: String
    let xpReward: Int
    let earnedAt: Date?

    var isEarned: Bool { earnedAt != nil }
}

/// Response from `record_lesson_progress`, which may unlock XP and badges.
struct ProgressReward: Codable, Hashable, Sendable {
    let xpAwarded: Int
    let newAchievements: [String]
    let currentStreak: Int
    let courseProgress: Double
}

struct AppNotification: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let title: String
    let body: String
    let kind: String
    let readAt: Date?
    let createdAt: Date
}
