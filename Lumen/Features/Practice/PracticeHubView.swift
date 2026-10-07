import SwiftUI

struct PracticeHubView: View {
    @State var model: PracticeHubViewModel
    @State private var path = NavigationPath()
    @State private var showTopicPicker = false
    @State private var showCustom = false
    @Environment(DownloadManager.self) private var downloads

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.xxl) {
                    modesSection
                    if !model.weakestTopics.isEmpty { weakSection }
                    toolsSection
                    offlineSection
                }
                .padding(.vertical, Theme.Spacing.lg)
            }
            .background(Theme.Palette.background)
            .navigationTitle("Practice")
            .withAppRoutes()
            .task { await model.load() }
            .refreshable { await model.load() }
            .sheet(isPresented: $showTopicPicker) {
                TopicPickerSheet(model: model) { topic in
                    showTopicPicker = false
                    path.append(Route.practice(PracticeRequest(mode: .topic, topicId: topic.id, count: 10), title: topic.name))
                }
            }
            .sheet(isPresented: $showCustom) {
                CustomPracticeSheet(model: model) {
                    showCustom = false
                    path.append(Route.practice(model.request(for: .custom), title: "Custom Practice"))
                }
            }
        }
    }

    private var modesSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            SectionHeader("Practice modes", subtitle: "Instant feedback after every answer")
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: Theme.Spacing.md)], spacing: Theme.Spacing.md) {
                ForEach(PracticeMode.allCases.filter { $0 != .saved }) { mode in
                    Button { open(mode) } label: { ModeTile(mode: mode) }
                        .buttonStyle(.card)
                }
            }
        }
        .pagePadding()
    }

    private var weakSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            SectionHeader("Needs attention", subtitle: "Your lowest-accuracy topics")
            VStack(spacing: Theme.Spacing.md) {
                ForEach(model.weakestTopics) { topic in
                    NavigationLink(value: Route.practice(PracticeRequest(mode: .topic, topicId: topic.topicId, count: 10), title: topic.topicName)) {
                        HStack {
                            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                                Text(topic.topicName).font(Theme.Typography.bodyEmphasis).foregroundStyle(Theme.Palette.textPrimary)
                                LinearProgress(value: topic.accuracy, tint: topic.accuracy < 0.5 ? Theme.Palette.danger : Theme.Palette.warning)
                            }
                            Text("\(Int(topic.accuracy * 100))%")
                                .font(Theme.Typography.captionEmphasis)
                                .foregroundStyle(Theme.Palette.textSecondary)
                                .frame(width: 44, alignment: .trailing)
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.Palette.textTertiary)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .card()
        }
        .pagePadding()
    }

    private var toolsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            SectionHeader("More ways to study")
            VStack(spacing: 0) {
                ToolRow(symbol: "timer", title: "Exam mode", subtitle: "Timed, realistic exams", destination: .examList(courseId: nil))
                Divider().padding(.leading, 52)
                ToolRow(symbol: "trophy", title: "Live quizzes", subtitle: "Compete in real time", destination: .liveQuizzes)
                Divider().padding(.leading, 52)
                ToolRow(symbol: "rectangle.on.rectangle.angled", title: "Flashcards", subtitle: "Spaced repetition decks", destination: .flashcards)
                Divider().padding(.leading, 52)
                ToolRow(symbol: "bookmark", title: "Saved questions", subtitle: "Questions you bookmarked",
                        destination: .practice(PracticeRequest(mode: .saved, count: 50), title: "Saved questions"))
            }
            .card(padding: Theme.Spacing.md)
        }
        .pagePadding()
    }

    @ViewBuilder private var offlineSection: some View {
        let sets = downloads.items.filter { $0.kind == .quizSet && $0.state == .completed }
        if !sets.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                SectionHeader("Offline practice sets")
                ForEach(sets, id: \.key) { item in
                    NavigationLink(value: Route.practice(PracticeRequest(mode: .revision, courseId: item.remoteId, count: 10), title: item.title)) {
                        Label(item.title, systemImage: "arrow.down.circle.fill")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .inset()
                }
            }
            .pagePadding()
        }
    }

    private func open(_ mode: PracticeMode) {
        Haptics.tap()
        switch mode {
        case .topic: showTopicPicker = true
        case .custom: showCustom = true
        default: path.append(Route.practice(model.request(for: mode), title: mode.title))
        }
    }
}

private struct ModeTile: View {
    let mode: PracticeMode

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            Image(systemName: mode.symbol)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Theme.Palette.brand)
                .frame(width: 40, height: 40)
                .background(Theme.Palette.brandSoft, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(mode.title).font(Theme.Typography.headline).foregroundStyle(Theme.Palette.textPrimary)
                Text(mode.subtitle).font(Theme.Typography.caption).foregroundStyle(Theme.Palette.textSecondary)
                    .lineLimit(2, reservesSpace: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

private struct ToolRow: View {
    let symbol: String
    let title: String
    let subtitle: String
    let destination: Route

    var body: some View {
        NavigationLink(value: destination) {
            HStack(spacing: Theme.Spacing.md) {
                Image(systemName: symbol)
                    .foregroundStyle(Theme.Palette.brand)
                    .frame(width: 36, height: 36)
                    .background(Theme.Palette.brandSoft, in: RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(Theme.Typography.bodyEmphasis).foregroundStyle(Theme.Palette.textPrimary)
                    Text(subtitle).font(Theme.Typography.caption).foregroundStyle(Theme.Palette.textSecondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.Palette.textTertiary)
            }
            .padding(.vertical, Theme.Spacing.sm)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct TopicPickerSheet: View {
    let model: PracticeHubViewModel
    let onPick: (Topic) -> Void
    @State private var subject: String?
    @State private var search = ""

    var body: some View {
        NavigationStack {
            Group {
                switch model.topics {
                case .idle, .loading: LoadingView()
                case .failed(let error): ErrorStateView(error: error) { Task { await model.loadTopics(subject: subject) } }
                case .loaded(let topics):
                    let filtered = search.isEmpty ? topics : topics.filter { $0.name.localizedCaseInsensitiveContains(search) }
                    if filtered.isEmpty {
                        EmptyStateView(symbol: "scope", title: "No topics", message: "Try another subject or search term.")
                    } else {
                        List(filtered) { topic in
                            Button { onPick(topic) } label: {
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(topic.name).foregroundStyle(Theme.Palette.textPrimary)
                                        Text(topic.subject.capitalized).font(.caption).foregroundStyle(Theme.Palette.textSecondary)
                                    }
                                    Spacer()
                                    Text("\(topic.questionCount) questions").font(.caption).foregroundStyle(Theme.Palette.textTertiary)
                                }
                            }
                        }
                    }
                }
            }
            .searchable(text: $search, prompt: "Search topics")
            .navigationTitle("Choose a topic")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Subject", selection: $subject) {
                            Text("All subjects").tag(String?.none)
                            ForEach(model.subjects, id: \.self) { Text($0.capitalized).tag(String?.some($0)) }
                        }
                    } label: { Image(systemName: "line.3.horizontal.decrease.circle") }
                    .accessibilityLabel("Filter by subject")
                }
            }
            .task(id: subject) { await model.loadTopics(subject: subject) }
        }
        .presentationDetents([.medium, .large])
    }
}

private struct CustomPracticeSheet: View {
    @Bindable var model: PracticeHubViewModel
    let onStart: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Subject") {
                    Picker("Subject", selection: $model.customSubject) {
                        Text("Any").tag(String?.none)
                        ForEach(model.subjects, id: \.self) { Text($0.capitalized).tag(String?.some($0)) }
                    }
                }
                Section("Topic") {
                    Picker("Topic", selection: $model.customTopicId) {
                        Text("Any").tag(UUID?.none)
                        ForEach(model.topics.value ?? []) { Text($0.name).tag(UUID?.some($0.id)) }
                    }
                }
                Section("Difficulty") {
                    Picker("Difficulty", selection: $model.customDifficulty) {
                        Text("Mixed").tag(Int?.none)
                        Text("Easy").tag(Int?.some(1))
                        Text("Medium").tag(Int?.some(2))
                        Text("Hard").tag(Int?.some(3))
                    }
                    .pickerStyle(.segmented)
                }
                Section("Number of questions") {
                    Stepper("\(model.customCount) questions", value: $model.customCount, in: 5...50, step: 5)
                }
            }
            .navigationTitle("Custom Practice")
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) {
                Button("Start practice", action: onStart)
                    .buttonStyle(.primary)
                    .pagePadding()
                    .padding(.bottom, Theme.Spacing.sm)
            }
            .task(id: model.customSubject) {
                model.customTopicId = nil
                await model.loadTopics(subject: model.customSubject)
            }
        }
        .presentationDetents([.large])
    }
}
