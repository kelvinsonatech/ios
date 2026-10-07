import Foundation
import Observation

@MainActor
@Observable
final class SessionStore {
    enum State: Equatable {
        case launching
        case signedOut
        case needsOnboarding
        case ready
    }

    private(set) var state: State = .launching
    private(set) var profile: Profile?
    private(set) var userId: UUID?

    @ObservationIgnored private let auth: AuthClient
    @ObservationIgnored private let profiles: ProfileRepository
    @ObservationIgnored private let cache: ResponseCache
    @ObservationIgnored private var eventsTask: Task<Void, Never>?

    init(auth: AuthClient, profiles: ProfileRepository, cache: ResponseCache) {
        self.auth = auth
        self.profiles = profiles
        self.cache = cache
    }

    var isPremium: Bool { profile?.isPremium ?? false }

    func restore() async {
        eventsTask?.cancel()
        eventsTask = Task { [weak self, auth] in
            for await event in await auth.events() {
                guard let self else { return }
                switch event {
                case .signedIn(let session):
                    self.userId = session.user.id
                    await self.refreshProfile()
                case .refreshed: break
                case .signedOut:
                    self.userId = nil
                    self.profile = nil
                    self.state = .signedOut
                }
            }
        }
        guard let session = await auth.currentSession else {
            state = .signedOut
            return
        }
        userId = session.user.id
        await refreshProfile()
    }

    func refreshProfile() async {
        do {
            let profile = try await profiles.me()
            self.profile = profile
            state = profile.onboardingCompleted ? .ready : .needsOnboarding
        } catch let error as APIError where error == .unauthorized {
            state = .signedOut
        } catch {
            // Offline with no cached profile: let the student in; screens show offline states.
            if state == .launching || state == .signedOut { state = profile == nil ? .needsOnboarding : .ready }
        }
    }

    /// Applies preferences collected before account creation.
    func completeOnboarding(_ update: ProfileUpdate) async throws {
        var update = update
        update.onboardingCompleted = true
        try await profiles.update(update)
        await refreshProfile()
    }

    func updateProfile(_ update: ProfileUpdate) async throws {
        try await profiles.update(update)
        await refreshProfile()
    }

    func signOut() async {
        await auth.signOut()
        cache.clear()
        profile = nil
        state = .signedOut
    }
}
