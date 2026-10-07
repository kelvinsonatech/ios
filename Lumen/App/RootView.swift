import SwiftUI

struct RootView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(SessionStore.self) private var session

    var body: some View {
        ZStack {
            Theme.Palette.background.ignoresSafeArea()
            switch session.state {
            case .launching:
                LaunchView()
            case .signedOut:
                OnboardingFlowView(model: OnboardingViewModel(env: env, requiresAuth: true))
                    .transition(.opacity)
            case .needsOnboarding:
                OnboardingFlowView(model: OnboardingViewModel(env: env, requiresAuth: false))
                    .transition(.opacity)
            case .ready:
                MainTabView()
                    .transition(.opacity)
            }
        }
        .motionAware(Theme.Motion.gentle, value: session.state)
    }
}

private struct LaunchView: View {
    var body: some View {
        VStack(spacing: Theme.Spacing.lg) {
            LumenMark(size: 72)
            ProgressView()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading Lumen")
    }
}

/// The Lumen brand mark: a rounded tile with a stylised spark.
struct LumenMark: View {
    var size: CGFloat = 56

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
            .fill(LinearGradient(colors: [Theme.Palette.brand, Theme.Palette.brand.opacity(0.75)],
                                 startPoint: .topLeading, endPoint: .bottomTrailing))
            .frame(width: size, height: size)
            .overlay(
                Image(systemName: "sparkle")
                    .font(.system(size: size * 0.46, weight: .semibold))
                    .foregroundStyle(.white)
            )
            .accessibilityHidden(true)
    }
}
