import SwiftUI
import StoreKit

struct PaywallView: View {
    @Environment(SubscriptionStore.self) private var store
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var selectedID: String?

    private struct Benefit: Identifiable {
        var id: String { title }
        let symbol: String, title: String, detail: String
    }

    private let benefits = [
        Benefit(symbol: "books.vertical.fill", title: "Every course and lesson", detail: "Unlock all premium courses, notes and e-books."),
        Benefit(symbol: "sparkles", title: "Unlimited AI tutoring", detail: "Explain, simplify, quiz and examiner modes with no daily cap."),
        Benefit(symbol: "timer", title: "Full exam library", detail: "Timed mock exams with detailed topic breakdowns."),
        Benefit(symbol: "arrow.down.circle.fill", title: "Offline learning", detail: "Download lessons and quiz sets to study anywhere.")
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                    VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                        Image(systemName: "crown.fill").font(.largeTitle).foregroundStyle(Theme.Palette.gold)
                        Text("Lumen Premium").font(Theme.Typography.largeTitle)
                        Text("Everything you need to learn faster and go further.")
                            .foregroundStyle(Theme.Palette.textSecondary)
                    }
                    VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                        ForEach(benefits) { benefit in
                            HStack(alignment: .top, spacing: Theme.Spacing.md) {
                                Image(systemName: benefit.symbol).foregroundStyle(Theme.Palette.brand).frame(width: 28)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(benefit.title).font(Theme.Typography.bodyEmphasis)
                                    Text(benefit.detail).font(Theme.Typography.callout).foregroundStyle(Theme.Palette.textSecondary)
                                }
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                    plans
                    if case .failed(let message) = store.purchaseState {
                        Text(message).font(Theme.Typography.callout).foregroundStyle(Theme.Palette.danger)
                    }
                    if store.purchaseState == .pending {
                        Text("Your purchase is pending approval.").font(Theme.Typography.callout).foregroundStyle(Theme.Palette.textSecondary)
                    }
                    Button(store.hasActiveSubscription ? "You're subscribed" : "Continue") {
                        guard let product = selectedProduct else { return }
                        Task {
                            await store.purchase(product, userId: session.userId)
                            if store.hasActiveSubscription { dismiss() }
                        }
                    }
                    .buttonStyle(.primary(loading: store.purchaseState == .purchasing))
                    .disabled(selectedProduct == nil || store.hasActiveSubscription)

                    HStack {
                        Button("Restore purchases") { Task { await store.restore() } }
                        Spacer()
                        Link("Terms", destination: URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!)
                    }
                    .font(Theme.Typography.caption)

                    Text("Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel any time in your App Store account settings.")
                        .font(.caption2)
                        .foregroundStyle(Theme.Palette.textTertiary)
                }
                .frame(maxWidth: 560)
                .pagePadding()
                .padding(.vertical, Theme.Spacing.xl)
                .frame(maxWidth: .infinity)
            }
            .background(Theme.Palette.background)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }.accessibilityLabel("Close")
                }
            }
            .task {
                await store.loadProducts()
                if selectedID == nil { selectedID = store.products.last?.id }
            }
        }
    }

    private var selectedProduct: Product? { store.products.first { $0.id == selectedID } }

    @ViewBuilder private var plans: some View {
        if store.isLoadingProducts {
            ProgressView().frame(maxWidth: .infinity)
        } else if store.products.isEmpty {
            Text("Subscriptions are unavailable right now. Please try again later.")
                .font(Theme.Typography.callout)
                .foregroundStyle(Theme.Palette.textSecondary)
        } else {
            VStack(spacing: Theme.Spacing.md) {
                ForEach(store.products, id: \.id) { product in
                    let selected = product.id == selectedID
                    Button {
                        Haptics.selection()
                        selectedID = product.id
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(product.displayName).font(Theme.Typography.headline).foregroundStyle(Theme.Palette.textPrimary)
                                Text("\(product.displayPrice) per \(product.periodLabel)")
                                    .font(Theme.Typography.callout).foregroundStyle(Theme.Palette.textSecondary)
                                if let offer = product.subscription?.introductoryOffer, offer.paymentMode == .freeTrial {
                                    Text("Includes a free trial").font(Theme.Typography.captionEmphasis).foregroundStyle(Theme.Palette.success)
                                }
                            }
                            Spacer()
                            Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                                .font(.title3)
                                .foregroundStyle(selected ? Theme.Palette.brand : Theme.Palette.textTertiary)
                        }
                        .padding(Theme.Spacing.lg)
                        .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                            .strokeBorder(selected ? Theme.Palette.brand : Theme.Palette.separator, lineWidth: selected ? 2 : 1))
                    }
                    .buttonStyle(.card)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
        }
    }
}
