import SwiftUI
import UIKit

/// Lumen design tokens. Every screen uses these instead of literal values.
enum Theme {
    // MARK: Colors

    enum Palette {
        /// Primary brand "Iris" — used for primary actions and selection.
        static let brand = Color(light: 0x5A4FF3, dark: 0x8981FF)
        static let brandSoft = Color(light: 0xEEEDFE, dark: 0x24224A)
        /// Warm accent for streaks and celebrations.
        static let ember = Color(light: 0xF2683C, dark: 0xFF8A5C)
        static let emberSoft = Color(light: 0xFDEDE6, dark: 0x3A2219)
        static let success = Color(light: 0x1F9D63, dark: 0x3DD68C)
        static let successSoft = Color(light: 0xE5F6EE, dark: 0x13301F)
        static let warning = Color(light: 0xD98E04, dark: 0xF5B83D)
        static let danger = Color(light: 0xD93D42, dark: 0xFF6369)
        static let dangerSoft = Color(light: 0xFCE9EA, dark: 0x3B1A1C)
        static let gold = Color(light: 0xC99A06, dark: 0xF2C94C)
        static let silver = Color(light: 0x8A94A6, dark: 0xB8C0CC)
        static let bronze = Color(light: 0xB0703B, dark: 0xD89A64)

        static let background = Color(light: 0xF8F8FC, dark: 0x0E0E17)
        static let surface = Color(light: 0xFFFFFF, dark: 0x181824)
        static let surfaceElevated = Color(light: 0xFFFFFF, dark: 0x21212F)
        static let surfaceMuted = Color(light: 0xF1F1F7, dark: 0x232333)
        static let separator = Color(light: 0xE4E4EE, dark: 0x2D2D3E)
        static let textPrimary = Color(light: 0x14141F, dark: 0xF3F3F8)
        static let textSecondary = Color(light: 0x5E5E72, dark: 0xA4A4B8)
        static let textTertiary = Color(light: 0x9090A4, dark: 0x6E6E84)
    }

    /// Stable per-subject tint so categories are recognisable without heavy colour blocks.
    static func subjectTint(_ categoryId: String) -> Color {
        switch categoryId {
        case "mathematics": Color(light: 0x3B6FE0, dark: 0x6E98FF)
        case "science": Color(light: 0x1C9A86, dark: 0x3FD1B7)
        case "computer-science", "computing", "programming": Color(light: 0x7A4FE0, dark: 0xA88BFF)
        case "english", "languages": Color(light: 0xD9535F, dark: 0xFF7F8A)
        case "data-science": Color(light: 0x0F8FBF, dark: 0x4CC3EE)
        case "business": Color(light: 0xC27C0E, dark: 0xF2B04C)
        default: Palette.brand
        }
    }

    // MARK: Spacing (4-pt grid)

    enum Spacing {
        static let xxs: CGFloat = 2
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
        static let xxxl: CGFloat = 48
        /// Horizontal page margin.
        static let page: CGFloat = 20
    }

    enum Radius {
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 22
        static let pill: CGFloat = 999
    }

    // MARK: Typography (all Dynamic Type aware)

    enum Typography {
        static let largeTitle = Font.system(.largeTitle, design: .rounded, weight: .bold)
        static let title = Font.system(.title2, design: .rounded, weight: .bold)
        static let headline = Font.system(.headline, design: .rounded, weight: .semibold)
        static let sectionTitle = Font.system(.title3, design: .rounded, weight: .semibold)
        static let body = Font.body
        static let bodyEmphasis = Font.body.weight(.semibold)
        static let callout = Font.callout
        static let caption = Font.caption
        static let captionEmphasis = Font.caption.weight(.semibold)
        static let metric = Font.system(.title, design: .rounded, weight: .bold).monospacedDigit()
        static let timer = Font.system(.title3, design: .monospaced, weight: .semibold)
        static let reading = Font.system(.body, design: .serif)
    }

    enum Shadow {
        static let card = (color: Color.black.opacity(0.06), radius: CGFloat(14), y: CGFloat(6))
    }

    enum Motion {
        static let snappy = Animation.spring(response: 0.32, dampingFraction: 0.82)
        static let gentle = Animation.easeInOut(duration: 0.25)
    }
}

extension Color {
    /// Dynamic colour from two hex values.
    init(light: UInt32, dark: UInt32) {
        self.init(uiColor: UIColor { traits in
            UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }
}

extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255,
                  green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255,
                  alpha: alpha)
    }
}

extension View {
    /// Applies motion only when Reduce Motion is off.
    func motionAware<V: Equatable>(_ animation: Animation, value: V) -> some View {
        modifier(MotionAwareAnimation(animation: animation, value: value))
    }

    func pagePadding() -> some View { padding(.horizontal, Theme.Spacing.page) }
}

private struct MotionAwareAnimation<V: Equatable>: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let animation: Animation
    let value: V

    func body(content: Content) -> some View {
        content.animation(reduceMotion ? nil : animation, value: value)
    }
}
