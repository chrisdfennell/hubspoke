# Hub & Spoke — Changelog & Dev Blog

A running log of changes shipped to this game, in reverse-chronological order.
Each entry describes what changed, why, and (where useful) the math or
gameplay reasoning behind the change.

> Originally prototyped as an Airline Tycoon (1998) homage. Renamed to
> **Hub & Spoke** on 2026-05-10 — see entry below.

---

## 2026-05-10 — Bugfix: Close + ESC dead in any re-entered room

**The bug**: after entering and closing any room (Travel Agency, Workshop,
Bank, etc.) once, returning to the same room left both Close button AND
ESC keyboard shortcut completely non-responsive.

**The cause**: `closingTransition` and `autoPausedGame` are class fields on
the persistent scene instance. Phaser scenes are reused — `create()` runs
on every entry, but field values from a previous visit (set inside
`closeRoom()`) persist on the instance. After one close, `closingTransition
= true`. The next visit's `closeRoom()` early-returned on its guard
(`if (this.closingTransition) return`), so neither Close nor ESC did
anything. Bug applied to every room scene because they all extend
`RoomScene`.

**The fix**: explicitly reset both flags at the top of `create()` so every
visit starts in a clean state ([RoomScene.ts](src/ui/RoomScene.ts)).

Also (still relevant from the earlier guess): `rebuild()` is now deferred
to the next frame so destroying buttons mid-click doesn't wedge Phaser's
input plugin. Both fixes layer cleanly.

---

## 2026-05-10 — Apron animation: boarding & deplaning beats

Departing planes now sit at the gate while a small `BOARDING` progress bar
above them fills (800ms) before they taxi to the runway. Arriving planes
land, taxi to a gate, then drain an `ARRIVED` bar (600ms) before the icon
clears. Tells a fuller story per cycle: gate → board → taxi → takeoff →
fly → land → taxi → deplane → repeat. ([AirportScene.ts](src/scenes/AirportScene.ts))

Side notes: trimmed the existing taxi/roll durations (1200→1000 taxi,
1400→1200 takeoff roll, 1400→1200 approach, 1200→1000 inbound taxi) to
keep the total per-leg animation under the shortest realistic flight
(~3s real-time for a 100km Cessna hop). New `boardingProgress` helper is
reused for both phases — bar widget + label tied together.

---

## 2026-05-10 — Rebrand: "Hub & Spoke"

Renamed the project from "Airline Tycoon" to **Hub & Spoke** for original-IP
reasons. "Hub & Spoke" is the real-world airline network model (every major
carrier organizes ops this way), and it's a direct callout to the multi-hub
gameplay we shipped earlier today.

- [index.html](index.html) page title.
- [package.json](package.json) — package name `hub-and-spoke`, description rewritten.
- [BootScene.ts](src/scenes/BootScene.ts) title-screen heading: `HUB & SPOKE`
  with the subtitle `an airline tycoon` (lowercase, italic — winking nod to
  the genre lineage).
- This file's heading.

**Internal save keys** (`localStorage` strings in
[Save.ts](src/systems/Save.ts) and [Sound.ts](src/systems/Sound.ts)) keep the
`airline-tycoon-*` prefix unchanged so existing saves and mute prefs survive
the rebrand. Players never see those strings; renaming them would only
orphan data.

---

## 2026-05-10 — Polish pass: modals, help system, world map

**UI plumbing**
- New `Modal` system ([src/ui/Modal.ts](src/ui/Modal.ts)) replaces every
  `window.alert` / `window.prompt` call. All dialogs (rename plane, rename
  airline, ferry errors, length warnings) now use a Phaser-rendered modal
  that matches the rest of the game's look. Supports `alert`, `confirm`,
  and `prompt` (with a typed text input — Backspace, Enter to submit, Esc
  to cancel, blinking cursor, min/max length validation with inline error).
- Modal keyboard handling listens on `window` in capture phase with
  `stopImmediatePropagation` so scene shortcuts (room ESC handlers, etc.)
  don't double-fire while a modal is up.
- Replaced 3 native dialogs:
  [WorkshopScene.ts](src/scenes/rooms/WorkshopScene.ts) plane rename,
  [OfficeScene.ts](src/scenes/rooms/OfficeScene.ts) airline rename and plane
  rename, OfficeScene ferry error → all now use `Modal`. Removed the
  `promptName` helper; `Modal.prompt` handles validation directly.

**Help system**
- New `HelpScene` ([src/scenes/rooms/HelpScene.ts](src/scenes/rooms/HelpScene.ts))
  with 9 sections covering basics, Travel Agency, hubs, Workshop, Bank /
  Stocks / Personnel, Settings, win/lose conditions, keyboard shortcuts,
  and tips & tricks.
- New `?` button in the HUD top bar between speed-text and the speed
  cluster ([HUDScene.ts](src/scenes/HUDScene.ts)). Opens `HelpScene`.
  Existing speed cluster shifted left by 40px to make room.

**Scene fade transitions**
- Every `RoomScene`-derived scene now fades in via a camera-alpha tween
  (180ms ease-out) and fades out on close (140ms ease-in). AirportScene
  behind it stays at full opacity. Guard against double-tap fading out
  twice. ([RoomScene.ts](src/ui/RoomScene.ts))

**HUD ticker pause-on-hover**
- Hovering the news ticker now pauses the scroll so headlines are actually
  readable. Cursor leaves → scroll resumes. ([HUDScene.ts](src/scenes/HUDScene.ts))

**CHANGELOG.md added**
- New `CHANGELOG.md` at repo root tracking every change in dev-blog style.
  Per user request: every change/update gets a corresponding entry, same
  session.

**World map polish** ([WorldMapScene.ts](src/scenes/rooms/WorldMapScene.ts))
- Click empty ocean dismisses the city info panel (no more click-the-X).
- Drop shadows under planes — bigger and darker for in-flight, smaller and
  softer for parked. Sells altitude.
- Hover-highlight: hover any city dot and routes touching it pop to full
  alpha + thicker stroke, while non-touching routes dim to 25%. Lets you
  read a hub's network at a glance.

**Office: inline ferry picker** ([OfficeScene.ts](src/scenes/rooms/OfficeScene.ts))
- The Ferry button on each fleet row no longer opens a numbered native
  prompt. It expands an inline strip below the plane row showing one button
  per other hub — each labeled with the destination city and either fuel
  cost or a disabled-reason (`out of range`, `need $X`).
- Ferry button toggles to `Cancel` while the picker is open.

**Sound design pass**
- Hub buy → `'buy'` arpeggio (C5–E5–G5).
- Route open → `'cashGain'` ping.
- Plane buy → `'buy'` arpeggio.
- Milestone celebration popup → upgraded from `'click'` to `'buy'`.

**Bug fixes**
- New planes purchased in the Workshop now park at `state.activeHub` instead
  of the hardcoded `HOME_AIRPORT`. Fixes "I bought a plane while operating
  out of London but it's sitting in Honolulu."

---

## 2026-05-10 — Multi-hub airlines + content expansion

**Hub switching MVP**
- `Player.hubs: string[]` and `GameState.activeHub` ship in the save.
- Travel Agency: chip-row hub picker. Routes are listed from / opened from
  the active hub. "Your Routes" filters to those touching the active hub.
- World Map (Control Tower): click any city → bottom-center popup with
  `Buy hub for $X` (cost = `demand × $5M`) or `Set as active hub` if owned.
  Owned hubs render in your airline's color with a thicker ring.
- AirportScene title updates live when you switch hubs; parked-plane apron
  filters to planes at the active hub. Takeoff/landing animations only play
  for departures/arrivals at the active hub.
- Dispatch refuses to fly a plane that isn't sitting at one of its route's
  endpoints (catches multi-hub mis-assignments).
- Ferry feature: idle planes can be repositioned between owned hubs at
  fuel cost only. New `ferry` PlaneStatus kind, dispatched from Office Fleet
  tab. Half the per-flight wear of a revenue flight, no passengers.

**AI hubs**
- Default airlines now have distinct homes:
  Honey Air → HNL, Falcon Lines → LAX, Phoenix Airlines → JFK,
  Tucan Airlines → LHR.
- AI opens routes from its own home (avoids dogpiling Honolulu).
- AI buys planes parked at its own home.
- Migrator (`balanceVersion ≥ 2`) detects legacy saves where every AI
  defaulted to HNL and reassigns each to its catalog home, relocates idle
  planes, and clears stale routes so the AI rebuilds from the right hub.

**Content expansion**
- 10 new cities: Chicago, Miami, Toronto, Madrid, Rome, Istanbul, Mumbai,
  Beijing, Hong Kong, Seoul (21 → 31).
- 3 new plane models: Bombardier Q400 (regional turboprop), Airbus A220-300
  (mid-range jet), Airbus A380-800 (super heavy) (5 → 8).

**Office Hubs section**
- Office Overview tab gains a hubs list: each owned hub with route count,
  idle / total plane count, and a "Set as active" button.

**Net-worth milestone arc**
- $10M / $100M / $500M / $1B tiers post news entries once each.
- $1B = victory condition alongside the existing rival-takeover win.
- Center-screen celebration popup appears on each crossing — gold accent
  bar, ★ icon, label + flavor, dismissable via Continue / Enter / Esc.
- Seeded from save on boot so a reload doesn't re-fire popups.

**Settings × competition coupling**
- Player's `minLoadFactorForTakeoff` setting throttles the player's route
  weight in *rivals'* competition share calculation. A player who waits for
  high LF dispatches less often → smaller competitive footprint → rivals
  get higher LF on the contested pair.
- When the player *does* dispatch after waiting, LF is floored at the
  threshold to simulate accumulated demand. Rewards patience.

---

## 2026-05-10 — Major balance + economy work

**Balance v1: route pricing rewrite**
- `suggestedTicketPrice`: from `$0.10/km × demand, floor $20` to
  `($30 base + $0.12/km) × demand, floor $40`. Old formula left starter
  Hawaii hops at $20 — below break-even on a Cessna.
- Load factor curve: from `1.05 - 0.4·ratio` (peak 0.65) to
  `1.20 - 0.30·ratio` (peak 0.90), cap raised 0.95.
- Competition split: from strict `1/N` to `share^0.4`, softening crowded
  pairs. 1 equal rival → 0.76× (was 0.50×); 3 equal rivals → 0.57× (was 0.25×).
- Per-flight ops: from `$80 + $6/pax + 2% rev` down to `$50 + $4/pax + 1.5% rev`.
- Cessna 208 fuel burn: 1.6 → 0.5 L/km (real 208 is ~0.3, was 5× reality).
- Initial fuel price: $0.95 → $0.80/L.
- Migrator (`balanceVersion ≥ 1`) bumps any existing route priced below
  70% of new fair fare up to fair, so loaded saves heal automatically.

**Wear & maintenance rebalance**
- Per-flight condition decay: 0.5% → 0.1% (planes last ~5× longer).
- Idle daily decay: 0.1% → 0.03%.
- Daily maintenance per plane down ~65%:
  Cessna $1,920 → $600/day, ATR $7,680 → $2,400, B737 $21,600 → $6,720,
  B747 $43,200 → $13,920.
- Repair cost coefficient: 5% of plane price per condition point → 2%.

**Fuel price stability**
- Daily drift magnitude: ±$0.03 → ±$0.01.
- Hard bounds tightened: `[$0.40, $2.00]` → `[$0.55, $1.10]`.
- Mean-reverting: 4% of the gap to $0.80 baseline pulled back each day so
  long-running saves don't random-walk into the cap and stay there.
- `setFuelPrice` clamps on assignment so loaded saves with out-of-range
  values self-heal.

---

## 2026-05-10 — Quality-of-life polish

**AirportScene polish**
- Per-room emoji watermark above the title (🏢 ✈ 🔧 🏦 👥 📊 🌐 📰 📦 🛡 🛒 🥂).
- Vertical gold accent bar on each room's left edge.
- Hover tooltips with live state (fleet counts, cash, crew shortfall,
  portfolio value, airborne planes, news/cargo offer counts).
- Keyboard shortcuts `1`-`9` / `0` / `-` / `=` jump to each room.
- Soft drop shadows under all plane icons.
- Direction-aware runway: even-indexed gates exit/arrive on the 08L end,
  odd-indexed on 26R, so simultaneous flights don't overlap.
- Fixed gate-teleport bug — animations now read from a `gateByPlaneId` map
  populated during render instead of `planes.indexOf(plane)` (which
  disagreed with the visual gate when other planes were mid-flight).
- Stopped per-frame allocation in `drawParkedPlanes()` — signature-based
  rebuild only when the idle set + gate assignment changes.

**HUD layout fix**
- Mute button moved to the far right after the speed cluster.
- Speed indicator right-aligned at `GAME_WIDTH - 270` so it tucks neatly
  before the buttons.
- Settings (`⚙`) button added between speed buttons and mute.

**Settings panel**
- New scene with persisted toggles: skip-unprofitable-flights, min-load-
  factor-for-takeoff (Off / 30% / 50% / 70%), pause-on-room-entry.
- All controls right-align to the panel's right edge.
- Settings round-trip through saves via `GameState.settings`.

---
