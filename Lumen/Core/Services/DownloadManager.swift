import Foundation
import SwiftData
import Observation

/// Downloads lessons, notes, e-books and quiz sets for offline study.
@Observable
@MainActor
final class DownloadManager {
    static let wifiOnlyKey = "downloads.wifiOnly"

    private(set) var items: [DownloadedItem] = []
    private(set) var lastError: String?

    @ObservationIgnored private let context: ModelContext
    @ObservationIgnored private let client: SupabaseClient
    @ObservationIgnored private let courses: CourseRepository
    @ObservationIgnored private let library: LibraryRepository
    @ObservationIgnored private let questions: QuestionRepository
    @ObservationIgnored private let network: NetworkMonitor
    @ObservationIgnored private var tasks: [String: Task<Void, Never>] = [:]

    init(container: ModelContainer, client: SupabaseClient, courses: CourseRepository,
         library: LibraryRepository, questions: QuestionRepository, network: NetworkMonitor) {
        self.context = ModelContext(container)
        self.client = client
        self.courses = courses
        self.library = library
        self.questions = questions
        self.network = network
        reload()
        // Anything interrupted by app termination restarts as failed so the user can retry.
        for item in items where item.state == .downloading || item.state == .queued {
            item.state = .failed
            item.errorMessage = "Interrupted"
        }
        try? context.save()
    }

    var wifiOnly: Bool = UserDefaults.standard.object(forKey: DownloadManager.wifiOnlyKey) as? Bool ?? true {
        didSet { UserDefaults.standard.set(wifiOnly, forKey: Self.wifiOnlyKey) }
    }

    var totalBytes: Int64 { items.reduce(0) { $0 + $1.byteSize } }

    static var directory: URL {
        let url = URL.applicationSupportDirectory.appending(path: "Downloads", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutable = url
        try? mutable.setResourceValues(values)
        return url
    }

    // MARK: Queries

    func item(_ kind: DownloadKind, id: UUID) -> DownloadedItem? {
        items.first { $0.key == DownloadedItem.key(kind, id) }
    }

    func isDownloaded(_ kind: DownloadKind, id: UUID) -> Bool {
        item(kind, id: id)?.state == .completed
    }

    func localVideoURL(lessonId: UUID) -> URL? {
        guard let item = item(.lessonVideo, id: lessonId), item.state == .completed,
              let name = item.localFileName else { return nil }
        let url = Self.directory.appending(path: name)
        return FileManager.default.fileExists(atPath: url.path()) ? url : nil
    }

    func offlinePayload<T: Decodable>(_ kind: DownloadKind, id: UUID, as type: T.Type) -> T? {
        guard let data = item(kind, id: id)?.payload else { return nil }
        return try? JSONCoding.decoder.decode(T.self, from: data)
    }

    // MARK: Starting downloads

    func downloadLesson(_ lesson: Lesson, courseTitle: String) {
        guard lesson.isDownloadable else { return }
        start(.lessonNotes, id: lesson.id, parentId: lesson.courseId, title: lesson.title, subtitle: courseTitle) { [courses] in
            let content = try await courses.lessonContent(lessonId: lesson.id)
            guard let content else { throw APIError.premiumRequired }
            return try JSONCoding.encoder.encode(content)
        }
        if let path = lesson.videoPath {
            startFile(.lessonVideo, id: lesson.id, parentId: lesson.courseId, title: lesson.title, subtitle: courseTitle) { [courses] in
                try await courses.mediaURL(path: path)
            }
        }
    }

    func downloadEbook(_ book: Ebook) {
        guard book.isDownloadable else { return }
        start(.ebook, id: book.id, parentId: nil, title: book.title, subtitle: book.author) { [library] in
            try JSONCoding.encoder.encode(try await library.chapters(ebookId: book.id))
        }
    }

    func downloadQuizSet(course: Course) {
        start(.quizSet, id: course.id, parentId: course.id, title: "\(course.title) practice set", subtitle: nil) { [questions] in
            try JSONCoding.encoder.encode(try await questions.offlineQuizSet(courseId: course.id))
        }
    }

    func cancel(_ item: DownloadedItem) {
        tasks[item.key]?.cancel()
        delete(item)
    }

    func delete(_ item: DownloadedItem) {
        tasks[item.key]?.cancel()
        tasks[item.key] = nil
        if let name = item.localFileName {
            try? FileManager.default.removeItem(at: Self.directory.appending(path: name))
        }
        context.delete(item)
        try? context.save()
        reload()
    }

    func deleteAll() {
        items.forEach(delete)
    }

    // MARK: Internals

    private func canDownloadNow() -> Bool {
        guard network.isConnected else { lastError = APIError.offline.localizedDescription; return false }
        if wifiOnly && !network.isOnUnmeteredNetwork {
            lastError = "Downloads are set to Wi-Fi only. Connect to Wi-Fi or change this in Downloads settings."
            return false
        }
        return true
    }

    private func upsertItem(_ kind: DownloadKind, id: UUID, parentId: UUID?, title: String, subtitle: String?) -> DownloadedItem {
        if let existing = item(kind, id: id) { return existing }
        let item = DownloadedItem(kind: kind, remoteId: id, parentId: parentId, title: title, subtitle: subtitle)
        context.insert(item)
        try? context.save()
        reload()
        return item
    }

    /// Structured payload download (JSON snapshot).
    private func start(_ kind: DownloadKind, id: UUID, parentId: UUID?, title: String, subtitle: String?,
                       load: @escaping @MainActor () async throws -> Data) {
        guard canDownloadNow() else { return }
        let item = upsertItem(kind, id: id, parentId: parentId, title: title, subtitle: subtitle)
        guard item.state != .completed, tasks[item.key] == nil else { return }
        item.state = .downloading
        let key = item.key
        tasks[key] = Task { [weak self] in
            do {
                let data = try await load()
                item.payload = data
                item.byteSize = Int64(data.count)
                item.progress = 1
                item.state = .completed
            } catch {
                item.state = .failed
                item.errorMessage = APIError.from(error).localizedDescription
            }
            self?.finish(key)
        }
    }

    /// Large file download with progress reporting.
    private func startFile(_ kind: DownloadKind, id: UUID, parentId: UUID?, title: String, subtitle: String?,
                           source: @escaping @MainActor () async throws -> URL) {
        guard canDownloadNow() else { return }
        let item = upsertItem(kind, id: id, parentId: parentId, title: title, subtitle: subtitle)
        guard item.state != .completed, tasks[item.key] == nil else { return }
        item.state = .downloading
        let key = item.key
        let session = client.session
        tasks[key] = Task { [weak self] in
            do {
                let url = try await source()
                let delegate = DownloadProgressDelegate { fraction in
                    Task { @MainActor in item.progress = fraction }
                }
                let (tempURL, response) = try await session.download(for: URLRequest(url: url), delegate: delegate)
                guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                    throw APIError.invalidResponse
                }
                let fileName = "\(kind.rawValue)-\(id.uuidString).\(url.pathExtension.isEmpty ? "mp4" : url.pathExtension)"
                let destination = Self.directory.appending(path: fileName)
                try? FileManager.default.removeItem(at: destination)
                try FileManager.default.moveItem(at: tempURL, to: destination)
                let size = (try? FileManager.default.attributesOfItem(atPath: destination.path())[.size] as? Int64) ?? 0
                item.localFileName = fileName
                item.byteSize = size
                item.progress = 1
                item.state = .completed
            } catch {
                item.state = error is CancellationError ? .paused : .failed
                item.errorMessage = APIError.from(error).localizedDescription
            }
            self?.finish(key)
        }
    }

    private func finish(_ key: String) {
        tasks[key] = nil
        try? context.save()
        reload()
    }

    private func reload() {
        let descriptor = FetchDescriptor<DownloadedItem>(sortBy: [SortDescriptor(\.createdAt, order: .reverse)])
        items = (try? context.fetch(descriptor)) ?? []
    }
}

private final class DownloadProgressDelegate: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    private let onProgress: @Sendable (Double) -> Void

    init(onProgress: @escaping @Sendable (Double) -> Void) { self.onProgress = onProgress }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard totalBytesExpectedToWrite > 0 else { return }
        onProgress(Double(totalBytesWritten) / Double(totalBytesExpectedToWrite))
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        // Handled by the async `download(for:delegate:)` call site.
    }
}
