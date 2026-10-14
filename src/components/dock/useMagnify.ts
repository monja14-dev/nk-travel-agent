import { useEffect, useMemo, useRef, useState, type FocusEvent, type PointerEvent } from "react";
import { MagnifyEngine, type FrameScheduler, type MagnifyItem } from "./magnifyEngine";
import { isMagnifyingPointer } from "./springMath";

/**
 * React glue for the dock magnification. Spread `containerProps` on the
 * element that holds the icons; mark each icon's visual element with
 * `data-magnify`. The hook measures those elements and animates their CSS
 * transform directly (no React re-render per frame).
 *
 * - Only mouse/pen hover magnifies; touch never does (see isMagnifyingPointer).
 * - Keyboard focus (focus-visible) gives a weaker version of the same wave.
 * - With "reduce motion" on, nothing is magnified at all.
 */

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(REDUCED_MOTION_QUERY).matches
      : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

const rafScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
};

/** Keyboard focus swells the focused icon this fraction as much as hover. */
const FOCUS_STRENGTH = 0.7;

export interface UseMagnifyOptions {
  axis: "x" | "y";
  /** Scale of the icon directly under the pointer. */
  maxScale: number;
  /** Distance (px) over which neighbours fade back to normal size. */
  range: number;
}

export function useMagnify({ axis, maxScale, range }: UseMagnifyOptions) {
  const reduced = useReducedMotion();
  const engineRef = useRef<MagnifyEngine | null>(null);

  useEffect(() => {
    const engine = new MagnifyEngine({ maxScale, range, scheduler: rafScheduler });
    engine.setEnabled(!reduced);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [maxScale, range, reduced]);

  return useMemo(() => {
    const centerOf = (el: Element): number => {
      const rect = el.getBoundingClientRect();
      return axis === "x" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
    };

    const collect = (container: Element): MagnifyItem[] =>
      Array.from(container.querySelectorAll<HTMLElement>("[data-magnify]")).map((el) => ({
        key: el,
        center: () => centerOf(el),
        apply: (scale) => {
          el.style.transform = scale === 1 ? "" : `scale(${scale.toFixed(4)})`;
        },
      }));

    return {
      containerProps: {
        onPointerMove(e: PointerEvent<HTMLElement>) {
          const engine = engineRef.current;
          if (!engine || !isMagnifyingPointer(e.pointerType)) return;
          engine.setItems(collect(e.currentTarget));
          engine.pointerAt(axis === "x" ? e.clientX : e.clientY);
        },
        onPointerLeave(e: PointerEvent<HTMLElement>) {
          if (!isMagnifyingPointer(e.pointerType)) return;
          engineRef.current?.release();
        },
        onFocus(e: FocusEvent<HTMLElement>) {
          const engine = engineRef.current;
          if (!engine) return;
          let keyboardFocus = false;
          try {
            keyboardFocus = e.target.matches(":focus-visible");
          } catch {
            // very old browsers: skip the focus wave, nothing else changes
          }
          if (!keyboardFocus) return;
          const visual = e.target.querySelector("[data-magnify]");
          if (!visual) return;
          engine.setItems(collect(e.currentTarget));
          engine.pointerAt(centerOf(visual), FOCUS_STRENGTH);
        },
        onBlur() {
          engineRef.current?.release();
        },
      },
    };
  }, [axis]);
}
