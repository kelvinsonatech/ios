import SwiftUI

struct LiveQuizListView: View {
    @State var model: LiveQuizListViewModel
    @Environment(AppRouter.self) private var router

    var body: some View {
        LoadableView(state: model.quizzes, retry: { Task { await model.load() } }) { quizzes in
            if quizzes.isEmpty {
                EmptyStateView(symbol: "trophy", title: "No upcoming competitions", message: "Check back soon — new live quizzes are scheduled regularly.")
            } else {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(quizzes) { quiz in
                            LiveQuizRow(quiz: quiz) {
                                if quiz.isJoined { router.presentedLiveQuizId = quiz.id }
                                else { Task { await model.join(quiz) } }
                            }
                            Divider()
                        }
                    }
                    .card(padding: Theme.Spacing.md)
                    .pagePadding()
                    .padding(.vertical, Theme.Spacing.lg)
                }
            }
        }
        .background(Theme.Palette.background)
        .navigationTitle("Live quizzes")
        .task { await model.load() }
        .refreshable { await model.load() }
    }
}

struct LiveQuizContainerView: View {
    @State var model: LiveQuizViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if let state = model.state {
                    switch state.phase {
                    case .lobby: lobby(state)
                    case .question, .reveal: question(state)
                    case .finished: PodiumView(model: model) { dismiss() }
                    }
                } else if let error = model.error {
                    ErrorStateView(error: error)
                } else {
                    LoadingView(message: "Joining…")
                }
            }
            .background(Theme.Palette.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Leave") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    if let rank = model.myRank {
                        Text("#\(rank) · \(model.myScore) pts").font(Theme.Typography.captionEmphasis).monospacedDigit()
                    }
                }
            }
        }
        .task { await model.start() }
        .onDisappear { model.stop() }
    }

    private func lobby(_ state: LiveQuizState) -> some View {
        VStack(spacing: Theme.Spacing.xl) {
            Spacer()
            Image(systemName: "trophy.fill").font(.system(size: 56)).foregroundStyle(Theme.Palette.gold)
            Text("Get ready!").font(Theme.Typography.largeTitle)
            if let end = model.phaseEndsAtLocal {
                CountdownText(target: end, prefix: "Starting in ")
                    .font(Theme.Typography.timer)
                    .foregroundStyle(Theme.Palette.brand)
            }
            Text("\(model.leaderboard.count) players in the lobby · \(state.questionCount) questions")
                .foregroundStyle(Theme.Palette.textSecondary)
            Text("Faster correct answers earn more points.")
                .font(Theme.Typography.callout)
                .foregroundStyle(Theme.Palette.textTertiary)
            Spacer()
            LeaderboardList(participants: model.leaderboard, highlight: model.myUserId, limit: 8)
        }
        .pagePadding()
    }

    private func question(_ state: LiveQuizState) -> some View {
        VStack(spacing: Theme.Spacing.lg) {
            HStack {
                Text("Question \(state.position + 1) of \(state.questionCount)").font(Theme.Typography.captionEmphasis)
                Spacer()
                if let end = model.phaseEndsAtLocal {
                    Label { CountdownText(target: end) } icon: { Image(systemName: state.phase == .question ? "timer" : "eye") }
                        .font(Theme.Typography.timer)
                }
            }
            .pagePadding()

            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                    if let question = state.question {
                        Text(LocalizedStringKey(question.prompt)).font(Theme.Typography.title)
                        ForEach(Array(question.choices.enumerated()), id: \.element.id) { index, choice in
                            ChoiceRow(letter: Character(UnicodeScalar(65 + index)!), text: choice.text,
                                      state: rowState(choice.id, state: state)) {
                                Task { await model.choose(choice.id) }
                            }
                            .disabled(state.phase != .question || model.selectedChoiceId != nil)
                        }
                    }
                    if state.phase == .reveal {
                        let correct = state.correctChoiceId != nil && state.correctChoiceId == model.selectedChoiceId
                        Label(correct ? "Correct! +\(model.lastResult?.points ?? 0) points" : model.selectedChoiceId == nil ? "Time's up" : "Not this one",
                              systemImage: correct ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .font(Theme.Typography.headline)
                            .foregroundStyle(correct ? Theme.Palette.success : Theme.Palette.danger)
                        LeaderboardList(participants: model.leaderboard, highlight: model.myUserId, limit: 5)
                    } else if model.selectedChoiceId != nil {
                        Label("Answer locked in — waiting for others", systemImage: "lock.fill")
                            .font(Theme.Typography.callout)
                            .foregroundStyle(Theme.Palette.textSecondary)
                    }
                }
                .frame(maxWidth: 680)
                .pagePadding()
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.top, Theme.Spacing.md)
    }

    private func rowState(_ id: String, state: LiveQuizState) -> ChoiceRow.State {
        if state.phase == .reveal, let correct = state.correctChoiceId {
            if id == correct { return .correct }
            if id == model.selectedChoiceId { return .incorrect }
            return .dimmed
        }
        return id == model.selectedChoiceId ? .selected : .normal
    }
}

struct LeaderboardList: View {
    let participants: [LiveQuizParticipant]
    let highlight: UUID?
    var limit = 100

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(participants.prefix(limit).enumerated()), id: \.element.id) { index, participant in
                HStack(spacing: Theme.Spacing.md) {
                    Text("\(index + 1)").font(Theme.Typography.captionEmphasis).frame(width: 24).monospacedDigit()
                    Avatar(name: participant.displayName, url: participant.avatarUrl, size: 28)
                    Text(participant.displayName).lineLimit(1)
                        .fontWeight(participant.userId == highlight ? .bold : .regular)
                    Spacer()
                    Text("\(participant.score)").font(Theme.Typography.bodyEmphasis).monospacedDigit()
                        .contentTransition(.numericText())
                }
                .padding(.vertical, Theme.Spacing.sm)
                .padding(.horizontal, Theme.Spacing.sm)
                .background(participant.userId == highlight ? Theme.Palette.brandSoft : .clear,
                            in: RoundedRectangle(cornerRadius: Theme.Radius.sm))
                .accessibilityElement(children: .combine)
            }
        }
        .animation(Theme.Motion.snappy, value: participants.map(\.score))
        .card(padding: Theme.Spacing.sm)
    }
}

private struct PodiumView: View {
    let model: LiveQuizViewModel
    let onDone: () -> Void

    var body: some View {
        let top = Array(model.leaderboard.prefix(3))
        ScrollView {
            VStack(spacing: Theme.Spacing.xl) {
                Text("Final results").font(Theme.Typography.largeTitle).padding(.top, Theme.Spacing.lg)
                HStack(alignment: .bottom, spacing: Theme.Spacing.md) {
                    if top.count > 1 { podium(top[1], place: 2, height: 110, color: Theme.Palette.silver) }
                    if let first = top.first { podium(first, place: 1, height: 150, color: Theme.Palette.gold) }
                    if top.count > 2 { podium(top[2], place: 3, height: 80, color: Theme.Palette.bronze) }
                }
                if let rank = model.myRank {
                    Text("You finished #\(rank) with \(model.myScore) points")
                        .font(Theme.Typography.headline)
                }
                SectionHeader("Full rankings").frame(maxWidth: .infinity, alignment: .leading)
                LeaderboardList(participants: model.leaderboard, highlight: model.myUserId)
                Button("Done", action: onDone).buttonStyle(.primary)
            }
            .frame(maxWidth: 680)
            .pagePadding()
            .frame(maxWidth: .infinity)
        }
        .onAppear { Haptics.success() }
    }

    private func podium(_ p: LiveQuizParticipant, place: Int, height: CGFloat, color: Color) -> some View {
        VStack(spacing: Theme.Spacing.sm) {
            Avatar(name: p.displayName, url: p.avatarUrl, size: place == 1 ? 64 : 52)
            Text(p.displayName).font(Theme.Typography.captionEmphasis).lineLimit(1)
            Text("\(p.score)").font(Theme.Typography.caption).monospacedDigit()
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .fill(color.gradient)
                .frame(height: height)
                .overlay(Text("\(place)").font(.system(.largeTitle, design: .rounded, weight: .heavy)).foregroundStyle(.white))
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Place \(place): \(p.displayName), \(p.score) points")
    }
}
