import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("personal billing API contracts pass in isolation", () => {
  const output = execFileSync(process.execPath, ["run", fileURLToPath(new URL("../scripts/check-personal-billing-contracts.ts", import.meta.url))], { encoding: "utf8" });
  expect(output).toContain("31 personal billing route contract scenarios passed");
});
