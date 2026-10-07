import SwiftUI

/// Typed navigation destinations shared by every tab's NavigationStack.
enum Route: Hashable {
    case course(UUID)
    case lesson(lessonId: UUID, courseId: UUID)
    case exam(Exam)
    case examList(courseId: UUID?)
    case practice(PracticeRequest, title: String)
    case library
    case ebook(Ebook)
    case downloads
    case flashcards
    case deck(FlashcardDeck)
    case achievements
    case bookmarks
    case notifications
    case liveQuizzes
    case settings
}

private struct RouteDestinations: ViewModifier {
    @Environment(AppEnvironment.self) private var env

    func body(content: Content) -> some View {
        content.navigationDestination(for: Route.self) { route in
            switch route {
            case .course(let id):
                CourseDetailView(model: CourseDetailViewModel(env: env, courseId: id))
            case .lesson(let lessonId, let courseId):
                LessonView(model: LessonViewModel(env: env, lessonId: lessonId, courseId: courseId))
            case .exam(let exam):
                ExamIntroView(exam: exam)
            case .examList(let courseId):
                ExamListView(model: ExamListViewModel(env: env, courseId: courseId))
            case .practice(let request, let title):
                PracticeSessionView(model: PracticeSessionViewModel(env: env, request: request, title: title))
            case .library:
                LibraryView(model: LibraryViewModel(env: env))
            case .ebook(let book):
                ReaderView(model: ReaderViewModel(env: env, book: book))
            case .downloads:
                DownloadsView()
            case .flashcards:
                DeckListView(model: DeckListViewModel(env: env))
            case .deck(let deck):
                FlashcardStudyView(model: FlashcardStudyViewModel(env: env, deck: deck))
            case .achievements:
                AchievementsView(model: AchievementsViewModel(env: env))
            case .bookmarks:
                BookmarksView(model: BookmarksViewModel(env: env))
            case .notifications:
                NotificationsView(model: NotificationsViewModel(env: env))
            case .liveQuizzes:
                LiveQuizListView(model: LiveQuizListViewModel(env: env))
            case .settings:
                SettingsView()
            }
        }
    }
}

extension View {
    func withAppRoutes() -> some View { modifier(RouteDestinations()) }
}
