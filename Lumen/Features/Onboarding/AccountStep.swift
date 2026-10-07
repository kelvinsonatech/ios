import SwiftUI
import AuthenticationServices

struct AccountStep: View {
    @Bindable var model: OnboardingViewModel
    @Environment(\.webAuthenticationSession) private var webAuthenticationSession
    @Environment(\.colorScheme) private var colorScheme
    @FocusState private var focus: Field?

    private enum Field { case name, email, password }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    Text(model.authMode == .signUp ? "Create your account" : "Welcome back")
                        .font(Theme.Typography.largeTitle)
                        .accessibilityAddTraits(.isHeader)
                    Text("Save your progress and pick up on any device.")
                        .font(Theme.Typography.body)
                        .foregroundStyle(Theme.Palette.textSecondary)
                }

                VStack(spacing: Theme.Spacing.md) {
                    SignInWithAppleButton(model.authMode == .signUp ? .signUp : .signIn) { request in
                        model.prepareAppleRequest(request)
                    } onCompletion: { result in
                        Task { await model.handleApple(result) }
                    }
                    .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                    .frame(height: 52)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))

                    if model.googleEnabled {
                        Button {
                            Task { await model.signInWithGoogle(using: webAuthenticationSession) }
                        } label: {
                            Label("Continue with Google", systemImage: "globe")
                        }
                        .buttonStyle(.secondary)
                    }
                }

                HStack {
                    Rectangle().fill(Theme.Palette.separator).frame(height: 1)
                    Text("or use email").font(Theme.Typography.caption).foregroundStyle(Theme.Palette.textTertiary)
                    Rectangle().fill(Theme.Palette.separator).frame(height: 1)
                }
                .accessibilityHidden(true)

                VStack(spacing: Theme.Spacing.md) {
                    if model.authMode == .signUp {
                        field("Your name", text: $model.displayName, field: .name)
                            .textContentType(.name)
                            .submitLabel(.next)
                    }
                    field("Email", text: $model.email, field: .email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.next)
                    SecureField("Password (8+ characters)", text: $model.password)
                        .textContentType(model.authMode == .signUp ? .newPassword : .password)
                        .focused($focus, equals: .password)
                        .submitLabel(.go)
                        .onSubmit { Task { await model.submitEmail() } }
                        .padding(Theme.Spacing.md)
                        .background(Theme.Palette.surfaceMuted, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
                }
                .onSubmit {
                    switch focus {
                    case .name: focus = .email
                    case .email: focus = .password
                    default: break
                    }
                }

                if let error = model.errorMessage {
                    Label(error, systemImage: "exclamationmark.circle")
                        .font(Theme.Typography.callout)
                        .foregroundStyle(Theme.Palette.danger)
                }
                if let info = model.infoMessage {
                    Label(info, systemImage: "envelope")
                        .font(Theme.Typography.callout)
                        .foregroundStyle(Theme.Palette.success)
                }

                Button(model.authMode == .signUp ? "Create account" : "Sign in") {
                    focus = nil
                    Task { await model.submitEmail() }
                }
                .buttonStyle(.primary(loading: model.isWorking))
                .disabled(!model.isEmailFormValid || model.isWorking)

                HStack {
                    Button(model.authMode == .signUp ? "I already have an account" : "Create a new account") {
                        model.errorMessage = nil
                        model.authMode = model.authMode == .signUp ? .signIn : .signUp
                    }
                    Spacer()
                    if model.authMode == .signIn {
                        Button("Forgot password?") { Task { await model.resetPassword() } }
                    }
                }
                .font(Theme.Typography.callout.weight(.medium))

                Text("By continuing you agree to Lumen's Terms of Service and Privacy Policy.")
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Palette.textTertiary)
            }
            .pagePadding()
            .padding(.vertical, Theme.Spacing.lg)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func field(_ title: String, text: Binding<String>, field: Field) -> some View {
        TextField(title, text: text)
            .focused($focus, equals: field)
            .padding(Theme.Spacing.md)
            .background(Theme.Palette.surfaceMuted, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
    }
}
