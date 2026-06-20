"use client";

import { useEffect, useRef, useState } from "react";
import { Button, CursorGlyph, StatusPill } from "../v2";

type SkillyEventName = "turn" | "complete" | "error" | "point";

interface SkillyWindowApi {
  init(config: {
    key: string;
    skill: string;
    backendUrl: string;
    coreUrl: string;
    accentColor: string;
    launcherLabel?: string;
  }): void;
  start(goal?: string): void;
  destroy(): void;
  on?(event: SkillyEventName, handler: (payload: unknown) => void): () => void;
}

declare global {
  interface Window {
    Skilly?: SkillyWindowApi;
  }
}

interface StudioAssistantPreviewProps {
  accentColor: string;
}

const SDK_SCRIPT_URL = "https://cdn.tryskilly.app/web/v1.js";
const CORE_URL = "https://cdn.tryskilly.app/web/v1.0.0/skilly_core_web_sdk.js";
const DASHBOARD_TEST_KEY = "pk_dashboard_session_test";
const STUDIO_GUIDE_SKILL_ID = "studio-guide";

function loadWidgetScript(): Promise<void> {
  if (window.Skilly) {
    return Promise.resolve();
  }

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SCRIPT_URL}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Widget script failed to load")), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Widget script failed to load"));
    document.head.appendChild(script);
  });
}

export function StudioAssistantPreview({ accentColor }: StudioAssistantPreviewProps) {
  const [status, setStatus] = useState<"ready" | "loading" | "active" | "error">("ready");
  const [message, setMessage] = useState("Use this guide when you want help inside Studio.");
  const [mode, setMode] = useState<"idle" | "live" | "fallback">("idle");
  const [fallbackPointing, setFallbackPointing] = useState(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubscribersRef = useRef<Array<() => void>>([]);
  const label = "Ask Studio Assistant";

  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }
      unsubscribersRef.current.forEach((unsubscribe) => unsubscribe());
      unsubscribersRef.current = [];
      window.Skilly?.destroy?.();
    };
  }, []);

  async function startStudioGuide() {
    setStatus("loading");
    setMessage("Starting the Studio assistant...");

    try {
      await loadWidgetScript();
      if (!window.Skilly) {
        throw new Error("Studio assistant could not load");
      }

      window.Skilly.destroy?.();
      unsubscribersRef.current.forEach((unsubscribe) => unsubscribe());
      unsubscribersRef.current = [];
      window.Skilly.init({
        key: DASHBOARD_TEST_KEY,
        skill: STUDIO_GUIDE_SKILL_ID,
        backendUrl: "/api/dashboard/test-widget",
        coreUrl: CORE_URL,
        accentColor,
        launcherLabel: label,
      });
      unsubscribersRef.current.push(
        window.Skilly.on?.("turn", () => {
          setStatus("active");
          setMessage("Studio guide started. Allow microphone access if the browser asks.");
        }) ?? (() => {}),
      );
      unsubscribersRef.current.push(
        window.Skilly.on?.("complete", () => {
          setStatus("ready");
          setMessage("Studio guide completed. Start it again when you need setup help.");
        }) ?? (() => {}),
      );
      unsubscribersRef.current.push(
        window.Skilly.on?.("error", (payload) => {
          const detail =
            payload && typeof payload === "object" && "message" in payload
              ? String((payload as { message?: unknown }).message)
              : "The Studio assistant could not start.";
          setStatus("error");
          setMessage(detail);
        }) ?? (() => {}),
      );
      setMode("live");
      window.Skilly.start("Help me finish setting up Skilly Studio and point at the next setup action.");
    } catch {
      startFallbackGuide();
    }
  }

  function startFallbackGuide() {
    setMode("fallback");
    setStatus("active");
    setMessage("Fallback preview: the Studio assistant is pointing at the setup action.");
    setFallbackPointing(true);
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
    }
    fallbackTimerRef.current = setTimeout(() => {
      setStatus("ready");
      setMessage("Fallback preview completed. The live Studio assistant uses this same setup surface.");
      setFallbackPointing(false);
      fallbackTimerRef.current = null;
    }, 2600);
  }

  const pillTone = status === "error" ? "red" : status === "active" ? "amber" : status === "ready" ? "green" : "neutral";

  return (
    <div className="relative min-h-[460px] overflow-hidden rounded-[16px] border border-line bg-[#f7f4ec] p-5 text-gray-950">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#e2ded4] pb-3">
        <div>
          <div className="text-sm font-semibold">Studio assistant surface</div>
          <p className="mt-1 max-w-xl text-sm text-neutral-600">
            This is Skilly's internal guide for helping admins finish setup inside Studio.
          </p>
        </div>
        <StatusPill tone={pillTone} label={status} showDot />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="rounded-[12px] border border-[#e2ded4] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
          <h3 className="text-lg font-bold" data-skilly="dashboard-test-heading">
            Studio setup
          </h3>
          <p className="mt-2 text-sm text-neutral-600">
            Ask the Studio assistant what to do next. This guide should explain Studio controls, not act like the
            customer's public website assistant.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              data-skilly="dashboard-test-primary"
              className="rounded-[8px] bg-neutral-950 px-3 py-2 text-sm font-semibold text-white"
              onClick={() => document.getElementById("customer-website-preview")?.scrollIntoView({ behavior: "smooth" })}
            >
              Preview customer site
            </button>
            <a
              href="/dashboard/skill"
              data-skilly="dashboard-test-secondary"
              className="rounded-[8px] border border-[#d7d0c3] px-3 py-2 text-sm font-semibold text-neutral-900"
            >
              Edit teaching skill
            </a>
          </div>
        </section>

        <aside className="rounded-[12px] border border-[#e2ded4] bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold" data-skilly="dashboard-test-settings">
            <span className="grid h-8 w-8 place-items-center rounded-full" style={{ backgroundColor: accentColor }}>
              <CursorGlyph size={18} />
            </span>
            Studio assistant
          </div>
          <p className="mt-3 text-sm text-neutral-600">{message}</p>
          <Button
            className="mt-4 w-full justify-center"
            type="button"
            onClick={() => void startStudioGuide()}
            disabled={status === "loading"}
          >
            Start Studio guide
          </Button>
        </aside>
      </div>

      {mode === "fallback" && (
        <button
          type="button"
          aria-label={label}
          onClick={startFallbackGuide}
          className="absolute bottom-5 right-5 grid h-14 w-14 place-items-center rounded-full text-gray-950 shadow-[0_16px_34px_rgba(0,0,0,0.22)]"
          style={{ backgroundColor: accentColor }}
        >
          <CursorGlyph size={28} />
        </button>
      )}

      {fallbackPointing && (
        <>
          <div className="absolute bottom-[92px] right-5 w-72 rounded-[14px] border border-neutral-900/10 bg-neutral-950 p-4 text-sm text-white shadow-[0_18px_55px_rgba(0,0,0,0.28)]">
            Start by previewing the customer's site, then refine the public teaching skill.
          </div>
          <div
            aria-hidden="true"
            className="absolute left-[112px] top-[236px] -rotate-12 text-gray-950 drop-shadow-[0_12px_20px_rgba(0,0,0,0.24)]"
            style={{ color: accentColor }}
          >
            <CursorGlyph size={34} />
          </div>
        </>
      )}
    </div>
  );
}

interface CustomerWebsitePreviewProps {
  accentColor: string;
  skillId: string;
  launcherLabel: string | null;
}

function normalizePreviewUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return "https://example.com";
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function hostFromUrl(rawUrl: string): string {
  try {
    return new URL(normalizePreviewUrl(rawUrl)).host || "your website";
  } catch {
    return "your website";
  }
}

export function CustomerWebsitePreview({ accentColor, skillId, launcherLabel }: CustomerWebsitePreviewProps) {
  const [siteUrl, setSiteUrl] = useState("");
  const [context, setContext] = useState("");
  const [generated, setGenerated] = useState(false);
  const [pointing, setPointing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const host = hostFromUrl(siteUrl);
  const label = launcherLabel || "Ask Skilly";

  function runPreview() {
    setGenerated(true);
    setPointing(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setPointing(false);
      timerRef.current = null;
    }, 3000);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="rounded-[14px] border border-line-soft bg-white/[0.035] p-4">
        <label className="block text-sm font-bold text-gray-100" htmlFor="customer-preview-url">
          Website URL
        </label>
        <input
          id="customer-preview-url"
          type="text"
          inputMode="url"
          value={siteUrl}
          onChange={(event) => setSiteUrl(event.target.value)}
          placeholder="yourcompany.com or https://app.yourcompany.com"
          className="mt-2 h-10 w-full rounded-[10px] border border-line bg-black/20 px-3 text-sm text-gray-100 outline-none transition placeholder:text-gray-600 focus:border-amber-500/45"
        />
        <p className="mt-1.5 text-xs text-muted">
          Plain domains are fine. Studio will preview the flow without requiring the domain to be reachable yet.
        </p>

        <label className="mt-4 block text-sm font-bold text-gray-100" htmlFor="customer-preview-context">
          What should Skilly help users do?
        </label>
        <textarea
          id="customer-preview-context"
          value={context}
          onChange={(event) => setContext(event.target.value)}
          placeholder="Example: Help new users create their first project, connect billing, and invite a teammate."
          rows={5}
          className="mt-2 w-full resize-none rounded-[10px] border border-line bg-black/20 px-3 py-2 text-sm text-gray-100 outline-none transition placeholder:text-gray-600 focus:border-amber-500/45"
        />

        <Button className="mt-4 w-full justify-center" type="button" onClick={runPreview}>
          Generate preview
        </Button>

        <div className="mt-4 rounded-[12px] border border-line-soft bg-black/20 p-3 text-xs text-muted">
          Uses tenant skill <code className="font-mono text-gray-300">{skillId}</code>. Later this can be upgraded to
          crawl the URL and draft the skill automatically from the page plus attachments.
        </div>
      </div>

      <div className="relative min-h-[500px] overflow-hidden rounded-[16px] border border-line bg-[#f7f4ec] p-5 text-gray-950">
        <div className="mb-5 flex items-center justify-between border-b border-[#e2ded4] pb-3">
          <div>
            <strong>{generated ? host : "Your website preview"}</strong>
            <p className="mt-1 text-sm text-neutral-600">
              {generated ? "Simulated customer page with Skilly injected." : "Enter a URL and goal to generate a preview."}
            </p>
          </div>
          <span className="rounded-[8px] bg-neutral-950 px-3 py-2 text-sm font-semibold text-white">
            Start free
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <section className="rounded-[12px] border border-[#e2ded4] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">{generated ? host : "Preview"}</p>
            <h3 className="mt-2 text-2xl font-bold tracking-normal">
              {generated ? "Get started with the product" : "Customer onboarding flow"}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-neutral-600">
              {context.trim() ||
                "Skilly will use the customer's website, product notes, and teaching skill to guide visitors through the next action."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                data-skilly="customer-preview-primary"
                className="rounded-[8px] bg-neutral-950 px-3 py-2 text-sm font-semibold text-white"
              >
                Create first project
              </button>
              <button
                type="button"
                data-skilly="customer-preview-secondary"
                className="rounded-[8px] border border-[#d7d0c3] px-3 py-2 text-sm font-semibold text-neutral-900"
              >
                View docs
              </button>
            </div>
          </section>

          <aside className="rounded-[12px] border border-[#e2ded4] bg-white p-4">
            <div className="text-sm font-semibold">Detected guidance plan</div>
            <ol className="mt-3 space-y-2 text-sm text-neutral-600">
              <li>1. Explain the page goal.</li>
              <li>2. Point at the primary action.</li>
              <li>3. Offer the next setup step.</li>
            </ol>
          </aside>
        </div>

        <button
          type="button"
          aria-label={label}
          onClick={runPreview}
          className="absolute bottom-5 right-5 grid h-14 w-14 place-items-center rounded-full text-gray-950 shadow-[0_16px_34px_rgba(0,0,0,0.22)]"
          style={{ backgroundColor: accentColor }}
        >
          <CursorGlyph size={28} />
        </button>

        {pointing && (
          <>
            <div className="absolute bottom-[92px] right-5 w-80 rounded-[14px] border border-neutral-900/10 bg-neutral-950 p-4 text-sm text-white shadow-[0_18px_55px_rgba(0,0,0,0.28)]">
              On {host}, I would guide visitors to start here and explain why this is the next best action.
            </div>
            <div
              aria-hidden="true"
              className="absolute left-[112px] top-[286px] -rotate-12 text-gray-950 drop-shadow-[0_12px_20px_rgba(0,0,0,0.24)]"
              style={{ color: accentColor }}
            >
              <CursorGlyph size={34} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
