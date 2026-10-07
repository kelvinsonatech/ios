import Foundation
import SwiftData

enum DownloadKind: String, Codable, CaseIterable, Sendable {
    case lessonVideo, lessonNotes, ebook, quizSet

    var title: String {
        switch self {
        case .lessonVideo: "Videos"
        case .lessonNotes: "Notes"
        case .ebook: "E-books"
        case .quizSet: "Quiz sets"
        }
    }
    var symbol: String {
        switch self {
        case .lessonVideo: "play.rectangle"
        case .lessonNotes: "doc.text"
        case .ebook: "book.closed"
        case .quizSet: "checklist"
        }
    }
}

enum DownloadState: String, Codable, Sendable {
    case queued, downloading, paused, completed, failed
}

/// A piece of content saved for offline study.
@Model
final class DownloadedItem {
    @Attribute(.unique) var key: String
    var kindRaw: String
    var remoteId: UUID
    var parentId: UUID?
    var title: String
    var subtitle: String?
    /// File name inside the app's Downloads directory (videos).
    var localFileName: String?
    /// JSON snapshot for structured content (notes, chapters, question sets).
    var payload: Data?
    var byteSize: Int64
    var stateRaw: String
    var progress: Double
    var errorMessage: String?
    var createdAt: Date

    init(kind: DownloadKind, remoteId: UUID, parentId: UUID?, title: String, subtitle: String?) {
        self.key = DownloadedItem.key(kind, remoteId)
        self.kindRaw = kind.rawValue
        self.remoteId = remoteId
        self.parentId = parentId
        self.title = title
        self.subtitle = subtitle
        self.byteSize = 0
        self.stateRaw = DownloadState.queued.rawValue
        self.progress = 0
        self.createdAt = .now
    }

    var kind: DownloadKind { DownloadKind(rawValue: kindRaw) ?? .lessonNotes }
    var state: DownloadState {
        get { DownloadState(rawValue: stateRaw) ?? .failed }
        set { stateRaw = newValue.rawValue }
    }

    static func key(_ kind: DownloadKind, _ id: UUID) -> String { "\(kind.rawValue):\(id.uuidString)" }
}

/// Last known video position per lesson; synced to `lesson_progress` when online.
@Model
final class PlaybackPosition {
    @Attribute(.unique) var lessonId: UUID
    var courseId: UUID
    var seconds: Double
    var updatedAt: Date

    init(lessonId: UUID, courseId: UUID, seconds: Double) {
        self.lessonId = lessonId
        self.courseId = courseId
        self.seconds = seconds
        self.updatedAt = .now
    }
}

@Model
final class ReadingPosition {
    @Attribute(.unique) var ebookId: UUID
    var chapterPosition: Int
    var scrollFraction: Double
    var percent: Double
    var updatedAt: Date

    init(ebookId: UUID, chapterPosition: Int, scrollFraction: Double, percent: Double) {
        self.ebookId = ebookId
        self.chapterPosition = chapterPosition
        self.scrollFraction = scrollFraction
        self.percent = percent
        self.updatedAt = .now
    }
}

/// Writes made while offline, replayed in order by `SyncEngine`.
@Model
final class PendingSyncOperation {
    @Attribute(.unique) var id: UUID
    var kindRaw: String
    var payload: Data
    var createdAt: Date
    var attempts: Int
    var lastError: String?

    init(kind: SyncOperationKind, payload: Data) {
        self.id = UUID()
        self.kindRaw = kind.rawValue
        self.payload = payload
        self.createdAt = .now
        self.attempts = 0
    }

    var kind: SyncOperationKind? { SyncOperationKind(rawValue: kindRaw) }
}

enum SyncOperationKind: String, Codable, Sendable {
    case lessonProgress, ebookProgress, flashcardReview, studyMinutes
}

/// Read-through cache for server responses so screens render offline.
@Model
final class CachedResponse {
    @Attribute(.unique) var key: String
    var data: Data
    var updatedAt: Date

    init(key: String, data: Data) {
        self.key = key
        self.data = data
        self.updatedAt = .now
    }
}

enum LocalStore {
    static let schema = Schema([
        DownloadedItem.self, PlaybackPosition.self, ReadingPosition.self,
        PendingSyncOperation.self, CachedResponse.self
    ])

    static func makeContainer(inMemory: Bool = false) -> ModelContainer {
        let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: inMemory)
        do {
            return try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            // The cache is rebuildable; never block launch on a corrupt store.
            let fallback = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
            return try! ModelContainer(for: schema, configurations: [fallback])
        }
    }
}
