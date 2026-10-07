import Foundation
import UIKit
import UserNotifications

/// Local study reminders and APNs registration. Permission is only requested when
/// the student turns reminders on, never at launch.
@MainActor
final class NotificationService: NSObject, UNUserNotificationCenterDelegate {
    private let center = UNUserNotificationCenter.current()
    private let reminderID = "lumen.daily-reminder"

    override init() {
        super.init()
        center.delegate = self
    }

    func authorizationStatus() async -> UNAuthorizationStatus {
        await center.notificationSettings().authorizationStatus
    }

    func requestPermission() async -> Bool {
        let granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
        if granted { UIApplication.shared.registerForRemoteNotifications() }
        return granted
    }

    func scheduleDailyReminder(hour: Int, minute: Int) async {
        center.removePendingNotificationRequests(withIdentifiers: [reminderID])
        let content = UNMutableNotificationContent()
        content.title = "Keep your streak going"
        content.body = "A few focused minutes today keeps your learning on track."
        content.sound = .default
        var components = DateComponents()
        components.hour = hour
        components.minute = minute
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
        try? await center.add(UNNotificationRequest(identifier: reminderID, content: content, trigger: trigger))
    }

    func cancelDailyReminder() {
        center.removePendingNotificationRequests(withIdentifiers: [reminderID])
    }

    func scheduleLiveQuizReminder(_ quiz: LiveQuiz) async {
        let fireDate = quiz.startsAt.addingTimeInterval(-5 * 60)
        guard fireDate > .now else { return }
        let content = UNMutableNotificationContent()
        content.title = "\(quiz.title) starts in 5 minutes"
        content.body = "Join the lobby now to compete live."
        content.sound = .default
        content.userInfo = ["live_quiz_id": quiz.id.uuidString]
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: fireDate.timeIntervalSinceNow, repeats: false)
        try? await center.add(UNNotificationRequest(identifier: "live-\(quiz.id)", content: content, trigger: trigger))
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}

/// Bridges APNs callbacks that SwiftUI doesn't expose.
final class AppDelegate: NSObject, UIApplicationDelegate {
    static var onDeviceToken: ((String) -> Void)?

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Self.onDeviceToken?(token)
    }
}
