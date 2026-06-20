"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

interface DashboardWidgetTestProps {
  skillId: string;
  accentColor: string;
  launcherLabel: string | null;
}

const SDK_SCRIPT_URL = "https://cdn.tryskilly.app/web/v1.js";
const CORE_URL = "https://cdn.tryskilly.app/web/v1.0.0/skilly_core_web_sdk.js";
const DASHBOARD_TEST_KEY = "pk_dashboard_session_test";

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

export function DashboardWidgetTest({ skillId, accentColor, launcherLabel }: DashboardWidgetTestProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "active" | "error">("loading");
  const [message, setMessage] = useState("Loading the web widget...");
  const [mode, setMode] = useState<"loading" | "live" | "fallback">("loading");
  const [fallbackPointing, setFallbackPointing] = useState(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const label = useMemo(() => launcherLabel || "Click to test Skilly", [launcherLabel]);

  useEffect(() => {
    let disposed = false;
    const unsubscribers: Array<() => void> = [];

    async function mountWidget() {
      try {
        await loadWidgetScript();
        if (disposed || !window.Skilly) {
          return;
        }
        window.Skilly.destroy?.();
        window.Skilly.init({
          key: DASHBOARD_TEST_KEY,
          skill: skillId,
          backendUrl: "/api/dashboard/test-widget",
          coreUrl: CORE_URL,
          accentColor,
          launcherLabel: label,
        });
        setMode("live");
        unsubscribers.push(
          window.Skilly.on?.("turn", () => {
            setStatus("active");
            setMessage("Widget session started. Allow microphone access if the browser asks.");
          }) ?? (() => {}),
        );
        unsubscribers.push(
          window.Skilly.on?.("complete", () => {
            setStatus("ready");
            setMessage("Test completed. Start another one or use the floating launcher.");
          }) ?? (() => {}),
        );
        unsubscribers.push(
          window.Skilly.on?.("error", (payload) => {
            const detail =
              payload && typeof payload === "object" && "message" in payload
                ? String((payload as { message?: unknown }).message)
                : "The widget could not start.";
            setStatus("error");
            setMessage(detail);
          }) ?? (() => {}),
        );
        setStatus("ready");
        setMessage("Ready. Use the button below or the floating Skilly launcher in the bottom-right corner.");
      } catch (error) {
        setMode("fallback");
        setStatus("ready");
        setMessage(
          error instanceof Error
            ? `${error.message}. Fallback preview is available below.`
            : "Fallback preview is available below.",
        );
      }
    }

    void mountWidget();

    return () => {
      disposed = true;
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      window.Skilly?.destroy?.();
    };
  }, [accentColor, label, skillId]);

  function startTest() {
    if (mode === "live" && window.Skilly) {
      window.Skilly.start("Guide me through this dashboard test area and point at the primary action.");
      return;
    }

    setStatus("active");
    setMessage("Fallback preview: Skilly is pointing at the primary action on this test surface.");
    setFallbackPointing(true);
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
    }
    fallbackTimerRef.current = setTimeout(() => {
      setStatus("ready");
      setMessage("Fallback preview completed. The production widget uses the same annotated elements.");
      setFallbackPointing(false);
      fallbackTimerRef.current = null;
    }, 2600);
  }

  const pillTone = status === "error" ? "red" : status === "active" ? "amber" : status === "ready" ? "green" : "neutral";

  return (
    <div className="relative min-h-[460px] overflow-hidden rounded-[16px] border border-line bg-[#f7f4ec] p-5 text-gray-950">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#e2ded4] pb-3">
        <div>
          <div className="text-sm font-semibold">Studio widget test surface</div>
          <p className="mt-1 max-w-xl text-sm text-neutral-600">
            This mounts the real web widget against your current Studio tenant and skill.
          </p>
        </div>
        <StatusPill tone={pillTone} label={status} showDot />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="rounded-[12px] border border-[#e2ded4] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
          <h3 className="text-lg font-bold" data-skilly="dashboard-test-heading">
            Project setup
          </h3>
          <p className="mt-2 text-sm text-neutral-600">
            Ask Skilly to explain this area. The test page includes annotated elements so pointer movement can be
            verified before the widget goes onto a customer site.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              data-skilly="dashboard-test-primary"
              className="rounded-[8px] bg-neutral-950 px-3 py-2 text-sm font-semibold text-white"
            >
              Create project
            </button>
            <button
              type="button"
              data-skilly="dashboard-test-secondary"
              className="rounded-[8px] border border-[#d7d0c3] px-3 py-2 text-sm font-semibold text-neutral-900"
            >
              Import site
            </button>
          </div>
        </section>

        <aside className="rounded-[12px] border border-[#e2ded4] bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold" data-skilly="dashboard-test-settings">
            <span className="grid h-8 w-8 place-items-center rounded-full" style={{ backgroundColor: accentColor }}>
              <CursorGlyph size={18} />
            </span>
            Widget controls
          </div>
          <p className="mt-3 text-sm text-neutral-600">{message}</p>
          <Button className="mt-4 w-full justify-center" type="button" onClick={startTest} disabled={status === "loading"}>
            Start test widget
          </Button>
        </aside>
      </div>

      {mode === "fallback" && (
        <button
          type="button"
          aria-label={label}
          onClick={startTest}
          className="absolute bottom-5 right-5 grid h-14 w-14 place-items-center rounded-full text-gray-950 shadow-[0_16px_34px_rgba(0,0,0,0.22)]"
          style={{ backgroundColor: accentColor }}
        >
          <CursorGlyph size={28} />
        </button>
      )}

      {fallbackPointing && (
        <>
          <div className="absolute bottom-[92px] right-5 w-72 rounded-[14px] border border-neutral-900/10 bg-neutral-950 p-4 text-sm text-white shadow-[0_18px_55px_rgba(0,0,0,0.28)]">
            Start with Create project. That is the primary action for this flow.
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
