import Foundation

/// Runtime configuration read from Info.plist (populated from `Config/Secrets.xcconfig`).
struct AppConfig: Sendable {
    let supabaseURL: URL
    let supabaseAnonKey: String
    let googleAuthEnabled: Bool
    let storeKitProductIDs: [String]
    let authCallbackScheme: String

    static let current: AppConfig = {
        let info = Bundle.main.infoDictionary ?? [:]
        func string(_ key: String) -> String {
            (info[key] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
        }
        let rawURL = string("SupabaseURL")
        guard let url = URL(string: rawURL), url.scheme?.hasPrefix("http") == true else {
            fatalError("SupabaseURL missing. Copy Config/Secrets.example.xcconfig to Config/Secrets.xcconfig.")
        }
        return AppConfig(
            supabaseURL: url,
            supabaseAnonKey: string("SupabaseAnonKey"),
            googleAuthEnabled: string("GoogleAuthEnabled").uppercased() == "YES",
            storeKitProductIDs: string("StoreKitProductIDs")
                .split(separator: ",")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty },
            authCallbackScheme: string("AuthCallbackScheme").isEmpty ? "lumen" : string("AuthCallbackScheme")
        )
    }()

    var authCallbackURL: URL { URL(string: "\(authCallbackScheme)://auth-callback")! }
}
