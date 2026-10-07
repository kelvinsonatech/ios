import Foundation
import Network
import Observation

@Observable
@MainActor
final class NetworkMonitor {
    private(set) var isConnected = true
    private(set) var isExpensive = false
    private(set) var isConstrained = false

    @ObservationIgnored private let monitor = NWPathMonitor()
    @ObservationIgnored private var continuations: [UUID: AsyncStream<Bool>.Continuation] = [:]

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in self?.update(path) }
        }
        monitor.start(queue: DispatchQueue(label: "lumen.network-monitor"))
    }

    /// Wi-Fi or wired; used by the "Wi-Fi only downloads" preference.
    var isOnUnmeteredNetwork: Bool { isConnected && !isExpensive }

    /// Emits whenever connectivity changes from offline to online.
    func reconnections() -> AsyncStream<Bool> {
        let id = UUID()
        let (stream, continuation) = AsyncStream<Bool>.makeStream()
        continuations[id] = continuation
        continuation.onTermination = { [weak self] _ in
            Task { @MainActor in self?.continuations[id] = nil }
        }
        return stream
    }

    private func update(_ path: NWPath) {
        let wasConnected = isConnected
        isConnected = path.status == .satisfied
        isExpensive = path.isExpensive
        isConstrained = path.isConstrained
        if isConnected && !wasConnected {
            continuations.values.forEach { $0.yield(true) }
        }
    }
}
