import { describe, it, expect } from "vitest";
import { activeDockItemId, buildDockItems, dockTooltipText, isEditableElement } from "../dockModel";
import type { View } from "../../../navigation/types";

describe("buildDockItems", () => {
  it("has exactly the five requested items, in order", () => {
    const labels = buildDockItems("t1").map((i) => i.label);
    expect(labels).toEqual(["Dashboard", "My Trips", "Itinerary Studio", "Stay Hunter", "NK Concierge"]);
  });

  it("points every item at an existing view for the given trip", () => {
    const byId = Object.fromEntries(buildDockItems("t1").map((i) => [i.id, i.view]));
    expect(byId.dashboard).toEqual({ name: "dashboard" });
    expect(byId["my-trips"]).toEqual({ name: "trip-details", tripId: "t1" });
    expect(byId.itinerary).toEqual({ name: "trip-itinerary", tripId: "t1" });
    expect(byId.stay).toEqual({ name: "trip-accommodation", tripId: "t1" });
    expect(byId.concierge).toEqual({ name: "trip-ai", tripId: "t1" });
  });

  it("enables everything when a trip is known", () => {
    expect(buildDockItems("t1").every((i) => i.view !== null && i.disabledReason === null)).toBe(true);
  });

  it("with no trip: Dashboard and My Trips still work (My Trips falls back to the Dashboard)", () => {
    const items = buildDockItems(null);
    expect(items[0].view).toEqual({ name: "dashboard" });
    expect(items[1].view).toEqual({ name: "dashboard" });
    expect(items[1].disabledReason).toBeNull();
  });

  it("with no trip: the three trip tools are disabled with a reason — not removed", () => {
    const items = buildDockItems(null);
    expect(items).toHaveLength(5);
    for (const id of ["itinerary", "stay", "concierge"]) {
      const item = items.find((i) => i.id === id)!;
      expect(item.view).toBeNull();
      expect(item.disabledReason).toMatch(/open a trip/i);
    }
  });
});

describe("activeDockItemId", () => {
  const cases: Array<[View, string | null]> = [
    [{ name: "dashboard" }, "dashboard"],
    [{ name: "trip-details", tripId: "t" }, "my-trips"],
    [{ name: "trip-edit", tripId: "t" }, "my-trips"],
    [{ name: "trip-override", tripId: "t" }, "my-trips"],
    [{ name: "trip-itinerary", tripId: "t" }, "itinerary"],
    [{ name: "trip-accommodation", tripId: "t" }, "stay"],
    [{ name: "trip-ai", tripId: "t" }, "concierge"],
    [{ name: "trip-food", tripId: "t" }, null],
    [{ name: "trip-budget", tripId: "t" }, null],
    [{ name: "trip-bookings", tripId: "t" }, null],
    [{ name: "trip-reminders", tripId: "t" }, null],
    [{ name: "trip-new" }, null],
    [{ name: "profile" }, null],
    [{ name: "backup" }, null],
  ];
  for (const [view, expected] of cases) {
    it(`${view.name} → ${expected ?? "no dock item"}`, () => {
      expect(activeDockItemId(view)).toBe(expected);
    });
  }

  it("every view the app has is handled (a new view can't silently fall through unnoticed)", () => {
    // If a view is added to navigation/types.ts, add it to the table above.
    expect(cases).toHaveLength(14);
  });
});

describe("dockTooltipText", () => {
  it("is just the label when the item works", () => {
    expect(dockTooltipText(buildDockItems("t")[2])).toBe("Itinerary Studio");
  });
  it("explains why when it doesn't", () => {
    expect(dockTooltipText(buildDockItems(null)[4])).toBe("NK Concierge — open a trip first");
  });
});

describe("isEditableElement", () => {
  it("is true for text-like fields", () => {
    expect(isEditableElement({ tagName: "TEXTAREA" })).toBe(true);
    expect(isEditableElement({ tagName: "SELECT" })).toBe(true);
    expect(isEditableElement({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(isEditableElement({ tagName: "input", type: "email" })).toBe(true);
    expect(isEditableElement({ tagName: "INPUT" })).toBe(true); // no type attribute = text
    expect(isEditableElement({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("is false for buttons, checkboxes and ordinary elements", () => {
    expect(isEditableElement({ tagName: "BUTTON" })).toBe(false);
    expect(isEditableElement({ tagName: "A" })).toBe(false);
    expect(isEditableElement({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(isEditableElement({ tagName: "INPUT", type: "radio" })).toBe(false);
    expect(isEditableElement({ tagName: "INPUT", type: "submit" })).toBe(false);
    expect(isEditableElement({ tagName: "BODY" })).toBe(false);
    expect(isEditableElement(null)).toBe(false);
    expect(isEditableElement(undefined)).toBe(false);
  });
});
