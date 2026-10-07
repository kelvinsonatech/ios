import Foundation
import Observation
import AuthenticationServices
import SwiftUI

/// Preferences gathered before the account exists; persisted so they survive the auth hand-off.
struct OnboardingDraft: Codable, Equatable {
    var interests: [String] = []
    var level: LearningLevel?
    var goal: LearningGoal?
    var displayName: String?

    var isComplete: Bool { !interests.isEmpty && level != nil && goal != nil }

    private static let key = "onboarding.draft"
    static func load() -> OnboardingDraft {
        guard let data = UserDefaults.standard.data(forKey: key),
              let draft = try? JSONDecoder().decode(OnboardingDraft.self, from: data) else { return OnboardingDraft() }
        return draft
    }
    func save() {
        if let data = try? JSONEncoder().encode(self) { UserDefaults.standard.set(data, forKey: Self.key) }
    }
    static func clear() { UserDefaults.standard.removeObject(forKey: key) }
}

@MainActor
@Observable
final class OnboardingViewModel {
    enum Step: Int, CaseIterable, Comparable {
        case welcome, interests, level, goal, account, finishing
        static func < (a: Step, b: Step) -> Bool { a.rawValue < b.rawValue }
    }

    enum AuthMode { case signUp, signIn }

    let requiresAuth: Bool
    var step: Step
    var draft: OnboardingDraft { didSet { draft.save() } }
    private(set) var categories: Loadable<[Category]> = .idle

    var authMode: AuthMode = .signUp
    var displayName = ""
    var email = ""
    var password = ""
    private(set) var isWorking = false
    var errorMessage: String?
    var infoMessage: String?

    @ObservationIgnored private let env: AppEnvironment
    @ObservationIgnored private var appleNonce: String?

    init(env: AppEnvironment, requiresAuth: Bool) {
        self.env = env
        self.requiresAuth = requiresAuth
        let draft = OnboardingDraft.load()
        self.draft = draft
        // Returning after authentication with answers already given: go straight to finishing.
        self.step = !requiresAuth && draft.isComplete ? .finishing : .welcome
    }

    var googleEnabled: Bool { env.client.config.googleAuthEnabled }

    var visibleSteps: [Step] {
        requiresAuth ? [.welcome, .interests, .level, .goal, .account] : [.welcome, .interests, .level, .goal]
    }

    var progress: Double {
        guard let index = visibleSteps.firstIndex(of: step) else { return 1 }
        return Double(index) / Double(max(visibleSteps.count - 1, 1))
    }

    var canContinue: Bool {
        switch step {
        case .welcome: true
        case .interests: !draft.interests.isEmpty
        case .level: draft.level != nil
        case .goal: draft.goal != nil
        case .account, .finishing: false
        }
    }

    func loadCategories() async {
        guard categories.value == nil else { return }
        categories = .loading
        do { categories = .loaded(try await env.courses.categories()) }
        catch { categories = .failed(.from(error)) }
    }

    func toggleInterest(_ id: String) {
        if let index = draft.interests.firstIndex(of: id) { draft.interests.remove(at: index) }
        else { draft.interests.append(id) }
    }

    func next() {
        guard let index = visibleSteps.firstIndex(of: step) else { return }
        if index + 1 < visibleSteps.count {
            step = visibleSteps[index + 1]
        } else {
            // FinishingStep triggers `finish()` when it appears.
            step = .finishing
        }
    }

    func back() {
        guard let index = visibleSteps.firstIndex(of: step), index > 0 else { return }
        step = visibleSteps[index - 1]
    }

    /// Saves preferences to the profile. Called once the student is authenticated.
    func finish() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await env.session.completeOnboarding(ProfileUpdate(
                displayName: draft.displayName ?? (displayName.isEmpty ? nil : displayName),
                interests: draft.interests, level: draft.level, goal: draft.goal
            ))
            OnboardingDraft.clear()
        } catch {
            errorMessage = APIError.from(error).localizedDescription
            step = .goal
        }
    }

    // MARK: Email

    var isEmailFormValid: Bool {
        let emailOK = email.contains("@") && email.contains(".")
        let passwordOK = password.count >= 8
        return emailOK && passwordOK && (authMode == .signIn || !displayName.trimmingCharacters(in: .whitespaces).isEmpty)
    }

    func submitEmail() async {
        guard isEmailFormValid else { return }
        await run {
            switch self.authMode {
            case .signIn:
                _ = try await self.env.client.auth.signIn(email: self.email, password: self.password)
            case .signUp:
                self.draft.displayName = self.displayName
                let session = try await self.env.client.auth.signUp(email: self.email, password: self.password,
                                                                    displayName: self.displayName)
                if session == nil {
                    self.infoMessage = "Check your inbox to confirm your email, then sign in."
                    self.authMode = .signIn
                }
            }
        }
    }

    func resetPassword() async {
        guard email.contains("@") else { errorMessage = "Enter your email address first."; return }
        await run {
            try await self.env.client.auth.sendPasswordReset(email: self.email)
            self.infoMessage = "We've sent a password reset link to \(self.email)."
        }
    }

    // MARK: Apple

    func prepareAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = PKCE.randomNonce()
        appleNonce = nonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = PKCE.sha256(nonce)
    }

    func handleApple(_ result: Result<ASAuthorization, Error>) async {
        switch result {
        case .failure(let error):
            if (error as? ASAuthorizationError)?.code != .canceled { errorMessage = error.localizedDescription }
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let token = String(data: tokenData, encoding: .utf8),
                  let nonce = appleNonce else {
                errorMessage = "Apple sign-in didn't return a valid token."
                return
            }
            // Apple only shares the name on first sign-in; keep it for the profile.
            if let name = credential.fullName {
                let formatted = PersonNameComponentsFormatter().string(from: name)
                if !formatted.isEmpty { draft.displayName = formatted }
            }
            await run { _ = try await self.env.client.auth.signInWithApple(idToken: token, nonce: nonce) }
        }
    }

    // MARK: Google (OAuth + PKCE through ASWebAuthenticationSession)

    func signInWithGoogle(using session: WebAuthenticationSession) async {
        let (url, verifier) = await env.client.auth.oauthAuthorizeURL(provider: "google")
        await run {
            let callback = try await session.authenticate(using: url, callbackURLScheme: self.env.client.config.authCallbackScheme,
                                                          preferredBrowserSession: .ephemeral)
            guard let code = URLComponents(url: callback, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "code" })?.value else { throw APIError.unauthorized }
            _ = try await self.env.client.auth.exchangeOAuthCode(code, verifier: verifier)
        }
    }

    private func run(_ operation: @escaping () async throws -> Void) async {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            try await operation()
            Haptics.success()
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            return
        } catch {
            Haptics.error()
            errorMessage = APIError.from(error).localizedDescription
        }
    }
}
