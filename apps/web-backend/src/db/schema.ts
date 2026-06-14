import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  allowedOrigins: text("allowed_origins").array().notNull().default(sql`'{}'::text[]`),
  allowedAppIds: text("allowed_app_ids").array().notNull().default(sql`'{}'::text[]`),
  usageCapSeconds: integer("usage_cap_seconds").notNull().default(0),
  /** Polar customer id, captured from the subscription webhook so we can open a customer-portal session. */
  polarCustomerId: text("polar_customer_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dashboardMemberships = pgTable(
  "dashboard_memberships",
  {
    workosUserId: text("workos_user_id").notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    email: text("email"),
    workosOrganizationId: text("workos_organization_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workosUserId, table.tenantId] }),
    check("dashboard_memberships_role_check", sql`${table.role} IN ('tenant_admin', 'super_admin')`),
    index("dashboard_memberships_user_idx").on(table.workosUserId),
    index("dashboard_memberships_org_idx").on(table.workosOrganizationId),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    keyType: text("key_type").notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyLast4: text("key_last4").notNull(),
    revoked: boolean("revoked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("api_keys_key_type_check", sql`${table.keyType} IN ('publishable', 'secret')`),
    unique("api_keys_key_hash_key").on(table.keyHash),
    index("api_keys_tenant_idx").on(table.tenantId),
  ],
);

export const tenantSkills = pgTable(
  "tenant_skills",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull(),
    content: text("content").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.skillId] })],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    seconds: integer("seconds").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("usage_events_tenant_time_idx").on(table.tenantId, table.createdAt)],
);

/** Per-tenant widget appearance/behavior config (accent, locale, launcher label). */
export const tenantWidgetConfigs = pgTable(
  "tenant_widget_configs",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" })
      .primaryKey(),
    accentColor: text("accent_color").notNull().default("#f59e0b"),
    locale: text("locale").notNull().default("en"),
    launcherLabel: text("launcher_label"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const tenantsRelations = relations(tenants, ({ many, one }) => ({
  apiKeys: many(apiKeys),
  dashboardMemberships: many(dashboardMemberships),
  skills: many(tenantSkills),
  usageEvents: many(usageEvents),
  widgetConfig: one(tenantWidgetConfigs),
}));
