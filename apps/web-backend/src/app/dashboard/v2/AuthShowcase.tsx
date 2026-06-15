"use client";

import { useEffect, useState } from "react";
import { CursorGlyph } from "./LogoMark";

/*
 * Auth showcase — the right-side panel of the login/signup split-screen.
 * Auto-rotates through a set of value props / quotes with a slow cross-fade,
 * so the half-screen earns its space instead of showing static filler.
 *
 * a11y / motion: respects prefers-reduced-motion (pauses auto-rotation and
 * drops the fade). Pure presentation — no forms, no provider state.
 */
export interface ShowcaseSlide {
  /** Short punchy headline. */
  headline: string;
  /** One supporting sentence (max ~20 words). */
  body: string;
  /** Optional small attribution line (e.g. a role or a stat). */
  attribution?: string;
}

const ROTATION_MS = 5500;

export function AuthShowcase({ slides }: { slides: ShowcaseSlide[] }) {
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
    <aside className="relative hidden min-h-[520px] items-center justify-center overflow-hidden rounded-[24px] border border-line bg-[radial-gradient(circle_at_50%_20%,rgba(245,158,11,0.16),transparent_26rem),rgba(255,255,255,0.035)] p-8 lg:flex">
      {/* Ambient cursor watermark */}
      <div className="pointer-events-none absolute -right-10 top-10 opacity-[0.07]">
        <CursorGlyph size={220} />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* The slide content cross-fades unless reduced-motion is set. */}
        <div
          key={index}
          className={reducedMotion ? "" : "animate-[authFade_0.6s_ease-out]"}
        >
          {/* Cursor lead-in */}
          <div className="mb-5 flex justify-center">
            <CursorGlyph size={56} />
          </div>

          <h2 className="text-center text-[26px] font-bold leading-tight tracking-[-0.03em] text-gray-100">
            {active.headline}
          </h2>
          <p className="mx-auto mt-3 max-w-xs text-center text-sm leading-relaxed text-muted">
            {active.body}
          </p>
          {active.attribution && (
            <p className="mt-4 text-center text-xs font-bold uppercase tracking-wide text-amber-300/80">
              {active.attribution}
            </p>
          )}
        </div>

        {/* Rotation dots (only when more than one slide + motion allowed) */}
        {slides.length > 1 && !reducedMotion && (
          <div className="mt-8 flex justify-center gap-1.5">
            {slides.map((_slide, slideIndex) => (
              <button
                key={slideIndex}
                type="button"
                aria-label={`Show highlight ${slideIndex + 1}`}
                aria-pressed={slideIndex === index}
                onClick={() => setIndex(slideIndex)}
                className={`h-1.5 rounded-full transition-all ${
                  slideIndex === index ? "w-6 bg-amber-400" : "w-1.5 bg-white/20 hover:bg-white/40"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Keyframes for the cross-fade (scoped, no global pollution). */}
      <style>{`
        @keyframes authFade {
          from { opacity: 0.4; transform: translateY(6px); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
    </aside>
  );
}
