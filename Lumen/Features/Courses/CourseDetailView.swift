import SwiftUI

struct CourseDetailView: View {
    @State var model: CourseDetailViewModel
    @Environment(AppRouter.self) private var router
    @Environment(DownloadManager.self) private var downloads

    var body: some View {
        LoadableView(state: model.course, retry: { Task { await model.load() } }) { course in
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                    header(course)
                    VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                        summary(course)
                        primaryAction(course)
                        Picker("Section", selection: $model.section) {
                            ForEach(CourseDetailViewModel.Section.allCases) { Text($0.title).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        sectionContent(course)
                    }
                    .frame(maxWidth: 760, alignment: .leading)
                    .pagePadding()
                }
                .frame(maxWidth: .infinity)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .ignoresSafeArea(edges: .top)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { Task { await model.toggleBookmark() } } label: {
                        Image(systemName: model.isBookmarked ? "bookmark.fill" : "bookmark")
                    }
                    .accessibilityLabel(model.isBookmarked ? "Remove bookmark" : "Bookmark course")
                    if course.isDownloadable {
                        Button { model.downloadCourse() } label: { Image(systemName: "arrow.down.circle") }
                            .accessibilityLabel("Download course for offline study")
                    }
                    ShareLink(item: course.title) { Image(systemName: "square.and.arrow.up") }
                }
            }
        }
        .background(Theme.Palette.background)
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .alert("Heads up", isPresented: Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(model.errorMessage ?? "") }
    }

    private func header(_ course: Course) -> some View {
        RemoteImage(url: course.coverUrl ?? course.thumbnailUrl, symbol: "book.pages", tint: Theme.subjectTint(course.categoryId))
            .frame(height: 260)
            .frame(maxWidth: .infinity)
            .overlay {
                LinearGradient(colors: [.clear, Theme.Palette.background], startPoint: .center, endPoint: .bottom)
            }
    }

    private func summary(_ course: Course) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            HStack(spacing: Theme.Spacing.xs) {
                PremiumBadge(isPremium: course.isPremium)
                Tag(text: course.level.title, tint: Theme.subjectTint(course.categoryId))
            }
            Text(course.title)
                .font(Theme.Typography.largeTitle)
                .foregroundStyle(Theme.Palette.textPrimary)
                .accessibilityAddTraits(.isHeader)
            if let subtitle = course.subtitle {
                Text(subtitle).font(Theme.Typography.body).foregroundStyle(Theme.Palette.textSecondary)
            }
            if let instructor = course.instructor {
                HStack(spacing: Theme.Spacing.sm) {
                    Avatar(name: instructor.name, url: instructor.avatarUrl, size: 32)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(instructor.name).font(Theme.Typography.bodyEmphasis)
                        if let title = instructor.title {
                            Text(title).font(Theme.Typography.caption).foregroundStyle(Theme.Palette.textSecondary)
                        }
                    }
                }
                .accessibilityElement(children: .combine)
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: Theme.Spacing.lg) { metadata(course) }
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) { metadata(course) }
            }
            if model.isEnrolled {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    HStack {
                        Text("Your progress").font(Theme.Typography.captionEmphasis)
                        Spacer()
                        Text("\(model.completedCount)/\(model.allLessons.count) lessons")
                            .font(Theme.Typography.caption).foregroundStyle(Theme.Palette.textSecondary)
                    }
                    LinearProgress(value: model.progress, tint: Theme.subjectTint(course.categoryId), height: 8)
                }
            }
        }
    }

    @ViewBuilder private func metadata(_ course: Course) -> some View {
        MetaLabel(symbol: "clock", text: course.formattedDuration)
        MetaLabel(symbol: "play.rectangle", text: "\(course.lessonCount) lessons")
        MetaLabel(symbol: "person.2", text: "\(course.studentCount.formatted(.number.notation(.compactName))) students")
        if let rating = course.rating, course.ratingCount > 0 {
            MetaLabel(symbol: "star.fill", text: "\(String(format: "%.1f", rating)) (\(course.ratingCount))")
        }
    }

    @ViewBuilder private func primaryAction(_ course: Course) -> some View {
        if model.isEnrolled, let lesson = model.nextLesson {
            NavigationLink(value: Route.lesson(lessonId: lesson.id, courseId: course.id)) {
                Label(model.completedCount == 0 ? "Start course" : "Continue: \(lesson.title)", systemImage: "play.fill")
                    .lineLimit(1)
            }
            .buttonStyle(PrimaryButtonStyle(tint: Theme.subjectTint(course.categoryId)))
        } else if !model.isEnrolled {
            Button {
                Task { await model.enroll() }
            } label: {
                Label(course.isPremium && !model.env.session.isPremium ? "Unlock with Premium" : "Enroll for free",
                      systemImage: course.isPremium ? "crown" : "plus")
            }
            .buttonStyle(.primary(loading: model.isEnrolling, tint: Theme.subjectTint(course.categoryId)))
        }
    }

    @ViewBuilder private func sectionContent(_ course: Course) -> some View {
        switch model.section {
        case .overview:
            VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                Text(LocalizedStringKey(course.description))
                    .font(Theme.Typography.body)
                    .foregroundStyle(Theme.Palette.textPrimary)
                if !course.tags.isEmpty {
                    SectionHeader("Topics covered")
                    FlowLayout(spacing: Theme.Spacing.sm) {
                        ForEach(course.tags, id: \.self) { Tag(text: $0, tint: Theme.Palette.textSecondary) }
                    }
                }
                if let bio = course.instructor?.bio {
                    SectionHeader("About the instructor")
                    Text(bio).font(Theme.Typography.callout).foregroundStyle(Theme.Palette.textSecondary)
                }
            }
        case .lessons:
            if model.modules.isEmpty {
                EmptyStateView(symbol: "list.bullet.rectangle", title: "Curriculum coming soon", message: "Lessons for this course haven't been published yet.")
            } else {
                VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                    ForEach(model.modules) { module in
                        ModuleSection(module: module, courseTitle: course.title, model: model)
                    }
                }
            }
        case .resources:
            if model.resources.isEmpty {
                EmptyStateView(symbol: "paperclip", title: "No resources", message: "Downloadable resources for this course will appear here.")
            } else {
                VStack(spacing: Theme.Spacing.sm) {
                    ForEach(model.resources) { resource in
                        ResourceRow(resource: resource)
                    }
                }
            }
        case .practice:
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                NavigationLink(value: Route.practice(PracticeRequest(mode: .topic, courseId: course.id, count: 10), title: "\(course.title) practice")) {
                    PracticeLinkRow(symbol: "bolt", title: "Practice this course", subtitle: "10 questions across all topics")
                }
                ForEach(model.topics) { topic in
                    NavigationLink(value: Route.practice(PracticeRequest(mode: .topic, courseId: course.id, topicId: topic.id, count: 10), title: topic.name)) {
                        PracticeLinkRow(symbol: "scope", title: topic.name, subtitle: "\(topic.questionCount) questions")
                    }
                }
                ForEach(model.exams) { exam in
                    NavigationLink(value: Route.exam(exam)) {
                        PracticeLinkRow(symbol: "timer", title: exam.title, subtitle: "\(exam.questionCount) questions · \(exam.timeLimitSeconds / 60) min")
                    }
                }
            }
            .buttonStyle(.plain)
        }
    }
}

private struct ModuleSection: View {
    let module: CourseModule
    let courseTitle: String
    let model: CourseDetailViewModel
    @State private var isExpanded = true
    @Environment(DownloadManager.self) private var downloads

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            VStack(spacing: 0) {
                ForEach(module.lessons) { lesson in
                    lessonRow(lesson)
                    if lesson.id != module.lessons.last?.id { Divider().padding(.leading, 44) }
                }
            }
            .padding(.top, Theme.Spacing.sm)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text("Module \(module.position)").font(Theme.Typography.captionEmphasis).foregroundStyle(Theme.Palette.textSecondary)
                Text(module.title).font(Theme.Typography.headline).foregroundStyle(Theme.Palette.textPrimary)
            }
        }
        .card()
    }

    @ViewBuilder private func lessonRow(_ lesson: Lesson) -> some View {
        let completed = model.progressByLesson[lesson.id]?.isCompleted == true
        let locked = model.isLocked(lesson)
        let row = HStack(spacing: Theme.Spacing.md) {
            Image(systemName: completed ? "checkmark.circle.fill" : locked ? "lock.fill" : lesson.hasVideo ? "play.circle" : "doc.text")
                .font(.title3)
                .foregroundStyle(completed ? Theme.Palette.success : locked ? Theme.Palette.textTertiary : Theme.Palette.brand)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(lesson.position). \(lesson.title)")
                    .font(Theme.Typography.body)
                    .foregroundStyle(Theme.Palette.textPrimary)
                    .multilineTextAlignment(.leading)
                Text(Duration.seconds(lesson.durationSeconds).studyLabel)
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Palette.textSecondary)
            }
            Spacer()
            if downloads.isDownloaded(.lessonNotes, id: lesson.id) {
                Image(systemName: "arrow.down.circle.fill").foregroundStyle(Theme.Palette.textTertiary)
                    .accessibilityLabel("Downloaded")
            }
        }
        .padding(.vertical, Theme.Spacing.sm)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityValue(completed ? "Completed" : locked ? "Premium" : "")

        if locked {
            Button { model.env.router.showPaywall() } label: { row }.buttonStyle(.plain)
        } else {
            NavigationLink(value: Route.lesson(lessonId: lesson.id, courseId: lesson.courseId)) { row }
                .buttonStyle(.plain)
                .contextMenu {
                    if lesson.isDownloadable {
                        Button { downloads.downloadLesson(lesson, courseTitle: courseTitle) } label: {
                            Label("Download for offline", systemImage: "arrow.down.circle")
                        }
                    }
                }
        }
    }
}

private struct ResourceRow: View {
    let resource: CourseResource
    @Environment(AppEnvironment.self) private var env
    @Environment(\.openURL) private var openURL

    var body: some View {
        Button {
            Task {
                if let url = resource.url { openURL(url) }
                else if let path = resource.filePath, let url = try? await env.courses.mediaURL(path: path) { openURL(url) }
            }
        } label: {
            HStack {
                Image(systemName: resource.kind == "link" ? "link" : "doc").foregroundStyle(Theme.Palette.brand)
                Text(resource.title).foregroundStyle(Theme.Palette.textPrimary)
                Spacer()
                Image(systemName: "arrow.up.right").font(.caption).foregroundStyle(Theme.Palette.textTertiary)
            }
            .inset(padding: Theme.Spacing.md)
        }
        .buttonStyle(.plain)
    }
}

struct PracticeLinkRow: View {
    let symbol: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: Theme.Spacing.md) {
            Image(systemName: symbol).foregroundStyle(Theme.Palette.brand).frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(Theme.Typography.bodyEmphasis).foregroundStyle(Theme.Palette.textPrimary)
                Text(subtitle).font(Theme.Typography.caption).foregroundStyle(Theme.Palette.textSecondary)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.Palette.textTertiary)
        }
        .inset(padding: Theme.Spacing.md)
        .contentShape(Rectangle())
    }
}

/// Wrapping horizontal layout for tags.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let height = rows.last.map { $0.y + $0.height } ?? 0
        let width = rows.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var index = 0
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for _ in 0..<row.count {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: bounds.minY + row.y), proposal: ProposedViewSize(size))
                x += size.width + spacing
                index += 1
            }
        }
    }

    private struct Row { var y: CGFloat; var height: CGFloat; var width: CGFloat; var count: Int }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var current = Row(y: 0, height: 0, width: 0, count: 0)
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if current.count > 0 && current.width + spacing + size.width > width {
                rows.append(current)
                current = Row(y: current.y + current.height + spacing, height: 0, width: 0, count: 0)
            }
            current.width += (current.count > 0 ? spacing : 0) + size.width
            current.height = max(current.height, size.height)
            current.count += 1
        }
        if current.count > 0 { rows.append(current) }
        return rows
    }
}
