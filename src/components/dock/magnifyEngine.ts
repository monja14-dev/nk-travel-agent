import {
  DEFAULT_SPRING,
  isSettled,
  magnificationScale,
  springStep,
  type SpringConfig,
  type SpringState,
} from "./springMath";

/**
 * Framework-free animation loop for the dock magnification. It knows
 * nothing about React or the DOM: items are described by two callbacks and
 * frames come from an injected scheduler, so the whole thing runs (and is
 * tested) in Node with a fake clock.
 *
 * Only runs while something is moving: when every icon has settled on its
 * target the loop stops requesting frames, so an idle app does no work.
 */

export interface MagnifyItem {
  /** Stable identity (the element) so a spring keeps its state across calls. */
  key: unknown;
  /** Center of the item along the dock's axis, in the same coordinate
   * space as the pointer position; null if it can't be measured. */
  center(): number | null;
  /** Show this scale. Called with exactly 1 when the icon is at rest. */
  apply(scale: number): void;
}

export interface FrameScheduler {
  request(callback: (nowMs: number) => void): number;
  cancel(id: number): void;
}

export interface MagnifyEngineOptions {
  maxScale: number;
  range: number;
  scheduler: FrameScheduler;
  spring?: SpringConfig;
}

const FIRST_FRAME_SECONDS = 1 / 60;

export class MagnifyEngine {
  private readonly maxScale: number;
  private readonly range: number;
  private readonly scheduler: FrameScheduler;
  private readonly spring: SpringConfig;

  private items: MagnifyItem[] = [];
  private readonly states = new Map<unknown, SpringState>();
  private readonly targets = new Map<unknown, number>();
  private frameId: number | null = null;
  private lastFrameMs: number | null = null;
  private enabled = true;

  constructor(options: MagnifyEngineOptions) {
    this.maxScale = options.maxScale;
    this.range = options.range;
    this.scheduler = options.scheduler;
    this.spring = options.spring ?? DEFAULT_SPRING;
  }

  /** Replace the item list (cheap; call it whenever the pointer moves so
   * newly mounted items are picked up). Items that disappeared are dropped. */
  setItems(items: MagnifyItem[]): void {
    this.items = items;
    const live = new Set(items.map((i) => i.key));
    for (const key of [...this.states.keys()]) {
      if (!live.has(key)) {
        this.states.delete(key);
        this.targets.delete(key);
      }
    }
  }

  /**
   * Aim every item at the size it should be for a pointer at `position`.
   * `strength` (0–1) scales the effect: keyboard focus uses a weaker
   * magnification than a real hover.
   */
  pointerAt(position: number, strength = 1): void {
    if (!this.enabled) return;
    const shape = { maxScale: 1 + (this.maxScale - 1) * strength, range: this.range };
    for (const item of this.items) {
      const center = item.center();
      this.targets.set(item.key, center === null ? 1 : magnificationScale(position - center, shape));
    }
    this.schedule();
  }

  /** Pointer left: every item springs back to rest. */
  release(): void {
    for (const item of this.items) this.targets.set(item.key, 1);
    this.schedule();
  }

  /** Turning this off (reduced motion) snaps everything to rest at once. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.reset();
  }

  destroy(): void {
    this.reset();
  }

  private reset(): void {
    if (this.frameId !== null) {
      this.scheduler.cancel(this.frameId);
      this.frameId = null;
    }
    this.lastFrameMs = null;
    for (const item of this.items) item.apply(1);
    this.states.clear();
    this.targets.clear();
  }

  private schedule(): void {
    if (this.frameId !== null) return;
    this.frameId = this.scheduler.request(this.tick);
  }

  private readonly tick = (nowMs: number): void => {
    this.frameId = null;
    const dt = this.lastFrameMs === null ? FIRST_FRAME_SECONDS : (nowMs - this.lastFrameMs) / 1000;
    this.lastFrameMs = nowMs;

    let moving = false;
    for (const item of this.items) {
      const target = this.targets.get(item.key) ?? 1;
      const current = this.states.get(item.key) ?? { value: 1, velocity: 0 };
      let next = springStep(current, target, dt, this.spring);
      if (isSettled(next, target)) {
        next = { value: target, velocity: 0 };
      } else {
        moving = true;
      }
      this.states.set(item.key, next);
      item.apply(next.value);
    }

    if (moving) {
      this.schedule();
    } else {
      this.lastFrameMs = null;
    }
  };
}
