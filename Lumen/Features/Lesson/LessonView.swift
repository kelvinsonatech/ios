import SwiftUI
import AVKit

struct LessonView: View {
    @State var model: LessonViewModel
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        LoadableView(state: model.lesson, retry: { Task { await model.load() } }) { lesson in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    videoSection(lesson)
                    VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                        titleBlock(lesson)
                        askAIButton
                        notesSection(lesson)
                        attachmentsSection
                        navigationButtons
                    }
                    .frame(maxWidth: 760, alignment: .leading)
                    .pagePadding()
                    .padding(.vertical, Theme.Spacing.xl)
                    .frame(maxWidth: .infinity)
                }
            }
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { Task { await model.toggleBookmark() } } label: {
                        Image(systemName: model.isBookmarked ? "bookmark.fill" : "bookmark")
                    }
                    .accessibilityLabel(model.isBookmarked ? "Remove bookmark" : "Bookmark lesson")
                    if lesson.isDownloadable {
                        Button { model.download() } label: {
                            Image(systemName: model.isDownloaded ? "arrow.down.circle.fill" : "arrow.down.circle")
                        }
                        .accessibilityLabel(model.isDownloaded ? "Downloaded" : "Download lesson")
                        .disabled(model.isDownloaded)
                    }
                }
            }
        }
        .background(Theme.Palette.background)
        .navigationTitle(model.courseTitle)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: model.lessonId) { await model.load() }
        .onDisappear { Task { await model.leave() } }
        .overlay(alignment: .bottom) {
            if let reward = model.reward {
                RewardToast(xp: reward.xpAwarded, message: "Lesson complete")
                    .padding(.bottom, Theme.Spacing.xl)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .task {
                        try? await Task.sleep(for: .seconds(2.5))
                        model.reward = nil
                    }
            }
        }
        .motionAware(Theme.Motion.snappy, value: model.reward)
    }

    @ViewBuilder private func videoSection(_ lesson: Lesson) -> some View {
        if lesson.hasVideo {
            Group {
                if model.contentLocked {
                    LockedContentView()
                } else if let player = model.player {
                    LessonPlayer(player: player)
                } else {
                    ZStack { Color.black; ProgressView().tint(.white) }
                }
            }
            .aspectRatio(16 / 9, contentMode: .fit)
            .frame(maxWidth: sizeClass == .regular ? 900 : .infinity)
            .frame(maxWidth: .infinity)
            .background(Color.black)
        }
    }

    private func titleBlock(_ lesson: Lesson) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text("Lesson \(lesson.position)")
                .font(Theme.Typography.captionEmphasis)
                .foregroundStyle(Theme.Palette.brand)
            Text(lesson.title)
                .font(Theme.Typography.title)
                .foregroundStyle(Theme.Palette.textPrimary)
                .accessibilityAddTraits(.isHeader)
            if let summary = lesson.summary {
                Text(summary).font(Theme.Typography.body).foregroundStyle(Theme.Palette.textSecondary)
            }
            HStack {
                MetaLabel(symbol: "clock", text: Duration.seconds(lesson.durationSeconds).studyLabel)
                Spacer()
                Button {
                    Task { await model.markCompleted() }
                } label: {
                    Label(model.isCompleted ? "Completed" : "Mark complete",
                          systemImage: model.isCompleted ? "checkmark.circle.fill" : "circle")
                }
                .buttonStyle(PillButtonStyle(tint: Theme.Palette.success, filled: model.isCompleted))
                .disabled(model.isCompleted || model.isMarkingComplete)
            }
        }
    }

    private var askAIButton: some View {
        Button(action: model.askAI) {
            HStack(spacing: Theme.Spacing.md) {
                Image(systemName: "sparkles")
                    .font(.title3)
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(Theme.Palette.brand, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Ask AI about this lesson").font(Theme.Typography.bodyEmphasis).foregroundStyle(Theme.Palette.textPrimary)
                    Text("Get explanations, examples or a quick quiz").font(Theme.Typography.caption).foregroundStyle(Theme.Palette.textSecondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.Palette.textTertiary)
            }
            .padding(Theme.Spacing.md)
            .background(Theme.Palette.brandSoft, in: RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
        }
        .buttonStyle(.card)
    }

    @ViewBuilder private func notesSection(_ lesson: Lesson) -> some View {
        if model.contentLocked {
            LockedContentView().frame(height: 220).clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg))
        } else if let content = model.content {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                SectionHeader("Lesson notes")
                MarkdownText(markdown: content.notesMarkdown)
                ForEach(content.imageUrls, id: \.self) { url in
                    RemoteImage(url: url, symbol: "photo")
                        .frame(maxWidth: .infinity)
                        .frame(height: 220)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
                }
                if !content.keyTerms.isEmpty {
                    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                        SectionHeader("Key definitions")
                        ForEach(content.keyTerms) { term in
                            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                                Text(term.term).font(Theme.Typography.bodyEmphasis)
                                Text(LocalizedStringKey(term.definition)).font(Theme.Typography.callout).foregroundStyle(Theme.Palette.textSecondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .inset(padding: Theme.Spacing.md)
                            .accessibilityElement(children: .combine)
                        }
                    }
                }
                if !content.examples.isEmpty {
                    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                        SectionHeader("Worked examples")
                        ForEach(content.examples) { example in
                            DisclosureGroup {
                                MarkdownText(markdown: example.body).padding(.top, Theme.Spacing.sm)
                            } label: {
                                Text(example.title).font(Theme.Typography.bodyEmphasis).foregroundStyle(Theme.Palette.textPrimary)
                            }
                            .card()
                        }
                    }
                }
                if lesson.hasPractice {
                    NavigationLink(value: Route.practice(PracticeRequest(mode: .topic, courseId: lesson.courseId, count: 5), title: "Practice: \(lesson.title)")) {
                        PracticeLinkRow(symbol: "checklist", title: "Practice questions", subtitle: "Check your understanding")
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder private var attachmentsSection: some View {
        if !model.attachments.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                SectionHeader("Attachments")
                ForEach(model.attachments) { attachment in
                    AttachmentRow(attachment: attachment)
                }
            }
        }
    }

    private var navigationButtons: some View {
        HStack(spacing: Theme.Spacing.md) {
            if let previous = model.previous {
                NavigationLink(value: Route.lesson(lessonId: previous.id, courseId: model.courseId)) {
                    Label("Previous", systemImage: "chevron.left")
                }
                .buttonStyle(.secondary)
            }
            if let next = model.next {
                NavigationLink(value: Route.lesson(lessonId: next.id, courseId: model.courseId)) {
                    Label("Next lesson", systemImage: "chevron.right").labelStyle(TrailingIconLabelStyle())
                }
                .buttonStyle(.primary)
            }
        }
    }
}

struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: Theme.Spacing.xs) { configuration.title; configuration.icon }
    }
}

/// AVPlayerViewController provides scrubbing, speed menu, captions, PiP, AirPlay and full screen natively.
struct LessonPlayer: UIViewControllerRepresentable {
    let player: AVPlayer

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let controller = AVPlayerViewController()
        controller.player = player
        controller.allowsPictureInPicturePlayback = true
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        controller.speeds = [AVPlaybackSpeed(rate: 0.75, localizedName: "0.75×"),
                             AVPlaybackSpeed(rate: 1, localizedName: "1×"),
                             AVPlaybackSpeed(rate: 1.25, localizedName: "1.25×"),
                             AVPlaybackSpeed(rate: 1.5, localizedName: "1.5×"),
                             AVPlaybackSpeed(rate: 2, localizedName: "2×")]
        return controller
    }

    func updateUIViewController(_ controller: AVPlayerViewController, context: Context) {
        if controller.player !== player { controller.player = player }
    }
}

struct LockedContentView: View {
    @Environment(AppRouter.self) private var router

    var body: some View {
        ZStack {
            LinearGradient(colors: [Theme.Palette.brand.opacity(0.9), Theme.Palette.brand.opacity(0.6)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            VStack(spacing: Theme.Spacing.md) {
                Image(systemName: "lock.fill").font(.title)
                Text("Premium lesson").font(Theme.Typography.headline)
                Button("Unlock with Premium") { router.showPaywall() }
                    .buttonStyle(PillButtonStyle(tint: .white, filled: false))
            }
            .foregroundStyle(.white)
        }
    }
}

private struct AttachmentRow: View {
    let attachment: LessonAttachment
    @Environment(AppEnvironment.self) private var env
    @Environment(\.openURL) private var openURL
    @State private var isOpening = false

    var body: some View {
        Button {
            Task {
                isOpening = true
                defer { isOpening = false }
                if let url = try? await env.courses.mediaURL(path: attachment.filePath) { openURL(url) }
            }
        } label: {
            HStack {
                Image(systemName: attachment.mimeType.contains("pdf") ? "doc.richtext" : "paperclip")
                    .foregroundStyle(Theme.Palette.brand)
                VStack(alignment: .leading) {
                    Text(attachment.title).foregroundStyle(Theme.Palette.textPrimary)
                    Text(ByteCountFormatter.string(fromByteCount: attachment.byteSize, countStyle: .file))
                        .font(.caption).foregroundStyle(Theme.Palette.textSecondary)
                }
                Spacer()
                if isOpening { ProgressView() } else { Image(systemName: "arrow.down.doc").foregroundStyle(Theme.Palette.textTertiary) }
            }
            .inset(padding: Theme.Spacing.md)
        }
        .buttonStyle(.plain)
    }
}

/// Block-level Markdown renderer (headings, lists, paragraphs, code) on top of inline AttributedString.
struct MarkdownText: View {
    let markdown: String
    var font: Font = Theme.Typography.body

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            ForEach(Array(Self.blocks(markdown).enumerated()), id: \.offset) { _, block in
                switch block {
                case .heading(let level, let text):
                    Text(inline(text))
                        .font(level <= 2 ? Theme.Typography.sectionTitle : Theme.Typography.headline)
                        .accessibilityAddTraits(.isHeader)
                case .bullet(let text):
                    HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.sm) {
                        Text("•").foregroundStyle(Theme.Palette.brand)
                        Text(inline(text))
                    }
                case .code(let text):
                    ScrollView(.horizontal, showsIndicators: false) {
                        Text(text).font(.system(.callout, design: .monospaced)).textSelection(.enabled)
                    }
                    .inset(padding: Theme.Spacing.md)
                case .paragraph(let text):
                    Text(inline(text))
                }
            }
        }
        .font(font)
        .foregroundStyle(Theme.Palette.textPrimary)
        .textSelection(.enabled)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func inline(_ text: String) -> AttributedString {
        (try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(text)
    }

    enum Block { case heading(Int, String), bullet(String), code(String), paragraph(String) }

    static func blocks(_ markdown: String) -> [Block] {
        var blocks: [Block] = []
        var paragraph: [String] = []
        var code: [String]?
        func flush() {
            if !paragraph.isEmpty { blocks.append(.paragraph(paragraph.joined(separator: " "))); paragraph = [] }
        }
        for rawLine in markdown.components(separatedBy: .newlines) {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.hasPrefix("```") {
                if let lines = code { blocks.append(.code(lines.joined(separator: "\n"))); code = nil }
                else { flush(); code = [] }
                continue
            }
            if code != nil { code?.append(rawLine); continue }
            if line.isEmpty { flush(); continue }
            if line.hasPrefix("#") {
                flush()
                let level = line.prefix { $0 == "#" }.count
                blocks.append(.heading(level, String(line.dropFirst(level)).trimmingCharacters(in: .whitespaces)))
            } else if line.hasPrefix("- ") || line.hasPrefix("* ") {
                flush()
                blocks.append(.bullet(String(line.dropFirst(2))))
            } else if let match = line.firstMatch(of: #/^\d+\.\s+/#) {
                flush()
                blocks.append(.bullet(String(line[match.range.upperBound...])))
            } else {
                paragraph.append(line)
            }
        }
        if let lines = code { blocks.append(.code(lines.joined(separator: "\n"))) }
        flush()
        return blocks
    }
}
