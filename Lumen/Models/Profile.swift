import Foundation

enum LearningLevel: String, Codable, CaseIterable, Identifiable, Sendable {
    case beginner, intermediate, advanced
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var detail: String {
        switch self {
        case .beginner: "I'm just getting started"
        case .intermediate: "I know the basics and want to go deeper"
        case .advanced: "I'm comfortable and want a challenge"
        }
    }
    var symbol: String {
        switch self {
        case .beginner: "leaf"
        case .intermediate: "chart.line.uptrend.xyaxis"
        case .advanced: "flame"
        }
    }
}

enum LearningGoal: String, Codable, CaseIterable, Identifiable, Sendable {
    case passExams = "pass_exams"
    case understandTopics = "understand_topics"
    case learnSkill = "learn_skill"
    case prepareUniversity = "prepare_university"
    case improveGrades = "improve_grades"
    case ownPace = "own_pace"

    var id: String { rawValue }
    var title: String {
        switch self {
        case .passExams: "Pass my exams"
        case .understandTopics: "Understand difficult topics"
        case .learnSkill: "Learn a new skill"
        case .prepareUniversity: "Prepare for university"
        case .improveGrades: "Improve my grades"
        case .ownPace: "Learn at my own pace"
        }
    }
    var symbol: String {
        switch self {
        case .passExams: "checkmark.seal"
        case .understandTopics: "lightbulb"
        case .learnSkill: "hammer"
        case .prepareUniversity: "building.columns"
        case .improveGrades: "arrow.up.right"
        case .ownPace: "tortoise"
        }
    }
}

struct Profile: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var displayName: String
    var avatarUrl: URL?
    var interests: [String]
    var level: LearningLevel?
    var goal: LearningGoal?
    var dailyGoalMinutes: Int
    var onboardingCompleted: Bool
    var xp: Int
    var currentStreak: Int
    var longestStreak: Int
    var lastActiveDate: String?
    var isPremium: Bool
    var notificationsEnabled: Bool

    var firstName: String {
        displayName.split(separator: " ").first.map(String.init) ?? displayName
    }

    /// Level derived from XP with a gently increasing curve (level n needs 100·n² XP).
    var xpLevel: Int { Int((Double(xp) / 100).squareRoot()) + 1 }
    var xpForCurrentLevel: Int { 100 * (xpLevel - 1) * (xpLevel - 1) }
    var xpForNextLevel: Int { 100 * xpLevel * xpLevel }
    var levelProgress: Double {
        let span = Double(xpForNextLevel - xpForCurrentLevel)
        return span > 0 ? Double(xp - xpForCurrentLevel) / span : 0
    }
}

/// Fields a student may change themselves. XP, streak and premium are server-owned.
struct ProfileUpdate: Encodable, Sendable {
    var displayName: String?
    var interests: [String]?
    var level: LearningLevel?
    var goal: LearningGoal?
    var dailyGoalMinutes: Int?
    var onboardingCompleted: Bool?
    var notificationsEnabled: Bool?
    var avatarUrl: URL?
}

struct Category: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let symbol: String
    let sortOrder: Int
}
