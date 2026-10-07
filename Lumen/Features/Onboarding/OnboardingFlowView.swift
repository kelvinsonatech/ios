import SwiftUI
import AuthenticationServices

struct OnboardingFlowView: View {
    @State var model: OnboardingViewModel

    var body: some View {
        VStack(spacing: 0) {
            if model.step != .welcome && model.step != .finishing {
                header
            }
            Group {
                switch model.step {
                case .welcome: WelcomeStep(onStart: model.next)
                case .interests: InterestsStep(model: model)
                case .level: LevelStep(model: model)
                case .goal: GoalStep(model: model)
                case .account: AccountStep(model: model)
                case .finishing: FinishingStep(model: model)
                }
            }
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                    removal: .move(edge: .leading).combined(with: .opacity)))
            .id(model.step)

            if [.interests, .level, .goal].contains(model.step) {
                Button("Continue") { Haptics.tap(); model.next() }
                    .buttonStyle(.primary)
                    .disabled(!model.canContinue)
                    .pagePadding()
                    .padding(.bottom, Theme.Spacing.lg)
                    .frame(maxWidth: 560)
            }
        }
        .background(Theme.Palette.background.ignoresSafeArea())
        .motionAware(Theme.Motion.snappy, value: model.step)
        .task { await model.loadCategories() }
    }

    private var header: some View {
        HStack(spacing: Theme.Spacing.md) {
            Button {
                model.back()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.headline)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Back")
            LinearProgress(value: model.progress)
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.top, Theme.Spacing.sm)
    }
}

// MARK: Steps

private struct StepTitle: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text(title).font(Theme.Typography.largeTitle).foregroundStyle(Theme.Palette.textPrimary)
            Text(subtitle).font(Theme.Typography.body).foregroundStyle(Theme.Palette.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

private struct WelcomeStep: View {
    let onStart: () -> Void

    private struct Highlight: Identifiable {
        var id: String { symbol }
        let symbol: String, title: String, detail: String
    }

    private let highlights = [
        Highlight(symbol: "play.rectangle.on.rectangle", title: "Structured lessons", detail: "Short videos, clear notes and worked examples."),
        Highlight(symbol: "sparkles", title: "A tutor that teaches", detail: "Ask anything — get explanations, not just answers."),
        Highlight(symbol: "chart.line.uptrend.xyaxis", title: "Progress you can see", detail: "Practice, exams, streaks and achievements.")
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            Spacer()
            LumenMark(size: 64)
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                Text("Learn anything,\nunderstand everything.")
                    .font(Theme.Typography.largeTitle)
                    .foregroundStyle(Theme.Palette.textPrimary)
                Text("Lumen brings courses, practice and a personal AI tutor together — built around how you learn.")
                    .font(Theme.Typography.body)
                    .foregroundStyle(Theme.Palette.textSecondary)
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                ForEach(highlights) { item in
                    HStack(alignment: .top, spacing: Theme.Spacing.md) {
                        Image(systemName: item.symbol)
                            .font(.title3)
                            .foregroundStyle(Theme.Palette.brand)
                            .frame(width: 32)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title).font(Theme.Typography.bodyEmphasis)
                            Text(item.detail).font(Theme.Typography.callout).foregroundStyle(Theme.Palette.textSecondary)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            Spacer()
            Button("Get started", action: onStart).buttonStyle(.primary)
        }
        .pagePadding()
        .padding(.bottom, Theme.Spacing.lg)
    }
}

private struct InterestsStep: View {
    @Bindable var model: OnboardingViewModel
    private let columns = [GridItem(.adaptive(minimum: 150), spacing: Theme.Spacing.md)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                StepTitle(title: "What do you want to learn?",
                          subtitle: "Pick as many as you like. We'll tailor your recommendations.")
                switch model.categories {
                case .idle, .loading:
                    LazyVGrid(columns: columns, spacing: Theme.Spacing.md) {
                        ForEach(0..<8, id: \.self) { _ in SkeletonBlock(height: 92) }
                    }
                case .failed(let error):
                    ErrorStateView(error: error) { Task { await model.loadCategories() } }
                case .loaded(let categories):
                    LazyVGrid(columns: columns, spacing: Theme.Spacing.md) {
                        ForEach(categories) { category in
                            InterestTile(category: category, isSelected: model.draft.interests.contains(category.id)) {
                                model.toggleInterest(category.id)
                            }
                        }
                    }
                }
            }
            .pagePadding()
            .padding(.vertical, Theme.Spacing.lg)
        }
    }
}

private struct InterestTile: View {
    let category: Category
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        let tint = Theme.subjectTint(category.id)
        Button {
            Haptics.selection()
            action()
        } label: {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                HStack {
                    Image(systemName: category.symbol)
                        .font(.title2)
                        .foregroundStyle(isSelected ? .white : tint)
                    Spacer()
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(isSelected ? .white : Theme.Palette.textTertiary)
                }
                Text(category.name)
                    .font(Theme.Typography.bodyEmphasis)
                    .foregroundStyle(isSelected ? .white : Theme.Palette.textPrimary)
                    .multilineTextAlignment(.leading)
            }
            .padding(Theme.Spacing.lg)
            .frame(maxWidth: .infinity, minHeight: 92, alignment: .leading)
            .background(isSelected ? tint : Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                .strokeBorder(isSelected ? .clear : Theme.Palette.separator))
        }
        .buttonStyle(.card)
        .accessibilityLabel(category.name)
        .accessibilityAddTraits(isSelected ? [.isSelected, .isButton] : [.isButton])
    }
}

private struct LevelStep: View {
    @Bindable var model: OnboardingViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                StepTitle(title: "Where are you starting from?", subtitle: "This helps us pitch lessons and questions at the right level.")
                VStack(spacing: Theme.Spacing.md) {
                    ForEach(LearningLevel.allCases) { level in
                        SelectableRow(title: level.title, subtitle: level.detail, symbol: level.symbol,
                                      isSelected: model.draft.level == level) { model.draft.level = level }
                    }
                }
            }
            .pagePadding()
            .padding(.vertical, Theme.Spacing.lg)
        }
    }
}

private struct GoalStep: View {
    @Bindable var model: OnboardingViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                StepTitle(title: "What's your main goal?", subtitle: "You can change this any time in your profile.")
                if let error = model.errorMessage {
                    Text(error).font(Theme.Typography.callout).foregroundStyle(Theme.Palette.danger)
                }
                VStack(spacing: Theme.Spacing.md) {
                    ForEach(LearningGoal.allCases) { goal in
                        SelectableRow(title: goal.title, symbol: goal.symbol,
                                      isSelected: model.draft.goal == goal) { model.draft.goal = goal }
                    }
                }
            }
            .pagePadding()
            .padding(.vertical, Theme.Spacing.lg)
        }
    }
}

private struct FinishingStep: View {
    let model: OnboardingViewModel

    var body: some View {
        VStack(spacing: Theme.Spacing.lg) {
            ProgressView().controlSize(.large)
            Text("Personalising your learning…")
                .font(Theme.Typography.headline)
                .foregroundStyle(Theme.Palette.textSecondary)
        }
        .task { if !model.isWorking { await model.finish() } }
    }
}
