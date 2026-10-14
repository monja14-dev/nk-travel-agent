# Dock-style navigation (sidebar magnification + bottom quick dock)

Status: **implemented on a feature branch, awaiting owner review on a Vercel
Preview.** Not merged, not deployed to Production.

- Branch: `feature/dock-nav` (from `phase-7-ui` at `64ae798`)
- Rollback checkpoint: git tag `checkpoint/pre-dock-nav` at `64ae798`
  (restore with `git switch phase-7-ui` — the branch itself is untouched — or
  `git checkout checkpoint/pre-dock-nav` to look at the old state)

## What changed

| Piece | Behaviour |
|---|---|
| Left sidebar | Still the primary navigation (collapse, mobile drawer, every item). Icons now swell near the mouse with a soft wave on the neighbours (max 1.28×). Active item: gold tint + slim gold bar on the left edge + `aria-current`. When collapsed, labels show as accessible tooltips instead of `title`. |
| Bottom quick dock | New, compact, centered at the bottom of the content area: **Dashboard · My Trips · Itinerary Studio · Stay Hunter · NK Concierge**. Icons swell up to 1.5× near the mouse with a wave on neighbours. Active item: gold tile + gold dot. |
| Floating "NK Concierge" button | No longer rendered — the dock's NK Concierge item replaces it (same destination). `ConciergeButton.tsx` is left in place, unused, so it can be restored in one line. |

No routes, screens, data, IndexedDB code, backup/restore or AI code were
touched. The dock uses the same `onNavigate(view)` as the sidebar.

### "My Trips" and the trip-dependent items

The app has no separate trip-list screen (the Dashboard *is* the list), so:

- **My Trips** opens the current trip's overview; before any trip has been
  opened it goes to the Dashboard, so it is never dead.
- **Itinerary Studio / Stay Hunter / NK Concierge** act on the active trip, or
  on the last trip opened this session (kept in memory only — nothing is
  stored — and dropped if that trip is deleted). With no trip at all they are
  shown disabled with the tooltip "open a trip first" (not hidden, so the dock
  never changes shape).

Tell me if you'd rather have "My Trips" always go to the Dashboard.

## Animation library decision

No animation library is installed (dependencies: exceljs, idb, react,
react-dom). Evaluated adding Motion (Framer Motion's successor):

| | Motion | In-house spring (chosen) |
|---|---|---|
| New dependency | yes | none |
| Bundle | adds its runtime to the main chunk (size unmeasured here — no registry access in the authoring environment) | ~100 lines |
| Need | one number (scale) per icon, ≤ ~12 icons | same |
| Testable in Node | needs DOM test tooling the project doesn't use | pure functions, 52 tests |
| Risk | new package to audit/keep updated (exceljs audit findings are already untriaged) | own code to maintain |

The spring step is the single seam: swapping in Motion later would replace
`springStep` / `magnifyEngine.ts` only. Recommendation: stay in-house unless
the dock grows richer animation (drag, shared-layout transitions).

Design: a damped spring (stiffness 320, damping 26 → damping ratio ≈ 0.73,
~3 % overshoot — restrained, not bouncy) drives each icon's scale toward a
target computed from the pointer's distance with a cosine falloff. The loop
only runs while something is moving, and writes `transform` directly (no React
re-render per frame).

## Accessibility and device behaviour

- **Touch:** only mouse/pen pointers magnify (`pointerType`); touch gets plain
  44 px tap targets, every action still reachable.
- **Reduced motion:** `prefers-reduced-motion` → no magnification at all;
  state changes are instant (global CSS already zeroes transitions); tooltips
  still work.
- **Keyboard:** Tab reaches every dock item; ←/→/Home/End move within the dock;
  keyboard focus shows the tooltip and a gentler swell; Esc dismisses a
  tooltip; the focus ring is the app-wide gold ring.
- **Screen readers:** each item has an `aria-label`, the active one
  `aria-current="page"`, disabled ones `aria-disabled` (still focusable so the
  reason is announced), the dock is `<nav aria-label="Quick navigation">`.
  Tooltips are `role="tooltip"` linked with `aria-describedby`, and are removed
  from the accessibility tree when closed.
- **Never in the way:**
  - the content area has 112 px of bottom padding, so the last row of any
    form, table or card can scroll above the dock;
  - the dock slides out while the mobile menu is open;
  - on phones/touch screens it slides out while a text field has focus (the
    on-screen keyboard needs the space);
  - hidden when printing.
- Style: solid navy surface, hairline border, champagne-gold only for the
  active tile/dot/focus ring. No blur, no large panel (≈ 260 px wide).

## Verification

- Automated: 52 new unit tests (`src/components/dock/__tests__`): magnification
  falloff (peak, symmetry, monotonic wave, bounds), spring (settles, restrained
  overshoot, frame-rate stability, long-frame clamp), the engine on a fake
  clock (wave, glide not jump, release, follow, weaker keyboard strength,
  reduced-motion off-switch, cancel/destroy, frame coalescing), and the dock
  model (items, trip-less fallback, active-route mapping for all 14 views,
  editable-field detection).
- Authoring-environment check only: these pure modules were type-checked with
  `tsc --strict` and the new tests run with a small stand-in runner (all 52
  green). The React components (`QuickDock`, `Sidebar`, `AppShell`,
  `useMagnify`, `Tooltip`) could **not** be compiled or rendered here, so the
  owner's `npm run build` / `npm test` result and a visual check on the
  Preview are the real verification.
- No component/DOM tests exist in this project (decision since Phase 1), so
  hover, wave, keyboard, tooltip and mobile behaviour are checked by hand:

### Manual QA checklist (desktop, then phone width ≈ 390 px)

1. Move the mouse along the dock: the icon under it swells, neighbours swell
   less, it glides back when you leave. Same, subtler, in the sidebar.
2. Active item shows the gold tile + dot (dock) and gold bar (sidebar) on:
   Dashboard, trip overview, Itinerary Studio, Stay Hunter, NK Concierge.
3. Tab into the dock: tooltip + gentle swell on focus; ←/→ move; Esc hides the
   tooltip; the focus ring is visible.
4. With no trip opened yet: Itinerary/Stay/Concierge look disabled, tooltip
   says "open a trip first"; after opening a trip and going back to the
   Dashboard they still work.
5. Itinerary Studio spreadsheet, long forms, Backup & Restore: scroll to the
   very bottom — nothing is hidden behind the dock.
6. Phone width / touch: no swelling; tap targets work; opening the ☰ menu hides
   the dock; focusing a text box (Concierge message, any form) hides it, and
   it returns when you leave the field.
7. OS "reduce motion" on: no swelling anywhere.
8. Existing flows unchanged: collapse the sidebar, open every screen, Excel
   export, backup download, Concierge send/approve.

## Known limitations

- The Concierge message box now has the dock *below* it on desktop (the page
  scrolls clear of it), unlike the old floating button at the right edge.
- Magnification needs a pointer hovering over the dock; on a hybrid device
  (touch laptop) a finger tap shows no swell, a mouse does.
- Tooltips use a short fade; no hover-delay.
