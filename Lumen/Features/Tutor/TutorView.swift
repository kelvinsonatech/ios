import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct TutorView: View {
    @State var model: TutorViewModel
    @State private var showHistory = false
    @State private var showVoice = false
    @State private var showFileImporter = false
    @State private var photoItem: PhotosPickerItem?
    @State private var isExtracting = false
    @FocusState private var composerFocused: Bool
    @Environment(AppRouter.self) private var router

    private let languages = ["English", "Spanish", "French", "German", "Portuguese", "Arabic", "Hindi", "Chinese", "Swahili"]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                modePicker
                Divider()
                conversation
                composer
            }
            .background(Theme.Palette.background)
            .navigationTitle("AI Tutor")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
            .sheet(isPresented: $showHistory) { TutorHistorySheet(model: model) }
            .sheet(isPresented: $showVoice) { VoiceTutorView(tutor: model) }
            .fileImporter(isPresented: $showFileImporter, allowedContentTypes: [.pdf, .plainText, .text]) { result in
                if case .success(let url) = result {
                    do { model.attachedMaterial = try StudyMaterialExtractor.text(fromFile: url) }
                    catch { model.errorMessage = "We couldn't read that file." }
                }
            }
            .onChange(of: photoItem) { _, item in
                guard let item else { return }
                Task {
                    isExtracting = true
                    defer { isExtracting = false; photoItem = nil }
                    guard let data = try? await item.loadTransferable(type: Data.self) else { return }
                    do {
                        let text = try await StudyMaterialExtractor.text(fromImageData: data)
                        if text.isEmpty { model.errorMessage = "We couldn't find any text in that photo." }
                        else { model.attachedMaterial = text }
                    } catch { model.errorMessage = "We couldn't read that photo." }
                }
            }
            .onAppear { model.consumePendingContext() }
            .onChange(of: router.pendingTutorContext) { _, _ in model.consumePendingContext() }
            .task { await model.loadHistory() }
        }
    }

    // MARK: Mode picker

    private var modePicker: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Theme.Spacing.sm) {
                    ForEach(TutorMode.allCases) { mode in
                        let selected = model.mode == mode
                        Button {
                            Haptics.selection()
                            if model.messages.isEmpty { model.mode = mode } else { model.newConversation(mode: mode) }
                        } label: {
                            Label(mode.title, systemImage: mode.symbol)
                                .font(Theme.Typography.callout.weight(.medium))
                                .padding(.horizontal, Theme.Spacing.md)
                                .padding(.vertical, Theme.Spacing.sm)
                                .foregroundStyle(selected ? .white : Theme.Palette.textPrimary)
                                .background(selected ? Theme.Palette.brand : Theme.Palette.surfaceMuted, in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(selected ? .isSelected : [])
                        .accessibilityHint(mode.hint)
                    }
                }
                .pagePadding()
            }
            Text(model.mode.hint)
                .font(Theme.Typography.caption)
                .foregroundStyle(Theme.Palette.textSecondary)
                .pagePadding()
        }
        .padding(.vertical, Theme.Spacing.sm)
    }

    // MARK: Conversation

    private var conversation: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                    if let lesson = model.context?.lessonTitle {
                        Label("Talking about: \(lesson)", systemImage: "book")
                            .font(Theme.Typography.captionEmphasis)
                            .foregroundStyle(Theme.Palette.brand)
                            .padding(.horizontal, Theme.Spacing.md)
                            .padding(.vertical, Theme.Spacing.sm)
                            .background(Theme.Palette.brandSoft, in: Capsule())
                    }
                    if model.messages.isEmpty {
                        emptyState
                    }
                    ForEach(model.messages) { message in
                        MessageBubble(message: message, isStreaming: model.isStreaming && message.id == model.messages.last?.id)
                            .id(message.id)
                    }
                    if let summary = model.examinerSummary {
                        ExaminerSummaryCard(summary: summary)
                    }
                    if let error = model.errorMessage {
                        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                            Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(Theme.Palette.danger)
                            if error.contains("Premium") {
                                Button("See Premium") { router.showPaywall() }.buttonStyle(.pillTinted)
                            }
                        }
                        .font(Theme.Typography.callout)
                    }
                    if let status = model.flashcardStatus {
                        Label(status, systemImage: "rectangle.on.rectangle.angled")
                            .font(Theme.Typography.callout)
                            .foregroundStyle(Theme.Palette.textSecondary)
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .frame(maxWidth: 760)
                .pagePadding()
                .padding(.vertical, Theme.Spacing.lg)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: model.messages.last?.content) { _, _ in
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
            HStack(spacing: Theme.Spacing.md) {
                LumenMark(size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Your personal tutor").font(Theme.Typography.headline)
                    Text("I'll help you understand — not just give you the answer.")
                        .font(Theme.Typography.callout)
                        .foregroundStyle(Theme.Palette.textSecondary)
                }
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                ForEach(model.suggestions, id: \.self) { suggestion in
                    Button {
                        model.send(suggestion)
                    } label: {
                        HStack {
                            Text(suggestion).foregroundStyle(Theme.Palette.textPrimary)
                            Spacer()
                            Image(systemName: "arrow.up.right").font(.caption).foregroundStyle(Theme.Palette.textTertiary)
                        }
                        .inset(padding: Theme.Spacing.md)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.top, Theme.Spacing.xl)
    }

    // MARK: Composer

    private var composer: some View {
        VStack(spacing: Theme.Spacing.sm) {
            if let material = model.attachedMaterial {
                HStack {
                    Label("Study material attached (\(material.count) characters)", systemImage: "doc.text")
                        .font(Theme.Typography.caption)
                    Spacer()
                    Button { model.attachedMaterial = nil } label: { Image(systemName: "xmark.circle.fill") }
                        .accessibilityLabel("Remove attachment")
                }
                .foregroundStyle(Theme.Palette.textSecondary)
                .inset(padding: Theme.Spacing.sm)
            }
            if !model.messages.isEmpty && !model.isStreaming {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Theme.Spacing.sm) {
                        quickAction("Give an example") { model.send("Can you give me another example?") }
                        quickAction("Simpler please") { model.send("Can you explain that more simply?") }
                        quickAction("Step by step") { model.send("Walk me through it step by step.") }
                        quickAction("Quiz me") { model.send("Ask me a question to check I understood.") }
                        quickAction("Summarise") { model.send("Summarise the key points as revision notes.") }
                    }
                }
            }
            HStack(alignment: .bottom, spacing: Theme.Spacing.sm) {
                Menu {
                    PhotosPicker(selection: $photoItem, matching: .images) {
                        Label("Photo of notes", systemImage: "camera.viewfinder")
                    }
                    Button { showFileImporter = true } label: { Label("PDF or text file", systemImage: "doc") }
                } label: {
                    Group {
                        if isExtracting { ProgressView() } else { Image(systemName: "paperclip") }
                    }
                    .font(.title3)
                    .frame(width: 40, height: 40)
                }
                .accessibilityLabel("Attach study material")

                TextField(model.mode.placeholder, text: $model.input, axis: .vertical)
                    .lineLimit(1...6)
                    .focused($composerFocused)
                    .padding(.horizontal, Theme.Spacing.md)
                    .padding(.vertical, Theme.Spacing.sm + 2)
                    .background(Theme.Palette.surfaceMuted, in: RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous))

                if model.isStreaming {
                    Button { model.cancel() } label: {
                        Image(systemName: "stop.circle.fill").font(.system(size: 34))
                    }
                    .accessibilityLabel("Stop generating")
                } else if model.canSend {
                    Button { model.send() } label: {
                        Image(systemName: "arrow.up.circle.fill").font(.system(size: 34))
                    }
                    .accessibilityLabel("Send")
                } else {
                    Button { showVoice = true } label: {
                        Image(systemName: "waveform.circle.fill").font(.system(size: 34))
                    }
                    .accessibilityLabel("Talk to your tutor")
                }
            }
        }
        .frame(maxWidth: 760)
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, Theme.Spacing.sm)
        .frame(maxWidth: .infinity)
        .background(.bar)
    }

    private func quickAction(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action).buttonStyle(.pillTinted)
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button { showHistory = true } label: { Image(systemName: "clock.arrow.circlepath") }
                .accessibilityLabel("Conversation history")
        }
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button { model.newConversation() } label: { Label("New conversation", systemImage: "square.and.pencil") }
                Button { Task { await model.makeFlashcards() } } label: {
                    Label("Make flashcards from this", systemImage: "rectangle.on.rectangle.angled")
                }
                Menu {
                    ForEach(languages, id: \.self) { language in
                        Button(language) { model.translateLastAnswer(to: language) }
                    }
                } label: { Label("Translate explanation", systemImage: "character.bubble") }
                .disabled(model.messages.isEmpty)
            } label: { Image(systemName: "ellipsis.circle") }
            .accessibilityLabel("Tutor options")
        }
    }
}

// MARK: - Pieces

struct MessageBubble: View {
    let message: ChatMessage
    var isStreaming = false

    var body: some View {
        HStack(alignment: .top) {
            if message.role == .user { Spacer(minLength: 48) }
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                if message.role == .assistant {
                    if message.content.isEmpty && isStreaming {
                        TypingIndicator()
                    } else {
                        MarkdownText(markdown: TutorViewModel.displayText(message.content))
                    }
                } else {
                    Text(message.content.components(separatedBy: "\n\n---\nStudy material:").first ?? message.content)
                        .foregroundStyle(.white)
                    if message.content.contains("Study material:") {
                        Label("Study material", systemImage: "doc.text").font(.caption).foregroundStyle(.white.opacity(0.8))
                    }
                }
            }
            .padding(Theme.Spacing.md)
            .background(message.role == .user ? Theme.Palette.brand : Theme.Palette.surface,
                        in: RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .overlay {
                if message.role == .assistant {
                    RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous).strokeBorder(Theme.Palette.separator)
                }
            }
            .contextMenu {
                Button { UIPasteboard.general.string = message.content } label: { Label("Copy", systemImage: "doc.on.doc") }
            }
            if message.role == .assistant { Spacer(minLength: 24) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(message.role == .user ? "You said" : "Tutor said")
    }
}

private struct TypingIndicator: View {
    @State private var phase = 0.0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<3) { i in
                Circle()
                    .fill(Theme.Palette.textTertiary)
                    .frame(width: 7, height: 7)
                    .opacity(reduceMotion ? 0.6 : 0.3 + 0.7 * abs(sin(phase + Double(i) * 0.6)))
            }
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) { phase = .pi }
        }
        .accessibilityLabel("Tutor is thinking")
    }
}

private struct ExaminerSummaryCard: View {
    let summary: ExaminerSummary
    @Environment(AppRouter.self) private var router

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            Text("Exam results").font(Theme.Typography.sectionTitle)
            HStack(spacing: Theme.Spacing.md) {
                StatTile(value: "\(summary.score)/\(summary.total)", label: "Score", symbol: "checkmark.seal")
                StatTile(value: "\(summary.correct.count)", label: "Correct", symbol: "checkmark.circle", tint: Theme.Palette.success)
                StatTile(value: "\(summary.incorrect.count)", label: "Incorrect", symbol: "xmark.circle", tint: Theme.Palette.danger)
            }
            if !summary.weakAreas.isEmpty {
                Text("Weak areas").font(Theme.Typography.headline)
                FlowLayout(spacing: Theme.Spacing.sm) {
                    ForEach(summary.weakAreas, id: \.self) { Tag(text: $0, tint: Theme.Palette.danger) }
                }
            }
            if !summary.suggestedLessons.isEmpty {
                Text("Suggested lessons").font(Theme.Typography.headline)
                ForEach(summary.suggestedLessons, id: \.self) { lesson in
                    Label(lesson, systemImage: "book").font(Theme.Typography.callout)
                }
                Button("Find these in Courses") { router.selectedTab = .courses }.buttonStyle(.pillTinted)
            }
        }
        .card()
    }
}

private struct TutorHistorySheet: View {
    let model: TutorViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if model.conversations.isEmpty {
                    EmptyStateView(symbol: "bubble.left.and.bubble.right", title: "No conversations yet",
                                   message: "Your tutoring sessions will appear here.")
                } else {
                    List {
                        ForEach(model.conversations) { conversation in
                            Button {
                                Task { await model.open(conversation); dismiss() }
                            } label: {
                                HStack {
                                    Image(systemName: conversation.mode.symbol).foregroundStyle(Theme.Palette.brand)
                                    VStack(alignment: .leading) {
                                        Text(conversation.title).foregroundStyle(Theme.Palette.textPrimary).lineLimit(1)
                                        Text(conversation.updatedAt, style: .relative)
                                            .font(.caption).foregroundStyle(Theme.Palette.textSecondary)
                                    }
                                }
                            }
                        }
                        .onDelete { offsets in
                            let items = offsets.map { model.conversations[$0] }
                            Task { for item in items { await model.delete(item) } }
                        }
                    }
                }
            }
            .navigationTitle("History")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
