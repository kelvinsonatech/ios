import Foundation

@MainActor
final class LibraryRepository {
    private let client: SupabaseClient
    private let cache: ResponseCache
    private let sync: SyncEngine

    init(client: SupabaseClient, cache: ResponseCache, sync: SyncEngine) {
        self.client = client
        self.cache = cache
        self.sync = sync
    }

    func books(categoryId: String? = nil, newestFirst: Bool = false, limit: Int = 20) async throws -> [Ebook] {
        var query = client.from("ebooks").select().eq("is_published", true)
        if let categoryId { query = query.eq("category_id", categoryId) }
        query = newestFirst ? query.order("created_at", ascending: false) : query.order("title")
        return try await cache.fetch("ebooks.\(categoryId ?? "all").\(newestFirst)") {
            try await query.limit(limit).execute()
        }
    }

    func recommended() async throws -> [Ebook] {
        try await cache.fetch("ebooks.recommended") { try await client.rpc("recommended_ebooks") }
    }

    func continueReading() async throws -> [ReadingItem] {
        struct Row: Codable {
            let ebookId: UUID
            let chapterPosition: Int
            let scrollFraction: Double
            let percent: Double
            let updatedAt: Date?
            let ebook: Ebook
        }
        guard let userId = await client.auth.userID else { return [] }
        let rows: [Row] = try await cache.fetch("ebooks.reading") {
            try await client.from("ebook_progress").select("*,ebook:ebooks(*)")
                .eq("user_id", userId).lt("percent", 1).order("updated_at", ascending: false).limit(10).execute()
        }
        return rows.map {
            ReadingItem(book: $0.ebook, progress: EbookProgress(ebookId: $0.ebookId, chapterPosition: $0.chapterPosition,
                                                               scrollFraction: $0.scrollFraction, percent: $0.percent, updatedAt: $0.updatedAt))
        }
    }

    func chapters(ebookId: UUID) async throws -> [EbookChapter] {
        try await client.from("ebook_chapters").select().eq("ebook_id", ebookId).order("position").execute()
    }

    func progress(ebookId: UUID) async throws -> EbookProgress? {
        guard let userId = await client.auth.userID else { return nil }
        return try await client.from("ebook_progress").select("ebook_id,chapter_position,scroll_fraction,percent,updated_at")
            .eq("user_id", userId).eq("ebook_id", ebookId).maybeSingle()
    }

    func saveProgress(_ payload: EbookProgressPayload) async {
        do { try await client.rpcVoid("record_ebook_progress", params: payload) }
        catch { if APIError.from(error).isRetryable { sync.enqueue(.ebookProgress, payload) } }
    }

    func bookmarks(ebookId: UUID) async throws -> [EbookBookmark] {
        try await client.from("ebook_bookmarks").select().eq("ebook_id", ebookId).order("created_at", ascending: false).execute()
    }

    func addBookmark(ebookId: UUID, chapterPosition: Int, excerpt: String) async throws -> EbookBookmark {
        struct Row: Encodable { let ebookId: UUID; let chapterPosition: Int; let excerpt: String; let userId: UUID }
        guard let userId = await client.auth.userID else { throw APIError.unauthorized }
        return try await client.from("ebook_bookmarks").insertReturning(
            Row(ebookId: ebookId, chapterPosition: chapterPosition, excerpt: String(excerpt.prefix(280)), userId: userId)
        )
    }

    func deleteBookmark(id: UUID) async throws {
        try await client.from("ebook_bookmarks").eq("id", id).delete()
    }
}
