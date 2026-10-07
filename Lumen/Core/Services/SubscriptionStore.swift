import Foundation
import StoreKit
import Observation
import OSLog

/// StoreKit 2 subscriptions. Entitlement is verified on device for instant UX and
/// re-verified server-side (`verify-subscription`) which is what RLS trusts.
@Observable
@MainActor
final class SubscriptionStore {
    enum PurchaseState: Equatable { case idle, purchasing, pending, failed(String) }

    private(set) var products: [Product] = []
    private(set) var hasActiveSubscription = false
    private(set) var activeProductID: String?
    private(set) var purchaseState: PurchaseState = .idle
    private(set) var isLoadingProducts = false

    @ObservationIgnored private let client: SupabaseClient
    @ObservationIgnored private let productIDs: [String]
    @ObservationIgnored private var updatesTask: Task<Void, Never>?
    @ObservationIgnored private let logger = Logger(subsystem: "com.lumenlearning.app", category: "store")

    /// Called after the server confirms an entitlement change so the profile can be refreshed.
    @ObservationIgnored var onEntitlementChange: (() async -> Void)?

    init(client: SupabaseClient, productIDs: [String]) {
        self.client = client
        self.productIDs = productIDs
        updatesTask = Task { [weak self] in
            for await update in Transaction.updates {
                await self?.handle(update)
            }
        }
    }

    deinit { updatesTask?.cancel() }

    func loadProducts() async {
        guard products.isEmpty, !productIDs.isEmpty else { return }
        isLoadingProducts = true
        defer { isLoadingProducts = false }
        do {
            products = try await Product.products(for: productIDs).sorted { $0.price < $1.price }
        } catch {
            logger.error("Failed to load products: \(error.localizedDescription)")
        }
    }

    func purchase(_ product: Product, userId: UUID?) async {
        purchaseState = .purchasing
        do {
            var options: Set<Product.PurchaseOption> = []
            // Ties the transaction to the Supabase user so server notifications can be attributed.
            if let userId { options.insert(.appAccountToken(userId)) }
            let result = try await product.purchase(options: options)
            switch result {
            case .success(let verification):
                await handle(verification)
                purchaseState = .idle
            case .pending:
                purchaseState = .pending
            case .userCancelled:
                purchaseState = .idle
            @unknown default:
                purchaseState = .idle
            }
        } catch {
            purchaseState = .failed(error.localizedDescription)
        }
    }

    func restore() async {
        do { try await AppStore.sync() } catch { logger.error("Restore failed: \(error.localizedDescription)") }
        await refreshEntitlements()
    }

    func refreshEntitlements() async {
        var active: String?
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result, transaction.productType == .autoRenewable,
                  transaction.revocationDate == nil else { continue }
            active = transaction.productID
            await sendToServer(result)
        }
        activeProductID = active
        hasActiveSubscription = active != nil
    }

    private func handle(_ result: VerificationResult<Transaction>) async {
        guard case .verified(let transaction) = result else {
            logger.warning("Ignoring unverified transaction")
            return
        }
        await sendToServer(result)
        await transaction.finish()
        await refreshEntitlements()
        await onEntitlementChange?()
    }

    private func sendToServer(_ result: VerificationResult<Transaction>) async {
        struct Body: Encodable { let signedTransaction: String }
        do {
            let _: EmptyPayload = try await client.invoke(function: "verify-subscription",
                                                          body: Body(signedTransaction: result.jwsRepresentation))
        } catch {
            logger.error("Server verification failed: \(error.localizedDescription)")
        }
    }
}

extension Product {
    var periodLabel: String {
        guard let period = subscription?.subscriptionPeriod else { return "" }
        switch period.unit {
        case .day: return period.value == 7 ? "week" : "\(period.value) days"
        case .week: return period.value == 1 ? "week" : "\(period.value) weeks"
        case .month: return period.value == 1 ? "month" : "\(period.value) months"
        case .year: return period.value == 1 ? "year" : "\(period.value) years"
        @unknown default: return ""
        }
    }
}
