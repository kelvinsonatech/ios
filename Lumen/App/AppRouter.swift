import Foundation
import Observation

enum AppTab: String, CaseIterable, Identifiable, Hashable {
    case home, courses, tutor, practice, profile

    var id: String { rawValue }
    var title: String {
        switch self {
        case .home: "Home"
        case .courses: "Courses"
        case .tutor: "AI Tutor"
        case .practice: "Practice"
        case .profile: "Profile"
        }
    }
    var symbol: String {
        switch self {
        case .home: "house"
        case .courses: "books.vertical"
        case .tutor: "sparkles"
        case .practice: "target"
        case .profile: "person.crop.circle"
        }
    }
}

/// Cross-feature navigation: tab switching, "Ask AI" hand-offs and modal presentations.
@MainActor
@Observable
final class AppRouter {
    var selectedTab: AppTab = .home
    /// Set to hand context to the AI Tutor (e.g. "Ask AI about this lesson").
    var pendingTutorContext: TutorContext?
    var isPaywallPresented = false
    var presentedLiveQuizId: UUID?

    func askTutor(_ context: TutorContext) {
        pendingTutorContext = context
        selectedTab = .tutor
    }

    func showPaywall() { isPaywallPresented = true }
}
