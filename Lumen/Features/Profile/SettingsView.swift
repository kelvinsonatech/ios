import SwiftUI

struct SettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(SessionStore.self) private var session
    @Environment(SubscriptionStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var displayName = ""
    @State private var interests: Set<String> = []
    @State private var level: LearningLevel?
    @State private var goal: LearningGoal?
    @State private var dailyGoal = 15
    @State private var categories: [Category] = []
    @State private var remindersOn = false
    @State private var reminderTime = Calendar.current.date(from: DateComponents(hour: 19, minute: 0)) ?? .now
    @State private var isSaving = false
    @State private var confirmSignOut = false
    @State private var confirmDelete = false
    @State private var message: String?

    var body: some View {
        Form {
            Section("Profile") {
                TextField("Display name", text: $displayName)
                    .textContentType(.name)
                Picker("Level", selection: $level) {
                    Text("Not set").tag(LearningLevel?.none)
                    ForEach(LearningLevel.allCases) { Text($0.title).tag(LearningLevel?.some($0)) }
                }
                Picker("Goal", selection: $goal) {
                    Text("Not set").tag(LearningGoal?.none)
                    ForEach(LearningGoal.allCases) { Text($0.title).tag(LearningGoal?.some($0)) }
                }
                Stepper("Daily goal: \(dailyGoal) min", value: $dailyGoal, in: 5...180, step: 5)
            }

            Section {
                ForEach(categories) { category in
                    Button {
                        if interests.contains(category.id) { interests.remove(category.id) } else { interests.insert(category.id) }
                    } label: {
                        HStack {
                            Label(category.name, systemImage: category.symbol).foregroundStyle(Theme.Palette.textPrimary)
                            Spacer()
                            if interests.contains(category.id) { Image(systemName: "checkmark").foregroundStyle(Theme.Palette.brand) }
                        }
                    }
                    .accessibilityAddTraits(interests.contains(category.id) ? .isSelected : [])
                }
            } header: { Text("Interests") } footer: { Text("Used to personalise your recommendations.") }

            Section {
                Button(isSaving ? "Saving…" : "Save changes") { Task { await save() } }
                    .disabled(isSaving || displayName.trimmingCharacters(in: .whitespaces).isEmpty)
            }

            Section("Reminders") {
                Toggle("Daily study reminder", isOn: $remindersOn)
                if remindersOn {
                    DatePicker("Time", selection: $reminderTime, displayedComponents: .hourAndMinute)
                }
            }

            Section("Subscription") {
                if session.isPremium {
                    Label("Lumen Premium is active", systemImage: "crown.fill").foregroundStyle(Theme.Palette.gold)
                    Link("Manage subscription", destination: URL(string: "https://apps.apple.com/account/subscriptions")!)
                } else {
                    Button { router.showPaywall() } label: { Label("Upgrade to Premium", systemImage: "crown") }
                }
                Button("Restore purchases") { Task { await store.restore(); message = "Purchases restored." } }
            }

            Section("Offline") {
                NavigationLink(value: Route.downloads) { Label("Downloads", systemImage: "arrow.down.circle") }
            }

            Section("Account") {
                Button("Sign out") { confirmSignOut = true }
                Button("Delete account", role: .destructive) { confirmDelete = true }
            }

            Section {
                Text("Lumen \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "")")
                    .font(.caption)
                    .foregroundStyle(Theme.Palette.textTertiary)
            }
        }
        .navigationTitle("Settings")
        .task { await populate() }
        .onChange(of: remindersOn) { _, on in Task { await updateReminder(on: on) } }
        .onChange(of: reminderTime) { _, _ in Task { await updateReminder(on: remindersOn) } }
        .confirmationDialog("Sign out of Lumen?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await session.signOut() } }
        }
        .confirmationDialog("Delete your account?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete account permanently", role: .destructive) { Task { await deleteAccount() } }
        } message: {
            Text("This permanently deletes your profile, progress, notes and tutor history. Active App Store subscriptions must be cancelled separately.")
        }
        .alert("Lumen", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(message ?? "") }
    }

    private func populate() async {
        if let profile = session.profile {
            displayName = profile.displayName
            interests = Set(profile.interests)
            level = profile.level
            goal = profile.goal
            dailyGoal = profile.dailyGoalMinutes
            remindersOn = profile.notificationsEnabled
        }
        let stored = UserDefaults.standard.double(forKey: "reminder.time")
        if stored > 0 { reminderTime = Date(timeIntervalSinceReferenceDate: stored) }
        categories = (try? await env.courses.categories()) ?? []
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            try await session.updateProfile(ProfileUpdate(displayName: displayName, interests: Array(interests),
                                                          level: level, goal: goal, dailyGoalMinutes: dailyGoal))
            Haptics.success()
            message = "Your profile has been updated."
        } catch {
            message = APIError.from(error).localizedDescription
        }
    }

    private func updateReminder(on: Bool) async {
        if on {
            guard await env.notifications.requestPermission() else {
                remindersOn = false
                message = "Notifications are turned off for Lumen. You can enable them in the Settings app."
                return
            }
            let parts = Calendar.current.dateComponents([.hour, .minute], from: reminderTime)
            UserDefaults.standard.set(reminderTime.timeIntervalSinceReferenceDate, forKey: "reminder.time")
            await env.notifications.scheduleDailyReminder(hour: parts.hour ?? 19, minute: parts.minute ?? 0)
        } else {
            env.notifications.cancelDailyReminder()
        }
        try? await session.updateProfile(ProfileUpdate(notificationsEnabled: on))
    }

    private func deleteAccount() async {
        do {
            try await env.profiles.deleteAccount()
            env.downloads.deleteAll()
            await session.signOut()
        } catch {
            message = APIError.from(error).localizedDescription
        }
    }
}
