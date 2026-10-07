import Foundation

/// A single change delivered by Supabase Realtime `postgres_changes`.
struct PostgresChange: Sendable {
    enum Kind: String, Sendable { case insert = "INSERT", update = "UPDATE", delete = "DELETE" }
    let kind: Kind
    let table: String
    let record: JSONValue?
    let oldRecord: JSONValue?
}

/// Minimal Phoenix-channel client for Supabase Realtime over URLSessionWebSocketTask.
/// One instance manages one socket; each `channel` call joins a topic and streams its changes.
actor RealtimeClient {
    private let config: AppConfig
    private let auth: AuthClient
    private var socket: URLSessionWebSocketTask?
    private var heartbeatTask: Task<Void, Never>?
    private var receiveTask: Task<Void, Never>?
    private var ref = 0
    private var subscriptions: [String: Subscription] = [:]

    private struct Subscription {
        let joinPayload: [String: JSONValue]
        let continuation: AsyncStream<PostgresChange>.Continuation
    }

    init(config: AppConfig, auth: AuthClient) {
        self.config = config
        self.auth = auth
    }

    /// Subscribes to row changes for `table` filtered by e.g. `quiz_id=eq.<uuid>`.
    func changes(table: String, filter: String?, topic: String) async -> AsyncStream<PostgresChange> {
        let (stream, continuation) = AsyncStream<PostgresChange>.makeStream(bufferingPolicy: .bufferingNewest(200))
        var change: [String: JSONValue] = ["event": .string("*"), "schema": .string("public"), "table": .string(table)]
        if let filter { change["filter"] = .string(filter) }
        let payload: [String: JSONValue] = [
            "config": .object([
                "broadcast": .object(["self": .bool(false)]),
                "presence": .object(["key": .string("")]),
                "postgres_changes": .array([.object(change)])
            ])
        ]
        let fullTopic = "realtime:\(topic)"
        subscriptions[fullTopic] = Subscription(joinPayload: payload, continuation: continuation)
        continuation.onTermination = { [weak self] _ in
            Task { await self?.leave(fullTopic) }
        }
        await connectIfNeeded()
        await join(fullTopic)
        return stream
    }

    func disconnect() {
        heartbeatTask?.cancel()
        receiveTask?.cancel()
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        for sub in subscriptions.values { sub.continuation.finish() }
        subscriptions.removeAll()
    }

    // MARK: Connection

    private func connectIfNeeded() async {
        guard socket == nil else { return }
        var components = URLComponents(url: config.supabaseURL.appending(path: "realtime/v1/websocket"), resolvingAgainstBaseURL: false)!
        components.scheme = config.supabaseURL.scheme == "https" ? "wss" : "ws"
        components.queryItems = [
            .init(name: "apikey", value: config.supabaseAnonKey),
            .init(name: "vsn", value: "1.0.0")
        ]
        let task = URLSession.shared.webSocketTask(with: components.url!)
        socket = task
        task.resume()
        receiveTask = Task { [weak self] in await self?.receiveLoop() }
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(25))
                await self?.push(topic: "phoenix", event: "heartbeat", payload: [:])
            }
        }
    }

    private func join(_ topic: String) async {
        guard var payload = subscriptions[topic]?.joinPayload else { return }
        if let token = try? await auth.validAccessToken() { payload["access_token"] = .string(token) }
        push(topic: topic, event: "phx_join", payload: payload)
    }

    private func leave(_ topic: String) {
        guard subscriptions.removeValue(forKey: topic) != nil else { return }
        push(topic: topic, event: "phx_leave", payload: [:])
        if subscriptions.isEmpty { disconnect() }
    }

    private func push(topic: String, event: String, payload: [String: JSONValue]) {
        guard let socket else { return }
        ref += 1
        let message: [String: JSONValue] = [
            "topic": .string(topic), "event": .string(event),
            "payload": .object(payload), "ref": .string(String(ref))
        ]
        guard let data = try? JSONEncoder().encode(message), let text = String(data: data, encoding: .utf8) else { return }
        socket.send(.string(text)) { _ in }
    }

    private func receiveLoop() async {
        while let socket, !Task.isCancelled {
            do {
                let message = try await socket.receive()
                let data: Data?
                switch message {
                case .string(let text): data = text.data(using: .utf8)
                case .data(let d): data = d
                @unknown default: data = nil
                }
                if let data { handle(data) }
            } catch {
                await reconnect()
                return
            }
        }
    }

    private func reconnect() async {
        heartbeatTask?.cancel()
        socket = nil
        guard !subscriptions.isEmpty else { return }
        try? await Task.sleep(for: .seconds(2))
        await connectIfNeeded()
        for topic in subscriptions.keys { await join(topic) }
    }

    private func handle(_ data: Data) {
        guard let envelope = try? JSONDecoder().decode([String: JSONValue].self, from: data),
              let topic = envelope["topic"]?.stringValue,
              envelope["event"]?.stringValue == "postgres_changes",
              let subscription = subscriptions[topic],
              let body = envelope["payload"]?["data"],
              let type = body["type"]?.stringValue,
              let kind = PostgresChange.Kind(rawValue: type)
        else { return }
        subscription.continuation.yield(PostgresChange(
            kind: kind,
            table: body["table"]?.stringValue ?? "",
            record: body["record"],
            oldRecord: body["old_record"]
        ))
    }
}
