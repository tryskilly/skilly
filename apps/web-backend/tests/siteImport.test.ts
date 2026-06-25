import { describe, expect, test } from "bun:test";
import { assertImportableUrl, extractSiteImportPreview } from "../src/domain/siteImport";

describe("site import", () => {
  test("extracts representative content from an HTML page", () => {
    const preview = extractSiteImportPreview(
      "acme.com",
      "https://acme.com/product",
      `
        <html>
          <head>
            <title>Acme Analytics</title>
            <meta name="description" content="Operational analytics for support teams.">
          </head>
          <body>
            <nav><a href="/features">Features</a><a href="/pricing">Pricing</a></nav>
            <h1>Understand every support conversation</h1>
            <h2>How does onboarding work?</h2>
            <a href="/demo">Book a demo</a>
            <button>Start free trial</button>
            <script>window.secret = true</script>
          </body>
        </html>
      `,
    );

    expect(preview.host).toBe("acme.com");
    expect(preview.title).toBe("Acme Analytics");
    expect(preview.description).toBe("Operational analytics for support teams.");
    expect(preview.headings).toContain("Understand every support conversation");
    expect(preview.navigation).toContain("Pricing");
    expect(preview.callsToAction).toContain("Book a demo");
    expect(preview.callsToAction).toContain("Start free trial");
    expect(preview.questions).toContain("How does onboarding work?");
    expect(preview.bodySummary).not.toContain("window.secret");
  });

  test("reads title metadata regardless of attribute order", () => {
    const preview = extractSiteImportPreview(
      "https://acme.com",
      "https://acme.com",
      `
        <meta content="Ship faster with Acme" property="og:title">
        <meta content="A product operating system for modern teams." name="description">
      `,
    );

    expect(preview.title).toBe("Ship faster with Acme");
    expect(preview.description).toBe("A product operating system for modern teams.");
  });

  test("rejects private network targets before fetching", async () => {
    await expect(assertImportableUrl("http://127.0.0.1:3000")).rejects.toThrow("Private network");
    await expect(assertImportableUrl("http://localhost:3000")).rejects.toThrow("cannot be imported");
    await expect(assertImportableUrl("https://example.com", async () => ["10.0.0.5"])).rejects.toThrow(
      "private network",
    );
  });

  test("normalizes plain public domains", async () => {
    const url = await assertImportableUrl("example.com/docs", async () => ["93.184.216.34"]);
    expect(url.toString()).toBe("https://example.com/docs");
  });
});
