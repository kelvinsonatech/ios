import Foundation
import SwiftData

/// Stores decoded responses in SwiftData so the app has something to show offline.
@MainActor
final class ResponseCache {
    private let context: ModelContext

    init(container: ModelContainer) {
        context = ModelContext(container)
        context.autosaveEnabled = true
    }

    func value<T: Decodable>(_ type: T.Type, for key: String) -> T? {
        let descriptor = FetchDescriptor<CachedResponse>(predicate: #Predicate { $0.key == key })
        guard let entry = try? context.fetch(descriptor).first else { return nil }
        return try? JSONCoding.decoder.decode(T.self, from: entry.data)
    }

    func store<T: Encodable>(_ value: T, for key: String) {
        guard let data = try? JSONCoding.encoder.encode(value) else { return }
        let descriptor = FetchDescriptor<CachedResponse>(predicate: #Predicate { $0.key == key })
        if let existing = try? context.fetch(descriptor).first {
            existing.data = data
            existing.updatedAt = .now
        } else {
            context.insert(CachedResponse(key: key, data: data))
        }
        try? context.save()
    }

    /// Network first, cache on success, fall back to cache when offline.
    func fetch<T: Codable>(_ key: String, _ load: () async throws -> T) async throws -> T {
        do {
            let fresh = try await load()
            store(fresh, for: key)
            return fresh
        } catch {
            let apiError = APIError.from(error)
            if apiError.isRetryable, let cached = value(T.self, for: key) { return cached }
            throw apiError
        }
    }

    func clear() {
        try? context.delete(model: CachedResponse.self)
        try? context.save()
    }
}
