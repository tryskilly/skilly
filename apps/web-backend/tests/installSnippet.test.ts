import { describe, expect, test } from "bun:test";
import { buildInstallSnippet } from "../src/lib/installSnippet";

const snippetInput = { publishableKey: "pk_live_example_full_key_8327", skillId: "acme-product-guide" };
const widgetConfig = { accentColor: "var(--brand)", locale: "fr", launcherLabel: null };

describe("install snippet", () => {
  test("includes the supplied full key, skill, and optional appearance", () => {
    expect(buildInstallSnippet({ ...snippetInput, widgetConfig })).toBe(`<script src="https://cdn.tryskilly.app/web/v1.js"
        data-skilly-key="pk_live_example_full_key_8327"
        data-skilly-skill="acme-product-guide"
        data-skilly-accent="var(--brand)"
        data-skilly-locale="fr"
        defer></script>`);
  });

  test("includes the launcher attribute only when its label is set", () => {
    for (const launcherLabel of [null, ""]) {
      expect(buildInstallSnippet({ ...snippetInput, widgetConfig: { ...widgetConfig, launcherLabel } })).not.toContain("data-skilly-launcher");
    }
    expect(buildInstallSnippet({ ...snippetInput, widgetConfig: { ...widgetConfig, launcherLabel: "Ask Skilly" } })).toContain('data-skilly-launcher="Ask Skilly"');
    expect(buildInstallSnippet(snippetInput)).not.toContain("data-skilly-launcher");
  });

  test("escapes attribute values so a launcher label cannot break the script tag", () => {
    expect(buildInstallSnippet({
      publishableKey: 'key"&',
      skillId: "guide<product>",
      widgetConfig: { ...widgetConfig, launcherLabel: 'Ask "Skilly" & <learn>' },
    })).toContain('data-skilly-launcher="Ask &quot;Skilly&quot; &amp; &lt;learn&gt;"');
    const snippet = buildInstallSnippet({ publishableKey: 'key"&', skillId: "guide<product>" });
    expect(snippet).toContain('data-skilly-key="key&quot;&amp;"');
    expect(snippet).toContain('data-skilly-skill="guide&lt;product&gt;"');
  });

  test("preserves the short onboarding snippet when appearance is omitted", () => {
    expect(buildInstallSnippet(snippetInput)).toBe(`<script src="https://cdn.tryskilly.app/web/v1.js"
        data-skilly-key="pk_live_example_full_key_8327"
        data-skilly-skill="acme-product-guide"
        defer></script>`);
  });
});
