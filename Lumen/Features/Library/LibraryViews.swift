import SwiftUI

struct LibraryView: View {
    @State var model: LibraryViewModel

    var body: some View {
        LoadableView(state: model.state, retry: { Task { await model.load() } }) { _ in
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.xxl) {
                    if !model.reading.isEmpty {
                        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                            SectionHeader("Continue reading").pagePadding()
                            ScrollView(.horizontal, showsIndicators: false) {
                                LazyHStack(spacing: Theme.Spacing.lg) {
                                    ForEach(model.reading) { item in
                                        NavigationLink(value: Route.ebook(item.book)) {
                                            BookTile(book: item.book, progress: item.progress.percent)
                                        }
                                        .buttonStyle(.card)
                                    }
                                }
                                .pagePadding()
                            }
                        }
                    }
                    shelf("Recommended books", books: model.recommended)
                    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                        SectionHeader(title: "Subjects") {
                            NavigationLink(value: Route.bookmarks) { Label("Bookmarks", systemImage: "bookmark") }
                                .font(Theme.Typography.callout)
                        }
                        .pagePadding()
                        ChipPicker(items: model.categories, selection: Binding(
                            get: { model.selectedCategory ?? model.categories.first ?? Category(id: "", name: "", symbol: "", sortOrder: 0) },
                            set: { model.selectedCategory = $0 }
                        )) { $0.name }
                        if let category = model.selectedCategory ?? model.categories.first {
                            let books = model.byCategory[category.id] ?? []
                            if books.isEmpty {
                                Text("No books in \(category.name) yet.")
                                    .font(Theme.Typography.callout)
                                    .foregroundStyle(Theme.Palette.textSecondary)
                                    .pagePadding()
                            } else {
                                bookRow(books)
                            }
                        }
                    }
                    .task(id: model.selectedCategory ?? model.categories.first) {
                        if let category = model.selectedCategory ?? model.categories.first { await model.loadCategory(category) }
                    }
                    shelf("Recently added", books: model.recent)
                }
                .padding(.vertical, Theme.Spacing.lg)
            }
        }
        .background(Theme.Palette.background)
        .navigationTitle("Library")
        .task { await model.load() }
        .refreshable { await model.load() }
    }

    @ViewBuilder private func shelf(_ title: String, books: [Ebook]) -> some View {
        if !books.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                SectionHeader(title).pagePadding()
                bookRow(books)
            }
        }
    }

    private func bookRow(_ books: [Ebook]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(alignment: .top, spacing: Theme.Spacing.lg) {
                ForEach(books) { book in
                    NavigationLink(value: Route.ebook(book)) { BookTile(book: book) }
                        .buttonStyle(.card)
                }
            }
            .pagePadding()
        }
    }
}

struct BookTile: View {
    let book: Ebook
    var progress: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            RemoteImage(url: book.coverUrl, symbol: "book.closed", tint: Theme.subjectTint(book.categoryId))
                .frame(width: 120, height: 170)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))
                .shadow(color: .black.opacity(0.12), radius: 6, y: 3)
            Text(book.title).font(Theme.Typography.captionEmphasis).foregroundStyle(Theme.Palette.textPrimary).lineLimit(2, reservesSpace: true)
            Text(book.author).font(Theme.Typography.caption).foregroundStyle(Theme.Palette.textSecondary).lineLimit(1)
            if let progress { LinearProgress(value: progress, height: 4) }
        }
        .frame(width: 120)
        .accessibilityElement(children: .combine)
    }
}

struct ReaderView: View {
    @State var model: ReaderViewModel
    @State private var showContents = false
    @State private var showSettings = false
    @State private var showSearch = false
    @Environment(DownloadManager.self) private var downloads

    var body: some View {
        LoadableView(state: model.chapters, retry: { Task { await model.load() } }) { _ in
            if let chapter = model.current {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                            Text(chapter.title)
                                .font(.system(.title, design: .serif, weight: .bold))
                                .accessibilityAddTraits(.isHeader)
                                .id("top")
                            MarkdownText(markdown: chapter.contentMarkdown,
                                         font: .system(size: 18 * model.fontScale, design: .serif))
                                .lineSpacing(6 * model.fontScale)
                            chapterNavigation
                        }
                        .foregroundStyle(textColor)
                        .frame(maxWidth: 680, alignment: .leading)
                        .padding(.horizontal, Theme.Spacing.xl)
                        .padding(.vertical, Theme.Spacing.xl)
                        .frame(maxWidth: .infinity)
                        .background(GeometryReader { geo in
                            Color.clear.preference(key: ScrollFractionKey.self,
                                                   value: -geo.frame(in: .named("reader")).minY / max(geo.size.height, 1))
                        })
                    }
                    .coordinateSpace(name: "reader")
                    .onPreferenceChange(ScrollFractionKey.self) { model.updateScroll($0) }
                    .onChange(of: model.chapterIndex) { _, _ in proxy.scrollTo("top", anchor: .top) }
                }
                .background(pageColor.ignoresSafeArea())
                .safeAreaInset(edge: .bottom) {
                    LinearProgress(value: model.overallProgress, height: 3).padding(.horizontal)
                        .accessibilityLabel("Book progress")
                }
            }
        }
        .navigationTitle(model.book.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { showSearch = true } label: { Image(systemName: "magnifyingglass") }.accessibilityLabel("Search book")
                Button { showContents = true } label: { Image(systemName: "list.bullet") }.accessibilityLabel("Contents and bookmarks")
                Button { showSettings = true } label: { Image(systemName: "textformat.size") }.accessibilityLabel("Reading settings")
                Menu {
                    Button { Task { await model.addBookmark() } } label: { Label("Bookmark this chapter", systemImage: "bookmark") }
                    if model.book.isDownloadable {
                        Button { model.download() } label: {
                            Label(downloads.isDownloaded(.ebook, id: model.book.id) ? "Downloaded" : "Download for offline",
                                  systemImage: "arrow.down.circle")
                        }
                        .disabled(downloads.isDownloaded(.ebook, id: model.book.id))
                    }
                } label: { Image(systemName: "ellipsis.circle") }
            }
        }
        .sheet(isPresented: $showContents) { ContentsSheet(model: model) }
        .sheet(isPresented: $showSettings) { ReaderSettingsSheet(model: model).presentationDetents([.height(280)]) }
        .sheet(isPresented: $showSearch) { ReaderSearchSheet(model: model) }
        .task { await model.load() }
    }

    private var chapterNavigation: some View {
        HStack {
            if model.chapterIndex > 0 {
                Button { model.goTo(chapter: model.chapterIndex - 1) } label: { Label("Previous chapter", systemImage: "chevron.left") }
            }
            Spacer()
            if model.chapterIndex + 1 < (model.chapters.value?.count ?? 0) {
                Button { model.goTo(chapter: model.chapterIndex + 1) } label: {
                    Label("Next chapter", systemImage: "chevron.right").labelStyle(TrailingIconLabelStyle())
                }
            }
        }
        .font(Theme.Typography.bodyEmphasis)
        .padding(.top, Theme.Spacing.xl)
    }

    private var pageColor: Color {
        switch model.appearance {
        case .light: Color(light: 0xFFFFFF, dark: 0xFFFFFF)
        case .sepia: Color(light: 0xF6EEDC, dark: 0xF6EEDC)
        case .dark: Color(light: 0x121218, dark: 0x121218)
        }
    }

    private var textColor: Color {
        switch model.appearance {
        case .light: Color(light: 0x1B1B22, dark: 0x1B1B22)
        case .sepia: Color(light: 0x3E3122, dark: 0x3E3122)
        case .dark: Color(light: 0xE6E6EE, dark: 0xE6E6EE)
        }
    }
}

private struct ScrollFractionKey: PreferenceKey {
    static let defaultValue: Double = 0
    static func reduce(value: inout Double, nextValue: () -> Double) { value = nextValue() }
}

private struct ContentsSheet: View {
    let model: ReaderViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Contents") {
                    ForEach(Array((model.chapters.value ?? []).enumerated()), id: \.element.id) { index, chapter in
                        Button {
                            model.goTo(chapter: index)
                            dismiss()
                        } label: {
                            HStack {
                                Text(chapter.title).foregroundStyle(Theme.Palette.textPrimary)
                                Spacer()
                                if index == model.chapterIndex { Image(systemName: "book.fill").foregroundStyle(Theme.Palette.brand) }
                            }
                        }
                    }
                }
                if !model.bookmarks.isEmpty {
                    Section("Bookmarks") {
                        ForEach(model.bookmarks) { bookmark in
                            Button {
                                model.goTo(chapter: bookmark.chapterPosition)
                                dismiss()
                            } label: {
                                Text(bookmark.excerpt).lineLimit(2).foregroundStyle(Theme.Palette.textPrimary)
                            }
                        }
                        .onDelete { offsets in
                            let items = offsets.map { model.bookmarks[$0] }
                            Task { for item in items { await model.deleteBookmark(item) } }
                        }
                    }
                }
            }
            .navigationTitle(model.book.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

private struct ReaderSettingsSheet: View {
    @Bindable var model: ReaderViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            Text("Reading settings").font(Theme.Typography.headline)
            HStack {
                Image(systemName: "textformat.size.smaller")
                Slider(value: $model.fontScale, in: 0.8...1.8, step: 0.1)
                    .accessibilityLabel("Text size")
                Image(systemName: "textformat.size.larger")
            }
            Picker("Appearance", selection: $model.appearance) {
                Text("Light").tag(ReaderViewModel.Appearance.light)
                Text("Sepia").tag(ReaderViewModel.Appearance.sepia)
                Text("Dark").tag(ReaderViewModel.Appearance.dark)
            }
            .pickerStyle(.segmented)
        }
        .padding(Theme.Spacing.xl)
    }
}

private struct ReaderSearchSheet: View {
    @Bindable var model: ReaderViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(model.searchResults) { hit in
                Button {
                    model.goTo(chapter: hit.chapterIndex)
                    dismiss()
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(hit.chapterTitle).font(.caption).foregroundStyle(Theme.Palette.brand)
                        Text(hit.snippet).font(.callout).foregroundStyle(Theme.Palette.textPrimary).lineLimit(3)
                    }
                }
            }
            .overlay {
                if model.searchQuery.count >= 2 && model.searchResults.isEmpty {
                    ContentUnavailableView.search(text: model.searchQuery)
                }
            }
            .searchable(text: $model.searchQuery, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search this book")
            .navigationTitle("Search")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
