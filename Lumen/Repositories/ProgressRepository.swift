import Foundation

@MainActor
final class ProgressRepository {
    private let client: SupabaseClient
    private let cache: ResponseCache
    private let sync: SyncEngine

    init(client: SupabaseClient, cache: ResponseCache, sync: SyncEngine) {
        self.client = client
        self.cache = cache
        self.sync = sync
    }

    /// Records progress; when offline the write is queued and `nil` is returned.
    @discardableResult
    func recordLessonProgress(_ payload: LessonProgressPayload) async -> ProgressReward? {
        do {
            return try await client.rpc("record_lesson_progress", params: payload)
        } catch {
            if APIError.from(error).isRetryable { sync.enqueue(.lessonProgress, payload) }
            return nil
        }
    }

    func logStudyMinutes(_ minutes: Int, source: String) async {
        guard minutes > 0 else { return }
        let payload = StudyMinutesPayload(minutes: minutes, day: PostgresDate.dayString(), source: source)
        do { try await client.rpcVoid("log_study_minutes", params: payload) }
        catch { if APIError.from(error).isRetryable { sync.enqueue(.studyMinutes, payload) } }
    }

    func todayStats() async throws -> DailyStats {
        struct Params: Encodable { let day: String }
        return try await cache.fetch("stats.today") {
            try await client.rpc("daily_stats", params: Params(day: PostgresDate.dayString()))
        }
    }

    func activity(days: Int = 7) async throws -> [ActivityDay] {
        struct Params: Encodable { let days: Int; let today: String }
        return try await cache.fetch("stats.activity.\(days)") {
            try await client.rpc("activity_history", params: Params(days: days, today: PostgresDate.dayString()))
        }
    }

    func achievements() async throws -> [Achievement] {
        try await cache.fetch("achievements") { try await client.rpc("my_achievements") }
    }

    // MARK: Bookmarks

    func bookmarks() async throws -> [Bookmark] {
        try await cache.fetch("bookmarks") { try await client.rpc("my_bookmarks") }
    }

    func isBookmarked(_ kind: BookmarkKind, id: UUID) async -> Bool {
        guard let userId = await client.auth.userID else { return false }
        struct Row: Decodable { let itemId: UUID }
        let rows: [Row]? = try? await client.from("bookmarks").select("item_id")
            .eq("user_id", userId).eq("item_type", kind.rawValue).eq("item_id", id).execute()
        return !(rows ?? []).isEmpty
    }

    /// Returns the new bookmarked state.
    func toggleBookmark(_ kind: BookmarkKind, id: UUID) async throws -> Bool {
        struct Params: Encodable { let itemType: String; let itemId: UUID }
        return try await client.rpc("toggle_bookmark", params: Params(itemType: kind.rawValue, itemId: id))
    }

    // MARK: Notifications

    func notifications() async throws -> [AppNotification] {
        try await client.from("notifications").select().order("created_at", ascending: false).limit(50).execute()
    }

    func markNotificationsRead() async throws {
        struct Patch: Encodable { let readAt: Date }
        try await client.from("notifications").isNull("read_at").update(Patch(readAt: .now))
    }
}
