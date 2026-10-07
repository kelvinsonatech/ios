import Foundation

@MainActor
final class ProfileRepository {
    private let client: SupabaseClient
    private let cache: ResponseCache

    init(client: SupabaseClient, cache: ResponseCache) {
        self.client = client
        self.cache = cache
    }

    func me() async throws -> Profile {
        guard let userId = await client.auth.userID else { throw APIError.unauthorized }
        return try await cache.fetch("profile.\(userId)") {
            try await client.from("profiles").select().eq("id", userId).single()
        }
    }

    func update(_ update: ProfileUpdate) async throws {
        guard let userId = await client.auth.userID else { throw APIError.unauthorized }
        try await client.from("profiles").eq("id", userId).update(update)
    }

    func registerDevice(token: String) async {
        struct Row: Encodable { let token: String; let platform: String; let userId: UUID }
        guard let userId = await client.auth.userID else { return }
        try? await client.from("device_tokens").upsert(Row(token: token, platform: "ios", userId: userId), onConflict: "token")
    }

    /// Permanently deletes the account and all personal data (App Store requirement).
    func deleteAccount() async throws {
        let _: EmptyPayload = try await client.invoke(function: "delete-account", body: EmptyPayload())
        await client.auth.clear()
        cache.clear()
    }
}
