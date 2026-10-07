import SwiftUI

struct ExamListView: View {
    @State var model: ExamListViewModel

    var body: some View {
        LoadableView(state: model.exams, retry: { Task { await model.load() } }) { exams in
            if exams.isEmpty {
                EmptyStateView(symbol: "timer", title: "No exams yet", message: "Exams for your courses will appear here.")
            } else {
                List(exams) { exam in
                    NavigationLink(value: Route.exam(exam)) {
                        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                            HStack {
                                Text(exam.title).font(Theme.Typography.bodyEmphasis)
                                if exam.isPremium { Image(systemName: "crown.fill").foregroundStyle(Theme.Palette.gold).font(.caption) }
                            }
                            Text("\(exam.subject) · \(exam.questionCount) questions · \(exam.timeLimitSeconds / 60) min")
                                .font(Theme.Typography.caption)
                                .foregroundStyle(Theme.Palette.textSecondary)
                        }
                        .padding(.vertical, Theme.Spacing.xs)
                    }
                }
            }
        }
        .navigationTitle("Exams")
        .task { await model.load() }
        .refreshable { await model.load() }
    }
}

struct ExamIntroView: View {
    let exam: Exam
    @Environment(AppEnvironment.self) private var env
    @State private var isPresentingExam = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    Text(exam.subject.uppercased()).font(Theme.Typography.captionEmphasis).foregroundStyle(Theme.Palette.brand)
                    Text(exam.title).font(Theme.Typography.largeTitle)
                    if let description = exam.description {
                        Text(description).foregroundStyle(Theme.Palette.textSecondary)
                    }
                }
                HStack(spacing: Theme.Spacing.md) {
                    StatTile(value: "\(exam.questionCount)", label: "Questions", symbol: "list.number")
                    StatTile(value: "\(exam.timeLimitSeconds / 60) min", label: "Time limit", symbol: "timer")
                    StatTile(value: "\(exam.passPercentage)%", label: "To pass", symbol: "checkmark.seal", tint: Theme.Palette.success)
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    SectionHeader("Instructions")
                    let instructions = exam.instructions.isEmpty ? Self.defaultInstructions : exam.instructions
                    ForEach(Array(instructions.enumerated()), id: \.offset) { index, line in
                        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.md) {
                            Text("\(index + 1)").font(Theme.Typography.captionEmphasis)
                                .frame(width: 22, height: 22)
                                .background(Theme.Palette.brandSoft, in: Circle())
                            Text(line).font(Theme.Typography.callout)
                        }
                    }
                }
                .card()
                Button("Start exam") { isPresentingExam = true }
                    .buttonStyle(.primary)
            }
            .frame(maxWidth: 680)
            .pagePadding()
            .padding(.vertical, Theme.Spacing.lg)
            .frame(maxWidth: .infinity)
        }
        .background(Theme.Palette.background)
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(isPresented: $isPresentingExam) {
            ExamSessionView(model: ExamViewModel(env: env, exam: exam))
        }
    }

    static let defaultInstructions = [
        "The timer starts as soon as you begin and cannot be paused.",
        "You won't see whether answers are correct until you submit.",
        "Use the navigator to jump between questions and flag ones to revisit.",
        "Your exam is submitted automatically when time runs out."
    ]
}

struct ExamSessionView: View {
    @State var model: ExamViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                switch model.phase {
                case .starting:
                    LoadingView(message: "Preparing your exam…")
                case .failed(let message):
                    EmptyStateView(symbol: "exclamationmark.triangle", title: "Couldn't continue", message: message,
                                   actionTitle: "Close") { dismiss() }
                case .inProgress, .submitting:
                    inProgress
                case .finished:
                    if let result = model.result {
                        ExamResultView(exam: model.exam, result: result, onAskAI: { review in
                            model.askAI(about: review)
                            dismiss()
                        }, onDone: { dismiss() })
                    }
                }
            }
            .background(Theme.Palette.background)
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(model.phase == .inProgress)
        }
        .task { await model.start() }
    }

    @ViewBuilder private var inProgress: some View {
        if let question = model.current, let session = model.session {
            VStack(spacing: 0) {
                VStack(spacing: Theme.Spacing.sm) {
                    HStack {
                        Text("Question \(model.index + 1) of \(model.questions.count)")
                            .font(Theme.Typography.captionEmphasis)
                        Spacer()
                        Label { CountdownText(target: session.deadline) } icon: { Image(systemName: "timer") }
                            .font(Theme.Typography.timer)
                            .foregroundStyle(session.deadline.timeIntervalSinceNow < 60 ? Theme.Palette.danger : Theme.Palette.textPrimary)
                            .accessibilityLabel("Time remaining")
                    }
                    LinearProgress(value: Double(model.answeredCount) / Double(max(model.questions.count, 1)))
                }
                .pagePadding()
                .padding(.vertical, Theme.Spacing.md)

                ScrollView {
                    QuestionBody(question: question,
                                 answer: Binding(get: { model.answerBinding(for: question.id) },
                                                 set: { model.setAnswer($0, for: question.id) }),
                                 result: nil, revealsCorrectness: false)
                        .frame(maxWidth: 680)
                        .pagePadding()
                        .padding(.vertical, Theme.Spacing.lg)
                        .frame(maxWidth: .infinity)
                        .id(question.id)
                }

                HStack(spacing: Theme.Spacing.md) {
                    Button { model.go(to: model.index - 1) } label: { Label("Previous", systemImage: "chevron.left") }
                        .buttonStyle(.secondary)
                        .disabled(model.index == 0)
                    if model.index + 1 < model.questions.count {
                        Button { model.go(to: model.index + 1) } label: {
                            Label("Next", systemImage: "chevron.right").labelStyle(TrailingIconLabelStyle())
                        }
                        .buttonStyle(.primary)
                    } else {
                        Button("Submit exam") { model.confirmSubmit = true }
                            .buttonStyle(.primary(loading: model.phase == .submitting, tint: Theme.Palette.success))
                    }
                }
                .frame(maxWidth: 680)
                .pagePadding()
                .padding(.vertical, Theme.Spacing.md)
                .background(.bar)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Submit") { model.confirmSubmit = true }
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { model.toggleFlag() } label: {
                        Image(systemName: model.flagged.contains(question.id) ? "flag.fill" : "flag")
                    }
                    .tint(Theme.Palette.warning)
                    .accessibilityLabel(model.flagged.contains(question.id) ? "Unflag question" : "Flag question")
                    Button { model.showNavigator = true } label: { Image(systemName: "square.grid.3x3") }
                        .accessibilityLabel("Question navigator")
                }
            }
            .sheet(isPresented: $model.showNavigator) { QuestionNavigator(model: model) }
            .confirmationDialog("Submit your exam?", isPresented: $model.confirmSubmit, titleVisibility: .visible) {
                Button("Submit exam") { Task { await model.submit() } }
                Button("Keep working", role: .cancel) {}
            } message: {
                Text(model.unansweredCount > 0
                     ? "You have \(model.unansweredCount) unanswered question\(model.unansweredCount == 1 ? "" : "s"). You can't change answers after submitting."
                     : "You can't change answers after submitting.")
            }
        }
    }
}

private struct QuestionNavigator: View {
    let model: ExamViewModel

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 52), spacing: Theme.Spacing.md)], spacing: Theme.Spacing.md) {
                    ForEach(Array(model.questions.enumerated()), id: \.element.id) { index, question in
                        let answered = !(model.answers[question.id]?.isEmpty ?? true)
                        let flagged = model.flagged.contains(question.id)
                        Button { model.go(to: index) } label: {
                            Text("\(index + 1)")
                                .font(Theme.Typography.headline)
                                .frame(width: 52, height: 52)
                                .foregroundStyle(answered ? .white : Theme.Palette.textPrimary)
                                .background(answered ? Theme.Palette.brand : Theme.Palette.surfaceMuted,
                                            in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                                    .strokeBorder(index == model.index ? Theme.Palette.textPrimary : .clear, lineWidth: 2))
                                .overlay(alignment: .topTrailing) {
                                    if flagged {
                                        Image(systemName: "flag.fill").font(.caption2).foregroundStyle(Theme.Palette.warning).padding(4)
                                    }
                                }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Question \(index + 1)\(answered ? ", answered" : ", unanswered")\(flagged ? ", flagged" : "")")
                    }
                }
                .padding(Theme.Spacing.lg)
                HStack(spacing: Theme.Spacing.lg) {
                    legend(color: Theme.Palette.brand, text: "Answered")
                    legend(color: Theme.Palette.surfaceMuted, text: "Unanswered")
                    Label("Flagged", systemImage: "flag.fill").foregroundStyle(Theme.Palette.warning)
                }
                .font(Theme.Typography.caption)
            }
            .navigationTitle("Questions")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
    }

    private func legend(color: Color, text: String) -> some View {
        HStack(spacing: Theme.Spacing.xs) {
            RoundedRectangle(cornerRadius: 3).fill(color).frame(width: 12, height: 12)
            Text(text)
        }
    }
}

struct ExamResultView: View {
    let exam: Exam
    let result: ExamResult
    let onAskAI: (ExamResult.Review) -> Void
    let onDone: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                VStack(spacing: Theme.Spacing.md) {
                    Image(systemName: result.passed ? "checkmark.seal.fill" : "arrow.counterclockwise.circle.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(result.passed ? Theme.Palette.success : Theme.Palette.warning)
                    Text(result.passed ? "You passed!" : "Not this time")
                        .font(Theme.Typography.largeTitle)
                    Text("\(Int(result.percentage.rounded()))% · pass mark \(exam.passPercentage)%")
                        .font(Theme.Typography.headline)
                        .foregroundStyle(Theme.Palette.textSecondary)
                    if result.xpAwarded > 0 {
                        Tag(text: "+\(result.xpAwarded) XP", symbol: "sparkles", tint: Theme.Palette.brand)
                    }
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .combine)

                Grid(horizontalSpacing: Theme.Spacing.md, verticalSpacing: Theme.Spacing.md) {
                    GridRow {
                        StatTile(value: "\(result.score)/\(result.total)", label: "Score", symbol: "checkmark.circle")
                        StatTile(value: Duration.seconds(result.timeSpentSeconds).formatted(.time(pattern: .minuteSecond)),
                                 label: "Time spent", symbol: "timer")
                    }
                    GridRow {
                        StatTile(value: "\(result.score)", label: "Correct", symbol: "checkmark", tint: Theme.Palette.success)
                        StatTile(value: "\(result.incorrect)", label: "Incorrect", symbol: "xmark", tint: Theme.Palette.danger)
                    }
                }

                if !result.topicBreakdown.isEmpty {
                    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                        SectionHeader("Topic performance")
                        ForEach(result.topicBreakdown) { topic in
                            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                                HStack {
                                    Text(topic.topicName).font(Theme.Typography.callout)
                                    Spacer()
                                    Text("\(topic.correct)/\(topic.total)").font(Theme.Typography.captionEmphasis).monospacedDigit()
                                }
                                LinearProgress(value: topic.accuracy,
                                               tint: topic.accuracy >= 0.7 ? Theme.Palette.success : topic.accuracy >= 0.4 ? Theme.Palette.warning : Theme.Palette.danger)
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                    .card()
                }

                if !result.recommendedLessons.isEmpty {
                    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                        SectionHeader("Recommended to revise")
                        ForEach(result.recommendedLessons) { lesson in
                            Label {
                                VStack(alignment: .leading) {
                                    Text(lesson.title)
                                    if let topic = lesson.topicName {
                                        Text(topic).font(.caption).foregroundStyle(Theme.Palette.textSecondary)
                                    }
                                }
                            } icon: { Image(systemName: "book").foregroundStyle(Theme.Palette.brand) }
                        }
                    }
                    .card()
                }

                let missed = result.review.filter { !$0.isCorrect }
                if !missed.isEmpty {
                    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                        SectionHeader("Review incorrect answers")
                        ForEach(missed) { review in
                            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                                Text(LocalizedStringKey(review.prompt)).font(Theme.Typography.bodyEmphasis)
                                let correct = review.choices.filter { review.correctChoiceIds.contains($0.id) }.map(\.text)
                                Text("Correct answer: \(correct.isEmpty ? (review.acceptedAnswer ?? "—") : correct.joined(separator: ", "))")
                                    .font(Theme.Typography.callout)
                                    .foregroundStyle(Theme.Palette.success)
                                if let explanation = review.explanation {
                                    Text(LocalizedStringKey(explanation)).font(Theme.Typography.callout).foregroundStyle(Theme.Palette.textSecondary)
                                }
                                Button { onAskAI(review) } label: { Label("Ask AI to explain", systemImage: "sparkles") }
                                    .buttonStyle(.pillTinted)
                            }
                            .inset()
                        }
                    }
                }

                Button("Done", action: onDone).buttonStyle(.primary)
            }
            .frame(maxWidth: 680)
            .pagePadding()
            .padding(.vertical, Theme.Spacing.xl)
            .frame(maxWidth: .infinity)
        }
        .onAppear { result.passed ? Haptics.success() : Haptics.warning() }
    }
}
