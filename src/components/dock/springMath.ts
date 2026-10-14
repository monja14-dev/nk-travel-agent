/**
 * Pure math for the dock-style magnification: how big an icon should be
 * given how far the pointer is from it, and a damped-spring step that moves
 * the displayed size toward that target. No DOM, no React — see
 * magnifyEngine.ts for the part that applies it to elements.
 *
 * Why this is in-house instead of Motion / Framer Motion: the whole effect
 * is one number (a scale) per icon on at most ~12 icons. A spring step is a
 * few lines, it adds nothing to the bundle, and it is unit-testable in Node.
 * The project has deliberately kept dependencies to a minimum (see
 * docs/DOCK_NAV.md for the comparison); `springStep` is the only seam a
 * library would replace.
 */

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

/** Damping ratio ≈ 0.73: settles quickly with only a hint (~3%) of
 * overshoot. Restrained, not bouncy. */
export const DEFAULT_SPRING: SpringConfig = { stiffness: 320, damping: 26, mass: 1 };

export interface SpringState {
  value: number;
  velocity: number;
}

/** A tab that was in the background can deliver one huge frame gap; never
 * integrate more than this in one go, or the spring can fling. */
export const MAX_FRAME_SECONDS = 1 / 20;

const SUBSTEP_SECONDS = 1 / 240;

export function springStep(
  state: SpringState,
  target: number,
  dtSeconds: number,
  config: SpringConfig = DEFAULT_SPRING,
): SpringState {
  let { value, velocity } = state;
  let remaining = Math.min(Math.max(dtSeconds, 0), MAX_FRAME_SECONDS);
  while (remaining > 1e-9) {
    const h = Math.min(SUBSTEP_SECONDS, remaining);
    // Semi-implicit Euler: update velocity first, then position. Stable
    // for the stiffness range used here at this substep size.
    const acceleration = (-config.stiffness * (value - target) - config.damping * velocity) / config.mass;
    velocity += acceleration * h;
    value += velocity * h;
    remaining -= h;
  }
  return { value, velocity };
}

export function isSettled(state: SpringState, target: number, positionEpsilon = 0.002, velocityEpsilon = 0.02): boolean {
  return Math.abs(state.value - target) < positionEpsilon && Math.abs(state.velocity) < velocityEpsilon;
}

export interface MagnifyShape {
  /** Scale of the icon directly under the pointer (e.g. 1.5). */
  maxScale: number;
  /** Distance in px from the pointer at which the effect has fully faded. */
  range: number;
}

/**
 * 1 when the pointer is `range` px or more away, `maxScale` when it is
 * exactly on the icon, and a smooth cosine bell in between. Neighbouring
 * icons therefore swell a little less than the one under the pointer —
 * that gradient is the "wave", with no extra animation code.
 */
export function magnificationScale(distance: number, shape: MagnifyShape): number {
  const d = Math.abs(distance);
  if (!(d < shape.range)) return 1;
  const bell = 0.5 * (1 + Math.cos((Math.PI * d) / shape.range));
  return 1 + (shape.maxScale - 1) * bell;
}

/** Which pointers drive magnification. Touch never does (there is no
 * hover, and a finger would make the icons jump under it); mouse and pen
 * hover do. Unknown types are treated as not-magnifying, the safe side. */
export function isMagnifyingPointer(pointerType: string): boolean {
  return pointerType === "mouse" || pointerType === "pen";
}
