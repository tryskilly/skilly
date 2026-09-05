import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("Builder checkout/portal reliability fixtures pass in an isolated process", () => {
  const output = execFileSync(
    process.execPath,
    ["run", fileURLToPath(new URL("../scripts/check-builders-billing-reliability.ts", import.meta.url))],
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  expect(output).toContain("builders billing reliability scenarios passed");
});

