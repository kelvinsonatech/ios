import Foundation
import SwiftData
import OSLog

struct LessonProgressPayload: Codable, Sendable {
    let lessonId: UUID
    let position: Double
    let secondsWatched: Int
    let completed: Bool
    let clientUpdatedAt: Date
}

struct EbookProgressPayload: Codable, Sendable {
    let ebookId: UUID
    let chapterPosition: Int
    let scrollFraction: Double
    let percent: Double
    let clientUpdatedAt: Date
}

struct FlashcardReviewPayload: Codable, Sendable {
    let cardId: UUID
    let grade: Int
    let reviewedAt: Date
}

struct StudyMinutesPayload: Codable, Sendable {
    let minutes: Int
    let day: String
    let source: String
}

/// Durable outbox for writes made while offline. Operations are replayed oldest-first
/// when connectivity returns; the server resolves conflicts using `client_updated_at`.
@MainActor
final class SyncEngine {
    private let client: SupabaseClient
    private let context: ModelContext
    private let logger = Logger(subsystem: "com.lumenlearning.app", category: "sync")
    private var isFlushing = false
    private static let maxAttempts = 8

    init(client: SupabaseClient, container: ModelContainer) {
        self.client = client
        self.context = ModelContext(container)
    }

    func enqueue<T: Encodable>(_ kind: SyncOperationKind, _ payload: T) {
        guard let data = try? JSONCoding.encoder.encode(payload) else { return }
        context.insert(PendingSyncOperation(kind: kind, payload: data))
        try? context.save()
    }

    var pendingCount: Int {
        (try? context.fetchCount(FetchDescriptor<PendingSyncOperation>())) ?? 0
    }

    /// Replays pending operations. Stops at the first connectivity failure so ordering is preserved.
    func flush() async {
        guard !isFlushing else { return }
        isFlushing = true
        defer { isFlushing = false }

        let descriptor = FetchDescriptor<PendingSyncOperation>(sortBy: [SortDescriptor(\.createdAt)])
        guard let operations = try? context.fetch(descriptor), !operations.isEmpty else { return }
        logger.info("Flushing \(operations.count) pending operations")

        for operation in operations {
            do {
                try await replay(operation)
                context.delete(operation)
            } catch {
                let apiError = APIError.from(error)
                if apiError == .offline { break }
                operation.attempts += 1
                operation.lastError = apiError.localizedDescription
                // Permanent failures (validation, permissions) are dropped after several tries.
                if operation.attempts >= Self.maxAttempts || !apiError.isRetryable && apiError != .unauthorized {
                    logger.error("Dropping sync op \(operation.kindRaw): \(apiError.localizedDescription)")
                    context.delete(operation)
                }
            }
        }
        try? context.save()
    }

    private func replay(_ operation: PendingSyncOperation) async throws {
        let decoder = JSONCoding.decoder
        switch operation.kind {
        case .lessonProgress:
            let p = try decoder.decode(LessonProgressPayload.self, from: operation.payload)
            let _: ProgressReward = try await client.rpc("record_lesson_progress", params: p)
        case .ebookProgress:
            let p = try decoder.decode(EbookProgressPayload.self, from: operation.payload)
            try await client.rpcVoid("record_ebook_progress", params: p)
        case .flashcardReview:
            let p = try decoder.decode(FlashcardReviewPayload.self, from: operation.payload)
            try await client.rpcVoid("review_flashcard", params: p)
        case .studyMinutes:
            let p = try decoder.decode(StudyMinutesPayload.self, from: operation.payload)
            try await client.rpcVoid("log_study_minutes", params: p)
        case .none:
            return
        }
    }
}
