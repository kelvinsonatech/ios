import Foundation
import Observation

@MainActor
@Observable
final class ProfileViewModel {
    private(set) var activity: [ActivityDay] = []
    private(set) var achievements: [Achievement] = []
    @ObservationIgnored let env: AppEnvironment

    init(env: AppEnvironment) { self.env = env }

    var earnedAchievements: [Achievement] { achievements.filter(\.isEarned) }

    func load() async {
        async let activityResult = env.progress.activity(days: 7)
        async let achievementsResult = env.progress.achievements()
        activity = (try? await activityResult) ?? activity
        achievements = (try? await achievementsResult) ?? achievements
        await env.session.refreshProfile()
    }
}

@MainActor
@Observable
final class AchievementsViewModel {
    private(set) var achievements: Loadable<[Achievement]> = .idle
    @ObservationIgnored let env: AppEnvironment

    init(env: AppEnvironment) { self.env = env }

    func load() async {
        if achievements.value == nil { achievements = .loading }
        do { achievements = .loaded(try await env.progress.achievements()) }
        catch { achievements = .failed(.from(error)) }
    }
}

@MainActor
@Observable
final class BookmarksViewModel {
    private(set) var bookmarks: Loadable<[Bookmark]> = .idle
    @ObservationIgnored let env: AppEnvironment

    init(env: AppEnvironment) { self.env = env }

    func load() async {
        if bookmarks.value == nil { bookmarks = .loading }
        do { bookmarks = .loaded(try await env.progress.bookmarks()) }
        catch { bookmarks = .failed(.from(error)) }
    }

    func remove(_ bookmark: Bookmark) async {
        _ = try? await env.progress.toggleBookmark(bookmark.itemType, id: bookmark.itemId)
        if case .loaded(let list) = bookmarks { bookmarks = .loaded(list.filter { $0.id != bookmark.id }) }
    }
}

@MainActor
@Observable
final class NotificationsViewModel {
    private(set) var notifications: Loadable<[AppNotification]> = .idle
    @ObservationIgnored let env: AppEnvironment

    init(env: AppEnvironment) { self.env = env }

    func load() async {
        if notifications.value == nil { notifications = .loading }
        do {
            notifications = .loaded(try await env.progress.notifications())
            try? await env.progress.markNotificationsRead()
        } catch {
            notifications = .failed(.from(error))
        }
    }
}
