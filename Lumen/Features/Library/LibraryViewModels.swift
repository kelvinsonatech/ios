import Foundation
import Observation

@MainActor
@Observable
final class LibraryViewModel {
    private(set) var reading: [ReadingItem] = []
    private(set) var recommended: [Ebook] = []
    private(set) var recent: [Ebook] = []
    private(set) var categories: [Category] = []
    private(set) var byCategory: [String: [Ebook]] = [:]
    private(set) var state: Loadable<Void> = .idle
    var selectedCategory: Category?

    @ObservationIgnored let env: AppEnvironment

    init(env: AppEnvironment) { self.env = env }

    func load() async {
        if state.value == nil { state = .loading }
        async let readingResult = env.library.continueReading()
        async let recommendedResult = env.library.recommended()
        async let recentResult = env.library.books(newestFirst: true, limit: 12)
        async let categoriesResult = env.courses.categories()
        do {
            recent = try await recentResult
            reading = (try? await readingResult) ?? []
            recommended = (try? await recommendedResult) ?? []
            categories = (try? await categoriesResult) ?? []
            state = .loaded(())
        } catch {
            state = .failed(.from(error))
        }
    }

    func loadCategory(_ category: Category) async {
        guard byCategory[category.id] == nil else { return }
        byCategory[category.id] = (try? await env.library.books(categoryId: category.id, limit: 50)) ?? []
    }
}

@MainActor
@Observable
final class ReaderViewModel {
    enum Appearance: String, CaseIterable, Identifiable {
        case light, sepia, dark
        var id: String { rawValue }
    }

    let book: Ebook
    private(set) var chapters: Loadable<[EbookChapter]> = .idle
    private(set) var bookmarks: [EbookBookmark] = []
    var chapterIndex = 0
    var scrollFraction: Double = 0
    var fontScale: Double {
        didSet { UserDefaults.standard.set(fontScale, forKey: "reader.fontScale") }
    }
    var appearance: Appearance {
        didSet { UserDefaults.standard.set(appearance.rawValue, forKey: "reader.appearance") }
    }
    var searchQuery = ""
    private(set) var isOffline = false

    @ObservationIgnored let env: AppEnvironment
    @ObservationIgnored private var pendingSave: Task<Void, Never>?

    init(env: AppEnvironment, book: Ebook) {
        self.env = env
        self.book = book
        let storedScale = UserDefaults.standard.double(forKey: "reader.fontScale")
        fontScale = storedScale == 0 ? 1 : storedScale
        appearance = Appearance(rawValue: UserDefaults.standard.string(forKey: "reader.appearance") ?? "") ?? .light
    }

    var current: EbookChapter? {
        guard let list = chapters.value, list.indices.contains(chapterIndex) else { return nil }
        return list[chapterIndex]
    }

    var overallProgress: Double {
        let count = Double(chapters.value?.count ?? 0)
        guard count > 0 else { return 0 }
        return min(1, (Double(chapterIndex) + scrollFraction) / count)
    }

    struct SearchHit: Identifiable, Hashable {
        let id = UUID()
        let chapterIndex: Int
        let chapterTitle: String
        let snippet: String
    }

    var searchResults: [SearchHit] {
        let query = searchQuery.trimmingCharacters(in: .whitespaces)
        guard query.count >= 2, let list = chapters.value else { return [] }
        var hits: [SearchHit] = []
        for (index, chapter) in list.enumerated() {
            var searchRange = chapter.contentMarkdown.startIndex..<chapter.contentMarkdown.endIndex
            while let range = chapter.contentMarkdown.range(of: query, options: .caseInsensitive, range: searchRange), hits.count < 100 {
                let lower = chapter.contentMarkdown.index(range.lowerBound, offsetBy: -40, limitedBy: chapter.contentMarkdown.startIndex) ?? chapter.contentMarkdown.startIndex
                let upper = chapter.contentMarkdown.index(range.upperBound, offsetBy: 60, limitedBy: chapter.contentMarkdown.endIndex) ?? chapter.contentMarkdown.endIndex
                hits.append(SearchHit(chapterIndex: index, chapterTitle: chapter.title,
                                      snippet: "…" + chapter.contentMarkdown[lower..<upper].replacingOccurrences(of: "\n", with: " ") + "…"))
                searchRange = range.upperBound..<chapter.contentMarkdown.endIndex
            }
        }
        return hits
    }

    func load() async {
        guard chapters.value == nil else { return }
        if book.isPremium && !env.session.isPremium {
            chapters = .failed(.premiumRequired)
            return
        }
        chapters = .loading
        do {
            chapters = .loaded(try await env.library.chapters(ebookId: book.id))
            if let progress = try? await env.library.progress(ebookId: book.id) {
                chapterIndex = progress.chapterPosition
                scrollFraction = progress.scrollFraction
            }
            bookmarks = (try? await env.library.bookmarks(ebookId: book.id)) ?? []
        } catch {
            if let offline = env.downloads.offlinePayload(.ebook, id: book.id, as: [EbookChapter].self) {
                isOffline = true
                chapters = .loaded(offline)
            } else {
                chapters = .failed(.from(error))
            }
        }
    }

    func goTo(chapter index: Int) {
        guard chapters.value?.indices.contains(index) == true else { return }
        chapterIndex = index
        scrollFraction = 0
        saveProgressSoon()
    }

    func updateScroll(_ fraction: Double) {
        scrollFraction = min(max(fraction, 0), 1)
        saveProgressSoon()
    }

    func addBookmark() async {
        guard let chapter = current else { return }
        let excerpt = String(chapter.contentMarkdown.prefix(160))
        if let bookmark = try? await env.library.addBookmark(ebookId: book.id, chapterPosition: chapterIndex,
                                                              excerpt: "\(chapter.title): \(excerpt)") {
            bookmarks.insert(bookmark, at: 0)
            Haptics.success()
        }
    }

    func deleteBookmark(_ bookmark: EbookBookmark) async {
        try? await env.library.deleteBookmark(id: bookmark.id)
        bookmarks.removeAll { $0.id == bookmark.id }
    }

    func download() {
        env.downloads.downloadEbook(book)
    }

    /// Debounced so scrolling doesn't spam the network.
    private func saveProgressSoon() {
        pendingSave?.cancel()
        let payload = EbookProgressPayload(ebookId: book.id, chapterPosition: chapterIndex, scrollFraction: scrollFraction,
                                           percent: overallProgress, clientUpdatedAt: .now)
        pendingSave = Task { [env] in
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            await env.library.saveProgress(payload)
        }
    }
}
