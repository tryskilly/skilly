import { CursorGlyph } from "./v2";

/**
 * Segment loading state for /dashboard/**. Shown while server components fetch
 * (repo reads) instead of a blank screen (spec §11 #13). Kept minimal — just
 * the cursor + a quiet shimmer so the shell feels alive.
 */
export default function DashboardLoading() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="animate-pulse">
          <CursorGlyph size={40} />
        </div>
        <span className="text-sm text-gray-400">Loading…</span>
      </div>
    </div>
  );
}
