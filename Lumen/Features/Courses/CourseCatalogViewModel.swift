import Foundation
import Observation

@MainActor
@Observable
final class CourseCatalogViewModel {
    struct CategoryOption: Identifiable, Hashable {
        let id: String?
        let name: String
        static let all = CategoryOption(id: nil, name: "All")
    }

    var filter = CourseFilter()
    var selectedCategory = CategoryOption.all {
        didSet { filter.categoryId = selectedCategory.id }
    }
    private(set) var categories: [CategoryOption] = [.all]
    private(set) var results: Loadable<[Course]> = .idle
    private(set) var isLoadingMore = false
    private(set) var reachedEnd = false

    @ObservationIgnored let env: AppEnvironment
    @ObservationIgnored private let pageSize = 30

    init(env: AppEnvironment) { self.env = env }

    func loadCategories() async {
        guard categories.count == 1, let list = try? await env.courses.categories() else { return }
        categories = [.all] + list.map { CategoryOption(id: $0.id, name: $0.name) }
    }

    /// Debounced search triggered by `.task(id: filter)`.
    func search(debounce: Bool) async {
        if debounce {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
        }
        if results.value == nil { results = .loading }
        reachedEnd = false
        do {
            let courses = try await env.courses.search(filter, limit: pageSize, offset: 0)
            guard !Task.isCancelled else { return }
            results = .loaded(courses)
            reachedEnd = courses.count < pageSize
        } catch {
            guard !Task.isCancelled else { return }
            results = .failed(.from(error))
        }
    }

    func loadMoreIfNeeded(current course: Course) async {
        guard let list = results.value, course.id == list.last?.id, !reachedEnd, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        if let more = try? await env.courses.search(filter, limit: pageSize, offset: list.count) {
            results = .loaded(list + more.filter { new in !list.contains { $0.id == new.id } })
            reachedEnd = more.count < pageSize
        }
    }
}
