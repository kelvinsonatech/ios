import Foundation

/// Thin, dependency-free Supabase client built on URLSession.
/// Covers PostgREST (tables + RPC), Storage signed URLs and Edge Functions.
final class SupabaseClient: Sendable {
    let config: AppConfig
    let auth: AuthClient
    let session: URLSession

    init(config: AppConfig = .current) {
        let configuration = URLSessionConfiguration.default
        configuration.waitsForConnectivity = false
        configuration.timeoutIntervalForRequest = 30
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.config = config
        self.session = URLSession(configuration: configuration)
        self.auth = AuthClient(config: config, session: session)
    }

    // MARK: Builders

    func from(_ table: String) -> PostgrestQuery {
        PostgrestQuery(client: self, table: table)
    }

    func rpc<Response: Decodable, Params: Encodable>(_ function: String, params: Params) async throws -> Response {
        let body = try JSONCoding.encoder.encode(params)
        let data = try await send(path: "rest/v1/rpc/\(function)", method: "POST", body: body)
        return try decode(Response.self, from: data)
    }

    func rpc<Response: Decodable>(_ function: String) async throws -> Response {
        try await rpc(function, params: EmptyPayload())
    }

    /// RPC whose return value is ignored (`returns void`).
    func rpcVoid<Params: Encodable>(_ function: String, params: Params) async throws {
        let body = try JSONCoding.encoder.encode(params)
        try await send(path: "rest/v1/rpc/\(function)", method: "POST", body: body)
    }

    // MARK: Storage

    /// Creates a short-lived signed URL. Storage RLS decides whether the caller may read the object.
    func signedURL(bucket: String, path: String, expiresIn: Int = 3600) async throws -> URL {
        struct Body: Encodable { let expiresIn: Int }
        struct Response: Decodable { let signedURL: String?; let signedUrl: String? }
        let data = try await send(
            path: "storage/v1/object/sign/\(bucket)/\(path)",
            method: "POST",
            body: try JSONCoding.encoder.encode(Body(expiresIn: expiresIn))
        )
        // Storage returns `signedURL`; keep raw keys for this response.
        let response = try JSONDecoder().decode(Response.self, from: data)
        guard let relative = response.signedURL ?? response.signedUrl,
              let url = URL(string: "storage/v1" + relative, relativeTo: config.supabaseURL)?.absoluteURL
        else { throw APIError.invalidResponse }
        return url
    }

    func publicURL(bucket: String, path: String) -> URL {
        config.supabaseURL.appending(path: "storage/v1/object/public/\(bucket)/\(path)")
    }

    // MARK: Edge Functions

    func invoke<Response: Decodable, Body: Encodable>(function: String, body: Body) async throws -> Response {
        let data = try await send(path: "functions/v1/\(function)", method: "POST", body: try JSONCoding.encoder.encode(body))
        return try decode(Response.self, from: data)
    }

    /// Streams Server-Sent Events from an Edge Function, yielding each `data:` payload.
    func stream<Body: Encodable>(function: String, body: Body) -> AsyncThrowingStream<String, Error> {
        let encoded = Result { try JSONCoding.encoder.encode(body) }
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = try await authorizedRequest(path: "functions/v1/\(function)", method: "POST")
                    request.httpBody = try encoded.get()
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    request.timeoutInterval = 120
                    let (bytes, response) = try await session.bytes(for: request)
                    guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
                    guard (200..<300).contains(http.statusCode) else {
                        var data = Data()
                        for try await byte in bytes { data.append(byte) }
                        throw mapError(status: http.statusCode, data: data)
                    }
                    for try await line in bytes.lines {
                        try Task.checkCancellation()
                        guard line.hasPrefix("data:") else { continue }
                        let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                        if payload == "[DONE]" { break }
                        continuation.yield(payload)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: APIError.from(error))
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    // MARK: Transport

    func authorizedRequest(path: String, method: String, query: [URLQueryItem] = [], headers: [String: String] = [:]) async throws -> URLRequest {
        var components = URLComponents(url: config.supabaseURL, resolvingAgainstBaseURL: false)!
        components.path = "/" + path
        if !query.isEmpty {
            components.queryItems = query
            // PostgREST filter values may contain `+`, which URLComponents leaves unescaped.
            components.percentEncodedQuery = components.percentEncodedQuery?
                .replacingOccurrences(of: "+", with: "%2B")
        }
        guard let url = components.url else { throw APIError.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let token = (try? await auth.validAccessToken()) ?? config.supabaseAnonKey
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        for (key, value) in headers { request.setValue(value, forHTTPHeaderField: key) }
        return request
    }

    @discardableResult
    func send(path: String, method: String, query: [URLQueryItem] = [], headers: [String: String] = [:], body: Data? = nil, retryOnUnauthorized: Bool = true) async throws -> Data {
        var request = try await authorizedRequest(path: path, method: method, query: query, headers: headers)
        request.httpBody = body
        let (data, response): (Data, URLResponse)
        do { (data, response) = try await session.data(for: request) } catch { throw APIError.from(error) }
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401, retryOnUnauthorized, await auth.currentSession != nil {
            _ = try await auth.refresh()
            return try await send(path: path, method: method, query: query, headers: headers, body: body, retryOnUnauthorized: false)
        }
        guard (200..<300).contains(http.statusCode) else { throw mapError(status: http.statusCode, data: data) }
        return data
    }

    func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        if T.self == EmptyPayload.self, let empty = EmptyPayload() as? T { return empty }
        do { return try JSONCoding.decoder.decode(T.self, from: data) }
        catch { throw APIError.decoding(String(describing: error)) }
    }

    private func mapError(status: Int, data: Data) -> APIError {
        let body = try? JSONCoding.decoder.decode(SupabaseErrorBody.self, from: data)
        let reason = body?.hint ?? body?.message
        if body?.code == "premium_required" || reason == "premium_required" { return .premiumRequired }
        if reason == "rate_limited" { return .rateLimited }
        switch status {
        case 401: return .unauthorized
        case 403: return .forbidden
        case 404: return .notFound
        case 429: return .rateLimited
        case 402: return .premiumRequired
        default: return .server(status: status, message: body?.bestMessage)
        }
    }
}

struct EmptyPayload: Codable, Sendable {}
