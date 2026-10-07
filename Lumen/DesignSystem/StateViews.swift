import SwiftUI

/// Uniform async state for screens.
enum Loadable<Value> {
    case idle
    case loading
    case loaded(Value)
    case failed(APIError)

    var value: Value? {
        if case .loaded(let v) = self { return v }
        return nil
    }

    var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }
}

struct LoadingView: View {
    var message: String?

    var body: some View {
        VStack(spacing: Theme.Spacing.md) {
            ProgressView().controlSize(.large)
            if let message {
                Text(message).font(Theme.Typography.callout).foregroundStyle(Theme.Palette.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(Theme.Spacing.xxl)
    }
}

struct EmptyStateView: View {
    let symbol: String
    let title: String
    let message: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: symbol)
        } description: {
            Text(message)
        } actions: {
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(.pillTinted)
            }
        }
    }
}

struct ErrorStateView: View {
    let error: APIError
    var retry: (() -> Void)?

    var body: some View {
        ContentUnavailableView {
            Label(error == .offline ? "You're offline" : "Something went wrong",
                  systemImage: error == .offline ? "wifi.slash" : "exclamationmark.triangle")
        } description: {
            Text(error.localizedDescription)
        } actions: {
            if let retry {
                Button("Try again", action: retry).buttonStyle(.pillTinted)
            }
        }
    }
}

/// Renders a `Loadable` with consistent loading / error handling.
struct LoadableView<Value, Content: View>: View {
    let state: Loadable<Value>
    var retry: (() -> Void)?
    @ViewBuilder let content: (Value) -> Content

    var body: some View {
        switch state {
        case .idle, .loading:
            LoadingView()
        case .failed(let error):
            ErrorStateView(error: error, retry: retry)
        case .loaded(let value):
            content(value)
        }
    }
}

/// Skeleton placeholder block for content-shaped loading states.
struct SkeletonBlock: View {
    var height: CGFloat = 16
    var width: CGFloat? = nil
    @State private var shimmer = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
            .fill(Theme.Palette.surfaceMuted)
            .frame(width: width, height: height)
            .opacity(shimmer ? 0.5 : 1)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.9).repeatForever()) { shimmer = true }
            }
            .accessibilityHidden(true)
    }
}

/// Small banner shown at the top of screens while offline.
struct OfflineBanner: View {
    var body: some View {
        Label("Offline — showing saved content", systemImage: "wifi.slash")
            .font(Theme.Typography.captionEmphasis)
            .foregroundStyle(Theme.Palette.textSecondary)
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.vertical, Theme.Spacing.sm)
            .background(.thinMaterial, in: Capsule())
            .accessibilityAddTraits(.isStaticText)
    }
}

/// Toast for XP rewards and confirmations.
struct RewardToast: View {
    let xp: Int
    var message: String = "Nice work!"

    var body: some View {
        HStack(spacing: Theme.Spacing.sm) {
            Image(systemName: "sparkles").foregroundStyle(Theme.Palette.gold)
            Text(message).font(Theme.Typography.bodyEmphasis)
            if xp > 0 {
                Text("+\(xp) XP")
                    .font(Theme.Typography.captionEmphasis)
                    .foregroundStyle(Theme.Palette.brand)
                    .padding(.horizontal, Theme.Spacing.sm)
                    .padding(.vertical, Theme.Spacing.xs)
                    .background(Theme.Palette.brandSoft, in: Capsule())
            }
        }
        .padding(.horizontal, Theme.Spacing.lg)
        .padding(.vertical, Theme.Spacing.md)
        .background(.regularMaterial, in: Capsule())
        .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
        .accessibilityElement(children: .combine)
    }
}
