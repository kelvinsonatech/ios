import SwiftUI

/// Full-width filled button for the single most important action on a screen.
struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    var tint: Color = Theme.Palette.brand
    var isLoading = false

    func makeBody(configuration: Configuration) -> some View {
        ZStack {
            configuration.label.opacity(isLoading ? 0 : 1)
            if isLoading { ProgressView().tint(.white) }
        }
        .font(Theme.Typography.headline)
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, minHeight: 52)
        .background(tint.opacity(isEnabled ? 1 : 0.4), in: RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
        .scaleEffect(configuration.isPressed ? 0.98 : 1)
        .animation(Theme.Motion.snappy, value: configuration.isPressed)
    }
}

/// Tinted secondary button.
struct SecondaryButtonStyle: ButtonStyle {
    var tint: Color = Theme.Palette.brand

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.Typography.headline)
            .foregroundStyle(tint)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(Theme.Motion.snappy, value: configuration.isPressed)
    }
}

/// Compact capsule button used inside cards ("Continue", "Join").
struct PillButtonStyle: ButtonStyle {
    var tint: Color = Theme.Palette.brand
    var filled = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.Typography.captionEmphasis)
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.vertical, Theme.Spacing.sm)
            .foregroundStyle(filled ? .white : tint)
            .background(filled ? tint : tint.opacity(0.12), in: Capsule())
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

/// Subtle press feedback for tappable cards.
struct CardButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .opacity(configuration.isPressed ? 0.92 : 1)
            .animation(Theme.Motion.snappy, value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == PrimaryButtonStyle {
    static var primary: PrimaryButtonStyle { PrimaryButtonStyle() }
    static func primary(loading: Bool, tint: Color = Theme.Palette.brand) -> PrimaryButtonStyle {
        PrimaryButtonStyle(tint: tint, isLoading: loading)
    }
}

extension ButtonStyle where Self == SecondaryButtonStyle {
    static var secondary: SecondaryButtonStyle { SecondaryButtonStyle() }
}

extension ButtonStyle where Self == PillButtonStyle {
    static var pill: PillButtonStyle { PillButtonStyle() }
    static var pillTinted: PillButtonStyle { PillButtonStyle(filled: false) }
}

extension ButtonStyle where Self == CardButtonStyle {
    static var card: CardButtonStyle { CardButtonStyle() }
}
