import { describe, it, expect } from "vitest";
import { MagnifyEngine, type FrameScheduler, type MagnifyItem } from "../magnifyEngine";

/** A fake clock + frame queue: nothing runs until the test advances it. */
function fakeScheduler() {
  let now = 0;
  let nextId = 1;
  const queue = new Map<number, (t: number) => void>();
  const scheduler: FrameScheduler = {
    request: (cb) => {
      const id = nextId++;
      queue.set(id, cb);
      return id;
    },
    cancel: (id) => {
      queue.delete(id);
    },
  };
  return {
    scheduler,
    pending: () => queue.size,
    /** Run frames of `frameMs` until `ms` of fake time has passed or nothing is scheduled. */
    advance(ms: number, frameMs = 1000 / 60) {
      const end = now + ms;
      while (now < end && queue.size > 0) {
        now += frameMs;
        const callbacks = [...queue.entries()];
        queue.clear();
        for (const [, cb] of callbacks) cb(now);
      }
    },
  };
}

/** Five icons 48px apart, centers at 24, 72, 120, 168, 216. */
function makeItems(count = 5, pitch = 48) {
  const applied: number[][] = Array.from({ length: count }, () => []);
  const items: MagnifyItem[] = Array.from({ length: count }, (_, i) => ({
    key: `item-${i}`,
    center: () => i * pitch + pitch / 2,
    apply: (scale) => {
      applied[i].push(scale);
    },
  }));
  const last = (i: number) => applied[i][applied[i].length - 1];
  return { items, applied, last };
}

const SHAPE = { maxScale: 1.5, range: 110 };

describe("MagnifyEngine", () => {
  it("does nothing until the pointer arrives — an idle dock requests no frames", () => {
    const clock = fakeScheduler();
    const { items, applied } = makeItems();
    const engine = new MagnifyEngine({ ...SHAPE, scheduler: clock.scheduler });
    engine.setItems(items);
    expect(clock.pending()).toBe(0);
    expect(applied.flat()).toEqual([]);
  });

  it("swells the icon under the pointer most, with a graded wave on its neighbours", () => {
    const clock = fakeScheduler();
    const { items, last } = makeItems();
    const engine = new MagnifyEngine({ ...SHAPE, scheduler: clock.scheduler });
    engine.setItems(items);
    engine.pointerAt(120); // center of the middle icon
    clock.advance(2000);

    expect(last(2)).toBeCloseTo(1.5, 2);
    expect(last(1)).toBeGreaterThan(1.1);
    expect(last(1)).toBeLessThan(last(2));
    expect(last(3)).toBeCloseTo(last(1), 2); // symmetric
    expect(last(0)).toBeLessThan(last(1));
    expect(last(4)).toBeCloseTo(last(0), 2);
  });

  it("animates (does not jump): the first frame is between rest and target", () => {
    const clock = fakeScheduler();
    const { items, applied } = makeItems();
    const engine = new MagnifyEngine({ ...SHAPE, scheduler: clock.scheduler });
    engine.setItems(items);
    engine.pointerAt(120);
    clock.advance(17);
    const first = applied[2][0];
    expect(first).toBeGreaterThan(1);
    expect(first).toBeLessThan(1.5);
  });

  it("springs back to exactly 1 on release and then stops requesting frames", () => {
    const clock = fakeScheduler();
    const { items, last } = makeItems();
    const engine = new MagnifyEngine({ ...SHAPE, scheduler: clock.scheduler });
    engine.setItems(items);
    engine.pointerAt(120);
    clock.advance(2000);
    engine.release();
    clock.advance(3000);
    for (let i = 0; i < 5; i++) expect(last(i)).toBe(1);
    expect(clock.pending()).toBe(0);
  });

  it("follows the pointer when it moves to another icon", () => {
    const clock = fakeScheduler();
    const { items, last } = makeItems();
    const engine = new MagnifyEngine({ ...SHAPE, scheduler: clock.scheduler });
    engine.setItems(items);
    engine.pointerAt(24);
    clock.advance(2000);
    expect(last(0)).toBeCloseTo(1.5, 2);
    engine.pointerAt(216);
    clock.advance(2000);
    expect(last(4)).toBeCloseTo(1.5, 2);
    expect(last(0)).toBeCloseTo(1, 2);
  });

  it("keyboard focus uses a weaker swell than hover (strength < 1)", () => {
    const clock = fakeScheduler();
    const { items, last } = makeItems();
    const engine = new MagnifyEngine({ ...SHAPE, scheduler: clock.scheduler });
    engine.setItems(items);
    engine.pointerAt(120, 0.7);
    clock.advance(2000);
    expect(last(2)).toBeCloseTo(1.35, 2);
    expect(last(2)).toBeLessThan(1.5);
  });

  it("an item that can't be measured stays at rest instead of throwing", () => {
    const clock = fakeScheduler();
    const { items, last } = makeItems(3);
    items[1] = { ...items[1], center: () => null };
    const engine = new MagnifyEngine({ ...SHAPE, scheduler: clock.scheduler });
    engine.setItems(items);
    engine.pointerAt(72);
    clock.advance(2000);
    expect(last(1)).toBe(1);
  });

  it("reduced motion: when disabled it ignores the pointer entirely and leaves every icon at 1", () => {
    const clock = fakeScheduler();
    const { items, applied } = makeItems();
    const engine = new MagnifyEngine({ ...SHAPE, scheduler: clock.scheduler });
    engine.setItems(items);
    engine.setEnabled(false);
    engine.pointerAt(120);
    engine.pointerAt(24, 0.7);
    clock.advance(2000);
    expect(clock.pending()).toBe(0);
    expect(applied.flat().every((s) => s === 1)).toBe(true);
  });

  it("disabling mid-animation snaps everything back to rest immediately and cancels the frame", () => {
    const clock = fakeScheduler();
    const { items, last } = makeItems();
    const engine = new MagnifyEngine({ ...SHAPE, scheduler: clock.scheduler });
    engine.setItems(items);
    engine.pointerAt(120);
    clock.advance(40);
    expect(last(2)).toBeGreaterThan(1);
    engine.setEnabled(false);
    expect(clock.pending()).toBe(0);
    for (let i = 0; i < 5; i++) expect(last(i)).toBe(1);
  });

  it("destroy cancels the pending frame and resets the icons", () => {
    const clock = fakeScheduler();
    const { items, last } = makeItems();
    const engine = new MagnifyEngine({ ...SHAPE, scheduler: clock.scheduler });
    engine.setItems(items);
    engine.pointerAt(120);
    clock.advance(40);
    engine.destroy();
    expect(clock.pending()).toBe(0);
    expect(last(2)).toBe(1);
  });

  it("coalesces a burst of pointer moves into one pending frame", () => {
    const clock = fakeScheduler();
    const { items } = makeItems();
    const engine = new MagnifyEngine({ ...SHAPE, scheduler: clock.scheduler });
    engine.setItems(items);
    for (let x = 0; x < 200; x += 4) engine.pointerAt(x);
    expect(clock.pending()).toBe(1);
  });

  it("copes with a large frame gap (background tab) without flinging past the target", () => {
    const clock = fakeScheduler();
    const { items, applied } = makeItems();
    const engine = new MagnifyEngine({ ...SHAPE, scheduler: clock.scheduler });
    engine.setItems(items);
    engine.pointerAt(120);
    clock.advance(10_000, 5_000); // two giant frames
    expect(Math.max(...applied[2])).toBeLessThan(1.6);
  });
});
