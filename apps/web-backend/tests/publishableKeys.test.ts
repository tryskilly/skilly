import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { MemoryRepo, defaultSeed } from "../src/db/memoryRepo";
import { apiKeys } from "../src/db/schema";
import { hashKey } from "../src/domain/keys";

const tenantId = defaultSeed().tenants[0]!.id;

describe("displayable publishable keys", () => {
  test("createApiKey stores the publishable value but never the secret value", async () => {
    const repo = new MemoryRepo({ ...defaultSeed(), keys: [] });
    const publishable = await repo.createApiKey(tenantId, "publishable");
    const secret = await repo.createApiKey(tenantId, "secret");
    expect(publishable.info.displayKey).toBe(publishable.rawKey);
    expect(secret.info.displayKey).toBeNull();
    const keys = await repo.listApiKeys(tenantId);
    expect(keys.find((key) => key.id === publishable.info.id)?.displayKey).toBe(publishable.rawKey);
    expect(keys.find((key) => key.id === secret.info.id)?.displayKey).toBeNull();
    expect(await repo.findTenantByKeyHash(hashKey(secret.rawKey))).toMatchObject({ keyType: "secret" });
  });

  test("creates a key once and reuses it on the second call", async () => {
    const repo = new MemoryRepo({ ...defaultSeed(), keys: [] });
    const first = await repo.ensurePublishableKey(tenantId);
    expect(first.created).toBe(true);
    expect(await repo.ensurePublishableKey(tenantId)).toEqual({ rawKey: first.rawKey, created: false });
    expect(await repo.listApiKeys(tenantId)).toHaveLength(1);
  });

  test("returns the newest displayable key while skipping revoked, legacy and secret keys", async () => {
    const repo = new MemoryRepo({
      ...defaultSeed(),
      keys: [
        { tenantId, keyType: "publishable", rawKey: "pk_live_old_displayable" },
        { tenantId, keyType: "publishable", rawKey: "pk_live_new_displayable" },
        { tenantId, keyType: "publishable", rawKey: "pk_live_revoked", revoked: true },
        { tenantId, keyType: "publishable", rawKey: "pk_live_legacy", displayKey: null },
        { tenantId, keyType: "secret", rawKey: "sk_live_secret", displayKey: "sk_live_secret" },
      ],
    });
    expect(await repo.ensurePublishableKey(tenantId)).toEqual({ rawKey: "pk_live_new_displayable", created: false });
    expect((await repo.listApiKeys(tenantId)).find((key) => key.keyType === "secret")?.displayKey).toBeNull();
  });

  test("creates a replacement when only revoked and legacy keys exist", async () => {
    const repo = new MemoryRepo({
      ...defaultSeed(),
      keys: [
        { tenantId, keyType: "publishable", rawKey: "pk_live_revoked", revoked: true },
        { tenantId, keyType: "publishable", rawKey: "pk_live_legacy", displayKey: null },
      ],
    });
    const replacement = await repo.ensurePublishableKey(tenantId);
    expect(replacement.created).toBe(true);
    expect(replacement.rawKey).not.toBe("pk_live_revoked");
    expect(replacement.rawKey).not.toBe("pk_live_legacy");
    expect(await repo.ensurePublishableKey(tenantId)).toEqual({ rawKey: replacement.rawKey, created: false });
  });

  test("never reuses another workspace's key", async () => {
    const repo = new MemoryRepo();
    const otherTenant = await repo.createTenant({ name: "Other workspace" });
    const otherKey = await repo.ensurePublishableKey(otherTenant.id);
    expect(otherKey.created).toBe(true);
    expect(otherKey.rawKey).not.toBe((await repo.ensurePublishableKey(tenantId)).rawKey);
    expect((await repo.listApiKeys(otherTenant.id)).map((key) => key.displayKey)).toEqual([otherKey.rawKey]);
  });

  test("concurrent ensures succeed and leave a reusable key", async () => {
    const repo = new MemoryRepo({ ...defaultSeed(), keys: [] });
    const results = await Promise.all([repo.ensurePublishableKey(tenantId), repo.ensurePublishableKey(tenantId)]);
    const keys = await repo.listApiKeys(tenantId);
    for (const result of results) expect(keys.some((key) => key.displayKey === result.rawKey)).toBe(true);
    const reused = await repo.ensurePublishableKey(tenantId);
    expect(reused.created).toBe(false);
    expect(keys.some((key) => key.displayKey === reused.rawKey)).toBe(true);
  });

  test("migration and schema constrain readable values to publishable keys", () => {
    const migration = readFileSync(new URL("../db/migrations/0015_acoustic_smiling_tiger.sql", import.meta.url), "utf8");
    expect(migration).toContain('ADD COLUMN "display_key" text');
    expect(migration).toContain('CHECK ("api_keys"."display_key" IS NULL OR "api_keys"."key_type" = \'publishable\')');
    const table = getTableConfig(apiKeys);
    expect(table.columns.find((column) => column.name === "display_key")?.notNull).toBe(false);
    expect(table.checks.some((constraint) => constraint.name === "api_keys_display_key_check")).toBe(true);
    const snapshot = readFileSync(new URL("../db/migrations/meta/0015_snapshot.json", import.meta.url), "utf8");
    expect(snapshot).toContain('"api_keys_display_key_check"');
    expect(snapshot).toContain('"display_key"');
    const journal = readFileSync(new URL("../db/migrations/meta/_journal.json", import.meta.url), "utf8");
    expect(journal).toContain('"tag": "0015_acoustic_smiling_tiger"');
  });
});
