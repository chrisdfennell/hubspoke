# Hub & Spoke — Changelog & Dev Blog

A running log of changes shipped to this game, in reverse-chronological order.
Each entry describes what changed, why, and (where useful) the math or
gameplay reasoning behind the change.

> Originally prototyped as an Airline Tycoon (1998) homage. Renamed to
> **Hub & Spoke** on 2026-05-10 — see entry below.

---

## 2026-05-11 — Bugfix: weekly newspaper fires one day late

User reported reaching day 8 with no paper popping up. Tracing:
`clock.onDay` fires *on the day transition* (when `d.day` increments
inside `Clock.advanceOneMinute`). The original implementation took
the baseline snapshot lazily on the first `onDay` fire, which meant
that first transition (01-01 → 01-02) didn't count toward the 7-day
window — it just-and-only seeded the baseline. Net effect: paper
landed on the 01-08 → 01-09 transition instead of 01-07 → 01-08,
costing the player an extra day.

Fix ([Newspaper.ts](src/systems/Newspaper.ts)): take the baseline
snapshot eagerly in `resetNewspaper()`, called from
`BootScene.go()` once GameState is bootstrapped. Every subsequent
`onDay` fire now increments the counter, so the 7th transition
fires the paper.

Existing saves loaded after this fix will take their baseline at
the current date on reload; their next paper drops 7 in-game days
later from that point.

---

## 2026-05-11 — Day / night cycle on the apron

The airport now reads the in-game clock visually — sky tint shifts
through dawn / day / dusk / night, and runway edge lights glow at
night and fade through the day. Pure atmosphere; doesn't affect
gameplay state.

**Implementation** ([AirportScene.ts](src/scenes/AirportScene.ts))

- New `skyOverlay` rectangle covering the apron + runway region
  (y=555 down). Its color + alpha are recomputed each frame from
  the current game hour via the new `daylightAt(t)` helper.
- New `runwayLightsLayer` — 14 paired top + bottom edge lights
  along the runway, each a soft outer halo + bright inner dot
  (yellow `0xffd44a` / `0xffe07a`). Static positions built once;
  visibility shifts via `setAlpha()`.
- `updateDaylight()` called from `update()` so the tint keeps up
  with the game clock at every speed without needing its own
  per-minute hook.

**Color/alpha keyframes** — file-scope `DAYLIGHT_KEYFRAMES`. Each
entry: `[hour, color, alpha, lightsAlpha]`. The `daylightAt(t)`
function finds the bracketing pair and linearly interpolates color
+ both alphas, so transitions are gradual rather than stepping at
hour boundaries. Phases:

- 00:00–05:00 deep night (`0x0a1a2c` @ 0.34), lights at full
- 06:00–07:00 dawn (`0xff7a3a` warm amber @ 0.22 fading)
- 09:00 onward to 16:00 midday — alpha drops to 0, no tint
- 18:00–19:00 dusk amber/red, lights coming up
- 20:00 evening blue with lights bright, transitioning back to night

Tunables (keyframe array near the bottom of `AirportScene.ts`) are
straightforward to tweak — change a hex value or push a new
keyframe and the lerp picks it up.

---

## 2026-05-11 — News Stand tabs: Voices / Headlines / World Events

The News Stand was only showing `state.gameEvents` (the structured
demand events). The 💬 passenger quotes and all the other ticker
content live in `state.news` — they were flashing by the bottom bar
and getting buried with no way to read them later. Fixed with tabs.

**Three tabs** ([NewsScene.ts](src/scenes/rooms/NewsScene.ts)):

- **Passenger Voices** (default) — every `💬`-prefixed item from
  `state.news`, prefix stripped. Date stamp on the left, quote on
  the right. Defaults to this tab so the first thing you see in
  the News Stand is the feedback you came to read.
- **Headlines** — every non-`💬` item from `state.news`. Arrivals,
  rival activity, milestone bumps, sabotage outcomes, sponsor
  offers and resolutions — the full ticker history, browsable.
- **World Events** — the original News Stand content: structured
  `gameEvents` with severity, headline, body, and impact.

Tab bar follows the same Button-based pattern as the Office tab
bar. Switching scrolls back to the top so a long history doesn't
leave you mid-scroll in the previous tab.

---

## 2026-05-11 — Sponsor section in the weekly newspaper + plane numbering

Two compounding additions to the just-shipped systems.

**Sponsor Watch section** — the weekly newspaper now includes a
"SPONSOR WATCH" section between The Week in Numbers and Letters
to the Editor, surfacing what happened with sponsor contracts:

- **Resolved this week**: one-line summary per contract that
  completed (★), failed (⚠), or expired (·) during the week.
  Filtered to the human's contracts only.
- **In progress**: one-line snapshot per active contract showing
  current progress / target / percent and destination.
- **New offers**: one-line ping for each available offer with the
  brand + pitch, nudging the player toward Office → Sponsors.

Plumbing: `WeekSnap` now also captures `sponsorCompletedLen` (the
length of `state.sponsorCompleted` at snapshot time). At week-end,
`tickNewspaper` slices the new entries since that index, filters
to the human, and bundles them into `WeeklyPaper.sponsorResolved`
alongside fresh `sponsorActive` and `sponsorOffers` snapshots.
Section auto-hides when all three lists are empty. Newspaper
panel grew from 590 → 650 px tall to fit the new section.

**Plane numbering on the apron** — every parked plane on your
active hub now shows its short id (e.g., `P3`) as a 9 px bold
label above the icon, 14 px above `apronY` so it clears the
BOARDING bar during takeoff. `plane.id` is sequential and
globally unique, so it doubles as a stable per-plane tag for
tracking which plane is which once the fleet grows past a
handful. Visiting rival planes keep their airline-name label
underneath instead.

---

## 2026-05-11 — Sponsor contracts

First proactive goal layer on top of the steady-state economy. Brand
sponsors periodically offer passenger-count deals: "Carry N
passengers to City X by day Y for $$$." Layered on top of normal
flights — every arrival of yours at the destination counts — so no
new flight type or dispatch path needed.

**State** ([Sponsor.ts](src/state/Sponsor.ts),
[GameState.ts](src/state/GameState.ts))
- `SponsorContract` interface with `target` / `progress` /
  `deadlineDay` / `reward` / `repReward` / `repPenalty` fields and a
  status of `available | active | completed | failed | expired`.
- Three arrays on GameState: `sponsorOffers` (available),
  `sponsorActive` (in-progress for the human), `sponsorCompleted`
  (history of resolutions). All persist in save/load with `?? []`
  fallbacks for save-compat.

**System** ([Sponsors.ts](src/systems/Sponsors.ts))
- `rollDailyOffers()` fires from a `clock.onDay` hook. Expires
  offers past their `offerExpiresOnDay`, then rolls a new offer
  with ~35% chance if there are fewer than 3 available. Target is
  500-2000 base scaled by destination city demand (so a Pago Pago
  contract is smaller than a Los Angeles one); reward is roughly
  $22-32 per passenger; duration is 7-21 days; offer expiry is 3
  days.
- `resolveActive()` (also daily) checks every active contract: if
  `progress >= target` → completed, pays the reward + bumps rep; if
  `today >= deadlineDay` → failed, dings rep by `repPenalty`. Posts
  ★ or ⚠ news headline depending on outcome.
- `trackArrival(player, route, passengers)` called from
  `Flights.landArrivedPlanes` for every successful arrival. Bumps
  `progress` on every matching active sponsor (filters by `ownerId
  === player.id` and `toCity === route.toCity`). AI is short-
  circuited — sponsors are a human-only mechanic right now.
- `acceptSponsor(player, sponsorId)` recomputes `deadlineDay`
  relative to the current day so you get the full advertised
  duration regardless of when in the 3-day offer window you accept.

**UI** ([OfficeScene.ts](src/scenes/rooms/OfficeScene.ts))
- New 'sponsors' tab in the Office tab bar (alongside Overview,
  Fleet, Routes, Standings).
- **Active** section: one card per accepted contract showing
  destination, progress (with a green fill bar), reward, and
  deadline. Days-left text turns red below 3 days.
- **Available offers**: one card per offer showing brand + pitch +
  target / duration / reward + offer-expiry. Accept and Decline
  buttons inline. Offer-expiry text turns red on the last day.
- **Recent history**: last 6 resolutions (completed / failed /
  expired) as a compact list.

**Brand + pitch pool** — 15 sponsor brands (Coca-Air, GlobalReach
Travel, Skyline Beverages, …) × 8 pitch templates (sponsoring a
sports team / launching a tourism campaign / …) gives ~120
combinations so offers don't read repetitive across a run.

---

## 2026-05-11 — Visible AI rivals on your apron

When a rival's route touches your active hub, their planes now
actually appear there. They land via animation, sit briefly in a
slim "visitor row" above the gate boxes in their airline color with
a name label, then animate their takeoff back out. Completes the
"alive airport" picture along with tarmac characters and the
weekly newspaper.

**Why a separate visitor row** — your numbered gate stalls are
state we already manage tightly (`gateByPlaneId`, gate expansion,
stable per-plane assignments). Mixing rival planes in would either
require rewriting gate assignment to handle multi-player ownership
or risk a rival hopping into a gate you'd assigned to one of yours.
A separate row sidesteps both and reads more clearly visually —
visiting planes are obviously visiting.

**Implementation** ([AirportScene.ts](src/scenes/AirportScene.ts))

- New `visitorLayer` container, drawn each frame by
  `drawVisitingPlanes()`. Iterates every AI player's planes;
  selects those that are idle at the active hub AND whose assigned
  route actually touches it (a stale-routeId check, otherwise a
  plane parked here by accident still renders). Caps at
  `MAX_VISITORS = 4` so a dogpile doesn't overflow horizontally.
  Each plane drawn at 0.7 scale in its owner's airline color, with
  a small `Segoe UI 9px` airline name centered below.
- New `checkRivalStatusChanges()` runs every frame, mirrors the
  existing `checkStatusChanges` for the human's planes but iterates
  all AI players and routes the animation through visitor-row
  endpoints instead of your gates.
- New `animateVisitorLanding(plane, owner)` and
  `animateVisitorTakeoff(plane, owner)` — simpler than the human
  versions (no BOARDING bar, no tarmac passengers — that flavor is
  reserved for your own apron). Path: runway threshold ↔ visitor
  slot. Owner's airline color used for the icon. Slot index
  derived from a stable hash of the plane id so a plane's
  arrival-slot and subsequent departure-slot match.
- Per-rival `rivalStatuses` snapshot + `animatingRivalIds` set
  follow the same pattern as the human's tracking, so the same
  transition-edge logic that drove your animations now drives
  rivals' too.

**Tunables** — `VISITOR_Y = 568` (above gate boxes at apronY + 18,
below the GATES label at apronY - 38), horizontal range
`VISITOR_X_LEFT = 200` to `VISITOR_X_RIGHT = 1000` (slightly inset
from your gate row at 120 / 1100 so visitor and gate slots don't
line up exactly).

---

## 2026-05-11 — Weekly newspaper modal

Gives the just-shipped passenger feedback (and the rest of the news
feed) actual weight by pacing it. Every 7 in-game days, a paper-styled
modal pops with the week's summary. Player reads at their own pace —
HUDScene is paused while the paper is up so the clock stops.

**System** ([Newspaper.ts](src/systems/Newspaper.ts))
- `tickNewspaper()` is called from a `clock.onDay` hook. Snapshots
  cumulative stats (flights / passengers / revenue / fuel) plus the
  player's cash, reputation, and net worth on day 1 baseline. On the
  7th subsequent day, diffs current vs. snapshot to build the week's
  deltas, then snapshots again for the next week.
- The week's news is filtered out of `state.news` by date comparison
  (`dateMin(item.date) >= dateMin(weekStart)`) and split into
  headlines (everything else) and letters (`💬`-prefixed passenger
  quotes from the new feedback system).
- Module-scope state (`daysSincePaper`, `lastSnap`, `pending`) is
  reset on `BootScene.go()` so a new run on the same tab doesn't
  inherit a stale baseline from the previous game.
- `pending` is the queued paper; HUDScene polls
  `consumePendingPaper()` each tick and launches NewspaperScene when
  one is available. Kept here (not on GameState) because it's
  transient UI — shouldn't persist with the save.

**Scene** ([NewspaperScene.ts](src/scenes/NewspaperScene.ts))
- Modal-style: dark backdrop + a 720×590 cream paper panel with a
  serif (Georgia) masthead, body, and accent-red section headers.
  Pauses HUDScene on create, resumes on dismiss (Continue button or
  Esc or Enter).
- Three sections, drawn top-to-bottom with a Y cursor so they flow
  naturally regardless of how many items each one has:
  - **Headlines** — the week's non-passenger news (capped at 8),
    bulleted, wrapped to panel width.
  - **The Week in Numbers** — 2-column grid: Flights / Revenue,
    Passengers / Fuel, Reputation (▲▼ delta) / Cash (▲▼ delta),
    Net worth (▲▼ delta).
  - **Letters to the Editor** — the week's 💬 quotes (capped at 5),
    with the prefix stripped (the section header already labels
    them), italic, indented.

**Wiring**
- `registerNewspaperHooks()` registered once in BootScene.create()
  alongside the existing system hooks.
- New `showWeeklyPaper: boolean` in GameSettings (default `true`).
  Setting toggle added between "Show competitor prices" and the news
  ticker filters in
  [SettingsScene.ts](src/scenes/rooms/SettingsScene.ts) so players
  who find it disruptive can flip it off.
- Scene added to the `main.ts` scene registry.

---

## 2026-05-11 — Passenger feedback drives reputation

Every revenue arrival now lands a small reputation delta based on what
the passengers actually experienced, and a roll has them say something
about it in the news ticker. Closes the loop between the upgrade /
maintenance / pricing systems and the rep number sitting in the HUD.

**Sentiment → reputation** (always applies, every flight)
([PassengerFeedback.ts](src/systems/PassengerFeedback.ts), wired in
[Flights.ts](src/systems/Flights.ts))

Each arrival rolls a sentiment delta capped to `[-0.10, +0.05]`:

- **Bare-metal penalty** — `-0.03` if the plane has no livery, no
  interior, and no entertainment equipped. Passengers notice the
  difference between "an airline that cares" and "the cheapest fleet
  on the apron." Composes with the existing `planeReputationPerFlight`
  drip so equipping any upgrade flips both signals at once.
- **Plane condition** — `+0.02` above 90%; `-0.02` between 40% and 60%;
  `-0.05` below 40%. A rattling neglected fleet drips rep down even
  when nothing crashes.
- **Ticket price vs. fair** — `-0.04` when priced >1.3× the suggested
  fair fare (gouging); `+0.02` when priced <0.85× (bargain). Pairs the
  pricing dial with a soft reputation cost so price-maxing isn't free.
- **Cramped cabin** — `-0.02` when load factor >95%. The flip side of
  "great LF" — packed flights are uncomfortable.

At ~50 arrivals/day for an active mid-game fleet, a maxed-out tidy
operation drips +1 to +2 rep/day passively; a bare neglected
overpriced one drips down at a similar rate. Per-flight cap keeps a
single rough flight from doing real damage.

**Sentiment → quotes** (rolls 8% chance per arrival)

When the roll hits, picks from weighted template pools matching the
same flight state — condition, equipped upgrades, price ratio, load
factor, current reputation — so the chatter feels earned. Examples:

- `💬 "Cabin smelled like burnt coffee for two hours. Sort it out,
  Honey Air." — disappointed` (low condition)
- `💬 "$320 LAX→JFK? Daylight robbery from Honey Air." — budget
  traveler` (price ratio > 1.3)
- `💬 "Honey Air's lie-flat suites are worth every penny." — premium
  passenger` (interior upgrade equipped)
- `💬 "Got me to JFK on time. Can't complain about Honey Air." —
  satisfied` (neutral / mid-rep catch-all)

Quotes are 💬-prefixed; HUDScene.classifyNews now routes that prefix to
the 'mine' category so the existing "Your airline" ticker toggle
controls them.

---

## 2026-05-11 — Tarmac passengers

The single biggest "feels like Airline Tycoon" beat we were still missing:
the apron now shows tiny stick-figure passengers walking between the gate
and the plane during the boarding and deplane phases.

**Implementation** ([AirportScene.ts](src/scenes/AirportScene.ts))
- New `spawnPassengers(gateX, phase, totalDurMs)` helper streams 5 figures
  along a single-file vertical track between the gate box and the parked
  plane. Walks staggered across the phase duration so multiple passengers
  are in transit at once. Color-matched to the existing label conventions
  — gold (`#ffc857`) for boarding, green (`#7be08a`) for arrived.
- New `makeStickFigure(x, y, color)` renders the figure as a head circle
  + body line via Phaser Graphics, sized (~4 px tall) to fit cleanly
  between the parked plane sprite at `apronY` and the gate box at
  `apronY + 18` without overlapping either.
- Wired into the existing animation phases:
  - `animateTakeoff`'s BOARDING bar (`this.a(800)` ms) → gate → plane.
  - `animateLanding`'s ARRIVED bar (`this.a(600)` ms) → plane → gate.
- `totalDurMs` is the already-game-speed-scaled duration of the phase, so
  at 4× speed the passenger stream compresses to match the shorter bar
  rather than spilling past it. Per-figure walk duration floored at
  `this.a(300)` ms so even at 4× they're not instantaneous flickers.

Reads as "passengers boarding / deplaning" at the apron's scale; sells the
gate phase as something happening rather than just a progress bar.

---

## 2026-05-11 — GitHub Pages deployment

Set up automated deploys to GitHub Pages so the game can actually be
played in a browser at `https://chrisdfennell.github.io/hubspoke/`.

**Vite config** ([vite.config.ts](vite.config.ts))
- Added `base: '/hubspoke/'` when `NODE_ENV=production`, falling back to
  `'/'` for local `npm run dev`. The repo name on GitHub is `hubspoke`,
  so Pages serves the site under that subpath — Vite needs the base set
  at build time so script tags resolve correctly. Verified: built
  `index.html` references `/hubspoke/assets/index-*.js`.

**GitHub Actions workflow** ([.github/workflows/deploy.yml](.github/workflows/deploy.yml))
- On every push to `main` (and manual dispatch): checkout → Node 20
  with npm cache → `npm ci` → `npm run build` with `NODE_ENV=production`
  → `touch dist/.nojekyll` so Pages doesn't try to Jekyll-process the
  asset folder → upload `dist/` as a Pages artifact → deploy.
- Uses the modern `actions/deploy-pages@v4` flow (not the legacy
  branch-push approach), so `dist/` never lives in git history.
- Standard `pages: write` + `id-token: write` permissions + concurrency
  guard so two rapid pushes can't race.

**One-time manual step** (cannot be automated from here): go to the
repo's GitHub Settings → Pages → set **Source: GitHub Actions**.
After that, every push to main rebuilds and redeploys.

---

## 2026-05-10 — Sabotage actually hurts now

The Security room and its 9 items existed but the consequences of a
landed sabotage were lukewarm — a few rep points off and one plane's
condition halved. Worth ignoring. The full pass:

**Sabotage effects rewritten** ([Sabotage.ts](src/systems/Sabotage.ts)):
- **Banana Peel** ($5k) — rep −5 on the target. Light tier.
- **Super Glue** ($18k) — grounds one idle plane for 6 game-hours
  with condition cut to 60%, rep −5. If no idle planes, a flying
  plane takes a 40% condition hit (raising mid-flight crash odds).
- **Virus USB** ($35k) — TARGET'S home hub (not always HNL — a
  London rival is hit at LHR) takes a −50% demand modifier for 4
  days. Rep −7.
- **Incendiary** ($90k) — hangar fire. Up to 3 idle planes grounded
  for 12 game-hours with condition reduced to 30%, rep −20. Named
  news headline when the saboteur is caught.

**Maintenance status is alive** ([Flights.ts](src/systems/Flights.ts)):
- `PlaneStatus.maintenance` was defined but never actually used.
  Saboteur now sets it; new `releaseMaintenancePlanes` hook (added to
  the per-tick callback) transitions planes back to `idle` once their
  `doneAt` is reached. Posts a "returned to service" news entry for
  the human.

**AI sabotages you back with real teeth** ([Sabotage.ts](src/systems/Sabotage.ts)):
- AI's daily sabotage no longer uses a free banana peel. AI now
  *buys* a sabotage item from the same Duty Free catalog the human
  uses (pays cash, picks heavier items when flush), and runs it
  through the same `attemptSabotage` resolver — so blocked attempts
  generate the same "caught red-handed" headlines for AI saboteurs
  that they do for the human.
- Target selection biased toward the cash leader. A run leader gets
  more sabotage attempts thrown at them than a struggling rival.

**Apron visibility** ([AirportScene.ts](src/scenes/AirportScene.ts)):
- "IN TRANSIT" strip now also lists grounded planes (`🔧 PlaneName`,
  pink) so the player can see at a glance why an expected dispatch
  isn't happening. Same row, color-coded by status.

Net effect: the run leader (often the player late-game) now actually
fears the next Newsstand headline. The Security room finally pulls
its weight as both a defensive (CCTV / K-9 / Cyber Shield) and an
offensive surface.

---

## 2026-05-10 — Ticket-price buttons: bigger, labeled, four steps

The `−` / `+` adjusters in the Travel Agency route detail were 28-px
hard-to-find buttons shoved to the right edge of the row. Player didn't
realize they could change route prices at all. Replaced with a four-button
cluster (`−$50`, `−$10`, `+$10`, `+$50`) placed directly next to the
ticket value, with explicit dollar labels so the affordance is obvious.
Ticket value bumped to 14-px accent color for the same reason.
([TravelAgencyScene.ts](src/scenes/rooms/TravelAgencyScene.ts))

---

## 2026-05-10 — Smarter AI rivals (and the same rules apply)

AI overhaul aimed at two complaints: rivals felt asleep at the wheel,
and they were quietly skipping some of the constraints the human had
to deal with. ([AI.ts](src/systems/AI.ts),
[GameState.ts](src/state/GameState.ts))

**Parity — AI plays by the same rules**:
- Each AI rival now rolls a random CEO at bootstrap and applies the
  same starting-cash + starting-inventory perks (and reads the same
  live perks for loan APR, repair discount, condition decay, duty-free
  multiplier) the human gets. No more "human gets Anita's $1M bonus
  while AI gets nothing."
- AI now repairs its fleet on the same Workshop cost formula the
  human's auto-repair setting uses, gated by the AI's CEO repair
  discount and threshold-checked at 40% condition (a hair more
  conservative than the human's 50% default — saves AI cash).
- Already-shared: crew hire costs, daily payroll, fuel, condition
  decay, mid-flight crash/incident odds, dispatch stagger, turnaround
  cooldown, loan interest, crew-capacity flight cap. AI was already
  paying these; CEO perks now give them the same dials humans get.

**Smarter — AI plays well**:
- **Undercut pricing**: when opening a new route, AI scans every
  existing rival route on the same city pair and prices its starting
  ticket one $5 step below the cheapest, with a 60%-of-fair floor so
  prices can't crater.
- **Defensive repricing**: each day, the AI walks its own routes and
  if any rival is cheaper on the same pair, drops its own ticket one
  $5 step toward theirs (same 60%-of-fair floor). Single step per day
  so a price war can't spiral overnight.
- **Smarter expansion targets**: new-route picker now scores each
  reachable city by `demand × 10 − rival_count × 3 + jitter`, biasing
  the AI toward high-demand low-competition pairs the way a human
  would. Previously it picked uniformly at random.

Net effect: opening a route to a city the AI already serves now actually
costs you — they undercut you on price and the route's economics shift.
Existing AI routes also defend themselves against your encroachment over
the next few in-game days.

---

## 2026-05-10 — Career stats: live panel + game-over screen

Two surfaces for the same data so the player can check progress mid-run
and also see a proper summary when the run ends.

**State** ([GameState.ts](src/state/GameState.ts))
- `GameStats` interface with 14 cumulative fields: flights, passengers,
  km, revenue, fuel, bestFlightProfit, worstFlightLoss, crashes,
  incidents, routesOpened, planesBought, hubsBought, daysPlayed,
  peakNetWorth.
- `state.stats` on GameState, persisted in `GameSnapshot.stats`
  (optional for backwards-compat with pre-stats saves; defaults applied
  on load via `{ ...DEFAULT_STATS, ...(snap.stats ?? {}) }`).

**Tracking**:
- Flights / passengers / km / revenue / fuel / best+worst flight all
  updated in `Flights.landArrivedPlanes` after each revenue arrival
  (human only).
- Crashes / incidents counted in `Flights.maybeMishap`.
- routesOpened bumped on TravelAgencyScene "Open route" click.
- planesBought bumped on WorkshopScene buy.
- hubsBought bumped on WorldMapScene buy.
- New `Stats.ts` system hooks `clock.onDay` for daysPlayed +
  peakNetWorth high-water mark; `registerStatsHooks()` wired into
  BootScene.

**UI**:
- `renderStatsBlock` ([StatsBlock.ts](src/ui/StatsBlock.ts)) — shared
  two-column grid renderer. Optional `container` param routes texts
  into a scrollable RoomScene container when needed.
- `StatsScene` ([StatsScene.ts](src/scenes/rooms/StatsScene.ts)) — a
  RoomScene reachable from a new 📊 button in the HUD (between the
  speed text and the ? help button). Shows current cash / net worth /
  reputation on top, then the stats block.
- `GameOverScene` rewritten to slot the same stats block between the
  message and the Back-to-Title button, giving every run a proper
  closing summary.

---

## 2026-05-10 — Boost cooldown: one use per game-day

Player could climb from 39 to 100 reputation by spamming Marketing
Campaigns + Press Conferences in a single Duty Free visit — ~$1M
total. Now each instant-use boost item (`marketing`, `press-spin`,
`pilot-prog`) is gated to a single purchase per game-day per item.

Implementation ([DutyFreeScene.ts](src/scenes/rooms/DutyFreeScene.ts),
[Player.ts](src/state/Player.ts)):
- `Player.boostUsedOn: Record<itemId, dayCount>` — persisted with the
  save, defaults to `{}` for old saves.
- DutyFreeScene checks `me.boostUsedOn[item.id] === today` when
  rendering each boost row; if so the button reads "Used today" and is
  disabled, with a red "Used today — available again tomorrow." hint
  underneath.
- After a successful purchase, `boostUsedOn[item.id] = today` is
  recorded. Defense + sabotage items are unaffected (they go into
  inventory rather than firing immediately).

Net effect: marketing now caps at ~5 rep/day, which is sustainable but
no longer skip-the-game level. Pairs with the slow per-flight rep drip
from livery upgrades for a "passive + active" mix.

---

## 2026-05-10 — Plane livery + interior upgrades

Per-plane customization, the biggest "this is Airline Tycoon" beat we
were still missing ([upgrades.ts](src/state/upgrades.ts),
[WorkshopScene.ts](src/scenes/rooms/WorkshopScene.ts)).

**Three categories, one slot each**:
- **Livery** (cosmetic + reputation drip per arrival) — Classic Stripe
  ($50k, +0.05 rep), Tropical Sunset ($120k, +0.10), Gold Trim ($250k,
  +0.18), Carbon Matte ($400k, +0.25).
- **Interior** (load-factor multiplier) — Premium Seats ($180k, +5%),
  Business Cabin ($550k, +10%), Lie-Flat Suites ($1.2M, +16%).
- **Entertainment** (load-factor bump) — Onboard Wi-Fi ($90k, +3%),
  Seat-back AVOD ($240k, +6%), Streaming Suite ($480k, +9%).

A maxed-out wide-body picks up roughly +25% load factor and +0.5 rep
per arrival.

**Plumbing**:
- `Plane.upgrades: { livery?; interior?; entertainment? }` — at most one
  per category. Serialized in `PlaneSnapshot.upgrades` (optional for
  backwards-compat with pre-upgrade saves; `fromJSON` defaults to `{}`).
- `flightProfit` multiplies expected LF by `planeLoadFactorBonus()`,
  capped at 1.0 so we never exceed seat count.
- `landArrivedPlanes` adds `planeReputationPerFlight()` to the player's
  rep (clamped to 100) on every successful revenue arrival.

**UI** — Workshop fleet row gained an "Outfit" button beside Repair /
Rename. Clicking opens a focused per-plane detail view: three category
panels with the equipped upgrade highlighted, Install / Remove buttons,
and price + effect columns. Back button returns to the buy + fleet
overview. View state resets on every scene entry so leaving + re-entering
the Workshop always lands you on the default screen.

---

## 2026-05-10 — Procedural background music

Same procedural-everything ethos as the rest of the audio system — no
external assets ([Sound.ts](src/systems/Sound.ts)). Three loops built
out of overlapping sine pad voices (a slow chord progression) plus a
sparse triangle-wave melody picked from a pentatonic scale at random
intervals, all gated by short attack/release envelopes:

- **`airport-lobby`** — Am → F → C → G, ~4s per chord. Slightly
  melancholic, runs during the AirportScene + rooms.
- **`world-map`** — Dm → Bb → F → A, ~6s per chord. More open and
  airy; takes over while the Control Tower map is up.
- **`title`** — Cmaj → Am → F → G, ~3s per chord. Faster and brighter,
  reserved for the BootScene title (not yet wired — would slot in if we
  later switch the boot screen to gameplay-state).

**Plumbing**:
- `sound.startMusic(track)` / `sound.stopMusic()`.
- `sound.setMusicVolume(v)` (0..1) — persisted in localStorage so it
  survives reloads independently of the SFX mute toggle.
- Mute (the speaker button in the HUD) now halts music scheduling on
  the way down (saves CPU on a silent loop) and re-starts whatever
  track was last requested on the way up — scenes don't need to listen
  to the mute event.
- BootScene.go() kicks the airport-lobby track inside the user-gesture
  click handler so the AudioContext is allowed to resume from suspended.
- WorldMapScene swaps to `world-map` on open, back to `airport-lobby`
  on close.
- GameOverScene calls `stopMusic()` to end the loop and clear the
  desired track (no auto-restart on un-mute from the game-over screen).
- New "Background music" preset row in Settings (Off / Low / Medium /
  High) using the same `addPresetRow` helper as the other dial-style
  options.

---

## 2026-05-10 — Animations scale with game speed (kills the 4× "poof")

Even with the same-plane chain fix, a plane on a short route (HNL ↔ Maui
= 1.3s flight at 4×) would still "poof" after deplaning. Root cause: the
2.8s landing animation runs in real time while the in-game cycle runs
~4× faster — by the time the landing's `onComplete` fired, the plane had
already landed at OGG, dispatched back, and was mid-return. The chained
`startTakeoff` then bailed validation (`plane.status.from !== 'hnl'`) and
the gate was empty.

Real fix: animation durations are now scaled by `GameState.speed` via a
new `this.a(ms)` helper ([AirportScene.ts](src/scenes/AirportScene.ts)).
At 1× the landing is 2800ms; at 2× it's 1400ms; at 4× it's 700ms. The
in-game turnaround is 15 game-min = 3000/speed ms — so the landing
animation is always strictly shorter (14 game-min < 15 game-min) and
the plane never finishes its return trip before its arrival animation
ends.

Touched: every duration in `animateTakeoff`, `animateLanding`,
`flashLabel`, and the `activeLandingEndsAt` end-time computation. Tween
durations during a single anim are still constant — changing speed
mid-flight doesn't retroactively stretch an in-progress tween — but each
new animation picks up the current speed.

---

## 2026-05-10 — Takeoff: chain off landing onComplete to kill the frame gap

Even after deferring the takeoff icon (rather than just the BOARDING bar)
until after a hold, the user still saw the plane vanish for ~1 frame at
2× / 4× speeds — specifically at G1, and intermittently ("sometimes it
works, sometimes it doesn't"). That intermittency was the giveaway: a
frame-ordering race between Phaser's time-event firing (`delayedCall`)
and the landing tween's `onComplete`. Both were scheduled for the same
scene-time, but they don't always land in the same frame slot — depending
on the frame delta, one could fire one frame before the other, leaving the
gate empty.

Fix ([AirportScene.ts](src/scenes/AirportScene.ts)):
- New `onLandingComplete: Map<planeId, () => void>` field — a chained
  continuation registered when `animateTakeoff` is called *while THIS
  plane's own landing animation is still running*.
- The landing's final `onComplete` callback now: destroys the landing
  icon, clears bookkeeping, **then** synchronously invokes the chained
  takeoff start. New icon is created in the same callback that destroyed
  the old one — no race, no frame gap.
- Sibling-plane hold path still uses `delayedCall` (different plane's
  landing onComplete doesn't have our continuation, and the visual race
  there isn't a same-gate merge).
- Synchronous path when nothing is active — avoids the
  `delayedCall(0)` 1-frame delay at 1× speed where landing always
  finishes before turnaround expires.

---

## 2026-05-10 — Takeoff hold: defer the *icon*, not just the boarding bar

First-pass fix held only the BOARDING phase but created the takeoff icon
immediately, which at 2× / 4× speeds (turnaround cooldown shorter than the
2.8s landing animation) produced *two icons for one plane* — a phantom
parked icon waiting at the gate while the landing icon for the same plane
was still taxiing in. They visibly merged when the landing reached the
gate.

Fix: in `animateTakeoff` ([AirportScene.ts](src/scenes/AirportScene.ts)),
move icon creation INSIDE the `delayedCall` so nothing is drawn during the
hold. The gate is still reserved on entry (animatingIds.add) so
gateByPlaneId cleanup doesn't release the slot. After the hold we
re-validate that the plane is still flying out of the active hub — at
4× speed it may have already completed another cycle and be somewhere
else — and silently skip the anim if state moved on.

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
