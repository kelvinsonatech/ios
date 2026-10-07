import Foundation
import SwiftData
import Observation

/// Composition root. Owns long-lived services and exposes repositories to features.
@MainActor
@Observable
final class AppEnvironment {
    let client: SupabaseClient
    let modelContainer: ModelContainer
    let cache: ResponseCache
    let sync: SyncEngine
    let realtime: RealtimeClient

    let courses: CourseRepository
    let progress: ProgressRepository
    let profiles: ProfileRepository
    let questions: QuestionRepository
    let exams: ExamRepository
    let liveQuizzes: LiveQuizRepository
    let library: LibraryRepository
    let flashcards: FlashcardRepository
    let tutor: TutorRepository
    let notifications: NotificationService

    let network: NetworkMonitor
    let downloads: DownloadManager
    let subscriptions: SubscriptionStore
    let session: SessionStore
    let router: AppRouter

    init(config: AppConfig = .current, inMemoryStore: Bool = false) {
        let client = SupabaseClient(config: config)
        let container = LocalStore.makeContainer(inMemory: inMemoryStore)
        let cache = ResponseCache(container: container)
        let sync = SyncEngine(client: client, container: container)
        let network = NetworkMonitor()

        let realtime = RealtimeClient(config: config, auth: client.auth)
        let courses = CourseRepository(client: client, cache: cache)
        let profiles = ProfileRepository(client: client, cache: cache)
        let questions = QuestionRepository(client: client, cache: cache)
        let library = LibraryRepository(client: client, cache: cache, sync: sync)
        let session = SessionStore(auth: client.auth, profiles: profiles, cache: cache)

        self.client = client
        self.modelContainer = container
        self.cache = cache
        self.sync = sync
        self.network = network
        self.realtime = realtime
        self.courses = courses
        self.profiles = profiles
        self.questions = questions
        self.library = library
        self.session = session
        self.progress = ProgressRepository(client: client, cache: cache, sync: sync)
        self.exams = ExamRepository(client: client)
        self.liveQuizzes = LiveQuizRepository(client: client, realtime: realtime)
        self.flashcards = FlashcardRepository(client: client, sync: sync)
        self.tutor = TutorRepository(client: client)
        self.notifications = NotificationService()
        self.downloads = DownloadManager(container: container, client: client, courses: courses,
                                         library: library, questions: questions, network: network)
        self.subscriptions = SubscriptionStore(client: client, productIDs: config.storeKitProductIDs)
        self.router = AppRouter()

        subscriptions.onEntitlementChange = { [weak session] in await session?.refreshProfile() }
        AppDelegate.onDeviceToken = { [profiles] token in
            Task { await profiles.registerDevice(token: token) }
        }
    }

    /// Long-running background work tied to the app lifecycle.
    func start() async {
        await session.restore()
        await sync.flush()
        await subscriptions.refreshEntitlements()
        for await _ in network.reconnections() {
            await sync.flush()
        }
    }
}
