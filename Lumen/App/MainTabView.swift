import SwiftUI

struct MainTabView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AppRouter.self) private var router
    @Environment(NetworkMonitor.self) private var network

    var body: some View {
        @Bindable var router = router
        TabView(selection: $router.selectedTab) {
            HomeView(model: HomeViewModel(env: env))
                .tabItem { Label(AppTab.home.title, systemImage: AppTab.home.symbol) }
                .tag(AppTab.home)

            CourseCatalogView(model: CourseCatalogViewModel(env: env))
                .tabItem { Label(AppTab.courses.title, systemImage: AppTab.courses.symbol) }
                .tag(AppTab.courses)

            TutorView(model: TutorViewModel(env: env))
                .tabItem { Label(AppTab.tutor.title, systemImage: AppTab.tutor.symbol) }
                .tag(AppTab.tutor)

            PracticeHubView(model: PracticeHubViewModel(env: env))
                .tabItem { Label(AppTab.practice.title, systemImage: AppTab.practice.symbol) }
                .tag(AppTab.practice)

            ProfileView(model: ProfileViewModel(env: env))
                .tabItem { Label(AppTab.profile.title, systemImage: AppTab.profile.symbol) }
                .tag(AppTab.profile)
        }
        .symbolEffect(.bounce, value: router.selectedTab)
        .sensoryFeedback(.selection, trigger: router.selectedTab)
        .overlay(alignment: .top) {
            if !network.isConnected {
                OfflineBanner()
                    .padding(.top, Theme.Spacing.xs)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .motionAware(Theme.Motion.gentle, value: network.isConnected)
        .sheet(isPresented: $router.isPaywallPresented) {
            PaywallView()
        }
        .fullScreenCover(item: Binding(
            get: { router.presentedLiveQuizId.map(IdentifiedUUID.init) },
            set: { router.presentedLiveQuizId = $0?.id }
        )) { item in
            LiveQuizContainerView(model: LiveQuizViewModel(env: env, quizId: item.id))
        }
    }
}

struct IdentifiedUUID: Identifiable, Hashable {
    let id: UUID
}
