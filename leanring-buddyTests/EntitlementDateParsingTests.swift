// MARK: - Skilly

import Foundation
import Testing
@testable import Skilly

/// Regression guard for the first-paying-customer lockout (Gabriel Blanco,
/// 2026-07-23): Polar sends `current_period_end` with MICROSECOND precision,
/// Foundation's ISO8601DateFormatter returns nil on >3 fractional digits, so
/// an *active* subscription parsed to nil -> read as .none -> paid user locked
/// out of the app they'd just bought.
@Suite("Entitlement date parsing")
struct EntitlementDateParsingTests {

    private func decode(status: String, periodEnd: String) throws -> EntitlementRecord {
        let json = #"{"user_id":"user_x","status":"\#(status)","period_end":"\#(periodEnd)"}"#
        return try JSONDecoder().decode(EntitlementRecord.self, from: Data(json.utf8))
    }

    @Test("microsecond period_end still reads as active")
    func microsecondActive() throws {
        // The exact value that locked out the first paying customer.
        let record = try decode(status: "active", periodEnd: "2026-08-23T12:06:03.691165Z")
        guard case .active = record.parsedStatus else {
            Issue.record("6-digit microsecond period_end parsed as \(record.parsedStatus), expected .active")
            return
        }
    }

    @Test("parseISO8601 accepts ms, no-fraction, micro, and nanosecond precision")
    func fractionalPrecisions() {
        #expect(EntitlementRecord.parseISO8601("2026-08-23T12:06:03Z") != nil)               // none
        #expect(EntitlementRecord.parseISO8601("2026-08-23T12:06:03.691Z") != nil)           // millis
        #expect(EntitlementRecord.parseISO8601("2026-08-23T12:06:03.691165Z") != nil)        // micros
        #expect(EntitlementRecord.parseISO8601("2026-08-23T12:06:03.691165123Z") != nil)     // nanos
    }

    @Test("garbage still returns nil (no false active)")
    func garbageIsNil() {
        #expect(EntitlementRecord.parseISO8601("not-a-date") == nil)
        #expect(EntitlementRecord.parseISO8601("") == nil)
    }
}
