import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("Keys shows full publishable keys with Copy and masks secrets outside their one-time reveal", async () => {
  const processResult = Bun.spawn([
    process.execPath,
    "run",
    fileURLToPath(new URL("./fixtures/keyManagerRendering.ts", import.meta.url)),
  ], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    processResult.exited,
    new Response(processResult.stdout).text(),
    new Response(processResult.stderr).text(),
  ]);
  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(stdout.trim()).toBe("Keys show publishable values, mask secret values, and reveal new secrets once.");
});
