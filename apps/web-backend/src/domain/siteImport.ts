import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface SiteImportPreview {
  url: string;
  finalUrl: string;
  host: string;
  title: string;
  description: string;
  headings: string[];
  navigation: string[];
  callsToAction: string[];
  questions: string[];
  bodySummary: string;
}

export type ResolveHost = (host: string) => Promise<string[]>;

const MAX_HTML_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 8_000;

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal"]);

function normalizeUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  url.hash = "";
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs can be imported.");
  }
  if (!url.hostname || BLOCKED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("That host cannot be imported.");
  }
  if (url.username || url.password) {
    throw new Error("URLs with credentials cannot be imported.");
  }
  return url;
}

function isPrivateIp(value: string): boolean {
  if (value === "::1" || value === "0:0:0:0:0:0:0:1") {
    return true;
  }

  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:")) {
    return true;
  }

  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export async function defaultResolveHost(host: string): Promise<string[]> {
  const records = await lookup(host, { all: true, verbatim: false });
  return records.map((record) => record.address);
}

export async function assertImportableUrl(rawUrl: string, resolveHost: ResolveHost = defaultResolveHost): Promise<URL> {
  const url = normalizeUrl(rawUrl);
  const host = url.hostname.toLowerCase();

  if (isIP(host)) {
    if (isPrivateIp(host)) {
      throw new Error("Private network URLs cannot be imported.");
    }
    return url;
  }

  const addresses = await resolveHost(host);
  if (!addresses.length || addresses.some((address) => isPrivateIp(address))) {
    throw new Error("That host resolves to a private network.");
  }

  return url;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function compactText(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = compactText(value);
    const key = normalized.toLowerCase();
    if (!normalized || normalized.length < 2 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized.slice(0, 140));
    if (output.length >= limit) {
      break;
    }
  }
  return output;
}

function matchAll(html: string, pattern: RegExp, group = 1): string[] {
  const globalPattern = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  return Array.from(html.matchAll(globalPattern), (match) => match[group] ?? "");
}

function tagAttribute(tag: string, attribute: string): string {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escaped}=["']([^"']*)["']`, "i"));
  return compactText(match?.[1] ?? "");
}

function metaContent(html: string, name: string): string {
  const normalizedName = name.toLowerCase();
  for (const tag of matchAll(html, /<meta\b[^>]*>/gi, 0)) {
    const tagName = tagAttribute(tag, "name").toLowerCase();
    const propertyName = tagAttribute(tag, "property").toLowerCase();
    if (tagName === normalizedName || propertyName === normalizedName) {
      return tagAttribute(tag, "content");
    }
  }
  return "";
}

function stripNoise(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ");
}

export function extractSiteImportPreview(rawUrl: string, finalUrl: string, html: string): SiteImportPreview {
  const cleanHtml = stripNoise(html);
  const title = compactText(matchAll(cleanHtml, /<title\b[^>]*>([\s\S]*?)<\/title>/i)[0] ?? "");
  const socialTitle = metaContent(cleanHtml, "og:title") || metaContent(cleanHtml, "twitter:title");
  const description = metaContent(cleanHtml, "description") || metaContent(cleanHtml, "og:description");
  const headings = unique(matchAll(cleanHtml, /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi), 10);
  const navigation = unique(matchAll(cleanHtml, /<a\b[^>]*>([\s\S]*?)<\/a>/gi), 8);
  const interactiveLabels = [
    ...matchAll(cleanHtml, /<button\b[^>]*>([\s\S]*?)<\/button>/gi),
    ...matchAll(cleanHtml, /<a\b[^>]*>([\s\S]*?)<\/a>/gi),
  ];
  const callsToAction = unique(
    interactiveLabels.filter((label) =>
      /\b(start|get|try|book|contact|demo|sign|join|create|buy|subscribe|learn|download|request)\b/i.test(label),
    ),
    6,
  );
  const questions = unique(
    [
      ...matchAll(cleanHtml, /<h[2-4]\b[^>]*>([\s\S]*?\?)<\/h[2-4]>/gi),
      ...matchAll(cleanHtml, /<summary\b[^>]*>([\s\S]*?\?)<\/summary>/gi),
    ],
    6,
  );
  const bodySummary = compactText(cleanHtml).slice(0, 420);
  const parsedFinalUrl = normalizeUrl(finalUrl);

  return {
    url: normalizeUrl(rawUrl).toString(),
    finalUrl: parsedFinalUrl.toString(),
    host: parsedFinalUrl.host,
    title: title || socialTitle || headings[0] || parsedFinalUrl.host,
    description,
    headings,
    navigation,
    callsToAction,
    questions,
    bodySummary,
  };
}

async function fetchTextWithLimit(response: Response): Promise<string> {
  const body = response.body;
  if (!body) {
    return "";
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    total += value.byteLength;
    if (total > MAX_HTML_BYTES) {
      chunks.push(value.slice(0, Math.max(0, value.byteLength - (total - MAX_HTML_BYTES))));
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function fetchSiteImportPreview(rawUrl: string): Promise<SiteImportPreview> {
  let currentUrl = await assertImportableUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.1",
        "user-agent": "SkillyStudioPreview/1.0 (+https://tryskilly.app)",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("The site redirected without a destination.");
      }
      currentUrl = await assertImportableUrl(new URL(location, currentUrl).toString());
      continue;
    }

    if (!response.ok) {
      throw new Error(`The site returned HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
      throw new Error("The URL did not return an HTML page.");
    }

    const html = await fetchTextWithLimit(response);
    return extractSiteImportPreview(rawUrl, currentUrl.toString(), html);
  }

  throw new Error("The site redirected too many times.");
}
