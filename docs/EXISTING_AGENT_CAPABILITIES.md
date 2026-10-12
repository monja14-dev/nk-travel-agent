# Existing NK Travel Agent — Capability Inventory

Captured from the chat-based agent before any migration, per the master
prompt's rule to document existing behavior first. Source: the NK Travel
Agent master prompt, the NK Couple Travel Profile, and the Boracay
honeymoon trip-specific prompt, all established and exercised in chat
before this app existed.

## Core modes

- **Stay Hunter** — searches/compares Agoda, Airbnb, Booking.com, Klook,
  official hotel sites. Never assumes one platform is cheapest.
- **Food Hunter** — destination-specific delicacies, not a generic
  restaurant list.
- **Itinerary Planner** — day-by-day plans.
- **Budget Planner** — planned spend by category.
- **Transportation Planner** — cost vs. convenience comparison.
- **Decision Support** — trade-offs, not just a winner.

## Accommodation logic

- Real total cost: nightly rate + taxes + service/cleaning/resort fees +
  breakfast cost + cancellation terms — not the sticker price.
- Quality scoring: star rating, guest rating, **review volume** (a 5.0 from
  3 reviews is weighted below a 4.6 from 2,000), recency-weighted recent
  reviews, cleanliness, noise, safety, amenities.
- Location scoring: attraction distance, transit access, walkability,
  convenience-store proximity.
- Cancellation terms surfaced explicitly: free / partial / non-refundable /
  deadline.
- Quality floor: avoids properties with consistent poor reviews or
  recurring complaints (pests, mold, misleading photos) even when cheap;
  explains why if one still surfaces.
- Standard output: comparison table, then "cheapest acceptable" / "best
  value" / "premium" picks with reasoning.

## Food logic

- Buckets: must-try, local favorites, hidden gems, budget eats,
  special-occasion.
- Per dish: what it is, why try it, typical price, where, best area, what
  to order, tourist-trap warning.
- Does not treat viral/social spots as automatically good — checks
  reputation and longevity.
- Integrates with the itinerary (food near where the trip actually is that
  day, not a city-wide list).

## Itinerary logic

- Realistic pacing: opening hours, travel time, queues, meals, weather,
  rest.
- Geographic clustering to avoid backtracking.
- Explicit buffer time; does not over-schedule.
- Standard structure: Day X / Area or theme → Morning / Lunch / Afternoon /
  Dinner / Evening, each with time, cost, and a booking-required flag.

## Budget logic

- Splits fixed / variable / optional costs.
- Daily estimate + trip total.
- Currency conversions explicitly labeled as estimates.
- Whole-trip optimization (e.g., savings on lodging reallocated to a better
  dinner or activity) rather than judging accommodation in isolation.

## Deal-hunting & red flags

- Checks for legitimate discounts (member rates, early booking, packages)
  but never invents one.
- Explicit red-flag list (suspiciously low prices, recent negative
  reviews, hidden fees, long walk to transit, fake-looking reviews, etc.)
  without exaggeration.

## Couple / honeymoon personalization (general profile)

- Default priority order: experience → value → quality → convenience →
  authenticity → comfort → photography.
- Standing philosophy: "value for money, not lowest price" — explicitly
  avoids both too-cheap and unnecessarily-expensive picks.
- Balances romance with food/culture/shopping/rest rather than forcing a
  romantic framing onto every slot.
- Trip-specific instructions override the general profile **for that trip
  only**, without permanently changing it.

## Per-trip override layer (demonstrated on Boracay)

- Each trip can override: budget range, must-have amenities (e.g. pool),
  openness to hotel vs. Airbnb, station/area comparison criteria, and
  activity tiers (must consider / nice to have / splurge / skip).
- Destination-agnostic engine; a new trip profile per destination, not a
  rewrite.

## Output formatting standard

- Tables with real numbers, not vague language.
- Closing "🏆 Summary" block: cheapest acceptable / best value / best
  quality / most convenient / best couple experience / key trade-off /
  expected cost.
- Explicit uncertainty flags whenever live data wasn't verified.

## Research behavior

- Prioritizes official tourism/attraction/transport sites and reputable
  booking platforms over old blog posts; distinguishes verified facts from
  estimates.

## Confirmed limitations (tested directly, not assumed)

- **Agoda, Booking.com, and Airbnb have no public search API** and their
  pages actively resist automated price/availability lookups (confirmed
  while researching the Boracay trip — direct fetches were blocked or
  returned no structured pricing). Live pricing must stay a **manual
  research/paste workflow** in the app (a "paste what you found" input
  feeding into `researchSources` + `itineraryItems`/`bookings`), not an
  automated integration, for the MVP.
- No destination-specific government fee/accreditation API was found
  either (e.g. Boracay's iPass/environmental fee) — that information is
  also manual research, time-boxed and re-verified per trip, not cached
  indefinitely.
