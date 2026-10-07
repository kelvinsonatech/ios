import SwiftUI

struct CourseCatalogView: View {
    @State var model: CourseCatalogViewModel
    @State private var path = NavigationPath()
    @State private var showFilters = false
    @Environment(DownloadManager.self) private var downloads
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: Theme.Spacing.lg, pinnedViews: [.sectionHeaders]) {
                    Section {
                        content
                    } header: {
                        ChipPicker(items: model.categories, selection: $model.selectedCategory) { $0.name }
                            .padding(.vertical, Theme.Spacing.sm)
                            .background(Theme.Palette.background)
                    }
                }
            }
            .background(Theme.Palette.background)
            .navigationTitle("Courses")
            .searchable(text: $model.filter.query, prompt: "Courses, subjects, instructors, topics")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showFilters = true } label: {
                        Image(systemName: activeFilterCount > 0 ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                    }
                    .accessibilityLabel(activeFilterCount > 0 ? "Filters, \(activeFilterCount) active" : "Filters")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        NavigationLink(value: Route.library) { Label("E-book library", systemImage: "books.vertical") }
                        NavigationLink(value: Route.downloads) { Label("Downloads", systemImage: "arrow.down.circle") }
                    } label: { Image(systemName: "ellipsis.circle") }
                    .accessibilityLabel("More")
                }
            }
            .sheet(isPresented: $showFilters) { FilterSheet(filter: $model.filter) }
            .withAppRoutes()
            .task { await model.loadCategories() }
            .task(id: model.filter) { await model.search(debounce: model.results.value != nil) }
            .refreshable { await model.search(debounce: false) }
        }
    }

    private var activeFilterCount: Int {
        [model.filter.level != nil, model.filter.freeOnly, model.filter.downloadableOnly, model.filter.sort != .relevance]
            .filter { $0 }.count
    }

    @ViewBuilder private var content: some View {
        switch model.results {
        case .idle, .loading:
            VStack(spacing: Theme.Spacing.lg) {
                ForEach(0..<6, id: \.self) { _ in
                    HStack(spacing: Theme.Spacing.md) {
                        SkeletonBlock(height: 78, width: 104)
                        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                            SkeletonBlock(height: 16)
                            SkeletonBlock(height: 12, width: 120)
                        }
                    }
                }
            }
            .pagePadding()
        case .failed(let error):
            ErrorStateView(error: error) { Task { await model.search(debounce: false) } }
                .padding(.top, Theme.Spacing.xxxl)
        case .loaded(let courses) where courses.isEmpty:
            EmptyStateView(symbol: "magnifyingglass", title: "No courses found",
                           message: "Try a different search or remove some filters.",
                           actionTitle: "Clear filters") { model.filter = CourseFilter(); model.selectedCategory = .all }
                .padding(.top, Theme.Spacing.xxxl)
        case .loaded(let courses):
            let columns = sizeClass == .regular
                ? [GridItem(.flexible(), spacing: Theme.Spacing.xl), GridItem(.flexible(), spacing: Theme.Spacing.xl)]
                : [GridItem(.flexible())]
            LazyVGrid(columns: columns, alignment: .leading, spacing: Theme.Spacing.lg) {
                ForEach(courses) { course in
                    NavigationLink(value: Route.course(course.id)) {
                        CourseRow(course: course, isDownloaded: downloads.isDownloaded(.quizSet, id: course.id))
                    }
                    .buttonStyle(.card)
                    .task { await model.loadMoreIfNeeded(current: course) }
                }
            }
            .pagePadding()
            if model.isLoadingMore { ProgressView().frame(maxWidth: .infinity).padding() }
        }
    }
}

private struct FilterSheet: View {
    @Binding var filter: CourseFilter
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Sort by") {
                    Picker("Sort by", selection: $filter.sort) {
                        ForEach(CourseSort.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }
                Section("Difficulty") {
                    Picker("Difficulty", selection: $filter.level) {
                        Text("Any").tag(Difficulty?.none)
                        ForEach(Difficulty.allCases) { Text($0.title).tag(Difficulty?.some($0)) }
                    }
                    .pickerStyle(.segmented)
                }
                Section {
                    Toggle("Free courses only", isOn: $filter.freeOnly)
                    Toggle("Available offline", isOn: $filter.downloadableOnly)
                }
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Reset") {
                        let query = filter.query, category = filter.categoryId
                        filter = CourseFilter()
                        filter.query = query
                        filter.categoryId = category
                    }
                }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
