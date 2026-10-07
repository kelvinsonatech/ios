import Foundation

enum APIError: LocalizedError, Equatable {
    case offline
    case unauthorized
    case forbidden
    case notFound
    case rateLimited
    case premiumRequired
    case server(status: Int, message: String?)
    case decoding(String)
    case invalidResponse
    case cancelled

    var errorDescription: String? {
        switch self {
        case .offline: "You're offline. We'll sync as soon as you're back online."
        case .unauthorized: "Your session has expired. Please sign in again."
        case .forbidden: "You don't have access to this content."
        case .notFound: "We couldn't find what you were looking for."
        case .rateLimited: "You're going a little fast. Please try again in a moment."
        case .premiumRequired: "This is part of Lumen Premium."
        case .server(_, let message): message ?? "Something went wrong on our side. Please try again."
        case .decoding: "We received data we didn't understand. Please update the app."
        case .invalidResponse: "Unexpected response from the server."
        case .cancelled: "The request was cancelled."
        }
    }

    var isRetryable: Bool {
        switch self {
        case .offline, .rateLimited, .invalidResponse: true
        case .server(let status, _): status >= 500
        default: false
        }
    }

    static func from(_ error: Error) -> APIError {
        if let api = error as? APIError { return api }
        if error is CancellationError { return .cancelled }
        if let url = error as? URLError {
            switch url.code {
            case .cancelled: return .cancelled
            case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed,
                 .cannotFindHost, .cannotConnectToHost, .timedOut, .internationalRoamingOff:
                return .offline
            default: return .server(status: 0, message: url.localizedDescription)
            }
        }
        if error is DecodingError { return .decoding(String(describing: error)) }
        return .server(status: 0, message: error.localizedDescription)
    }
}

/// Error body shapes returned by PostgREST, GoTrue and Edge Functions.
struct SupabaseErrorBody: Decodable {
    let message: String?
    let msg: String?
    let error: String?
    let errorDescription: String?
    let code: String?
    let hint: String?

    var bestMessage: String? { errorDescription ?? message ?? msg ?? error }
}
