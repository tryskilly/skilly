import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("Polar dispatch fixtures pass without leaking provider/database mocks", () => {
  const result = spawnSync(process.execPath, ["test", fileURLToPath(new URL("../scripts/fixtures/polarWebhookDispatch.fixture.ts", import.meta.url))], { encoding: "utf8" });
  expect({ status: result.status, error: result.status === 0 ? null : result.stderr }).toEqual({ status: 0, error: null });
});
