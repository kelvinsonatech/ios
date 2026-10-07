import SwiftUI

/// Vertical card used in horizontal carousels.
struct CourseTile: View {
    let course: Course
    var progress: Double?
    var width: CGFloat = 220

    var body: some View {
        let tint = Theme.subjectTint(course.categoryId)
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            RemoteImage(url: course.thumbnailUrl, symbol: "book.pages", tint: tint)
                .frame(width: width, height: width * 0.56)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
                .overlay(alignment: .topTrailing) {
                    if course.isPremium {
                        Image(systemName: "crown.fill")
                            .font(.caption)
                            .foregroundStyle(Theme.Palette.gold)
                            .padding(6)
                            .background(.ultraThinMaterial, in: Circle())
                            .padding(Theme.Spacing.sm)
                            .accessibilityLabel("Premium")
                    }
                }
            Text(course.title)
                .font(Theme.Typography.headline)
                .foregroundStyle(Theme.Palette.textPrimary)
                .lineLimit(2, reservesSpace: true)
            if let progress {
                HStack(spacing: Theme.Spacing.sm) {
                    LinearProgress(value: progress, tint: tint, height: 4)
                    Text("\(Int(progress * 100))%")
                        .font(Theme.Typography.captionEmphasis)
                        .foregroundStyle(Theme.Palette.textSecondary)
                        .monospacedDigit()
                }
            } else {
                Text(course.instructor?.name ?? course.level.title)
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Palette.textSecondary)
                    .lineLimit(1)
            }
        }
        .frame(width: width)
        .accessibilityElement(children: .combine)
    }
}

/// Full-width row used in the catalog and search results.
struct CourseRow: View {
    let course: Course
    var isDownloaded = false

    var body: some View {
        let tint = Theme.subjectTint(course.categoryId)
        HStack(alignment: .top, spacing: Theme.Spacing.md) {
            RemoteImage(url: course.thumbnailUrl, symbol: "book.pages", tint: tint)
                .frame(width: 104, height: 78)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text(course.title)
                    .font(Theme.Typography.headline)
                    .foregroundStyle(Theme.Palette.textPrimary)
                    .lineLimit(2)
                if let instructor = course.instructor {
                    Text(instructor.name)
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Palette.textSecondary)
                }
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: Theme.Spacing.sm) { meta }
                    VStack(alignment: .leading, spacing: Theme.Spacing.xxs) { meta }
                }
                HStack(spacing: Theme.Spacing.xs) {
                    PremiumBadge(isPremium: course.isPremium)
                    Tag(text: course.level.title, tint: tint)
                    if course.isDownloadable {
                        Image(systemName: isDownloaded ? "arrow.down.circle.fill" : "arrow.down.circle")
                            .font(.caption)
                            .foregroundStyle(Theme.Palette.textTertiary)
                            .accessibilityLabel(isDownloaded ? "Downloaded" : "Available offline")
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var meta: some View {
        MetaLabel(symbol: "play.rectangle", text: "\(course.lessonCount) lessons")
        MetaLabel(symbol: "clock", text: course.formattedDuration)
        if let rating = course.rating, course.ratingCount > 0 {
            MetaLabel(symbol: "star.fill", text: String(format: "%.1f", rating))
        }
    }
}
