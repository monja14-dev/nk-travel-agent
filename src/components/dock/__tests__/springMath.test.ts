import { describe, it, expect } from "vitest";
import {
  DEFAULT_SPRING,
  MAX_FRAME_SECONDS,
  isMagnifyingPointer,
  isSettled,
  magnificationScale,
  springStep,
  type SpringState,
} from "../springMath";

const SHAPE = { maxScale: 1.5, range: 110 };

describe("magnificationScale", () => {
  it("is the full max scale exactly under the pointer", () => {
    expect(magnificationScale(0, SHAPE)).toBeCloseTo(1.5, 6);
  });

  it("is exactly 1 at and beyond the range", () => {
    expect(magnificationScale(110, SHAPE)).toBe(1);
    expect(magnificationScale(-110, SHAPE)).toBe(1);
    expect(magnificationScale(500, SHAPE)).toBe(1);
  });

  it("is symmetric left/right of the pointer", () => {
    expect(magnificationScale(37, SHAPE)).toBeCloseTo(magnificationScale(-37, SHAPE), 10);
  });

  it("falls off monotonically with distance — that gradient is the wave on neighbours", () => {
    let previous = magnificationScale(0, SHAPE);
    for (let d = 5; d <= 110; d += 5) {
      const scale = magnificationScale(d, SHAPE);
      expect(scale <= previous + 1e-12).toBe(true);
      previous = scale;
    }
  });

  it("lifts the immediate neighbours, but less than the icon under the pointer", () => {
    const under = magnificationScale(0, SHAPE);
    const neighbour = magnificationScale(48, SHAPE); // one dock slot away
    const farther = magnificationScale(96, SHAPE);
    expect(neighbour).toBeGreaterThan(1.1);
    expect(neighbour).toBeLessThan(under);
    expect(farther).toBeLessThan(neighbour);
    expect(farther).toBeGreaterThanOrEqual(1);
  });

  it("never goes below 1 or above maxScale", () => {
    for (let d = -200; d <= 200; d += 3) {
      const scale = magnificationScale(d, SHAPE);
      expect(scale >= 1 && scale <= 1.5 + 1e-9).toBe(true);
    }
  });
});

describe("springStep", () => {
  function run(from: SpringState, target: number, seconds: number, fps = 60): SpringState {
    let state = from;
    const frames = Math.round(seconds * fps);
    for (let i = 0; i < frames; i++) state = springStep(state, target, 1 / fps);
    return state;
  }

  it("settles on the target", () => {
    const end = run({ value: 1, velocity: 0 }, 1.5, 2);
    expect(end.value).toBeCloseTo(1.5, 3);
    expect(Math.abs(end.velocity)).toBeLessThan(0.01);
  });

  it("moves toward the target on the very first frame", () => {
    const next = springStep({ value: 1, velocity: 0 }, 1.5, 1 / 60);
    expect(next.value).toBeGreaterThan(1);
    expect(next.value).toBeLessThan(1.5);
  });

  it("has only a restrained overshoot (under 10% of the travel)", () => {
    let state: SpringState = { value: 1, velocity: 0 };
    let peak = 1;
    for (let i = 0; i < 240; i++) {
      state = springStep(state, 1.5, 1 / 60);
      peak = Math.max(peak, state.value);
    }
    expect(peak - 1.5).toBeLessThan(0.05);
    expect(peak).toBeGreaterThan(1.5 - 1e-6); // it is a spring: it does reach the target
  });

  it("returns to rest the same way", () => {
    const end = run({ value: 1.5, velocity: 0 }, 1, 2);
    expect(end.value).toBeCloseTo(1, 3);
  });

  it("is stable across frame rates (30, 60 and 144 fps reach the same place)", () => {
    const a = run({ value: 1, velocity: 0 }, 1.5, 1, 30).value;
    const b = run({ value: 1, velocity: 0 }, 1.5, 1, 60).value;
    const c = run({ value: 1, velocity: 0 }, 1.5, 1, 144).value;
    expect(Math.abs(a - b)).toBeLessThan(0.01);
    expect(Math.abs(b - c)).toBeLessThan(0.01);
  });

  it("clamps an enormous frame gap (background tab) instead of flinging the value", () => {
    const next = springStep({ value: 1, velocity: 0 }, 1.5, 30);
    const clamped = springStep({ value: 1, velocity: 0 }, 1.5, MAX_FRAME_SECONDS);
    expect(next).toEqual(clamped);
    expect(next.value).toBeLessThan(2);
  });

  it("ignores a zero or negative dt", () => {
    const start = { value: 1.2, velocity: 0.3 };
    expect(springStep(start, 1.5, 0)).toEqual(start);
    expect(springStep(start, 1.5, -1)).toEqual(start);
  });

  it("uses a damping ratio below 1 (a real spring) but above 0.6 (not bouncy)", () => {
    const ratio = DEFAULT_SPRING.damping / (2 * Math.sqrt(DEFAULT_SPRING.stiffness * DEFAULT_SPRING.mass));
    expect(ratio).toBeLessThan(1);
    expect(ratio).toBeGreaterThan(0.6);
  });
});

describe("isSettled", () => {
  it("needs both position and velocity to be at rest", () => {
    expect(isSettled({ value: 1.5, velocity: 0 }, 1.5)).toBe(true);
    expect(isSettled({ value: 1.4, velocity: 0 }, 1.5)).toBe(false);
    expect(isSettled({ value: 1.5, velocity: 1 }, 1.5)).toBe(false);
  });
});

describe("isMagnifyingPointer", () => {
  it("magnifies for mouse and pen only — never touch", () => {
    expect(isMagnifyingPointer("mouse")).toBe(true);
    expect(isMagnifyingPointer("pen")).toBe(true);
    expect(isMagnifyingPointer("touch")).toBe(false);
    expect(isMagnifyingPointer("")).toBe(false);
    expect(isMagnifyingPointer("something-new")).toBe(false);
  });
});
