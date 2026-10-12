import { describe, expect, test } from "bun:test";
import { buildFrameworkSnippets } from "../src/app/dashboard/go-live/frameworkSnippets";

describe("Go live framework snippets", () => {
  test("fills the stored publishable key and widget settings into every framework", () => {
    const snippets = buildFrameworkSnippets({
      publishableKey: "pk_live_builders_stored_key",
      skillId: "product-guide",
      widgetConfig: { accentColor: "var(--skilly-accent)", locale: "en", launcherLabel: "Ask Skilly" },
    });

    for (const snippet of Object.values(snippets)) {
      expect(snippet).toContain("pk_live_builders_stored_key");
      expect(snippet).not.toContain("pk_live_your_key");
      expect(snippet).toContain("https://cdn.tryskilly.app/web/v1.js");
      expect(snippet).not.toContain("data-skilly-backend-url");
      expect(snippet).not.toContain("data-skilly-core-url");
      for (const attribute of ["data-skilly-key", "data-skilly-skill", "data-skilly-accent", "data-skilly-locale", "data-skilly-launcher"]) {
        expect(snippet).toContain(attribute);
      }
    }
    expect(snippets.html).toContain('data-skilly-key="pk_live_builders_stored_key"');
    expect(snippets.react).toContain('"data-skilly-key": "pk_live_builders_stored_key"');
    expect(snippets.nextjs).toContain('data-skilly-key={"pk_live_builders_stored_key"}');
    expect(snippets.react).toContain("document.body.appendChild(script)");
    expect(snippets.react).toContain("return () => script.remove()");
    expect(snippets.nextjs).toContain('import Script from "next/script"');
    expect(snippets.nextjs).toContain('strategy="afterInteractive"');
  });

  test("escapes launcher copy in HTML and emits valid JSX for React and Next.js", () => {
    const snippets = buildFrameworkSnippets({
      publishableKey: "pk_live_safe",
      skillId: "product-guide",
      widgetConfig: { accentColor: "var(--skilly-accent)", locale: "en", launcherLabel: 'Ask "Skilly" <help> & tips' },
    });
    expect(snippets.html).toContain('data-skilly-launcher="Ask &quot;Skilly&quot; &lt;help&gt; &amp; tips"');
    expect(snippets.react).toContain('"data-skilly-launcher": "Ask \\"Skilly\\" <help> & tips"');
    expect(snippets.nextjs).toContain('data-skilly-launcher={"Ask \\"Skilly\\" <help> & tips"}');
    const transpiler = new Bun.Transpiler({ loader: "tsx" });
    expect(() => transpiler.transformSync(snippets.react)).not.toThrow();
    expect(() => transpiler.transformSync(snippets.nextjs)).not.toThrow();
  });
});
