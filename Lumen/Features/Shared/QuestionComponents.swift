import SwiftUI

/// Renders a question prompt and the appropriate answer input for its kind.
/// When `result` is set the inputs lock and choices are coloured by correctness.
struct QuestionBody: View {
    let question: Question
    @Binding var answer: AnswerSubmission
    var result: AnswerResult?
    /// Exam mode: lock correctness colouring even after selection.
    var revealsCorrectness = true

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
            HStack(spacing: Theme.Spacing.xs) {
                Tag(text: question.kind.title, tint: Theme.Palette.textSecondary)
                Tag(text: question.difficultyLabel, tint: difficultyTint)
                if let topic = question.topicName { Tag(text: topic, tint: Theme.Palette.brand) }
            }
            Text(LocalizedStringKey(question.prompt))
                .font(Theme.Typography.headline)
                .foregroundStyle(Theme.Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)

            if question.kind.usesChoices {
                VStack(spacing: Theme.Spacing.sm) {
                    ForEach(Array(question.choices.enumerated()), id: \.element.id) { index, choice in
                        ChoiceRow(letter: question.kind == .trueFalse ? nil : Character(UnicodeScalar(65 + index)!),
                                  text: choice.text,
                                  state: state(for: choice)) {
                            select(choice)
                        }
                        .disabled(result != nil)
                    }
                }
                if question.allowsMultiple && result == nil {
                    Text("Select all that apply").font(Theme.Typography.caption).foregroundStyle(Theme.Palette.textSecondary)
                }
            } else {
                TextField(question.kind == .fillBlank ? "Fill in the blank" : "Type your answer",
                          text: $answer.text, axis: .vertical)
                    .lineLimit(1...4)
                    .textInputAutocapitalization(.never)
                    .padding(Theme.Spacing.md)
                    .background(Theme.Palette.surfaceMuted, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                            .strokeBorder(textBorder, lineWidth: result == nil ? 0 : 2)
                    )
                    .disabled(result != nil)
            }
        }
    }

    private var difficultyTint: Color {
        switch question.difficulty {
        case ...1: Theme.Palette.success
        case 2: Theme.Palette.warning
        default: Theme.Palette.danger
        }
    }

    private var textBorder: Color {
        guard let result, revealsCorrectness else { return .clear }
        return result.isCorrect ? Theme.Palette.success : Theme.Palette.danger
    }

    private func select(_ choice: QuestionChoice) {
        Haptics.selection()
        if question.allowsMultiple {
            if let i = answer.choiceIds.firstIndex(of: choice.id) { answer.choiceIds.remove(at: i) }
            else { answer.choiceIds.append(choice.id) }
        } else {
            answer.choiceIds = [choice.id]
        }
    }

    private func state(for choice: QuestionChoice) -> ChoiceRow.State {
        let selected = answer.choiceIds.contains(choice.id)
        guard let result, revealsCorrectness else { return selected ? .selected : .normal }
        if result.correctChoiceIds.contains(choice.id) { return .correct }
        if selected { return .incorrect }
        return .dimmed
    }
}

struct ChoiceRow: View {
    enum State { case normal, selected, correct, incorrect, dimmed }

    let letter: Character?
    let text: String
    let state: State
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Theme.Spacing.md) {
                if let letter {
                    Text(String(letter))
                        .font(Theme.Typography.captionEmphasis)
                        .frame(width: 28, height: 28)
                        .foregroundStyle(badgeForeground)
                        .background(badgeBackground, in: Circle())
                }
                Text(LocalizedStringKey(text))
                    .font(Theme.Typography.body)
                    .foregroundStyle(Theme.Palette.textPrimary)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let symbol {
                    Image(systemName: symbol).foregroundStyle(border)
                }
            }
            .padding(Theme.Spacing.md)
            .background(background, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous).strokeBorder(border, lineWidth: state == .normal || state == .dimmed ? 1 : 2))
            .opacity(state == .dimmed ? 0.6 : 1)
        }
        .buttonStyle(.card)
        .accessibilityLabel(text)
        .accessibilityValue(accessibilityState)
        .accessibilityAddTraits(state == .selected ? .isSelected : [])
    }

    private var border: Color {
        switch state {
        case .normal, .dimmed: Theme.Palette.separator
        case .selected: Theme.Palette.brand
        case .correct: Theme.Palette.success
        case .incorrect: Theme.Palette.danger
        }
    }

    private var background: Color {
        switch state {
        case .normal, .dimmed: Theme.Palette.surface
        case .selected: Theme.Palette.brandSoft
        case .correct: Theme.Palette.successSoft
        case .incorrect: Theme.Palette.dangerSoft
        }
    }

    private var badgeBackground: Color { state == .normal || state == .dimmed ? Theme.Palette.surfaceMuted : border }
    private var badgeForeground: Color { state == .normal || state == .dimmed ? Theme.Palette.textSecondary : .white }

    private var symbol: String? {
        switch state {
        case .correct: "checkmark.circle.fill"
        case .incorrect: "xmark.circle.fill"
        default: nil
        }
    }

    private var accessibilityState: String {
        switch state {
        case .normal, .dimmed: ""
        case .selected: "Selected"
        case .correct: "Correct answer"
        case .incorrect: "Your answer, incorrect"
        }
    }
}

/// Correct / incorrect verdict with explanation and an "Ask AI" hand-off.
struct AnswerFeedbackView: View {
    let result: AnswerResult
    let question: Question
    var askAI: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            HStack {
                Label(result.isCorrect ? "Correct" : "Not quite",
                      systemImage: result.isCorrect ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .font(Theme.Typography.headline)
                    .foregroundStyle(result.isCorrect ? Theme.Palette.success : Theme.Palette.danger)
                Spacer()
                if result.xpAwarded > 0 {
                    Text("+\(result.xpAwarded) XP").font(Theme.Typography.captionEmphasis).foregroundStyle(Theme.Palette.brand)
                }
            }
            if !result.isCorrect {
                if question.kind.usesChoices {
                    let correct = question.choices.filter { result.correctChoiceIds.contains($0.id) }.map(\.text)
                    if !correct.isEmpty {
                        Text("Correct answer: **\(correct.joined(separator: ", "))**").font(Theme.Typography.callout)
                    }
                } else if let accepted = result.acceptedAnswer {
                    Text("Correct answer: **\(accepted)**").font(Theme.Typography.callout)
                }
            }
            if let explanation = result.explanation, !explanation.isEmpty {
                Text(LocalizedStringKey(explanation))
                    .font(Theme.Typography.callout)
                    .foregroundStyle(Theme.Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let askAI {
                Button(action: askAI) {
                    Label("Ask AI to explain", systemImage: "sparkles")
                }
                .buttonStyle(.pillTinted)
            }
        }
        .padding(Theme.Spacing.md)
        .background((result.isCorrect ? Theme.Palette.successSoft : Theme.Palette.dangerSoft),
                    in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
        .accessibilityElement(children: .contain)
        .onAppear {
            UIAccessibility.post(notification: .announcement, argument: result.isCorrect ? "Correct" : "Incorrect")
        }
    }
}
