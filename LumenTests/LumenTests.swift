import XCTest
@testable import Lumen

final class SpacedRepetitionTests: XCTestCase {
    func testFirstSuccessfulReviewSchedulesOneDay() {
        let next = SpacedRepetition.next(after: .init(), grade: .good)
        XCTAssertEqual(next.repetitions, 1)
        XCTAssertEqual(next.intervalDays, 1)
    }

    func testAgainResetsRepetitions() {
        let state = SpacedRepetition.State(ease: 2.5, intervalDays: 20, repetitions: 4)
        let next = SpacedRepetition.next(after: state, grade: .again)
        XCTAssertEqual(next.repetitions, 0)
        XCTAssertLessThan(next.intervalDays, 1)
        XCTAssertGreaterThanOrEqual(next.ease, 1.3)
    }

    func testEaseNeverDropsBelowFloor() {
        var state = SpacedRepetition.State()
        for _ in 0..<20 { state = SpacedRepetition.next(after: state, grade: .again) }
        XCTAssertEqual(state.ease, 1.3, accuracy: 0.0001)
    }
}

final class AnswerGradingTests: XCTestCase {
    private func question(_ kind: QuestionKind) -> Question {
        Question(id: UUID(), courseId: nil, topicId: nil, topicName: nil, lessonId: nil, kind: kind, difficulty: 1,
                 prompt: "Q", choices: [.init(id: "a", text: "A"), .init(id: "b", text: "B")], allowsMultiple: false)
    }

    func testChoiceGrading() {
        let offline = OfflineQuestion(question: question(.multipleChoice), correctChoiceIds: ["b"], acceptedAnswers: [], explanation: nil)
        XCTAssertTrue(offline.grade(AnswerSubmission(choiceIds: ["b"])).isCorrect)
        XCTAssertFalse(offline.grade(AnswerSubmission(choiceIds: ["a"])).isCorrect)
    }

    func testShortAnswerNormalisation() {
        let offline = OfflineQuestion(question: question(.shortAnswer), correctChoiceIds: [], acceptedAnswers: ["Mitochondria"], explanation: nil)
        XCTAssertTrue(offline.grade(AnswerSubmission(text: "  Mitochondria ")).isCorrect)
        XCTAssertTrue(offline.grade(AnswerSubmission(text: "MITOCHONDRIA!")).isCorrect)
        XCTAssertFalse(offline.grade(AnswerSubmission(text: "nucleus")).isCorrect)
    }
}

final class CodingTests: XCTestCase {
    func testPostgresMicrosecondTimestampsParse() {
        XCTAssertNotNil(PostgresDate.parse("2026-10-07T12:53:00.123456+00:00"))
        XCTAssertNotNil(PostgresDate.parse("2026-10-07T12:53:00+00:00"))
        XCTAssertNotNil(PostgresDate.parse("2026-10-07"))
    }

    func testSnakeCaseDecoding() throws {
        let json = #"{"lesson_id":"6F1C2E2A-7E3B-4C1A-9E59-0B6F7B9D2A11","course_id":"6F1C2E2A-7E3B-4C1A-9E59-0B6F7B9D2A12","playback_position":42.5,"completed_at":null,"updated_at":"2026-10-07T12:53:00.1+00:00"}"#
        let progress = try JSONCoding.decoder.decode(LessonProgress.self, from: Data(json.utf8))
        XCTAssertEqual(progress.playbackPosition, 42.5)
        XCTAssertFalse(progress.isCompleted)
    }

    func testExaminerSummaryStripping() {
        let content = "Great job!\n\n```lumen-exam-summary\n{\"score\":1}\n```"
        XCTAssertEqual(TutorViewModel.displayText(content), "Great job!")
    }

    func testMarkdownBlocks() {
        let blocks = MarkdownText.blocks("# Title\n\nPara one\ncontinues\n\n- item\n1. step\n```\ncode\n```")
        XCTAssertEqual(blocks.count, 5)
    }

    func testCountdownFormatting() {
        XCTAssertEqual(CountdownText.format(65), "01:05")
        XCTAssertEqual(CountdownText.format(3725), "1:02:05")
    }
}
