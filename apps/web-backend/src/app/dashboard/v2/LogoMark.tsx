import Image from "next/image";

/*
 * Skilly brand marks. The REAL shipped assets live in /public/brand/
 * (skilly-app-icon.png, skilly-cursor.png) — these are the source of truth,
 * used by the existing SkillyMark and widget preview. The designer's prototype
 * cursor SVG was a visual reference only; we do NOT swap it in.
 */

/**
 * App-icon mark in an amber-glow rounded frame. Used in the sidebar brand
 * block, login split-screen, and onboarding shell. Matches the existing
 * SkillyMark styling so the brand reads identically across v1/v2 surfaces.
 */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-[10px] border border-amber-300/20 bg-gray-950 shadow-[0_0_28px_rgba(245,158,11,0.16)]"
      style={{ width: size, height: size }}
    >
      <Image
        src="/brand/skilly-app-icon.png"
        alt="Skilly"
        width={size}
        height={size}
        className="h-full w-full object-cover"
        priority={size > 32}
      />
    </span>
  );
}

/**
 * The amber cursor — the product signature (design-system §5: the cursor IS
 * the mascot). Uses the real /brand/skilly-cursor.png with its native glow.
 * Used in widget previews and empty states.
 */
export function CursorGlyph({
  size = 42,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/brand/skilly-cursor.png"
      alt=""
      width={size}
      height={size}
      className={`drop-shadow-[0_0_12px_rgba(252,211,77,0.32)] ${className ?? ""}`}
    />
  );
}
