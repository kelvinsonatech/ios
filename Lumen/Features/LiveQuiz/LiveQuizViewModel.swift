import Foundation
import Observation

@MainActor
@Observable
final class LiveQuizListViewModel {
    private(set) var quizzes: Loadable<[LiveQuiz]> = .idle
    @ObservationIgnored let env: AppEnvironment

    init(env: AppEnvironment) { self.env = env }

    func load() async {
        if quizzes.value == nil { quizzes = .loading }
        do { quizzes = .loaded(try await env.liveQuizzes.upcoming(limit: 30)) }
        catch { quizzes = .failed(.from(error)) }
    }

    func join(_ quiz: LiveQuiz) async {
        do {
            try await env.liveQuizzes.join(quizId: quiz.id)
            await env.notifications.scheduleLiveQuizReminder(quiz)
            Haptics.success()
            await load()
        } catch let error as APIError where error == .premiumRequired {
            env.router.showPaywall()
        } catch {
            Haptics.error()
        }
    }
}

/// Drives a live competition. All timing and scoring come from the server's clock;
/// the client only renders state and submits a choice.
@MainActor
@Observable
final class LiveQuizViewModel {
    let quizId: UUID
    private(set) var state: LiveQuizState?
    private(set) var leaderboard: [LiveQuizParticipant] = []
    private(set) var selectedChoiceId: String?
    private(set) var lastResult: LiveAnswerResult?
    private(set) var error: APIError?
    /// Server time minus device time, so countdowns match the server.
    private(set) var clockOffset: TimeInterval = 0

    @ObservationIgnored let env: AppEnvironment
    @ObservationIgnored private var pollTask: Task<Void, Never>?
    @ObservationIgnored private var realtimeTask: Task<Void, Never>?

    init(env: AppEnvironment, quizId: UUID) {
        self.env = env
        self.quizId = quizId
    }

    var myUserId: UUID? { env.session.userId }
    var myRank: Int? { leaderboard.firstIndex { $0.userId == myUserId }.map { $0 + 1 } }
    var myScore: Int { leaderboard.first { $0.userId == myUserId }?.score ?? 0 }

    /// Phase end expressed in device time.
    var phaseEndsAtLocal: Date? { state?.phaseEndsAt?.addingTimeInterval(-clockOffset) }

    func start() async {
        await refreshLeaderboard()
        realtimeTask = Task { [weak self] in
            guard let self else { return }
            for await change in await self.env.liveQuizzes.participantChanges(quizId: self.quizId) {
                self.apply(change)
            }
        }
        pollTask = Task { [weak self] in await self?.pollLoop() }
    }

    func stop() {
        pollTask?.cancel()
        realtimeTask?.cancel()
    }

    func choose(_ choiceId: String) async {
        guard let state, state.phase == .question, selectedChoiceId == nil, state.answeredChoiceId == nil else { return }
        selectedChoiceId = choiceId
        Haptics.tap()
        do {
            let result = try await env.liveQuizzes.submit(quizId: quizId, position: state.position, choiceId: choiceId)
            lastResult = result
            if !result.accepted { selectedChoiceId = nil }
        } catch {
            selectedChoiceId = nil
            self.error = .from(error)
        }
    }

    private func pollLoop() async {
        while !Task.isCancelled {
            do {
                let previousPosition = state?.position
                let previousPhase = state?.phase
                let newState = try await env.liveQuizzes.state(quizId: quizId)
                clockOffset = newState.serverTime.timeIntervalSinceNow
                if newState.position != previousPosition { selectedChoiceId = newState.answeredChoiceId; lastResult = nil }
                state = newState
                error = nil
                if newState.phase == .reveal && previousPhase == .question {
                    if let correct = newState.correctChoiceId, correct == (selectedChoiceId ?? newState.answeredChoiceId) {
                        Haptics.success()
                    } else {
                        Haptics.warning()
                    }
                }
                if newState.phase == .finished {
                    await refreshLeaderboard()
                    await env.session.refreshProfile()
                    return
                }
                // Sleep until just after the phase boundary (server-adjusted), capped for resilience.
                let wait = (phaseEndsAtLocal?.timeIntervalSinceNow ?? 3) + 0.25
                try await Task.sleep(for: .seconds(min(max(wait, 0.5), 15)))
            } catch is CancellationError {
                return
            } catch {
                self.error = .from(error)
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    private func refreshLeaderboard() async {
        if let list = try? await env.liveQuizzes.leaderboard(quizId: quizId) { leaderboard = list }
    }

    private func apply(_ change: PostgresChange) {
        guard let record = change.record, let participant = try? record.decode(LiveQuizParticipant.self) else { return }
        if let index = leaderboard.firstIndex(where: { $0.userId == participant.userId }) {
            leaderboard[index] = participant
        } else {
            leaderboard.append(participant)
        }
        leaderboard.sort { $0.score > $1.score }
    }
}
