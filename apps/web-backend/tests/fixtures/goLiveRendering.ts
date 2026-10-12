import { mock } from "bun:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRepo, defaultSeed } from "../../src/db/memoryRepo";

const tenantId = defaultSeed().tenants[0]!.id;
let pathname = "/dashboard/go-live";
let selectedFramework: "html" | "react" | "nextjs" = "html";
const originalUseState = React.useState;
mock.module("react", () => ({
  ...React,
  useState: (initialState: unknown) => originalUseState(initialState === "html" ? selectedFramework : initialState),
}));
const revalidatedPaths: string[] = [];
const analyticsEvents: Array<{ event: string; properties: Record<string, unknown> }> = [];
mock.module("next/cache", () => ({
  revalidatePath: (path: string) => { revalidatedPaths.push(path); },
}));
mock.module("../../src/lib/dashboardAuth", () => ({
  requireDashboardSession: async () => ({ role: "tenant_admin", tenantId, issuedAt: Date.now() }),
  setDashboardSession: async () => {},
}));
mock.module("../../src/lib/analytics", () => ({
  captureServerEvent: async (event: string, properties: Record<string, unknown>) => { analyticsEvents.push({ event, properties }); },
}));
mock.module("../../src/lib/session", () => ({
  getCurrentDashboardTenantId: async () => tenantId,
  DEFAULT_SKILL_ID: "default",
}));
mock.module("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  redirect: () => { throw new Error("Unexpected redirect"); },
}));

const { default: GoLivePage } = await import("../../src/app/dashboard/go-live/page");
const { default: DashboardPage } = await import("../../src/app/dashboard/page");
const { default: SetupPage } = await import("../../src/app/dashboard/setup/page");
const { default: WidgetPage } = await import("../../src/app/dashboard/widget/page");
const { getBillingPlanOptions } = await import("../../src/domain/billing");
const { useBillingRedirect } = await import("../../src/app/dashboard/go-live/useBillingRedirect");
const { default: UsagePage } = await import("../../src/app/dashboard/usage/page");
const { AppShell } = await import("../../src/app/dashboard/v2/AppShell");
const { addOriginAction, removeOriginAction, saveSkillAction } = await import("../../src/app/dashboard/actions");
const { serializeStudioGuide } = await import("../../src/domain/studioGuide");
const repo = new MemoryRepo({ ...defaultSeed(), keys: [] });
globalThis.__skillyRepo = repo;
const project = await repo.ensureDefaultProject(tenantId);
await repo.setProjectOrigins(project.id, ["https://app.acme.com"]);

await repo.setTenantUsageCap(tenantId, 0);
const waitingHtml = renderToStaticMarkup(await GoLivePage());
const firstKeys = await repo.listApiKeys(tenantId);
assert.equal(firstKeys.length, 1);
const realPublishableKey = firstKeys[0]?.displayKey;
assert(realPublishableKey);
assert(waitingHtml.includes(realPublishableKey));
assert.deepEqual(analyticsEvents, [{ event: "dashboard_publishable_key_auto_created", properties: { tenant_id: tenantId } }]);
assert(renderToStaticMarkup(await GoLivePage()).includes(realPublishableKey));
assert.equal((await repo.listApiKeys(tenantId)).length, 1);
assert.equal(analyticsEvents.length, 1);
const headings = ["Where Skilly can run", "Add one line to your site", "Pick a plan to turn Skilly on for visitors", "Customize the launcher"];
for (let index = 0; index < headings.length; index++) {
  assert(waitingHtml.includes(headings[index]!));
  if (index > 0) assert(waitingHtml.indexOf(headings[index - 1]!) < waitingHtml.indexOf(headings[index]!));
}
assert(waitingHtml.includes("Waiting for Skilly to load on app.acme.com…"));
assert(waitingHtml.includes('name="origin"'));
assert(waitingHtml.includes("https://app.acme.com"));
assert(waitingHtml.includes('href="/dashboard/origins"'));
assert(waitingHtml.includes('data-analytics-event="dashboard_go_live_check_again_clicked"'));
assert(waitingHtml.includes('data-analytics-event="dashboard_go_live_email_developer_clicked"'));
assert(!waitingHtml.includes("pk_live_your_key"));
assert(!waitingHtml.includes("Create a new key"));
assert(!waitingHtml.includes("Create my key"));
assert(waitingHtml.includes("Your publishable key is filled in. It&#x27;s safe in the browser; Skilly only runs on the sites above."));
assert(waitingHtml.includes("Manage keys"));
assert(waitingHtml.includes("Step 3 of 3 · Go live"));
assert(waitingHtml.includes("Put Skilly in front of your users."));
assert(waitingHtml.includes("Three things, all on this page."));
assert(waitingHtml.includes("Skilly refuses to start anywhere else, even if someone copies your script."));
assert(waitingHtml.includes("+ Add staging or another domain"));
for (const framework of ["HTML", "React", "Next.js"]) assert(waitingHtml.includes(framework));
const recommendedPlan = getBillingPlanOptions(process.env)[1];
assert(recommendedPlan);
assert(waitingHtml.includes(`Go live with ${recommendedPlan.name} · $${recommendedPlan.priceMonthly}/mo`));
assert(waitingHtml.includes("Recommended"));
assert(waitingHtml.includes("Stay on Free") === false);
assert(waitingHtml.includes("Test mode only. Visitors can&#x27;t see Skilly."));
assert(waitingHtml.includes("You&#x27;ll go live as soon as the script is detected and the plan is active."));
assert(waitingHtml.includes('data-analytics-event="dashboard_checkout_clicked"'));
assert(waitingHtml.includes('data-analytics-event="dashboard_widget_config_save_clicked"'));
const developerHref = waitingHtml.match(/href="(mailto:[^"]+)"/)?.[1]?.replaceAll("&amp;", "&").replaceAll("&#x27;", "'");
assert(developerHref);
const emailParameters = new URLSearchParams(developerHref.slice("mailto:?".length));
assert.equal(emailParameters.get("subject"), "Add Skilly to our site");
assert(emailParameters.get("body")?.includes(`data-skilly-key="${realPublishableKey}"`));
assert(!emailParameters.get("body")?.includes("Replace"));
assert(emailParameters.get("body")?.includes(`data-skilly-skill="${project.skillId}"`));
for (const framework of ["html", "react", "nextjs"] as const) {
  selectedFramework = framework;
  const frameworkHtml = renderToStaticMarkup(await GoLivePage());
  assert(frameworkHtml.includes(realPublishableKey));
  assert(!frameworkHtml.includes("pk_live_your_key"));
  assert(frameworkHtml.includes(`aria-labelledby="install-tab-${framework}"`));
  const frameworkEmailHref = frameworkHtml.match(/href="(mailto:[^"]+)"/)?.[1]?.replaceAll("&amp;", "&").replaceAll("&#x27;", "'");
  assert(frameworkEmailHref);
  const frameworkEmail = new URLSearchParams(frameworkEmailHref.slice("mailto:?".length)).get("body");
  assert(frameworkEmail?.includes(realPublishableKey));
  assert(!frameworkEmail?.includes("pk_live_your_key"));
  if (framework === "react") assert(frameworkEmail?.includes("document.body.appendChild(script)"));
  if (framework === "nextjs") assert(frameworkEmail?.includes('import Script from "next/script"'));
}
selectedFramework = "html";
assert.equal(analyticsEvents.length, 1);
assert.equal((waitingHtml.match(/bg-accent text-accent-fg border border-line shadow-card hover:bg-accent-hover/g) ?? []).length, 1);

const addedOriginForm = new FormData();
addedOriginForm.set("origin", "added.acme.com");
await addOriginAction(addedOriginForm);
assert((await repo.ensureDefaultProject(tenantId)).allowedOrigins.includes("https://added.acme.com"));
assert((await repo.getTenant(tenantId))?.allowedOrigins.includes("https://added.acme.com"));
assert(renderToStaticMarkup(await GoLivePage()).includes("https://added.acme.com"));
assert.deepEqual(revalidatedPaths, ["/dashboard", "/dashboard/origins", "/dashboard/go-live"]);

revalidatedPaths.length = 0;
const removedOriginForm = new FormData();
removedOriginForm.set("origin", "https://added.acme.com");
await removeOriginAction(removedOriginForm);
assert(!(await repo.ensureDefaultProject(tenantId)).allowedOrigins.includes("https://added.acme.com"));
assert(!(await repo.getTenant(tenantId))?.allowedOrigins.includes("https://added.acme.com"));
assert(!renderToStaticMarkup(await GoLivePage()).includes("https://added.acme.com"));
assert.deepEqual(revalidatedPaths, ["/dashboard", "/dashboard/origins", "/dashboard/go-live"]);

function assertNextStepHome(html: string, buttonLabel: string, buttonHref: string, completedSteps: number) {
  assert(html.includes("Let&#x27;s get Skilly live."));
  assert(html.includes('<p class="font-mono text-xs font-semibold uppercase tracking-wider text-accent-text">Get live</p>'));
  assert(!html.includes("For builders"));
  const checklistHtml = html.match(/<section[^>]*>.*?<div[^>]*>Get live<\/div>.*?<\/section>/)?.[0];
  assert(checklistHtml);
  for (const label of ["Draft the guide", "Try it on your site", "Go live"]) assert(checklistHtml.includes(label));
  const checklistLinks = [...checklistHtml.matchAll(/<a href="([^"]+)" class="block transition-colors/g)].map((match) => match[1]);
  assert.deepEqual(checklistLinks, ["/dashboard/setup", "/dashboard/widget", "/dashboard/go-live"]);
  assert.equal((checklistHtml.match(/bg-success-soft text-success border-success\/25/g) ?? []).length, completedSteps);
  const primaryButtons = [...html.matchAll(/<a[^>]*class="[^"]*bg-accent text-accent-fg[^>]*>.*?<\/a>/g)].map((match) => match[0]);
  assert.equal(primaryButtons.length, 1);
  assert(primaryButtons[0]?.includes(`href="${buttonHref}"`));
  assert(primaryButtons[0]?.includes(`>${buttonLabel}</a>`));
  assert.equal((html.match(/<header/g) ?? []).length, 1);
  assert.equal((html.match(/<section/g) ?? []).length, 1);
  for (const hiddenLabel of ["Continue setup", "Test widget", "Minutes used", "Recent sessions", "Widget health", "Run live test"]) assert(!html.includes(hiddenLabel));
  assert(!html.includes("/dashboard/setup#"));
}

await repo.saveProjectSkill(project.id, "");
assertNextStepHome(renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) })), "Draft my guide", "/onboarding/start", 0);
await repo.saveProjectSkill(project.id, project.skillContent);
assertNextStepHome(renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) })), "Try it on your site", "/dashboard/widget", 1);
await repo.recordProjectPreviewed(project.id);
assertNextStepHome(renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) })), "Go live", "/dashboard/go-live", 2);

await repo.recordProjectWidgetSeen(project.id, "app.acme.com");
const installedHtml = renderToStaticMarkup(await GoLivePage());
assert(installedHtml.includes("Installed on app.acme.com. Open your site and ask Skilly one question."));
assert(installedHtml.includes("Pick a plan to turn Skilly on for visitors"));
assert(!installedHtml.includes("Waiting for Skilly"));
await repo.recordUsage({ tenantId, kind: "session_seconds", seconds: 20, domain: "app.acme.com" });
const liveHtml = renderToStaticMarkup(await GoLivePage());
assert(liveHtml.includes("Skilly is live on app.acme.com."));
assert(!liveHtml.includes("Waiting for Skilly"));
const liveHomeHtml = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }));
assert(!liveHomeHtml.includes("Get live</div>"));
assert(!liveHomeHtml.includes("Let&#x27;s get Skilly live."));
for (const liveLabel of ["Skilly is live on app.acme.com.", "Run live test", "Minutes used", "Sessions", "Avg session", "Error rate", "Recent sessions", "Widget health", "Test widget"]) assert(liveHomeHtml.includes(liveLabel));
assert(liveHomeHtml.includes('data-analytics-event="dashboard_widget_preview_clicked"'));

for (const key of await repo.listApiKeys(tenantId)) await repo.revokeApiKey(tenantId, key.id);
const noKeyHtml = renderToStaticMarkup(await GoLivePage());
const replacementKey = (await repo.listApiKeys(tenantId)).find((key) => !key.revoked)?.displayKey;
assert(replacementKey);
assert.notEqual(replacementKey, realPublishableKey);
assert(noKeyHtml.includes(replacementKey));
assert(!noKeyHtml.includes("pk_live_your_key"));
assert.equal(analyticsEvents.filter(({ event }) => event === "dashboard_publishable_key_auto_created").length, 2);
assert(noKeyHtml.includes('href="/dashboard/keys"'));
assert(!noKeyHtml.includes("Create my key"));
const guideHtml = renderToStaticMarkup(await SetupPage());
assert(guideHtml.includes("Step 1 of 3 · Your guide"));
assert(guideHtml.includes("Here&#x27;s the guide Skilly follows."));
assert(guideHtml.includes("Tasks Skilly can guide"));
assert(guideHtml.includes("What should a new user get done first?"));
for (const starterTask of ["Create first project", "Connect data", "Invite a teammate", "Something else…"]) assert(guideHtml.includes(starterTask));
assert(guideHtml.includes("What Skilly should know"));
assert(guideHtml.includes("How Skilly sounds"));
assert(!guideHtml.includes("Safety check passed"));
assert(guideHtml.includes("or start from scratch"));
const emptyGuideSaveButtons = [...guideHtml.matchAll(/<button[^>]*data-analytics-event="dashboard_guide_(?:saved|save_and_try)_clicked"[^>]*>/g)].map((match) => match[0]);
assert.equal(emptyGuideSaveButtons.length, 2);
assert(emptyGuideSaveButtons.every((button) => button.includes('disabled=""')));
assert(guideHtml.includes('href="/dashboard/skill"'));
assert(guideHtml.includes('data-analytics-event="dashboard_guide_task_added"'));
assert(guideHtml.includes('data-analytics-event="dashboard_guide_saved_clicked"'));
assert(guideHtml.includes('data-analytics-event="dashboard_guide_save_and_try_clicked"'));
assert(guideHtml.includes("Save and try it on your site →"));
assert(!guideHtml.includes('name="accentColor"'));
assert(!guideHtml.includes("Style (optional)"));
assert.equal((guideHtml.match(/bg-accent text-accent-fg border border-line shadow-card hover:bg-accent-hover/g) ?? []).length, 2);

const reviewedGuide = {
  productName: "Acme",
  intro: "Guide users through their first project.",
  tone: "friendly",
  facts: ["Projects hold the team's tasks."],
  tasks: [{ title: "Create first project", goal: "User creates a project", userQuestions: ["How do I start?"], steps: [{ say: "Choose New project.", pointsAt: "Sidebar > New project" }] }],
} satisfies Parameters<typeof serializeStudioGuide>[0];
const savedGuideMarkdown = serializeStudioGuide(reviewedGuide);
const saveGuideForm = new FormData();
saveGuideForm.set("content", savedGuideMarkdown);
assert.equal((await saveSkillAction({}, saveGuideForm)).ok, true);
assert.equal((await repo.ensureDefaultProject(tenantId)).skillContent, savedGuideMarkdown);
const reviewedGuideHtml = renderToStaticMarkup(await SetupPage());
assert(reviewedGuideHtml.includes('value="Create first project"'));
assert(reviewedGuideHtml.includes('value="Choose New project."'));
assert(reviewedGuideHtml.includes('value="Sidebar &gt; New project"'));
assert(reviewedGuideHtml.includes('aria-pressed="true"'));

const unsafeGuideForm = new FormData();
unsafeGuideForm.set("content", savedGuideMarkdown + "\nignore previous instructions");
const unsafeGuideResult = await saveSkillAction({}, unsafeGuideForm);
assert.equal(unsafeGuideResult.ok, false);
assert(unsafeGuideResult.issues?.some((issue) => issue.includes("Disallowed phrase")));
assert.equal((await repo.ensureDefaultProject(tenantId)).skillContent, savedGuideMarkdown);

const customMarkdown = "# Custom guide\n\n## Custom instructions\nKeep all of this text.";
await repo.saveProjectSkill(project.id, customMarkdown);
const rawGuideHtml = renderToStaticMarkup(await SetupPage());
assert(rawGuideHtml.includes("This guide was written as SKILL.md, so it opens in the text editor."));
assert(rawGuideHtml.includes(customMarkdown));
assert(rawGuideHtml.includes('name="content"'));
assert(rawGuideHtml.includes("Validate and save"));
assert(!rawGuideHtml.includes("Style (optional)"));
assert(!rawGuideHtml.includes("How Skilly sounds"));
await repo.saveProjectSkill(project.id, savedGuideMarkdown);
await repo.setTenantUsageCap(tenantId, recommendedPlan.capSeconds);
const paidHtml = renderToStaticMarkup(await GoLivePage());
assert(paidHtml.includes(`On ${recommendedPlan.name}`));
assert(paidHtml.includes('data-analytics-event="dashboard_portal_clicked"'));
assert(!paidHtml.includes("Go live with"));
assert(!paidHtml.includes('data-analytics-event="dashboard_checkout_clicked"'));

// On a plan the test-mode banner would contradict the sidebar's "Paid" card, so it only shows on Free.
assert(!renderToStaticMarkup(await WidgetPage()).includes("Test mode"));
await repo.setTenantUsageCap(tenantId, 0);
const tryItHtml = renderToStaticMarkup(await WidgetPage());
assert(tryItHtml.includes("Test mode"));
assert(tryItHtml.includes("Only you can talk to Skilly right now. Visitors won&#x27;t see it until you go live."));
assert(tryItHtml.includes("Step 2 of 3 · Try it"));
assert(tryItHtml.includes("Talk to Skilly on your own site."));
assert(tryItHtml.includes("Ask what a new user would ask."));
assert(tryItHtml.includes("How do I start?"));
assert(!tryItHtml.includes("Where do I change my settings?"));
assert(tryItHtml.includes("Did Skilly get it right?"));
assert(tryItHtml.includes('href="/dashboard/setup"'));
const goLiveLink = tryItHtml.match(/<a[^>]*data-analytics-event="dashboard_try_it_go_live_clicked"[^>]*>.*?<\/a>/)?.[0];
assert(goLiveLink);
assert(goLiveLink.includes('href="/dashboard/go-live"'));
assert(goLiveLink.includes("It works. Go live →"));
assert(!tryItHtml.includes("Embed snippet"));
assert(tryItHtml.includes("Widget states (for reference)"));
await repo.setTenantUsageCap(tenantId, recommendedPlan.capSeconds);
const usageHtml = renderToStaticMarkup(await UsagePage());
assert(usageHtml.includes('data-analytics-event="dashboard_portal_clicked"'));
for (const planName of ["Starter", "Studio", "Scale"]) assert(usageHtml.includes(planName));

const shellProps = {
  children: null,
  tenantName: "Acme",
  role: "tenant_admin",
  accountEmail: "builder@acme.com",
  isLive: false,
  switchableTenants: [],
  currentTenantId: tenantId,
  hasSkill: true,
  hasPreviewed: false,
  usedSecondsThisMonth: 0,
  usageCapSeconds: 0,
  hasPeopleSurface: true,
} satisfies Parameters<typeof AppShell>[0];
const shellHtml = renderToStaticMarkup(createElement(AppShell, shellProps));
const navigation = shellHtml.match(/<nav aria-label="Primary"[^>]*>(.*?)<\/nav>/)?.[1];
assert(navigation);
assert.deepEqual([...navigation.matchAll(/data-analytics-label="([^"]+)"/g)].map((match) => match[1]), [
  "Home", "Guide", "Try it", "Go live", "Usage &amp; plan", "Settings",
]);
assert(!navigation.includes("Tenant directory"));
assert(shellHtml.includes("Book a free setup call"));
assert(shellHtml.includes("Get to live"));
assert(shellHtml.includes("Free · test mode · 0 min used"));
const paidShellHtml = renderToStaticMarkup(createElement(AppShell, {
  ...shellProps, usedSecondsThisMonth: 60, usageCapSeconds: 24000,
}));
assert(paidShellHtml.includes("Paid · 399 min left"));
const shellTopbar = paidShellHtml.match(/<header[^>]*skilly-dashboard-topbar[^>]*>.*?<\/header>/)?.[0];
assert(shellTopbar);
assert(!shellTopbar.includes("min left"));
assert(shellHtml.includes("1/3"));
assert(shellHtml.includes("Draft the guide"));
assert(shellHtml.includes("Try it on your site"));
const shellChecklist = shellHtml.match(/<ul class="mt-3 grid gap-2">.*?<\/ul>/)?.[0];
assert(shellChecklist);
assert.deepEqual([...shellChecklist.matchAll(/href="([^"]+)"/g)].map((match) => match[1]), ["/dashboard/setup", "/dashboard/widget", "/dashboard/go-live"]);
assert(shellChecklist.includes("Current step"));
assert(renderToStaticMarkup(createElement(AppShell, { ...shellProps, hasSkill: false })).includes("0/3"));
const previewedShellHtml = renderToStaticMarkup(createElement(AppShell, { ...shellProps, hasPreviewed: true }));
assert(previewedShellHtml.includes("2/3"));
assert.equal((previewedShellHtml.match(/aria-label="Done"/g) ?? []).length, 2);
assert(!shellHtml.includes("Readiness"));
assert(!shellHtml.includes("Needs setup"));
const liveShellHtml = renderToStaticMarkup(createElement(AppShell, {
  ...shellProps, hasPreviewed: true, isLive: true,
}));
assert(!liveShellHtml.includes("Get to live"));
assert(liveShellHtml.includes("Book a free setup call"));
assert(renderToStaticMarkup(createElement(AppShell, { ...shellProps, role: "super_admin" })).includes("Tenant directory"));
pathname = "/dashboard/setup";
assert(renderToStaticMarkup(createElement(AppShell, shellProps)).includes('<strong class="font-bold text-fg">Guide</strong>'));
pathname = "/dashboard/people";
const peopleHtml = renderToStaticMarkup(createElement(AppShell, shellProps));
assert(peopleHtml.includes('data-analytics-label="Create a skill"'));
assert(peopleHtml.includes('data-analytics-label="My skills"'));
assert(peopleHtml.includes('data-analytics-label="Account"'));
assert(!peopleHtml.includes('data-analytics-label="Go live"'));
assert(!peopleHtml.includes("Get to live"));

let billingActions: ReturnType<typeof useBillingRedirect> | undefined;
function BillingRequestHarness() {
  billingActions = useBillingRedirect();
  return null;
}
renderToStaticMarkup(createElement(BillingRequestHarness));
assert(billingActions);
const originalFetch = globalThis.fetch;
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
const billingLocation = { href: "" };
const billingRequests: Array<{ url: string; method: string | undefined; body: unknown }> = [];
let portalFallsBack = false;
Object.defineProperty(globalThis, "window", { configurable: true, value: { location: billingLocation } });
globalThis.fetch = Object.assign(mock(async (input: string | URL | Request, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  billingRequests.push({ url, method: init?.method, body: init?.body });
  return Response.json(url === "/api/web/portal" && portalFallsBack
    ? { fallback: "checkout" }
    : { url: url === "/api/web/portal" ? "https://billing.example/portal" : "https://billing.example/checkout" });
}), { preconnect: originalFetch.preconnect });
try {
  await billingActions.startCheckout("studio");
  assert.deepEqual(billingRequests.pop(), { url: "/api/web/checkout", method: "POST", body: '{"plan":"studio"}' });
  assert.equal(billingLocation.href, "https://billing.example/checkout");
  await billingActions.openPortal();
  assert.deepEqual(billingRequests.pop(), { url: "/api/web/portal", method: "POST", body: undefined });
  assert.equal(billingLocation.href, "https://billing.example/portal");
  portalFallsBack = true;
  await billingActions.openPortal();
  assert.deepEqual(billingRequests, [
    { url: "/api/web/portal", method: "POST", body: undefined },
    { url: "/api/web/checkout", method: "POST", body: '{"plan":"starter"}' },
  ]);
  assert.equal(billingLocation.href, "https://billing.example/checkout");
} finally {
  globalThis.fetch = originalFetch;
  if (originalWindowDescriptor) Object.defineProperty(globalThis, "window", originalWindowDescriptor);
  else Reflect.deleteProperty(globalThis, "window");
}

console.log("Go live, Home, Guide, Usage, and builder/People navigation rendered successfully.");
