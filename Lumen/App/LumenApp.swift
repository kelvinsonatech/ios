import SwiftUI
import SwiftData

@main
struct LumenApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var environment = AppEnvironment()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(environment)
                .environment(environment.network)
                .environment(environment.downloads)
                .environment(environment.subscriptions)
                .environment(environment.session)
                .environment(environment.router)
                .modelContainer(environment.modelContainer)
                .tint(Theme.Palette.brand)
                .task { await environment.start() }
        }
    }
}
