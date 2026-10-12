import { mock } from "bun:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRepo, defaultSeed } from "../../src/db/memoryRepo";
import type { CreateKeyState } from "../../src/app/dashboard/actions";

let createState: CreateKeyState = {};
mock.module("react", () => ({
  ...React,
  useActionState: () => [createState, () => {}, false],
}));
const { KeyManager } = await import("../../src/app/dashboard/KeyManager");
const repo = new MemoryRepo({ ...defaultSeed(), keys: [] });
const tenantId = defaultSeed().tenants[0]!.id;
const publishable = await repo.createApiKey(tenantId, "publishable");
const secret = await repo.createApiKey(tenantId, "secret");
const keys = await repo.listApiKeys(tenantId);
const html = renderToStaticMarkup(React.createElement(KeyManager, { keys }));
assert(html.includes(publishable.rawKey));
assert(html.includes('aria-label="Copy publishable key"'));
assert(html.includes(">Copy</button>"));
assert(html.includes(`sk_…${secret.info.last4}`));
assert(!html.includes(secret.rawKey));
assert(!html.includes("Copy this key now"));
assert(html.includes("Create key"));
assert(html.includes("Revoke"));

createState = { rawKey: secret.rawKey };
const secretRevealHtml = renderToStaticMarkup(React.createElement(KeyManager, { keys }));
assert(secretRevealHtml.includes("Copy this key now. It won&#x27;t be shown again."));
assert(secretRevealHtml.includes(secret.rawKey));
assert(secretRevealHtml.includes(`sk_…${secret.info.last4}`));

createState = { rawKey: publishable.rawKey };
const publishableCreatedHtml = renderToStaticMarkup(React.createElement(KeyManager, { keys }));
assert(publishableCreatedHtml.includes(publishable.rawKey));
assert(!publishableCreatedHtml.includes("Copy this key now"));

const legacyRepo = new MemoryRepo({
  ...defaultSeed(),
  keys: [{ tenantId, keyType: "publishable", rawKey: "pk_live_legacy1234", displayKey: null }],
});
createState = {};
const legacyHtml = renderToStaticMarkup(React.createElement(KeyManager, { keys: await legacyRepo.listApiKeys(tenantId) }));
assert(legacyHtml.includes("pk_live_…1234"));
assert(!legacyHtml.includes("pk_live_legacy1234"));
assert(!legacyHtml.includes('aria-label="Copy publishable key"'));

console.log("Keys show publishable values, mask secret values, and reveal new secrets once.");
