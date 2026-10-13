import type { ReactNode } from "react";

/**
 * Phase 7 (UI): a generated banner for a destination — a deterministic
 * dark gradient chosen from the destination's name, with an optional
 * overlay slot for text.
 *
 * This is deliberately NOT a photo and does not pretend to be one. Trips
 * have no image field, and adding one (e.g. user-uploaded photos stored
 * in IndexedDB) is a schema change that needs owner approval (spec §9).
 * Until then every trip still gets a distinct, consistent banner: the
 * same destination always maps to the same gradient.
 */

const PALETTES: ReadonlyArray<readonly [string, string]> = [
  ["#1F3A5F", "#2E6E8E"], // ocean
  ["#2B2F4F", "#52467A"], // dusk
  ["#1D4044", "#2F7468"], // jade
  ["#4A3B2A", "#8A683F"], // amber earth
  ["#2A3B55", "#62789C"], // mist
  ["#3A2A3F", "#76506A"], // plum
];

/** djb2 string hash → stable non-negative integer. */
function hash(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function paletteIndexFor(destination: string, country: string): number {
  return hash(`${destination.trim().toLowerCase()}|${country.trim().toLowerCase()}`) % PALETTES.length;
}

export function DestinationBanner({
  destination,
  country,
  className = "",
  children,
}: {
  destination: string;
  country: string;
  className?: string;
  children?: ReactNode;
}) {
  const [from, to] = PALETTES[paletteIndexFor(destination, country)];
  return (
    <div
      className={["relative overflow-hidden", className].join(" ")}
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
      aria-hidden={children ? undefined : true}
    >
      {/* soft highlight + bottom fade so overlaid text stays legible */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 85% 15%, rgba(213,182,123,0.22), transparent 55%), linear-gradient(to top, rgba(16,27,43,0.65), transparent 70%)",
        }}
      />
      {children && <div className="relative h-full">{children}</div>}
    </div>
  );
}
