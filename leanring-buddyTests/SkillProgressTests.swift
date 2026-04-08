// MARK: - SkillSight

import Testing
import Foundation
@testable import leanring_buddy

// MARK: - SkillProgressTests

struct SkillProgressTests {

    // MARK: Test 1

    @Test func createsNewProgressAtFirstStage() {
        let newProgress = SkillProgress.createNew(
            skillId: "xcode-debugger",
            skillVersion: "1.0.0",
            firstStageId: "stage-one"
        )

        #expect(newProgress.skillId == "xcode-debugger")
        #expect(newProgress.skillVersion == "1.0.0")
        #expect(newProgress.currentStageId == "stage-one")
        #expect(newProgress.completedStageIds.isEmpty)
        #expect(newProgress.stageStartDates["stage-one"] != nil)
        #expect(newProgress.totalInteractions == 0)
        #expect(newProgress.lastInteractionDate == nil)
        #expect(newProgress.isManualOverride == false)
        #expect(newProgress.signalBuffer.isEmpty)
    }

    // MARK: Test 2

    @Test func serializesAndDeserializesViaJSON() throws {
        let referenceDate = Date(timeIntervalSince1970: 1_700_000_000)

        let originalProgress = SkillProgress(
            skillId: "xcode-debugger",
            skillVersion: "1.2.3",
            currentStageId: "stage-two",
            completedStageIds: ["stage-one"],
            stageStartDates: ["stage-one": referenceDate, "stage-two": referenceDate],
            totalInteractions: 7,
            lastInteractionDate: referenceDate,
            isManualOverride: true,
            signalBuffer: ["stage-two": 2]
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let jsonData = try encoder.encode(originalProgress)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decodedProgress = try decoder.decode(SkillProgress.self, from: jsonData)

        #expect(decodedProgress.skillId == originalProgress.skillId)
        #expect(decodedProgress.skillVersion == originalProgress.skillVersion)
        #expect(decodedProgress.currentStageId == originalProgress.currentStageId)
        #expect(decodedProgress.completedStageIds == originalProgress.completedStageIds)
        #expect(decodedProgress.totalInteractions == originalProgress.totalInteractions)
        #expect(decodedProgress.isManualOverride == originalProgress.isManualOverride)
        #expect(decodedProgress.signalBuffer == originalProgress.signalBuffer)
        // Compare dates by their second-level resolution (ISO8601 round-trips at second precision)
        #expect(
            decodedProgress.lastInteractionDate?.timeIntervalSince1970.rounded()
            == originalProgress.lastInteractionDate?.timeIntervalSince1970.rounded()
        )
    }

    // MARK: Test 3

    @Test func isCompleteWhenFinalStageCompleted() {
        var progress = SkillProgress.createNew(
            skillId: "xcode-debugger",
            skillVersion: "1.0.0",
            firstStageId: "stage-one"
        )

        // Simulate completing stage-one by appending it to completedStageIds.
        progress.completedStageIds.append("stage-one")

        #expect(progress.completedStageIds.contains("stage-one"))
    }

    // MARK: Test 4

    @Test func detectsVersionMismatch() {
        let progress = SkillProgress.createNew(
            skillId: "xcode-debugger",
            skillVersion: "1.0.0",
            firstStageId: "stage-one"
        )

        // A different version string should indicate migration is needed.
        #expect(progress.needsMigration(currentSkillVersion: "2.0.0") == true)

        // The same version string should indicate no migration is needed.
        #expect(progress.needsMigration(currentSkillVersion: "1.0.0") == false)
    }

    // MARK: Test 5

    @Test func migratesProgressByPositionWhenStageIdsChange() {
        let oldStageIds = ["old-one", "old-two", "old-three"]
        let newStageIds = ["new-one", "new-two", "new-three"]

        // User has completed old-one and is currently on old-two.
        let progressBeforeMigration = SkillProgress(
            skillId: "xcode-debugger",
            skillVersion: "1.0.0",
            currentStageId: "old-two",
            completedStageIds: ["old-one"],
            stageStartDates: ["old-one": Date(), "old-two": Date()],
            totalInteractions: 5,
            lastInteractionDate: Date(),
            isManualOverride: true,
            signalBuffer: ["old-two": 2]
        )

        let migratedProgress = progressBeforeMigration.migrateByPosition(
            oldStageIds: oldStageIds,
            newStageIds: newStageIds,
            newSkillVersion: "2.0.0"
        )

        // old-one was at index 0 → new-one is at index 0
        #expect(migratedProgress.completedStageIds == ["new-one"])

        // old-two was at index 1 → new-two is at index 1
        #expect(migratedProgress.currentStageId == "new-two")

        // Version should be bumped to the new version
        #expect(migratedProgress.skillVersion == "2.0.0")

        // Signal buffer must be cleared after migration
        #expect(migratedProgress.signalBuffer.isEmpty)

        // Manual override must be cleared after migration
        #expect(migratedProgress.isManualOverride == false)
    }

    // MARK: Test 6

    @Test func preservesProgressWhenStageIdsUnchanged() {
        let stageIds = ["stage-one", "stage-two", "stage-three"]

        let originalProgress = SkillProgress(
            skillId: "xcode-debugger",
            skillVersion: "1.0.0",
            currentStageId: "stage-two",
            completedStageIds: ["stage-one"],
            stageStartDates: ["stage-one": Date(), "stage-two": Date()],
            totalInteractions: 4,
            lastInteractionDate: Date(),
            isManualOverride: false,
            signalBuffer: ["stage-two": 1]
        )

        let migratedProgress = originalProgress.migrateByPosition(
            oldStageIds: stageIds,
            newStageIds: stageIds,
            newSkillVersion: "1.1.0"
        )

        // Stage IDs are the same, so completed stages should map to themselves
        #expect(migratedProgress.completedStageIds == ["stage-one"])

        // Current stage should remain the same
        #expect(migratedProgress.currentStageId == "stage-two")

        // Version should be bumped to the new version
        #expect(migratedProgress.skillVersion == "1.1.0")

        // Signal buffer is always cleared on migration, even when stage IDs are unchanged
        #expect(migratedProgress.signalBuffer.isEmpty)
    }
}
