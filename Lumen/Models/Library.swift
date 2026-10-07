import Foundation

struct Ebook: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let title: String
    let author: String
    let description: String?
    let categoryId: String
    let coverUrl: URL?
    let isPremium: Bool
    let isDownloadable: Bool
    let chapterCount: Int
    let estimatedMinutes: Int
    let createdAt: Date
}

struct EbookChapter: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let ebookId: UUID
    let position: Int
    let title: String
    let contentMarkdown: String
}

struct EbookProgress: Codable, Hashable, Sendable {
    let ebookId: UUID
    var chapterPosition: Int
    var scrollFraction: Double
    var percent: Double
    var updatedAt: Date?
}

struct EbookBookmark: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let ebookId: UUID
    let chapterPosition: Int
    let excerpt: String
    let createdAt: Date
}

struct ReadingItem: Identifiable, Hashable, Sendable {
    var id: UUID { book.id }
    let book: Ebook
    let progress: EbookProgress
}

enum BookmarkKind: String, Codable, Sendable {
    case lesson, question, ebook, course
}

struct Bookmark: Codable, Hashable, Identifiable, Sendable {
    var id: String { "\(itemType.rawValue):\(itemId)" }
    let itemType: BookmarkKind
    let itemId: UUID
    let title: String
    let subtitle: String?
    let createdAt: Date
}
