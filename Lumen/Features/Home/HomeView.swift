import SwiftUI

struct HomeView: View {
    @State var model: HomeViewModel
    @State private var path = NavigationPath()
    @Environment(AppRouter.self) private var router
    @Environment(SessionStore.self) private var session

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.xxl) {
                    header
                    continueSection
                    yourLearningSection
                    dailyChallengeSection
                    statisticsSection
                    recommendedSection
                    liveQuizSection
                }
                .padding(.vertical, Theme.Spacing.lg)
            }
            .background(Theme.Palette.background)
            .refreshable { await model.load() }
            .toolbar(.hidden, for: .navigationBar)
            .withAppRoutes()
            .task { await model.load() }
        }
        .overlay(alignment: .bottom) {
            if let xp = model.rewardXP {
                RewardToast(xp: xp, message: "Daily challenge complete")
                    .padding(.bottom, Theme.Spacing.xl)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .task {
                        try? await Task.sleep(for: .seconds(2.5))
                        model.rewardXP = nil
                    }
            }
        }
        .motionAware(Theme.Motion.snappy, value: model.rewardXP)
    }

    // MARK: Header

    private var header: some View {
        HStack(spacing: Theme.Spacing.md) {
            Button { router.selectedTab = .profile } label: {
                Avatar(name: session.profile?.displayName ?? "", url: session.profile?.avatarUrl, size: 44)
            }
            .accessibilityLabel("Your profile")

            VStack(alignment: .leading, spacing: 2) {
                Text(model.greeting)
                    .font(Theme.Typography.title)
                    .foregroundStyle(Theme.Palette.textPrimary)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                Text("Ready to learn something new?")
                    .font(Theme.Typography.callout)
                    .foregroundStyle(Theme.Palette.textSecondary)
            }
            Spacer(minLength: Theme.Spacing.sm)

            StreakBadge(days: session.profile?.currentStreak ?? 0)

            NavigationLink(value: Route.notifications) {
                Image(systemName: "bell")
                    .font(.title3)
                    .foregroundStyle(Theme.Palette.textPrimary)
                    .frame(width: 44, height: 44)
                    .overlay(alignment: .topTrailing) {
                        if model.unreadNotifications > 0 {
                            Circle().fill(Theme.Palette.ember).frame(width: 9, height: 9).offset(x: -10, y: 10)
                        }
                    }
            }
            .accessibilityLabel(model.unreadNotifications > 0 ? "Notifications, \(model.unreadNotifications) unread" : "Notifications")
        }
        .pagePadding()
    }

    // MARK: Continue learning

    @ViewBuilder private var continueSection: some View {
        switch model.enrolled {
        case .idle, .loading:
            SkeletonBlock(height: 180).pagePadding()
        case .failed:
            EmptyView()
        case .loaded(let courses):
            if let current = model.continueLearning {
                ContinueLearningCard(item: current) {
                    if let lesson = current.currentLesson {
                        path.append(Route.lesson(lessonId: lesson.id, courseId: current.course.id))
                    } else {
                        path.append(Route.course(current.course.id))
                    }
                }
                .pagePadding()
            } else if courses.isEmpty {
                StartLearningCard { router.selectedTab = .courses }.pagePadding()
            }
        }
    }

    @ViewBuilder private var yourLearningSection: some View {
        if let courses = model.enrolled.value, !courses.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                SectionHeader(title: "Your Learning") {
                    Button("See all") { router.selectedTab = .courses }.font(Theme.Typography.callout)
                }
                .pagePadding()
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(alignment: .top, spacing: Theme.Spacing.lg) {
                        ForEach(courses) { item in
                            NavigationLink(value: Route.course(item.course.id)) {
                                CourseTile(course: item.course, progress: item.enrollment.progress, width: 200)
                            }
                            .buttonStyle(.card)
                        }
                    }
                    .pagePadding()
                }
            }
        }
    }

    @ViewBuilder private var dailyChallengeSection: some View {
        if case .loaded(let maybe) = model.challenge, let challenge = maybe {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                SectionHeader("Daily Challenge", subtitle: "Answer correctly to earn \(challenge.xpReward) XP")
                DailyChallengeCard(challenge: challenge, model: model) {
                    router.askTutor(TutorContext(questionId: challenge.question.id, submittedAnswer: model.challengeAnswer,
                                                 seedPrompt: "Explain today's daily challenge question to me.", mode: .explain))
                }
            }
            .pagePadding()
        }
    }

    @ViewBuilder private var statisticsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            SectionHeader("Today")
            switch model.stats {
            case .loaded(let stats):
                StatsGrid(stats: stats)
            case .failed:
                StatsGrid(stats: .empty)
            default:
                SkeletonBlock(height: 110)
            }
        }
        .pagePadding()
    }

    @ViewBuilder private var recommendedSection: some View {
        if let courses = model.recommended.value, !courses.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                SectionHeader("Recommended for you", subtitle: "Based on your interests and progress").pagePadding()
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(alignment: .top, spacing: Theme.Spacing.lg) {
                        ForEach(courses) { course in
                            NavigationLink(value: Route.course(course.id)) {
                                CourseTile(course: course)
                            }
                            .buttonStyle(.card)
                        }
                    }
                    .pagePadding()
                }
            }
        }
    }

    @ViewBuilder private var liveQuizSection: some View {
        if let quizzes = model.liveQuizzes.value, !quizzes.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                SectionHeader(title: "Upcoming Live Quizzes") {
                    NavigationLink("See all", value: Route.liveQuizzes).font(Theme.Typography.callout)
                }
                VStack(spacing: 0) {
                    ForEach(quizzes) { quiz in
                        LiveQuizRow(quiz: quiz) {
                            if quiz.isJoined { router.presentedLiveQuizId = quiz.id }
                            else { Task { await model.join(quiz) } }
                        }
                        if quiz.id != quizzes.last?.id { Divider().padding(.leading, 56) }
                    }
                }
                .card(padding: Theme.Spacing.md)
            }
            .pagePadding()
        }
    }
}

// MARK: - Components

struct StreakBadge: View {
    let days: Int

    var body: some View {
        HStack(spacing: Theme.Spacing.xs) {
            Image(systemName: "flame.fill")
                .foregroundStyle(days > 0 ? Theme.Palette.ember : Theme.Palette.textTertiary)
                .symbolEffect(.bounce, value: days)
            Text("\(days)").font(Theme.Typography.headline).monospacedDigit()
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, Theme.Spacing.sm)
        .background(days > 0 ? Theme.Palette.emberSoft : Theme.Palette.surfaceMuted, in: Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(days) day learning streak")
    }
}

private struct ContinueLearningCard: View {
    let item: EnrolledCourse
    let onContinue: () -> Void

    var body: some View {
        let tint = Theme.subjectTint(item.course.categoryId)
        VStack(alignment: .leading, spacing: 0) {
            RemoteImage(url: item.course.coverUrl ?? item.course.thumbnailUrl, symbol: "play.rectangle", tint: tint)
                .frame(height: 150)
                .frame(maxWidth: .infinity)
                .overlay(alignment: .topLeading) {
                    Tag(text: "Continue learning", symbol: "play.fill", tint: .white)
                        .background(.black.opacity(0.35), in: Capsule())
                        .padding(Theme.Spacing.md)
                }
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text(item.course.title)
                        .font(Theme.Typography.title)
                        .foregroundStyle(Theme.Palette.textPrimary)
                    if let lesson = item.currentLesson {
                        Text("Lesson \(lesson.position): \(lesson.title)")
                            .font(Theme.Typography.callout)
                            .foregroundStyle(Theme.Palette.textSecondary)
                            .lineLimit(1)
                    }
                }
                HStack(spacing: Theme.Spacing.md) {
                    LinearProgress(value: item.enrollment.progress, tint: tint, height: 8)
                    Text("\(Int(item.enrollment.progress * 100))% complete")
                        .font(Theme.Typography.captionEmphasis)
                        .foregroundStyle(Theme.Palette.textSecondary)
                        .fixedSize()
                }
                Button(action: onContinue) {
                    Label("Continue", systemImage: "play.fill")
                }
                .buttonStyle(PrimaryButtonStyle(tint: tint))
            }
            .padding(Theme.Spacing.lg)
        }
        .background(Theme.Palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous))
        .shadow(color: Theme.Shadow.card.color, radius: Theme.Shadow.card.radius, y: Theme.Shadow.card.y)
        .accessibilityElement(children: .contain)
    }
}

private struct StartLearningCard: View {
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            Image(systemName: "books.vertical").font(.largeTitle).foregroundStyle(Theme.Palette.brand)
            Text("Start your first course").font(Theme.Typography.title)
            Text("Browse subjects you picked during setup and enroll in a course to begin.")
                .font(Theme.Typography.callout)
                .foregroundStyle(Theme.Palette.textSecondary)
            Button("Browse courses", action: action).buttonStyle(.primary)
        }
        .card(padding: Theme.Spacing.xl, radius: Theme.Radius.xl)
    }
}

private struct StatsGrid: View {
    let stats: DailyStats

    var body: some View {
        let goal = max(stats.dailyGoalMinutes, 1)
        VStack(spacing: Theme.Spacing.md) {
            HStack(spacing: Theme.Spacing.md) {
                ProgressRing(value: Double(stats.minutesStudied) / Double(goal), lineWidth: 8)
                    .frame(width: 56, height: 56)
                    .overlay(Image(systemName: "clock").foregroundStyle(Theme.Palette.brand))
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(stats.minutesStudied) of \(goal) min")
                        .font(Theme.Typography.headline)
                    Text(stats.minutesStudied >= goal ? "Daily goal reached — great work!" : "Daily study goal")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Palette.textSecondary)
                }
                Spacer()
            }
            .accessibilityElement(children: .combine)
            Grid(horizontalSpacing: Theme.Spacing.md, verticalSpacing: Theme.Spacing.md) {
                GridRow {
                    StatTile(value: "\(stats.lessonsCompleted)", label: "Lessons completed", symbol: "checkmark.circle", tint: Theme.Palette.success)
                    StatTile(value: "\(stats.questionsAnswered)", label: "Questions answered", symbol: "questionmark.circle")
                    StatTile(value: "\(stats.currentStreak)", label: "Day streak", symbol: "flame", tint: Theme.Palette.ember)
                }
            }
        }
        .card()
    }
}

private struct DailyChallengeCard: View {
    let challenge: DailyChallenge
    @Bindable var model: HomeViewModel
    let askAI: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            if challenge.completed && model.challengeResult == nil {
                Label(challenge.wasCorrect == true ? "Completed — you got it right!" : "Completed for today",
                      systemImage: "checkmark.seal.fill")
                    .font(Theme.Typography.bodyEmphasis)
                    .foregroundStyle(Theme.Palette.success)
                Text("Come back tomorrow for a new challenge.")
                    .font(Theme.Typography.callout)
                    .foregroundStyle(Theme.Palette.textSecondary)
            } else {
                QuestionBody(question: challenge.question, answer: $model.challengeAnswer, result: model.challengeResult)
                if let result = model.challengeResult {
                    AnswerFeedbackView(result: result, question: challenge.question, askAI: askAI)
                } else {
                    Button("Submit answer") { Task { await model.submitChallenge() } }
                        .buttonStyle(.primary(loading: model.isSubmittingChallenge))
                        .disabled(model.challengeAnswer.isEmpty)
                }
            }
        }
        .card()
    }
}

struct LiveQuizRow: View {
    let quiz: LiveQuiz
    let action: () -> Void

    var body: some View {
        HStack(spacing: Theme.Spacing.md) {
            Image(systemName: "trophy")
                .font(.headline)
                .foregroundStyle(Theme.Palette.gold)
                .frame(width: 40, height: 40)
                .background(Theme.Palette.gold.opacity(0.12), in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(quiz.title).font(Theme.Typography.bodyEmphasis).lineLimit(1)
                HStack(spacing: Theme.Spacing.sm) {
                    Text(quiz.subject)
                    Text("·")
                    Text("\(quiz.playerCount) players")
                    if quiz.xpPrize > 0 { Text("· \(quiz.xpPrize) XP") }
                }
                .font(Theme.Typography.caption)
                .foregroundStyle(Theme.Palette.textSecondary)
                CountdownText(target: quiz.startsAt, prefix: "Starts in ")
                    .font(Theme.Typography.captionEmphasis)
                    .foregroundStyle(Theme.Palette.brand)
            }
            Spacer()
            Button(quiz.isJoined ? "Open" : "Join", action: action)
                .buttonStyle(PillButtonStyle(filled: !quiz.isJoined))
        }
        .padding(.vertical, Theme.Spacing.sm)
    }
}
