import Foundation
import Observation

@MainActor
@Observable
final class TutorViewModel {
    var mode: TutorMode = .explain
    var input = ""
    private(set) var messages: [ChatMessage] = []
    private(set) var conversationId: UUID?
    private(set) var context: TutorContext?
    private(set) var isStreaming = false
    private(set) var conversations: [TutorConversation] = []
    private(set) var examinerSummary: ExaminerSummary?
    var attachedMaterial: String?
    var errorMessage: String?
    var flashcardStatus: String?

    @ObservationIgnored let env: AppEnvironment
    @ObservationIgnored private var streamTask: Task<Void, Never>?

    static let summaryFence = "```lumen-exam-summary"

    init(env: AppEnvironment) { self.env = env }

    var canSend: Bool {
        !isStreaming && (!input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || attachedMaterial != nil)
    }

    var suggestions: [String] {
        if let title = context?.lessonTitle {
            return ["Summarise \"\(title)\"", "Give me a real-world example", "Quiz me on this lesson"]
        }
        switch mode {
        case .explain: return ["Explain photosynthesis", "How do derivatives work?", "What is recursion?"]
        case .simplify: return ["Simplify quantum entanglement", "Explain inflation like I'm 12"]
        case .quiz: return ["Quiz me on fractions", "5 questions on the French Revolution"]
        case .examiner: return ["Examine me on algebra", "Test me on cell biology"]
        case .socratic: return ["Why is the sky blue?", "Help me solve 2x + 5 = 17"]
        }
    }

    // MARK: Conversations

    func loadHistory() async {
        conversations = (try? await env.tutor.conversations()) ?? conversations
    }

    func open(_ conversation: TutorConversation) async {
        cancel()
        conversationId = conversation.id
        mode = conversation.mode
        context = conversation.lessonId.map { TutorContext(lessonId: $0) }
        examinerSummary = nil
        do { messages = try await env.tutor.messages(conversationId: conversation.id) }
        catch { errorMessage = APIError.from(error).localizedDescription }
        parseSummary()
    }

    func newConversation(mode: TutorMode? = nil) {
        cancel()
        messages = []
        conversationId = nil
        context = nil
        examinerSummary = nil
        attachedMaterial = nil
        if let mode { self.mode = mode }
    }

    func delete(_ conversation: TutorConversation) async {
        try? await env.tutor.deleteConversation(id: conversation.id)
        conversations.removeAll { $0.id == conversation.id }
        if conversationId == conversation.id { newConversation() }
    }

    /// Consumes a hand-off from another screen (lesson, question, exam result).
    func consumePendingContext() {
        guard let pending = env.router.pendingTutorContext else { return }
        env.router.pendingTutorContext = nil
        newConversation(mode: pending.mode)
        context = pending
        if let seed = pending.seedPrompt {
            input = seed
            send()
        }
    }

    // MARK: Sending

    func send(_ text: String? = nil) {
        let typed = (text ?? input).trimmingCharacters(in: .whitespacesAndNewlines)
        var outgoing = typed
        if let material = attachedMaterial {
            outgoing = (typed.isEmpty ? "Please explain this study material." : typed)
                + "\n\n---\nStudy material:\n" + material
        }
        guard !outgoing.isEmpty, !isStreaming else { return }
        input = ""
        attachedMaterial = nil
        errorMessage = nil
        Haptics.tap()

        messages.append(ChatMessage(role: .user, content: outgoing))
        let reply = ChatMessage(role: .assistant, content: "")
        messages.append(reply)
        isStreaming = true

        let request = TutorRepository.SendRequest(
            conversationId: conversationId, mode: mode, message: outgoing,
            lessonId: context?.lessonId, questionId: messages.count <= 2 ? context?.questionId : nil,
            submittedAnswer: messages.count <= 2 ? context?.submittedAnswer : nil,
            language: Locale.current.language.languageCode?.identifier
        )

        streamTask = Task { [weak self] in
            guard let self else { return }
            do {
                for try await event in self.env.tutor.send(request) {
                    switch event.type {
                    case "meta":
                        if let id = event.conversationId { self.conversationId = id }
                    case "delta":
                        if let text = event.text { self.appendToReply(reply.id, text) }
                    default:
                        break
                    }
                }
                self.parseSummary()
                Task { await self.loadHistory() }
            } catch {
                let apiError = APIError.from(error)
                if apiError != .cancelled {
                    if apiError == .premiumRequired || apiError == .rateLimited {
                        self.errorMessage = "You've reached today's free tutor limit. Upgrade to Premium for unlimited tutoring."
                    } else {
                        self.errorMessage = apiError.localizedDescription
                    }
                    if self.messages.last?.id == reply.id && self.messages.last?.content.isEmpty == true {
                        self.messages.removeLast()
                    }
                }
            }
            self.isStreaming = false
        }
    }

    func cancel() {
        streamTask?.cancel()
        streamTask = nil
        isStreaming = false
    }

    func translateLastAnswer(to language: String) {
        send("Please translate your last explanation into \(language), keeping any formulas unchanged.")
    }

    func makeFlashcards() async {
        let topic = context?.lessonTitle
            ?? messages.last(where: { $0.role == .user })?.content.prefix(200).description
            ?? input
        guard !topic.isEmpty else { flashcardStatus = "Ask about a topic first, then make flashcards."; return }
        flashcardStatus = "Creating flashcards…"
        do {
            let cards = try await env.tutor.generateFlashcards(topic: topic)
            _ = try await env.flashcards.createDeck(title: String(topic.prefix(60)), description: "Generated by your AI tutor",
                                                    courseId: nil, cards: cards)
            flashcardStatus = "Saved \(cards.count) flashcards to your decks."
            Haptics.success()
        } catch {
            flashcardStatus = APIError.from(error).localizedDescription
        }
    }

    private func appendToReply(_ id: UUID, _ text: String) {
        guard let index = messages.lastIndex(where: { $0.id == id }) else { return }
        messages[index].content += text
    }

    /// The examiner ends with a fenced JSON summary; render it as a results card.
    private func parseSummary() {
        guard mode == .examiner, let last = messages.last(where: { $0.role == .assistant }),
              let start = last.content.range(of: Self.summaryFence) else { return }
        let afterFence = last.content[start.upperBound...]
        guard let end = afterFence.range(of: "```") else { return }
        let json = afterFence[..<end.lowerBound]
        examinerSummary = try? JSONCoding.decoder.decode(ExaminerSummary.self, from: Data(json.utf8))
    }

    /// Message text without the machine-readable summary block.
    static func displayText(_ content: String) -> String {
        guard let start = content.range(of: summaryFence) else { return content }
        return String(content[..<start.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
