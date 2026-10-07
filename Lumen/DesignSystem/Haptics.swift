import UIKit

/// Haptic feedback that is safe to call from any context.
enum Haptics {
    static func selection() { onMain { UISelectionFeedbackGenerator().selectionChanged() } }
    static func tap() { onMain { UIImpactFeedbackGenerator(style: .light).impactOccurred() } }
    static func success() { onMain { UINotificationFeedbackGenerator().notificationOccurred(.success) } }
    static func warning() { onMain { UINotificationFeedbackGenerator().notificationOccurred(.warning) } }
    static func error() { onMain { UINotificationFeedbackGenerator().notificationOccurred(.error) } }

    private static func onMain(_ work: @escaping @MainActor @Sendable () -> Void) {
        if Thread.isMainThread {
            MainActor.assumeIsolated { work() }
        } else {
            Task { @MainActor in work() }
        }
    }
}
