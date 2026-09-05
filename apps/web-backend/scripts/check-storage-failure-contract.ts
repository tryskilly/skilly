import assert from "node:assert/strict";
import { getMacEntitlement, upsertMacEntitlement, recordMacUsage } from "../src/lib/macSession";

// No database connection is created: deliberately verify missing configuration.
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
const expected = /Studio database is not configured/;
await assert.rejects(getMacEntitlement("user_fixture"), expected);
await assert.rejects(upsertMacEntitlement({ userId: "user_fixture", status: "active", entitlementType: "relay" }), expected);
await assert.rejects(recordMacUsage({ userId: "user_fixture", email: "fixture@example.com", seconds: 1 }), expected);
console.log("3 storage failure contracts passed; no database connection.");
