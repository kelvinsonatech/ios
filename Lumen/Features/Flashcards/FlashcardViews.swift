import SwiftUI

struct DeckListView: View {
    @State var model: DeckListViewModel
    @State private var showCreate = false

    var body: some View {
        LoadableView(state: model.decks, retry: { Task { await model.load() } }) { decks in
            if decks.isEmpty {
                EmptyStateView(symbol: "rectangle.on.rectangle.angled", title: "No flashcards yet",
                               message: "Create a deck, or let your AI tutor generate one from any topic.",
                               actionTitle: "Create a deck") { showCreate = true }
            } else {
                List {
                    ForEach(decks) { deck in
                        NavigationLink(value: Route.deck(deck)) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(deck.title).font(Theme.Typography.bodyEmphasis)
                                    Text("\(deck.cardCount) cards\(deck.isOfficial ? " · Lumen" : "")")
                                        .font(.caption).foregroundStyle(Theme.Palette.textSecondary)
                                }
                                Spacer()
                                if deck.dueCount > 0 {
                                    Text("\(deck.dueCount) due")
                                        .font(Theme.Typography.captionEmphasis)
                                        .foregroundStyle(Theme.Palette.ember)
                                }
                            }
                        }
                        .swipeActions {
                            if !deck.isOfficial {
                                Button(role: .destructive) { Task { await model.delete(deck) } } label: { Label("Delete", systemImage: "trash") }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Flashcards")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showCreate = true } label: { Image(systemName: "plus") }.accessibilityLabel("New deck")
            }
        }
        .sheet(isPresented: $showCreate) { CreateDeckSheet(model: model) }
        .task { await model.load() }
        .refreshable { await model.load() }
    }
}

private struct CreateDeckSheet: View {
    @Bindable var model: DeckListViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Deck title", text: $model.newTitle)
                }
                Section {
                    HStack {
                        TextField("Topic, e.g. \"Photosynthesis\"", text: $model.generateTopic)
                        Button {
                            Task { await model.generate() }
                        } label: {
                            if model.isGenerating { ProgressView() } else { Label("Generate", systemImage: "sparkles") }
                        }
                        .disabled(model.generateTopic.isEmpty || model.isGenerating)
                    }
                } header: { Text("Generate with AI") } footer: {
                    Text("Your tutor drafts cards you can review and edit before saving.")
                }
                Section("Cards") {
                    ForEach(model.newCards.indices, id: \.self) { index in
                        VStack(alignment: .leading) {
                            TextField("Front", text: $model.newCards[index].front, axis: .vertical).font(.body.weight(.semibold))
                            TextField("Back", text: $model.newCards[index].back, axis: .vertical).foregroundStyle(Theme.Palette.textSecondary)
                        }
                    }
                    .onDelete { model.newCards.remove(atOffsets: $0) }
                    Button { model.newCards.append(NewFlashcard(front: "", back: "")) } label: { Label("Add card", systemImage: "plus") }
                }
                if let error = model.errorMessage {
                    Section { Text(error).foregroundStyle(Theme.Palette.danger) }
                }
            }
            .navigationTitle("New deck")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { if await model.save() { dismiss() } } }
                        .disabled(!model.canSave || model.isSaving)
                }
            }
        }
    }
}

struct FlashcardStudyView: View {
    @State var model: FlashcardStudyViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        LoadableView(state: model.queue, retry: { Task { await model.load() } }) { cards in
            if cards.isEmpty {
                EmptyStateView(symbol: "rectangle.on.rectangle.angled", title: "Empty deck", message: "This deck has no cards yet.")
            } else if model.isComplete {
                VStack(spacing: Theme.Spacing.lg) {
                    Image(systemName: "checkmark.seal.fill").font(.system(size: 56)).foregroundStyle(Theme.Palette.success)
                    Text("Session complete").font(Theme.Typography.title)
                    Text("You reviewed \(model.reviewedCount) cards. \(model.againCount) to revisit soon.")
                        .foregroundStyle(Theme.Palette.textSecondary)
                    Button("Done") { dismiss() }.buttonStyle(.primary).frame(maxWidth: 320)
                }
                .pagePadding()
                .onAppear { Haptics.success() }
            } else if let card = model.current {
                VStack(spacing: Theme.Spacing.xl) {
                    Text("\(model.remaining) remaining").font(Theme.Typography.captionEmphasis).foregroundStyle(Theme.Palette.textSecondary)
                    cardView(card)
                        .onTapGesture { flip() }
                        .accessibilityAddTraits(.isButton)
                        .accessibilityHint(model.isFlipped ? "" : "Double-tap to reveal the answer")
                    if model.isFlipped {
                        HStack(spacing: Theme.Spacing.sm) {
                            ForEach(RecallGrade.allCases) { grade in
                                Button {
                                    Task { await model.grade(grade) }
                                } label: {
                                    VStack(spacing: 2) {
                                        Text(grade.title).font(Theme.Typography.captionEmphasis)
                                        Text(model.intervalLabel(for: grade)).font(.caption2).opacity(0.8)
                                    }
                                    .frame(maxWidth: .infinity, minHeight: 52)
                                    .foregroundStyle(.white)
                                    .background(tint(grade), in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
                                }
                                .buttonStyle(.card)
                            }
                        }
                    } else {
                        Button("Show answer") { flip() }.buttonStyle(.primary)
                    }
                }
                .frame(maxWidth: 560)
                .pagePadding()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.Palette.background)
        .navigationTitle(model.deck.title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
    }

    private func cardView(_ card: Flashcard) -> some View {
        ZStack {
            face(text: card.front, label: "Question").opacity(model.isFlipped ? 0 : 1)
            face(text: card.back, label: "Answer")
                .opacity(model.isFlipped ? 1 : 0)
                .rotation3DEffect(.degrees(180), axis: (0, 1, 0))
        }
        .rotation3DEffect(.degrees(model.isFlipped && !reduceMotion ? 180 : 0), axis: (0, 1, 0))
        .frame(height: 320)
    }

    private func face(text: String, label: String) -> some View {
        VStack(spacing: Theme.Spacing.md) {
            Text(label.uppercased()).font(Theme.Typography.captionEmphasis).foregroundStyle(Theme.Palette.textTertiary)
            ScrollView {
                Text(LocalizedStringKey(text))
                    .font(.system(.title3, design: .rounded, weight: .medium))
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(Theme.Spacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .card(radius: Theme.Radius.xl)
        .accessibilityElement(children: .combine)
    }

    private func flip() {
        Haptics.tap()
        withAnimation(reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.8)) { model.isFlipped.toggle() }
    }

    private func tint(_ grade: RecallGrade) -> Color {
        switch grade {
        case .again: Theme.Palette.danger
        case .hard: Theme.Palette.warning
        case .good: Theme.Palette.success
        case .easy: Theme.Palette.brand
        }
    }
}
