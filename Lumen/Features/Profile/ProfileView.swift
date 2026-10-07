import SwiftUI
import Charts

struct ProfileView: View {
    @State var model: ProfileViewModel
    @Environment(SessionStore.self) private var session
    @Environment(AppRouter.self) private var router

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.xxl) {
                    if let profile = session.profile {
                        header(profile)
                        levelCard(profile)
                    }
                    activityChart
                    achievementsPreview
                    links
                }
                .frame(maxWidth: 760)
                .pagePadding()
                .padding(.vertical, Theme.Spacing.lg)
                .frame(maxWidth: .infinity)
            }
            .background(Theme.Palette.background)
            .navigationTitle("Profile")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink(value: Route.settings) { Image(systemName: "gearshape") }.accessibilityLabel("Settings")
                }
            }
            .withAppRoutes()
            .task { await model.load() }
            .refreshable { await model.load() }
        }
    }

    private func header(_ profile: Profile) -> some View {
        HStack(spacing: Theme.Spacing.lg) {
            Avatar(name: profile.displayName, url: profile.avatarUrl, size: 72)
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text(profile.displayName).font(Theme.Typography.title)
                HStack(spacing: Theme.Spacing.xs) {
                    if profile.isPremium {
                        Tag(text: "Premium", symbol: "crown.fill", tint: Theme.Palette.gold)
                    }
                    if let level = profile.level { Tag(text: level.title, tint: Theme.Palette.brand) }
                }
                if let goal = profile.goal {
                    Text(goal.title).font(Theme.Typography.caption).foregroundStyle(Theme.Palette.textSecondary)
                }
            }
            Spacer()
        }
    }

    private func levelCard(_ profile: Profile) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Level \(profile.xpLevel)").font(Theme.Typography.headline)
                    Text("\(profile.xp) XP · \(profile.xpForNextLevel - profile.xp) XP to level \(profile.xpLevel + 1)")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Palette.textSecondary)
                }
                Spacer()
                StreakBadge(days: profile.currentStreak)
            }
            LinearProgress(value: profile.levelProgress, height: 8)
            HStack {
                MetaLabel(symbol: "flame", text: "Longest streak: \(profile.longestStreak) days")
                Spacer()
            }
            if !profile.isPremium {
                Button { router.showPaywall() } label: { Label("Upgrade to Premium", systemImage: "crown") }
                    .buttonStyle(PillButtonStyle(tint: Theme.Palette.gold))
            }
        }
        .card()
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var activityChart: some View {
        if !model.activity.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                SectionHeader("This week", subtitle: "\(model.activity.reduce(0) { $0 + $1.minutesStudied }) minutes studied")
                Chart(model.activity) { day in
                    BarMark(x: .value("Day", Self.weekday(day.day)), y: .value("Minutes", day.minutesStudied))
                        .foregroundStyle(Theme.Palette.brand.gradient)
                        .cornerRadius(6)
                }
                .chartYAxis { AxisMarks(position: .leading) }
                .frame(height: 160)
                .accessibilityLabel("Minutes studied per day this week")
            }
            .card()
        }
    }

    @ViewBuilder private var achievementsPreview: some View {
        if !model.achievements.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                SectionHeader(title: "Achievements", subtitle: "\(model.earnedAchievements.count) of \(model.achievements.count) earned") {
                    NavigationLink("See all", value: Route.achievements).font(Theme.Typography.callout)
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Theme.Spacing.md) {
                        ForEach(model.achievements.sorted { ($0.earnedAt ?? .distantPast) > ($1.earnedAt ?? .distantPast) }.prefix(8)) { achievement in
                            AchievementBadge(achievement: achievement, size: 64)
                        }
                    }
                }
            }
        }
    }

    private var links: some View {
        VStack(spacing: 0) {
            linkRow("books.vertical", "E-book library", .library)
            Divider().padding(.leading, 44)
            linkRow("rectangle.on.rectangle.angled", "Flashcards", .flashcards)
            Divider().padding(.leading, 44)
            linkRow("bookmark", "Bookmarks", .bookmarks)
            Divider().padding(.leading, 44)
            linkRow("arrow.down.circle", "Downloads", .downloads)
            Divider().padding(.leading, 44)
            linkRow("timer", "Exams", .examList(courseId: nil))
        }
        .card(padding: Theme.Spacing.md)
    }

    private func linkRow(_ symbol: String, _ title: String, _ route: Route) -> some View {
        NavigationLink(value: route) {
            HStack(spacing: Theme.Spacing.md) {
                Image(systemName: symbol).foregroundStyle(Theme.Palette.brand).frame(width: 28)
                Text(title).foregroundStyle(Theme.Palette.textPrimary)
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.Palette.textTertiary)
            }
            .padding(.vertical, Theme.Spacing.md)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    static func weekday(_ day: String) -> String {
        guard let date = PostgresDate.parse(day) else { return day }
        return date.formatted(.dateTime.weekday(.abbreviated))
    }
}

struct AchievementBadge: View {
    let achievement: Achievement
    var size: CGFloat = 72

    var body: some View {
        VStack(spacing: Theme.Spacing.xs) {
            Image(systemName: achievement.symbol)
                .font(.system(size: size * 0.4, weight: .semibold))
                .foregroundStyle(achievement.isEarned ? .white : Theme.Palette.textTertiary)
                .frame(width: size, height: size)
                .background(achievement.isEarned ? AnyShapeStyle(Theme.Palette.brand.gradient) : AnyShapeStyle(Theme.Palette.surfaceMuted), in: Circle())
            Text(achievement.title)
                .font(Theme.Typography.caption)
                .multilineTextAlignment(.center)
                .lineLimit(2, reservesSpace: true)
                .frame(width: size + 16)
        }
        .opacity(achievement.isEarned ? 1 : 0.7)
        .accessibilityElement(children: .combine)
        .accessibilityValue(achievement.isEarned ? "Earned" : "Locked")
    }
}

struct AchievementsView: View {
    @State var model: AchievementsViewModel

    var body: some View {
        LoadableView(state: model.achievements, retry: { Task { await model.load() } }) { achievements in
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: Theme.Spacing.lg)], spacing: Theme.Spacing.xl) {
                    ForEach(achievements) { achievement in
                        VStack(spacing: Theme.Spacing.xs) {
                            AchievementBadge(achievement: achievement)
                            Text(achievement.description)
                                .font(.caption2)
                                .foregroundStyle(Theme.Palette.textSecondary)
                                .multilineTextAlignment(.center)
                            Text("+\(achievement.xpReward) XP").font(.caption2.weight(.semibold)).foregroundStyle(Theme.Palette.brand)
                        }
                    }
                }
                .pagePadding()
                .padding(.vertical, Theme.Spacing.lg)
            }
        }
        .background(Theme.Palette.background)
        .navigationTitle("Achievements")
        .task { await model.load() }
    }
}

struct BookmarksView: View {
    @State var model: BookmarksViewModel

    var body: some View {
        LoadableView(state: model.bookmarks, retry: { Task { await model.load() } }) { bookmarks in
            if bookmarks.isEmpty {
                EmptyStateView(symbol: "bookmark", title: "No bookmarks", message: "Bookmark lessons, courses, books and tricky questions to find them here.")
            } else {
                List {
                    ForEach(bookmarks) { bookmark in
                        row(bookmark)
                            .swipeActions {
                                Button(role: .destructive) { Task { await model.remove(bookmark) } } label: { Label("Remove", systemImage: "bookmark.slash") }
                            }
                    }
                }
            }
        }
        .navigationTitle("Bookmarks")
        .task { await model.load() }
        .refreshable { await model.load() }
    }

    @ViewBuilder private func row(_ bookmark: Bookmark) -> some View {
        let label = VStack(alignment: .leading, spacing: 2) {
            Text(bookmark.title).lineLimit(2)
            if let subtitle = bookmark.subtitle {
                Text(subtitle).font(.caption).foregroundStyle(Theme.Palette.textSecondary)
            }
        }
        switch bookmark.itemType {
        case .course:
            NavigationLink(value: Route.course(bookmark.itemId)) { Label { label } icon: { Image(systemName: "books.vertical") } }
        case .question:
            NavigationLink(value: Route.practice(PracticeRequest(mode: .saved, count: 50), title: "Saved questions")) {
                Label { label } icon: { Image(systemName: "questionmark.circle") }
            }
        case .lesson:
            if let courseId = bookmark.parentId {
                NavigationLink(value: Route.lesson(lessonId: bookmark.itemId, courseId: courseId)) {
                    Label { label } icon: { Image(systemName: "play.rectangle") }
                }
            } else {
                Label { label } icon: { Image(systemName: "play.rectangle") }
            }
        case .ebook:
            Label { label } icon: { Image(systemName: "book.closed") }
        }
    }
}

struct NotificationsView: View {
    @State var model: NotificationsViewModel

    var body: some View {
        LoadableView(state: model.notifications, retry: { Task { await model.load() } }) { items in
            if items.isEmpty {
                EmptyStateView(symbol: "bell", title: "You're all caught up", message: "Reminders, achievements and live quiz alerts will appear here.")
            } else {
                List(items) { item in
                    VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                        HStack {
                            Text(item.title).font(Theme.Typography.bodyEmphasis)
                            if item.readAt == nil { Circle().fill(Theme.Palette.brand).frame(width: 8, height: 8) }
                        }
                        Text(item.body).font(Theme.Typography.callout).foregroundStyle(Theme.Palette.textSecondary)
                        Text(item.createdAt, style: .relative).font(.caption2).foregroundStyle(Theme.Palette.textTertiary)
                    }
                    .padding(.vertical, Theme.Spacing.xs)
                }
            }
        }
        .navigationTitle("Notifications")
        .task { await model.load() }
    }
}
