import type { BadgeTone } from "./Badge";
import type { TripStatus, BookingStatus, ResearchVerificationStatus } from "../../db/schema";

/**
 * Phase 7 (UI): maps each domain's real status enum (src/db/schema.ts)
 * to a Badge tone + display label. Kept in one place so a future status
 * value added to the schema fails loudly here (TS exhaustiveness) rather
 * than silently rendering as an unstyled fallback somewhere in the UI.
 */

export function tripStatusTone(status: TripStatus): { tone: BadgeTone; label: string } {
  switch (status) {
    case "planning":
      return { tone: "accent", label: "Planning" };
    case "booked":
      return { tone: "success", label: "Booked" };
    case "in_progress":
      return { tone: "warning", label: "In Progress" };
    case "completed":
      return { tone: "neutral", label: "Completed" };
    case "archived":
      return { tone: "neutral", label: "Archived" };
  }
}

export function bookingStatusTone(status: BookingStatus): { tone: BadgeTone; label: string } {
  switch (status) {
    case "not_booked":
      return { tone: "neutral", label: "Not Booked" };
    case "pending":
      return { tone: "warning", label: "Pending" };
    case "confirmed":
      return { tone: "success", label: "Confirmed" };
    case "cancelled":
      return { tone: "danger", label: "Cancelled" };
  }
}

export function verificationStatusTone(
  status: ResearchVerificationStatus,
): { tone: BadgeTone; label: string } {
  switch (status) {
    case "verified":
      return { tone: "success", label: "Verified" };
    case "estimate":
      return { tone: "accent", label: "Estimate" };
    case "stale":
      return { tone: "warning", label: "Stale" };
    case "unknown":
      return { tone: "neutral", label: "Unknown" };
  }
}
