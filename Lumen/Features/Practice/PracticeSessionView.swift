import SwiftUI

struct PracticeSessionView: View {
    @State var model: PracticeSessionViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        LoadableView(state: model.questions, retry: { Task { await model.load() } }) { _ in
            if model.isFinished {
                PracticeSummaryView(model: model) { dismiss() }
            } else if let question = model.current {
                session(question)
            }
        }
        .background(Theme.Palette.background)
        .navigationTitle(model.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if model.current != nil && !model.isFinished {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await model.toggleBookmark() }
                    } label: {
                        Image(systemName: model.bookmarked.contains(model.current!.id) ? "bookmark.fill" : "bookmark")
                    }
                    .accessibilityLabel("Bookmark question")
                }
            }
        }
        .task { await model.load() }
        .alert("Something went wrong", isPresented: Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.errorMessage ?? "")
        }
    }

    private func session(_ question: Question) -> some View {
        VStack(spacing: 0) {
            VStack(spacing: Theme.Spacing.sm) {
                HStack {
                    Text("Question \(model.index + 1) of \(model.total)")
                    Spacer()
                    if model.isOfflineSession { Label("Offline", systemImage: "wifi.slash") }
                    Label("\(model.correctCount)", systemImage: "checkmark.circle").foregroundStyle(Theme.Palette.success)
                }
                .font(Theme.Typography.captionEmphasis)
                .foregroundStyle(Theme.Palette.textSecondary)
                LinearProgress(value: model.progress)
            }
            .pagePadding()
            .padding(.vertical, Theme.Spacing.md)

            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                    QuestionBody(question: question, answer: $model.answer, result: model.result)
                    if let result = model.result {
                        AnswerFeedbackView(result: result, question: question, askAI: model.askAI)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
                .frame(maxWidth: 680)
                .pagePadding()
                .padding(.bottom, Theme.Spacing.xxl)
                .id(question.id)
            }
            .motionAware(Theme.Motion.snappy, value: model.result)

            Group {
                if model.result == nil {
                    Button("Submit answer") { Task { await model.check() } }
                        .buttonStyle(.primary(loading: model.isChecking))
                        .disabled(model.answer.isEmpty)
                } else {
                    Button(model.index + 1 >= model.total ? "See results" : "Next question") { model.next() }
                        .buttonStyle(.primary)
                }
            }
            .frame(maxWidth: 680)
            .pagePadding()
            .padding(.vertical, Theme.Spacing.md)
            .background(.bar)
        }
    }
}

private struct PracticeSummaryView: View {
    let model: PracticeSessionViewModel
    let onDone: () -> Void

    var body: some View {
        let accuracy = model.total == 0 ? 0 : Double(model.correctCount) / Double(model.total)
        ScrollView {
            VStack(spacing: Theme.Spacing.xl) {
                ProgressRing(value: accuracy, lineWidth: 12, tint: accuracy >= 0.7 ? Theme.Palette.success : Theme.Palette.warning)
                    .frame(width: 140, height: 140)
                    .overlay {
                        VStack {
                            Text("\(Int(accuracy * 100))%").font(Theme.Typography.metric)
                            Text("accuracy").font(Theme.Typography.caption).foregroundStyle(Theme.Palette.textSecondary)
                        }
                    }
                    .padding(.top, Theme.Spacing.xl)
                Text(accuracy >= 0.8 ? "Excellent work!" : accuracy >= 0.5 ? "Good progress" : "Keep practising")
                    .font(Theme.Typography.title)
                HStack(spacing: Theme.Spacing.md) {
                    StatTile(value: "\(model.correctCount)", label: "Correct", symbol: "checkmark.circle", tint: Theme.Palette.success)
                    StatTile(value: "\(model.total - model.correctCount)", label: "Incorrect", symbol: "xmark.circle", tint: Theme.Palette.danger)
                    StatTile(value: "+\(model.xpEarned)", label: "XP earned", symbol: "sparkles")
                }
                Button("Done", action: onDone).buttonStyle(.primary)
            }
            .frame(maxWidth: 560)
            .pagePadding()
            .frame(maxWidth: .infinity)
        }
        .onAppear { Haptics.success() }
    }
}
