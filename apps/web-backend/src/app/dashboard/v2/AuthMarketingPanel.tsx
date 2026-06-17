"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CursorGlyph } from "./LogoMark";

/*
 * Auth marketing panel — the LEFT-side panel of the login/signup split-screen.
 *
 * A rotating slideshow that earns the half-screen. Each slide is a rich marketing
 * beat (eyebrow → big 2-line headline with an amber-highlighted word → supporting
 * body → a content block) rather than a flat quote. Two slide "kinds" are supported:
 *
 *   - "features": a 2x2 feature grid with Lucide icons (used on login).
 *   - "steps":    a numbered onboarding journey preview (used on signup).
 *
 * Auto-rotates with a slow cross-fade, respects prefers-reduced-motion (pauses
 * auto-rotation + drops the fade), and lets users jump slides via clickable dots.
 * Pure presentation — no forms, no provider state.
 *
 * Layout note: this panel is designed to sit on the LEFT of the split-screen,
 * with the auth form on the RIGHT.
 */

export interface AuthFeatureSlide {
  kind: "features";
  /** Small uppercase label above the headline (e.g. "The in-product tutor"). */
  eyebrow: string;
  /** Two-line headline. Use `{highlight: "word"}` to amber-highlight a word. */
  headline: [string, ReactNode];
  /** One supporting sentence (max ~22 words). */
  body: string;
  /** Up to 4 feature tiles with a Lucide icon + short label + one-line description. */
  features: Array<{ icon: LucideIcon; label: string; description: string }>;
}

export interface AuthStepsSlide {
  kind: "steps";
  eyebrow: string;
  /** Two-line headline. Use `{highlight: "word"}` to amber-highlight a word. */
  headline: [string, ReactNode];
  body: string;
  /** Ordered onboarding journey steps (numbered automatically). */
  steps: Array<{ label: string; description: string }>;
}

export type AuthSlide = AuthFeatureSlide | AuthStepsSlide;

const ROTATION_MS = 6500;

export function AuthMarketingPanel({ slides }: { slides: AuthSlide[] }) {
  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);
    const handleChange = () => setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (reducedMotion || slides.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, ROTATION_MS);
    return () => clearInterval(timer);
  }, [reducedMotion, slides.length]);

  const active = slides[index] ?? slides[0]!;

  return (
    <aside className="relative hidden min-h-[560px] items-stretch overflow-hidden rounded-[24px] border border-line bg-[radial-gradient(circle_at_28%_12%,rgba(245,158,11,0.18),transparent_30rem),radial-gradient(circle_at_88%_96%,rgba(255,255,255,0.05),transparent_26rem),rgba(255,255,255,0.035)] p-8 lg:flex lg:flex-col lg:justify-between">
      {/* Ambient cursor watermark, top-right. */}
      <div className="pointer-events-none absolute -right-12 -top-6 opacity-[0.06]">
        <CursorGlyph size={240} />
      </div>

      {/* Top: brand + eyebrow.
          The logo anchors the panel as a branded surface, not an ad slot. */}
      <header className="relative z-10 flex items-center gap-2.5">
        <CursorGlyph size={34} />
        <span className="text-sm font-bold uppercase tracking-[0.18em] text-amber-300/85">
          Skilly
        </span>
      </header>

      {/* Middle: the slide content. Cross-fades unless reduced-motion is set. */}
      <div className="relative z-10 w-full max-w-md">
        <div
          key={index}
          className={reducedMotion ? "" : "animate-[authFade_0.6s_ease-out]"}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300/75">
            {active.eyebrow}
          </p>

          <h2 className="mt-3 text-[30px] font-bold leading-[1.12] tracking-[-0.032em] text-gray-100">
            <span className="block">{active.headline[0]}</span>
            <span className="block">{active.headline[1]}</span>
          </h2>

          <p className="mt-3.5 max-w-sm text-[15px] leading-relaxed text-gray-400">
            {active.body}
          </p>

          {/* Slide-kind-specific content block. */}
          <div className="mt-6">
            {active.kind === "features" ? (
              <FeatureGrid features={active.features} />
            ) : (
              <StepList steps={active.steps} />
            )}
          </div>
        </div>
      </div>

      {/* Bottom: rotation dots + a quiet stat line. */}
      <footer className="relative z-10 flex items-center justify-between">
        {slides.length > 1 ? (
          <div className="flex items-center gap-1.5">
            {slides.map((_slide, slideIndex) => (
              <button
                key={slideIndex}
                type="button"
                aria-label={`Show highlight ${slideIndex + 1}`}
                aria-pressed={slideIndex === index}
                onClick={() => setIndex(slideIndex)}
                className={`h-1.5 rounded-full transition-all ${
                  slideIndex === index
                    ? "w-6 bg-amber-400"
                    : "w-1.5 bg-white/20 hover:bg-white/40"
                }`}
              />
            ))}
          </div>
        ) : (
          <span />
        )}

        <span className="text-xs font-medium text-gray-500">
          {index + 1} / {slides.length}
        </span>
      </footer>

      {/* Keyframes for the cross-fade (scoped, no global pollution). */}
      <style>{`
        @keyframes authFade {
          from { opacity: 0.35; transform: translateY(6px); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
    </aside>
  );
}

/*
 * Feature grid: 2x2 tiles, each with a Lucide icon in an amber-tinted chip, a
 * bold short label, and a one-line description. Reads as "what you get".
 */
function FeatureGrid({
  features,
}: {
  features: Array<{ icon: LucideIcon; label: string; description: string }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {features.map((feature) => {
        const Icon = feature.icon;
        return (
          <div
            key={feature.label}
            className="rounded-[12px] border border-line bg-white/[0.035] p-3.5 transition hover:border-amber-400/30 hover:bg-white/[0.05]"
          >
            <div className="mb-2 grid size-8 place-items-center rounded-[8px] border border-amber-400/20 bg-amber-500/12 text-amber-300">
              <Icon className="size-4" />
            </div>
            <p className="text-[13px] font-bold text-gray-100">{feature.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              {feature.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/*
 * Step list: a numbered onboarding journey preview. Each step has an amber
 * number badge, a bold label, and a one-line description. A vertical connector
 * reads as a timeline — "do this, then this, then live".
 */
function StepList({
  steps,
}: {
  steps: Array<{ label: string; description: string }>;
}) {
  return (
    <ol className="grid gap-2.5">
      {steps.map((step, stepIndex) => (
        <li key={step.label} className="flex items-start gap-3">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-amber-400/30 bg-amber-500/15 text-xs font-bold text-amber-200">
            {stepIndex + 1}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-gray-100">{step.label}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-400">
              {step.description}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
