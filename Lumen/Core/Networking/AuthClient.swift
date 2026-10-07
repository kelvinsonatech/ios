import Foundation
import CryptoKit
import Security

struct AuthUser: Codable, Sendable, Equatable {
    let id: UUID
    let email: String?
}

struct AuthSession: Codable, Sendable, Equatable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
    var user: AuthUser

    var isExpiringSoon: Bool { expiresAt.timeIntervalSinceNow < 60 }
}

enum AuthEvent: Sendable {
    case signedIn(AuthSession)
    case refreshed(AuthSession)
    case signedOut
}

/// GoTrue (Supabase Auth) client. Owns the session, persists it in the Keychain
/// and coalesces concurrent token refreshes into one network call.
actor AuthClient {
    private let config: AppConfig
    private let session: URLSession
    private let keychain: KeychainStore
    private let storageKey = "supabase.session"
    private var current: AuthSession?
    private var refreshTask: Task<AuthSession, Error>?
    private var continuations: [UUID: AsyncStream<AuthEvent>.Continuation] = [:]

    init(config: AppConfig, session: URLSession, keychain: KeychainStore = KeychainStore()) {
        self.config = config
        self.session = session
        self.keychain = keychain
        self.current = keychain.codable(AuthSession.self, for: storageKey)
    }

    var currentSession: AuthSession? { current }
    var userID: UUID? { current?.user.id }

    func events() -> AsyncStream<AuthEvent> {
        let id = UUID()
        let (stream, continuation) = AsyncStream<AuthEvent>.makeStream()
        continuations[id] = continuation
        continuation.onTermination = { [weak self] _ in
            Task { await self?.removeContinuation(id) }
        }
        return stream
    }

    private func removeContinuation(_ id: UUID) { continuations[id] = nil }

    // MARK: Sign-in flows

    func signUp(email: String, password: String, displayName: String) async throws -> AuthSession? {
        struct Body: Encodable { let email: String; let password: String; let data: [String: String] }
        let response: TokenResponse = try await post(
            "signup", body: Body(email: email, password: password, data: ["display_name": displayName])
        )
        // When email confirmation is enabled GoTrue returns a user without tokens.
        guard response.accessToken != nil else { return nil }
        return try store(response, event: AuthEvent.signedIn)
    }

    func signIn(email: String, password: String) async throws -> AuthSession {
        struct Body: Encodable { let email: String; let password: String }
        let response: TokenResponse = try await post("token?grant_type=password", body: Body(email: email, password: password))
        return try store(response, event: AuthEvent.signedIn)
    }

    /// Exchanges an Apple identity token. `nonce` is the raw nonce whose SHA256 was sent to Apple.
    func signInWithApple(idToken: String, nonce: String) async throws -> AuthSession {
        struct Body: Encodable { let provider: String; let idToken: String; let nonce: String }
        let response: TokenResponse = try await post(
            "token?grant_type=id_token", body: Body(provider: "apple", idToken: idToken, nonce: nonce)
        )
        return try store(response, event: AuthEvent.signedIn)
    }

    /// Builds the OAuth authorize URL for PKCE. Returns the verifier the caller must keep.
    func oauthAuthorizeURL(provider: String) -> (url: URL, verifier: String) {
        let verifier = PKCE.makeVerifier()
        var components = URLComponents(url: config.supabaseURL.appending(path: "auth/v1/authorize"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            .init(name: "provider", value: provider),
            .init(name: "redirect_to", value: config.authCallbackURL.absoluteString),
            .init(name: "code_challenge", value: PKCE.challenge(for: verifier)),
            .init(name: "code_challenge_method", value: "s256")
        ]
        return (components.url!, verifier)
    }

    func exchangeOAuthCode(_ code: String, verifier: String) async throws -> AuthSession {
        struct Body: Encodable { let authCode: String; let codeVerifier: String }
        let response: TokenResponse = try await post("token?grant_type=pkce", body: Body(authCode: code, codeVerifier: verifier))
        return try store(response, event: AuthEvent.signedIn)
    }

    func sendPasswordReset(email: String) async throws {
        struct Body: Encodable { let email: String }
        let _: EmptyResponse = try await post("recover", body: Body(email: email))
    }

    func signOut() async {
        if let token = current?.accessToken {
            var request = URLRequest(url: config.supabaseURL.appending(path: "auth/v1/logout"))
            request.httpMethod = "POST"
            request.setValue(config.supabaseAnonKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            _ = try? await session.data(for: request)
        }
        clear()
    }

    func clear() {
        current = nil
        refreshTask?.cancel()
        refreshTask = nil
        keychain.remove(storageKey)
        broadcast(.signedOut)
    }

    // MARK: Tokens

    /// Returns a non-expired access token, refreshing if needed. Concurrent callers share a refresh.
    func validAccessToken() async throws -> String {
        guard let session = current else { throw APIError.unauthorized }
        if !session.isExpiringSoon { return session.accessToken }
        return try await refresh().accessToken
    }

    @discardableResult
    func refresh() async throws -> AuthSession {
        if let refreshTask { return try await refreshTask.value }
        guard let refreshToken = current?.refreshToken else { throw APIError.unauthorized }
        let task = Task { () throws -> AuthSession in
            struct Body: Encodable { let refreshToken: String }
            do {
                let response: TokenResponse = try await post("token?grant_type=refresh_token", body: Body(refreshToken: refreshToken))
                return try store(response, event: AuthEvent.refreshed)
            } catch let error as APIError where error == .unauthorized || isInvalidGrant(error) {
                clear()
                throw APIError.unauthorized
            }
        }
        refreshTask = task
        defer { refreshTask = nil }
        return try await task.value
    }

    private func isInvalidGrant(_ error: APIError) -> Bool {
        if case .server(let status, _) = error { return status == 400 }
        return false
    }

    // MARK: Internals

    private struct TokenResponse: Decodable {
        let accessToken: String?
        let refreshToken: String?
        let expiresIn: Double?
        let expiresAt: Double?
        let user: AuthUser?
        let id: UUID?
        let email: String?
    }

    private struct EmptyResponse: Decodable {}

    private func store(_ response: TokenResponse, event: (AuthSession) -> AuthEvent) throws -> AuthSession {
        guard let access = response.accessToken, let refresh = response.refreshToken, let user = response.user else {
            throw APIError.invalidResponse
        }
        let expiry: Date
        if let at = response.expiresAt { expiry = Date(timeIntervalSince1970: at) }
        else { expiry = Date().addingTimeInterval(response.expiresIn ?? 3600) }
        let newSession = AuthSession(accessToken: access, refreshToken: refresh, expiresAt: expiry, user: user)
        current = newSession
        keychain.setCodable(newSession, for: storageKey)
        broadcast(event(newSession))
        return newSession
    }

    private func broadcast(_ event: AuthEvent) {
        for continuation in continuations.values { continuation.yield(event) }
    }

    private func post<Body: Encodable, Response: Decodable>(_ path: String, body: Body) async throws -> Response {
        let url = URL(string: "auth/v1/\(path)", relativeTo: config.supabaseURL)!.absoluteURL
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.httpBody = try JSONCoding.encoder.encode(body)
        let (data, response): (Data, URLResponse)
        do { (data, response) = try await session.data(for: request) } catch { throw APIError.from(error) }
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONCoding.decoder.decode(SupabaseErrorBody.self, from: data))?.bestMessage
            switch http.statusCode {
            case 401: throw APIError.unauthorized
            case 429: throw APIError.rateLimited
            default: throw APIError.server(status: http.statusCode, message: message)
            }
        }
        if data.isEmpty, let empty = EmptyResponse() as? Response { return empty }
        do { return try JSONCoding.decoder.decode(Response.self, from: data) }
        catch { throw APIError.decoding(String(describing: error)) }
    }
}

enum PKCE {
    static func makeVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64URLEncoded
    }

    static func challenge(for verifier: String) -> String {
        Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncoded
    }

    /// Random nonce for Sign in with Apple.
    static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

extension Data {
    var base64URLEncoded: String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
