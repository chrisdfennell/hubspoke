# Hub & Spoke — Changelog & Dev Blog

A running log of changes shipped to this game, in reverse-chronological order.
Each entry describes what changed, why, and (where useful) the math or
gameplay reasoning behind the change.

> Originally prototyped as an Airline Tycoon (1998) homage. Renamed to
> **Hub & Spoke** on 2026-05-10 — see entry below.

---

## 2026-05-10 — Takeoff animation holds for active landings

With 3+ planes on 3+ routes, plane A's turnaround could expire while
plane B was still on approach. Because the two animations are independent
graphics-layer tweens, plane A would start its BOARDING bar / taxi-out
sequence *during* plane B's landing animation — the player saw "a plane
magically appears at a gate and starts boarding before the landing plane
even shows up at its own gate."

Fix ([AirportScene.ts](src/scenes/AirportScene.ts)):
- New `activeLandingEndsAt: Map<planeId, realtimeMs>` published by
  `animateLanding` on start and cleared in the final ARRIVED-bar
  `onComplete`. Tracks the real-time end of every in-flight landing.
- `animateTakeoff` queries it for the longest remaining landing and
  delays Phase 0 (BOARDING) by that amount via `time.delayedCall`.
  The plane icon sits at its gate during the hold — visually identical
  to a parked plane — so the player just sees "queued for departure
  while the inbound traffic clears."
- Capped at `TAKEOFF_HOLD_CAP_MS = 4000` so sustained traffic at 4×
  game-speed can't queue takeoffs indefinitely; animations are flavor,
  not strict scheduling.

Pairs with the earlier stable-gate work — each plane already had its
own gate; this serializes the *visual* sequence too so a busy apron
doesn't read as chaos.

---

## 2026-05-10 — CEO characters + mid-flight failures

Two original-game systems wired together. CEOs make new runs feel
distinct; mishaps make condition matter.

**CEOs** ([ceos.ts](src/state/ceos.ts), [BootScene.ts](src/scenes/BootScene.ts))
- Four CEOs in homage to the original roster: Mario Zucchero (The Charmer
  — Duty Free 25% off, starting banana peels), Igor Tuppolevski (The
  Engineer — Workshop repairs 50% off, planes wear 50% slower), Sven
  Hassel (The Stoic — starts with 2× CCTV + 1× Cyber Shield to repel
  saboteurs), Anita Mansion (The Tycoon — +$1M starting cash, loan APR
  ×0.7).
- New picker overlay shown after the difficulty card, before the run
  actually starts (Back button returns to the difficulty picker so it's
  not a one-way commit).
- `GameState.reset(difficulty, ceoId)` and `bootstrap(ceoId)` apply
  starting-cash + starting-inventory perks at the moment of bootstrap;
  the live perks (repair discount, decay rate, duty-free multiplier,
  loan APR) are read per-player from `getCEO(player.ceoId).perks` at
  each call site.
- `Bank.effectiveLoanApr` now takes an optional player so Anita's 0.7×
  loan APR actually reduces her daily interest. HUDScene + BankScene
  pass `me`.
- Workshop repair-cost calc, auto-repair daily sweep, and per-flight
  condition decay all read CEO perks live so flipping CEOs (via save
  edit or new run) takes effect instantly.
- Airline-name HUD tooltip now shows the CEO's name, epithet, and
  perk blurb so you don't forget who you're playing as.

**Mid-flight failures** ([Flights.ts](src/systems/Flights.ts))
- Revenue flights now roll `maybeMishap` on landing. Above 50%
  condition: nothing. Below 50%: linear ramp from 0% chance at 0.5
  condition to 20% at 0%. Below 15%: 30% of incidents are full crashes.
- **Incident**: plane forced to 50% condition via emergency repair
  (charged $0 — the patch is just so the plane is flyable), reputation
  −5, $2k/passenger compensation, news headline.
- **Crash**: plane removed from the fleet outright, reputation −25,
  $10k/passenger compensation, news headline tagged with `★`.
- AI rivals can also crash — keeps the competitive landscape honest if
  they neglect their fleet — but only the human gets news headlines.
- Pairs naturally with the auto-repair Settings toggle: a player who
  doesn't want this consequence loop can flip auto-repair to 50% and
  never see a mishap.

---

## 2026-05-10 — Five new Settings panel options

Settings ([SettingsScene.ts](src/scenes/rooms/SettingsScene.ts)) gained two
new sections (Save, World) and five new toggles/pickers. All persist with
the save via `GameSettings`.

- **News ticker categories** — three independent toggles for "Your airline",
  "Rivals", and "World events". Milestones (★) always show.
  ([HUDScene.ts](src/scenes/HUDScene.ts) — `HUDScene.classifyNews()` uses
  prefix + your-name heuristics so we don't have to label every `pushNews`
  call site at the source.)
- **Autosave cadence** — Hourly / Daily / Manual. Both clock hooks are
  always registered; the live setting decides which one actually fires
  `saveNow()`. Plus a separate "Save on browser close" toggle for the
  beforeunload/pagehide path. ([Save.ts](src/systems/Save.ts))
- **World event severity** — Off / Mild / Normal / Harsh. `severityScalar()`
  feeds `scaledMult()` (demand multipliers pulled toward 1.0) and
  `scaledDelta()` (additive impacts like reputation, condition damage).
  `'off'` short-circuits the daily event roll entirely.
  ([Events.ts](src/systems/Events.ts))
- **Auto-repair threshold** — Off / 15% / 30% / 50%. Daily hook in
  registerFlightHooks sweeps idle planes below the threshold and runs the
  same restore-to-100% repair the Workshop button uses, charged to cash;
  insufficient funds pushes a news warning instead of failing silently.
  ([Flights.ts](src/systems/Flights.ts))
- **Show competitor prices in route tooltip** — Off hides the entire
  Competition block from the route tooltip (you fly blind against rival
  pricing). On, the tooltip now lists each rival's price by airline name in
  addition to the cheaper-count line.
  ([TravelAgencyScene.ts](src/scenes/rooms/TravelAgencyScene.ts))

Also: extracted a small `addPresetRow()` helper in SettingsScene to share
the right-aligned preset-button layout across the cadence, severity, and
auto-repair pickers.

---

## 2026-05-10 — Buyable gate expansions (8 → 12 per hub)

Hubs used to expose a fixed 8 gates and silently wrap with modulo once you
had more planes than gates. Now apron capacity is part of the airline's
upgrade tree.

**State** ([Player.ts](src/state/Player.ts))
- `gateCounts: Record<hubId, number>` on Player (defaults to 8 via
  `gatesAt(hubId)` getter when an entry is missing). Persists in the save.
- `STARTING_GATES = 8`, `MAX_GATES_PER_HUB = 12`, plus `gateExpansionCost`
  helper: `(currentGates - 6) × $1M × hub.demand`. So at HNL (×1.0): gate
  9 = $2M, gate 10 = $3M, gate 11 = $4M, gate 12 = $5M. At LAX (×1.3): the
  same gates cost $2.6M / $3.9M / $5.2M / $6.5M. Big hubs cost more.

**UI** ([TravelAgencyScene.ts](src/scenes/rooms/TravelAgencyScene.ts))
- New "Airport" tab beside "Routes". Hub picker is shared across tabs.
- Airport tab shows current `gates / MAX` for the active hub, a "Buy +1
  gate" button (greyed when broke), and a preview of remaining gate costs
  so the player can plan the spend.
- `currentTab` is reset in `create()` to land you on Routes each entry —
  Phaser reuses the scene instance, so without the reset a previous Airport
  visit would persist across room reopens.

**Apron rendering** ([AirportScene.ts](src/scenes/AirportScene.ts))
- `gateXs` is now dynamic: `ensureGateLayout()` recomputes the array
  (evenly spaced between x=120 and x=1100) and redraws the gate boxes into
  a dedicated `gateBoxLayer` whenever the active hub or its gate count
  changes. 8 gates recover the original 140-px spacing; 12 gates tighten
  to ~89 px between centers, still fitting the same apron strip.
- Hub-change clears `gateByPlaneId` (gate assignments don't carry across
  hubs — different gate count, different spacing).

---

## 2026-05-10 — Stable per-plane gate assignment

A plane that landed at gate 3 used to visually hop to gate 1 the instant an
earlier gate became free — the gate index was computed each frame as
`idleListIndex % gateCount`, so removing any plane from the filtered list
shifted everyone behind it. Player saw: plane taxis to gate 3, deplanes,
then teleports to gate 1 for boarding before takeoff.

Fix ([AirportScene.ts](src/scenes/AirportScene.ts)):
`drawParkedPlanes` now treats `gateByPlaneId` as authoritative state
instead of rebuilding it from scratch. Each plane keeps its gate from
landing through boarding through takeoff. Gates are released only when a
plane is no longer at the apron AND no longer mid-animation, so the
landing icon, the parked beat, the boarding bar, and the takeoff icon all
share the same gate. `gateIndexFor()` assigns lazily on first call (lowest
free gate), so a fresh arrival picks an unoccupied slot and stays there.

---

## 2026-05-10 — Crew shortage warning: modal alert + tighter inline label

The full "⚠ N grounded — hire crew in Personnel" warning in the top HUD bar
was overflowing into the centered date strip, leaving both unreadable when
they overlapped ([HUDScene.ts](src/scenes/HUDScene.ts)).

Two changes:
- Inline label now reads `⚠ N grounded` — short enough to fit beside the
  fleet/routes/rep block without colliding with the date. Full instruction
  is still in the fleet-text hover tooltip.
- Added a one-shot `Modal.alert` ("Crew Shortage" + "Got it" button) that
  fires on the rising edge — when the shortfall transitions 0→positive or
  grows. `lastShortfallAlerted` tracks the last value we showed, so the
  modal doesn't reappear every frame the issue persists. Resolving the
  shortfall (hiring enough crew) resets it so a future shortage alerts
  again.

---

## 2026-05-10 — Bugfix: takeoff/landing animations silently swallowed

Two bugs sat on top of each other. Both caused the Maui (and every) route
to play sounds without ever showing a plane animation on the apron.

**Bug 1: RESUME snapshot erased the transition edge**
([AirportScene.ts](src/scenes/AirportScene.ts))

`snapshotStatuses()` was being re-run on every RESUME / WAKE event. The
clock lives in the HUDScene and keeps ticking while the airport is paused,
so `dispatchIdlePlanes` flips the plane idle→flying *during* the Travel
Agency visit. The takeoff sound fires from the dispatch system itself, but
the animation hook lives in `checkStatusChanges` (gated by a prev→cur edge
in `lastStatuses`). The RESUME snapshot overwrote `lastStatuses[plane]`
with the current `'flying'` value, so the next frame saw prev=cur=`'flying'`
and skipped the animation entirely.

Fix: keep the one-shot snapshot in `create()` (still useful for seeding new
planes the first frame), but drop the RESUME / WAKE handlers. First
post-resume frame now sees prev=`'idle'` / cur=`'flying'` and fires
`animateTakeoff` normally.

**Bug 2: same-tick land + redispatch hid the idle state**
([Flights.ts](src/systems/Flights.ts))

Even with Bug 1 fixed, a fully-cycling plane *still* never animated.
`registerFlightHooks()` runs `landArrivedPlanes()` and `dispatchIdlePlanes()`
back-to-back inside a single `clock.onTick` callback. The instant a plane
lands, the very next call in the same tick redispatches it. Inside one
synchronous JS callback, the status goes `flying → idle → flying` without
yielding a single Phaser frame. AirportScene's per-frame poller never sees
the `'idle'` value, so both the landing animation AND the boarding/takeoff
beat that follows it get silently skipped. The console heartbeat I added
to debug this confirmed it: the plane oscillated between
`flying hnl->ogg` and `flying ogg->hnl` with `last=flying` every time —
zero observed idle frames across thousands of ticks.

Fix: per-plane `lastLandedAt` cooldown of 15 game-minutes (≈3s real-time
at 1×) before a plane can be redispatched. That's enough headroom for the
2.8s landing animation to play out plus a brief parked beat at the gate
before the boarding bar fills. Module-scope state, not persisted — a
post-reload plane can dispatch on its first tick, which is the right
behavior (it's been idle "off-screen" for arbitrarily long).

---

## 2026-05-10 — Apron liveliness: staggered dispatch + in-transit strip

**Stagger** ([Flights.ts](src/systems/Flights.ts))
- A fleet of N planes that all become idle on the same tick used to leap
  off the apron together, leaving the airport looking empty mid-cycle.
  Now each player has a per-game-minute cooldown between dispatches —
  default 5 game-minutes (≈ 1s real-time at 1×). One plane lifts off,
  the next one waits ~1s, and so on.
- Module-scope `lastDispatchAt: Record<playerId, gameMin>`. Not persisted;
  resetting on page reload is harmless.

**In-transit strip** ([AirportScene.ts](src/scenes/AirportScene.ts))
- New `transitLayer` container under the apron showing one tag per flight
  currently outbound (`→ Maui`, gold) or inbound (`← Maui`, green) to the
  active hub. Sig-cached so it only rebuilds when the set of destinations
  changes, not every frame.
- Lives at `apronY + 45`, between the gate stalls and the runway, so it
  doesn't compete with takeoff/landing animations.

Together: takeoffs no longer arrive in bursts, and even when every plane
happens to be mid-flight the apron tells you what's coming back.

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
