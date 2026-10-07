import SwiftUI

// MARK: Surfaces

struct CardModifier: ViewModifier {
    var padding: CGFloat = Theme.Spacing.lg
    var radius: CGFloat = Theme.Radius.lg

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(Theme.Palette.separator.opacity(0.6), lineWidth: 0.5)
            )
            .shadow(color: Theme.Shadow.card.color, radius: Theme.Shadow.card.radius, y: Theme.Shadow.card.y)
    }
}

extension View {
    func card(padding: CGFloat = Theme.Spacing.lg, radius: CGFloat = Theme.Radius.lg) -> some View {
        modifier(CardModifier(padding: padding, radius: radius))
    }

    /// Flat grouped surface without shadow, for secondary content.
    func inset(padding: CGFloat = Theme.Spacing.lg) -> some View {
        self.padding(padding)
            .background(Theme.Palette.surfaceMuted, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
    }
}

// MARK: Headers

struct SectionHeader<Trailing: View>: View {
    let title: String
    var subtitle: String?
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                Text(title)
                    .font(Theme.Typography.sectionTitle)
                    .foregroundStyle(Theme.Palette.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                if let subtitle {
                    Text(subtitle).font(Theme.Typography.caption).foregroundStyle(Theme.Palette.textSecondary)
                }
            }
            Spacer(minLength: Theme.Spacing.sm)
            trailing()
        }
    }
}

extension SectionHeader where Trailing == EmptyView {
    init(_ title: String, subtitle: String? = nil) {
        self.init(title: title, subtitle: subtitle) { EmptyView() }
    }
}

// MARK: Badges & tags

struct Tag: View {
    let text: String
    var symbol: String?
    var tint: Color = Theme.Palette.textSecondary

    var body: some View {
        HStack(spacing: Theme.Spacing.xs) {
            if let symbol { Image(systemName: symbol).imageScale(.small) }
            Text(text)
        }
        .font(Theme.Typography.captionEmphasis)
        .foregroundStyle(tint)
        .padding(.horizontal, Theme.Spacing.sm)
        .padding(.vertical, Theme.Spacing.xs)
        .background(tint.opacity(0.12), in: Capsule())
    }
}

struct PremiumBadge: View {
    var isPremium: Bool

    var body: some View {
        if isPremium {
            Tag(text: "Premium", symbol: "crown.fill", tint: Theme.Palette.gold)
        } else {
            Tag(text: "Free", tint: Theme.Palette.success)
        }
    }
}

struct MetaLabel: View {
    let symbol: String
    let text: String

    var body: some View {
        Label(text, systemImage: symbol)
            .labelStyle(.titleAndIcon)
            .font(Theme.Typography.caption)
            .foregroundStyle(Theme.Palette.textSecondary)
    }
}

// MARK: Progress

struct LinearProgress: View {
    let value: Double
    var tint: Color = Theme.Palette.brand
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.Palette.surfaceMuted)
                Capsule().fill(tint)
                    .frame(width: max(height, proxy.size.width * min(max(value, 0), 1)))
                    .opacity(value > 0 ? 1 : 0)
            }
        }
        .frame(height: height)
        .accessibilityElement()
        .accessibilityLabel("Progress")
        .accessibilityValue("\(Int(value * 100)) percent")
    }
}

struct ProgressRing: View {
    let value: Double
    var lineWidth: CGFloat = 6
    var tint: Color = Theme.Palette.brand

    var body: some View {
        ZStack {
            Circle().stroke(Theme.Palette.surfaceMuted, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: min(max(value, 0), 1))
                .stroke(tint, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .accessibilityElement()
        .accessibilityLabel("Progress")
        .accessibilityValue("\(Int(value * 100)) percent")
    }
}

// MARK: Imagery

/// Remote image with a calm tinted placeholder and an SF Symbol fallback.
struct RemoteImage: View {
    let url: URL?
    var symbol = "book"
    var tint: Color = Theme.Palette.brand

    var body: some View {
        AsyncImage(url: url, transaction: Transaction(animation: Theme.Motion.gentle)) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFill()
            default:
                ZStack {
                    LinearGradient(colors: [tint.opacity(0.22), tint.opacity(0.08)], startPoint: .topLeading, endPoint: .bottomTrailing)
                    Image(systemName: symbol)
                        .font(.system(size: 28, weight: .medium))
                        .foregroundStyle(tint.opacity(0.7))
                }
            }
        }
        .clipped()
        .accessibilityHidden(true)
    }
}

struct Avatar: View {
    let name: String
    let url: URL?
    var size: CGFloat = 40

    var body: some View {
        ZStack {
            Circle().fill(Theme.Palette.brandSoft)
            if let url {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: { initials }
            } else {
                initials
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityLabel(name)
    }

    private var initials: some View {
        Text(name.split(separator: " ").prefix(2).compactMap { $0.first.map(String.init) }.joined().uppercased())
            .font(.system(size: size * 0.38, weight: .semibold, design: .rounded))
            .foregroundStyle(Theme.Palette.brand)
    }
}

// MARK: Selection chips

struct ChipPicker<Item: Hashable & Identifiable>: View {
    let items: [Item]
    @Binding var selection: Item
    let label: (Item) -> String

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Theme.Spacing.sm) {
                ForEach(items) { item in
                    let isSelected = item == selection
                    Button {
                        Haptics.selection()
                        selection = item
                    } label: {
                        Text(label(item))
                            .font(Theme.Typography.callout.weight(.medium))
                            .padding(.horizontal, Theme.Spacing.md)
                            .padding(.vertical, Theme.Spacing.sm)
                            .foregroundStyle(isSelected ? Color.white : Theme.Palette.textPrimary)
                            .background(isSelected ? Theme.Palette.brand : Theme.Palette.surfaceMuted, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(isSelected ? [.isSelected] : [])
                }
            }
            .pagePadding()
        }
    }
}

/// Large selectable row used in onboarding and settings.
struct SelectableRow: View {
    let title: String
    var subtitle: String?
    let symbol: String
    let isSelected: Bool
    var tint: Color = Theme.Palette.brand
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.selection()
            action()
        } label: {
            HStack(spacing: Theme.Spacing.md) {
                Image(systemName: symbol)
                    .font(.title3)
                    .foregroundStyle(isSelected ? .white : tint)
                    .frame(width: 44, height: 44)
                    .background(isSelected ? tint : tint.opacity(0.12), in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
                VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                    Text(title).font(Theme.Typography.bodyEmphasis).foregroundStyle(Theme.Palette.textPrimary)
                    if let subtitle {
                        Text(subtitle).font(Theme.Typography.caption).foregroundStyle(Theme.Palette.textSecondary)
                    }
                }
                Spacer()
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(isSelected ? tint : Theme.Palette.textTertiary)
            }
            .padding(Theme.Spacing.md)
            .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                    .strokeBorder(isSelected ? tint : Theme.Palette.separator, lineWidth: isSelected ? 2 : 1)
            )
        }
        .buttonStyle(.card)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}

// MARK: Stat tile

struct StatTile: View {
    let value: String
    let label: String
    let symbol: String
    var tint: Color = Theme.Palette.brand

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Image(systemName: symbol)
                .font(.callout.weight(.semibold))
                .foregroundStyle(tint)
            Text(value)
                .font(Theme.Typography.metric)
                .foregroundStyle(Theme.Palette.textPrimary)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            Text(label)
                .font(Theme.Typography.caption)
                .foregroundStyle(Theme.Palette.textSecondary)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .inset(padding: Theme.Spacing.md)
        .accessibilityElement(children: .combine)
    }
}

// MARK: Countdown

/// Live countdown that ticks once per second without driving the whole screen.
struct CountdownText: View {
    let target: Date
    var prefix = ""

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            Text(prefix + Self.format(target.timeIntervalSince(context.date)))
                .monospacedDigit()
        }
    }

    static func format(_ interval: TimeInterval) -> String {
        let total = max(0, Int(interval.rounded(.up)))
        let d = total / 86_400, h = (total % 86_400) / 3600, m = (total % 3600) / 60, s = total % 60
        if d > 0 { return "\(d)d \(h)h" }
        if h > 0 { return String(format: "%d:%02d:%02d", h, m, s) }
        return String(format: "%02d:%02d", m, s)
    }
}
