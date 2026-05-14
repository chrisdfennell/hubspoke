# Hub & Spoke — Changelog & Dev Blog

A running log of changes shipped to this game, in reverse-chronological order.
Each entry describes what changed, why, and (where useful) the math or
gameplay reasoning behind the change.

> Originally prototyped as an Airline Tycoon (1998) homage. Renamed to
> **Hub & Spoke** on 2026-05-10 — see entry below.

---

## 2026-05-14 (later 8) — Campaign mode

Five scripted scenarios with hand-picked starting conditions,
objectives, and deadlines. Sandbox win conditions ($1B net worth,
all rivals eliminated) are suppressed during a campaign — the run
resolves only on the scenario's own terms.

### Scenarios shipped

| Icon | Name | Difficulty | Hub | Deadline | Objective(s) |
|---|---|---|---|---|---|
| 💰 | **First Million** | easy | HNL | 60 days | $1M net worth |
| 📦 | **Cargo King** | normal | JFK | 180 days | 30 deliveries + 200,000 kg lifetime |
| 🌐 | **Empire Builder** | normal | LAX | 360 days | 5 routes + 10 planes + $50M net worth |
| 🌍 | **Globetrotter** | normal | LHR | 360 days | 4 hubs + 15 routes |
| ☠ | **Hostile Takeover** | hard | JFK | 360 days | 500,000+ Falcon Lines shares |

### Architecture

- `state/scenarios.ts` — `Scenario` + `ScenarioObjective` types,
  SCENARIOS registry, `evaluateScenario(state)` helper that returns
  live progress + deadline status.
- `GameState.scenarioId` + `scenarioStartDay` — persisted in saves
  so a campaign survives reload.
- `GameState.reset(..., scenarioId?)` — fifth optional parameter
  binds the scenario at game-start.

### Flow

`Save slot → 🏆 Campaign button → Scenario picker → click card → run starts`

The scenario picker shows all five cards stacked vertically with
icon, name, difficulty/hub/deadline meta, and a bulleted objective
list. Clicking a scenario starts the run immediately — using the
scenario's preset difficulty + hub, default airline name (renameable
in-game via Office).

### Mission HUD

Always-visible overlay at top-right of the play area showing:
- Scenario name + icon
- Objectives complete (e.g. `2 / 3 complete`)
- Days remaining (turns amber ≤30, red ≤7, "deadline passed" after)

Hidden entirely during sandbox runs.

### Win/lose detection

`HUDScene.checkGameOver` now branches on `evaluateScenario(state)`:
- **All objectives complete** → victory game-over.
- **Deadline passed** → defeat game-over with objectives-met count.
- **Still running** → skip sandbox-style victories so the run doesn't
  end prematurely on a $1B net-worth crossing.
- Bankruptcy and creditor seizure still end campaigns the same way
  they end sandbox runs.

---

## 2026-05-14 (later 7) — Creative mode

A new 5th difficulty added to the picker — the no-friction sandbox.

### Tagline

> Creative — No pressure. No rivals. Build whatever you want.

### What's different

**Starting conditions**:
- $1,000,000,000 starting cash (enough to buy every plane in the
  catalog with change to spare).
- 50 pilots / 50 mechanics on payroll.
- Loan APR multiplier 0× (interest-free borrowing if you bother).
- Required monthly principal: 0% (no creditor risk).

**No pressure systems**:
- AI rivals: `aiDailyTurn` early-returns in Creative — rivals sit
  dormant at their starting hub, never expand, never buy planes,
  never bid sponsors/cargo, never sabotage, never trade stocks.
- Random events: `eventChance: 0` — no oil shocks, no hurricanes,
  no tourism booms, no scandals.
- Crashes & incidents: `maybeMishap` early-returns when
  `difficulty === 'creative'` — neglected planes don't crash; you
  can fly a 5%-condition plane forever without consequence.

**What still works**:
- All of the room scenes, contracts, upgrades, hubs, achievements.
- Cargo + charter delivery still credits stats and pays out.
- Time progression, day cycles, weather cosmetics (just no
  mechanical impact).
- Save/load, music, sound, settings.

### Where to find it

New game → Choose Difficulty: **Creative** is the first card,
above Easy. Panel was bumped from 460 → 560px to fit the 5th row.

Difficulty card order: Creative → Easy → Normal → Hard → Brutal.

### What's next: Campaign mode

Coming separately. Creative is the "screw around with everything"
mode; Campaign will be the "scripted scenarios with win/lose
conditions" mode. They're complementary.

---

## 2026-05-14 (later 6) — In-flight retail (ancillary revenue)

Every revenue flight now earns ancillary revenue on top of ticket
sales — bag fees, snacks, food + drink, paid Wi-Fi. The amount per
passenger depends on what cabin/entertainment upgrades the plane has
installed, giving the Workshop outfit decisions a second revenue
dimension on top of the existing load-factor boost.

### Mechanic

```
ancillary = passengers × planeAncillaryPerPax(upgrades)
revenue   = (passengers × ticketPrice) + ancillary
```

`planeAncillaryPerPax` starts from `ANCILLARY_BASE_PER_PAX = $8` and
stacks any installed interior + entertainment upgrades.

### Per-upgrade ancillary

Added to existing upgrade catalog entries (alongside the existing LF
bonus):

| Upgrade | + $/pax |
|---|---|
| Premium Seats | +$3 |
| Business Cabin | +$8 |
| Lie-Flat Suites | +$15 |
| Onboard Wi-Fi | +$2 |
| Seat-back AVOD | +$4 |
| Streaming Suite | +$7 |

Maxed-out passenger plane (lie-flat + streaming + base) = $30/pax
of ancillary revenue per flight. For a 354-pax B747 at 85% LF,
that's $10,620 extra per flight (~3% boost on a typical $354K
ticket revenue at long-haul fares).

For an early-game Cessna (11 pax, $8 base, no upgrades), that's
$88 extra per flight (~11% boost on $770 ticket revenue) — meaningful
help when starting out, but not balance-breaking.

### Wire-through

- `state/upgrades.ts` — added `ancillaryPerPax?: number` to the
  `Upgrade` interface, `ANCILLARY_BASE_PER_PAX` constant, and
  `planeAncillaryPerPax(upgrades)` helper. Updated existing entries.
- `systems/Economy.flightProfit` — return type adds `ticketRevenue`
  and `ancillary` line items (backward-compatible additive change);
  the existing `revenue` field includes ancillary so ops/share-of-
  revenue calculations see the full bottom line.
- `WorkshopScene` Outfit view — each upgrade row now shows `+$N/pax`
  alongside the existing `+N% LF` and `+N rep/flight` columns.

### Symmetric for AI

`flightProfit` runs for every player's flights — AI rivals earn
ancillary too. Since `aiBuyUpgrades` already targets interior +
entertainment, AI rivals benefit from this organically. No extra
AI plumbing needed.

Charters and cargo deliberately don't get ancillary: charters
already pay a 1.5× premium over fair fare, and cargo has no
passengers.

---

## 2026-05-14 (later 5) — Weather events

Six new weather-event blueprints, each pairing a demand drop with a
new **mishap-chance multiplier** at the affected city. Storms now
*matter operationally* — not just for ticket sales but for whether
your neglected plane declares an emergency on approach.

### New `weatherHazards` state

`state/weatherHazards.ts` mirrors `demandModifiers.ts` line-for-line:
per-city multiplier stack, expires by game-day, `applyWeatherHazard()`
to write and `getHazardMult()` to read. Persisted in the snapshot
alongside demand modifiers. Default multiplier is 1.0 (no effect).

### Wired into Flights.maybeMishap

The mishap-chance pipeline now reads the destination's hazard
multiplier:

```
failChance = (0.5 − condition) × 0.4
           × moraleMishapMult(player.morale)
           × getHazardMult(destinationCity, today)
```

A pristine plane still won't mishap (the `condition < 0.5` gate),
but a marginal plane landing into a hurricane is much more likely to
declare an emergency than the same plane landing in clear weather.

### Weather event blueprints

Each has a per-day weight, hits one city (chosen from a climate-
appropriate pool), and stacks both `applyDemandMod` and
`applyWeatherHazard`:

| Event | Cities | Demand × | Mishap × | Days |
|---|---|---|---|---|
| Thunderstorm cluster | Tropical+coastal | 0.65 | 1.40 | 2 |
| Hurricane / typhoon | Tropical | 0.30 | 2.00 | 5 |
| Blizzard | Cold-climate | 0.55 | 1.60 | 3 |
| Dense fog | Foggy-prone (SFO, LHR, …) | 0.80 | 1.25 | 1 |
| Heatwave | Hot-climate | 0.85 | 1.15 | 4 |
| Ice storm | Cold-climate | 0.40 | 1.80 | 2 |

Climate buckets are defined at the top of `Events.ts` — tropical
cities (HNL, MIA, SIN, MEX, BKK, …), cold-winter cities (ORD, JFK,
MSP, FRA, ICN, NRT, ANC, …), heatwave-prone cities (PHX, LAS, DFW,
DXB, …), fog-prone cities (SFO, LHR, CDG, AMS, …). A snowstorm in
Singapore won't fire; a hurricane in Boston won't either.

All weather magnitudes scale with `settings.eventSeverity` (Off/Mild/
Normal/Harsh) like every other event, so a 'mild' run halves storm
impact and 'harsh' multiplies it by 1.5×.

### What this changes

- **Run-to-run variety** — every game has different weather
  fingerprints depending on which blueprints fire and where.
- **Operational stakes** — keeping your fleet at high condition
  matters more in stormy seasons, because a neglected plane has
  ~2× crash chance landing into a hurricane.
- **Hub strategy** — basing your airline at a notorious-weather
  city (e.g. ORD for blizzards, MIA for hurricanes) has real ops
  cost vs basing at a fair-weather hub.

---

## 2026-05-14 (later 4) — 18 US international airports + range filter

### 18 US international airports added

The catalog jumped from 46 → 64 cities. Picks span the biggest gaps:

| Tier | Cities |
|---|---|
| Mega hubs | DFW, EWR, CLT, IAD, PHL |
| Major hubs | PHX, MCO, LAS, MSP, DTW, SLC |
| Regional | SAN, TPA, BWI, PDX, AUS |
| Outliers | ANC (Alaska), SJU (Puerto Rico) |

DFW was a notable absence — American Airlines' largest hub and one
of the busiest airports in the world. Now you can base out of Dallas
or have a rival do it. Demand multipliers calibrated to real traffic
(DFW 1.4 mega-hub, mid-tier hubs 1.1–1.2, regional 1.0, outliers
0.9). All systems (routes, cargo, charters, sponsors, lounge contacts,
hub picker, AI hub randomization) pick up the new cities
automatically.

### Travel Agency: out-of-range destinations dimmed

A destination beyond your fleet's max range used to look identical
to one in range — the dispatch would just silently fail later. Now:

- The header shows `Fleet max range: N,NNN km — destinations beyond
  it are dimmed.` when you have any planes.
- Rows where `distance > fleetMaxRange` render in the dim text color,
  with the distance cell suffixed `(out of range)` in red.
- The `Open route` button still works — you might be planning to buy
  a longer-range plane later. The visual cue is "this won't fly
  today, not this is locked."

With the catalog at 64 cities and a starter Cessna's 1,900 km range
on day 1, this fixes the "why isn't my route launching?" mystery
that the bigger catalog made more painful.

---

## 2026-05-14 (later 3) — Pick your hub + randomized AI rivals

The expanded 46-city catalog made HNL feeling like a forced default
even more obvious. New flow at game start:

### New hub-picker step

A fifth step in the new-game flow, after the airline picker:

`Slot → Difficulty → CEO → Airline (name + tail) → **Hub** → Start`

Major-demand cities (≥ 1.0) shown as a 5×N grid sorted by demand
descending. Selected hub highlights gold; the summary line shows
`Selected: City, Country · demand × N.NN` so you know what tier
market you're choosing. Defaults to HNL to match the Honey Air
classic experience for first-run players.

### Randomized AI rival hubs

AI rivals (Falcon, Phoenix, Tucan) used to be hardcoded to LAX, JFK,
LHR. Now they pull random hubs at bootstrap from the same
major-demand pool, excluding the human's chosen hub and each other.
So every run spawns the rivals at different cities — sometimes you
share a continent with all three, sometimes you're alone in
Hawaii/Asia with rivals scattered across Europe.

New `pickRandomAIHubs(humanHub, count)` helper in GameState.ts —
shuffle, take N, fallback to lower-demand if the pool isn't deep
enough (defensive only at current 46-city catalog).

### Wire-through

- `GameState.reset(difficulty, ceoId, customAirline, customHub)` —
  new optional parameter.
- `GameState.bootstrap(ceoId, customAirline, customHub)` — same.
- `BootScene.startNewGame(...)` passes `customHub` through.
- Pre-existing v2 balance migration that "resets AI hubs to defaults"
  only fires for AIs at HNL (the legacy default), so randomized
  hubs in new saves won't get clobbered on load.

---

## 2026-05-14 (later 2) — More cities + cargo & charter achievements

### 16 new cities

The catalog jumped from 30 → 46 with regional gap-fills:

| Region | Cities added |
|---|---|
| US interior/east | ATL, DEN, BOS, IAH |
| Canada | YVR |
| South America | EZE (Buenos Aires), BOG (Bogotá) |
| Europe | AMS, MUC |
| Middle East | DOH |
| Asia | BKK, DEL, TPE, KUL |
| Oceania | MEL, AKL |
| Africa | CPT |

Demand multipliers calibrated to real-world hub traffic (ATL 1.4
because it's one of the busiest airports on the planet; AMS 1.4 for
Schiphol; secondary hubs 1.0–1.2). All routes / cargo / charters /
sponsors / lounge contacts use the same catalog, so the new
destinations show up in every system automatically.

### 9 cargo + charter achievements

New stats fields on `GameStats`:
- `cargoDeliveries`, `cargoKgShipped`, `cargoBiggestPayment`
- `charterDeliveries`, `charterPaxFlown`, `charterBiggestGroup`

Incremented in `Cargo.landArrivedCargo` and `Charters.landArrivedCharters`
(human-only — AI cargo deliveries don't tally toward the player's
achievement progress).

| ID | Name | Target |
|---|---|---|
| first-cargo | First cargo delivery | 1 |
| cargo-10 | 10 cargo deliveries | 10 |
| cargo-100 | 100 cargo deliveries | 100 |
| cargo-1m-kg | Million-kg shipper | 1,000,000 kg lifetime |
| cargo-big-pay | Big haul | $1M+ single contract |
| first-charter | First charter | 1 |
| charter-10 | 10 charters delivered | 10 |
| charter-100 | 100 charters delivered | 100 |
| charter-big-group | Mega charter | 300+ pax single contract |

All land under the existing `operations` category so they show up in
the Stats panel alongside the flight + passenger counters.

---

## 2026-05-14 (tune) — Rested-crew threshold bumped

**Reported**: with 4 planes and 6 pilots, utilization showed 67%
(balanced) — but two extra pilots over fleet size should read as
"rested" with surplus crew slack.

Old threshold: `< 0.5` for rested (i.e., 2× more pilots than flying
planes). That bar was unrealistically high — real airlines run
~80% pilot utilization, so anything sub-70% should already feel
slack.

New threshold: `< 0.7` for rested. So 67% utilization now reads
"rested (+2 morale/day)" instead of "balanced (no change)." The
band `0.7..1.0` is still "balanced" — that's close to 1:1
crew-to-active-planes, which is "fully employed but not
overworked." Overworked thresholds unchanged.

Net effect: surplus crew now actually pays off in steady morale
growth, which was the intent of the morale system.

---

## 2026-05-14 (later) — Four new Settings toggles

Filling in long-standing items from the Settings roadmap.

### Auto-hire crew on plane purchase

Default off. When on, buying a plane (new or used) that would leave
you understaffed auto-hires the missing pilot + mechanic at the
standard rate ($8K / $4K). Cash is charged like a manual hire, so
all the downstream consequences (morale +2, payroll growth) stay
identical. Stops if cash runs out mid-loop — you can finish hiring
manually in Personnel.

### Confirm purchase at $ threshold

The big-purchase confirm modal used to fire at a hardcoded $50M.
Now settings-controlled: `$10M / $50M (default) / $100M / Never`.

"Never" returns `Infinity` from the threshold helper so the modal
literally cannot fire. Useful late-game when every plane purchase
is a $200M+ widebody and the modal turns into spam.

### Fuel-price volatility

The daily fuel-price random walk amplitude is now a knob:

| Setting | Daily noise |
|---|---|
| Off | ±0 (mean-reversion only) |
| Low | ±$0.005 |
| Normal | ±$0.01 (the historical default) |
| High | ±$0.02 |

Mean reversion toward `FUEL_BASELINE` ($0.80) still applies at the
same 4%/day rate regardless of setting. "Off" freezes price near
baseline; "High" gives runs more volatile fuel-driven margin swings.

### SFX volume

Music and SFX share the master gain but didn't have separate trim.
New `sfxGain` bus between every `envelope()` and the master, with a
matching `Sound effects: Off / Low / Medium / High` preset row in
Settings (same shape as the music volume row). Volume is persisted
in localStorage under `airline-tycoon-sfx-vol`.

The top-right mute toggle still silences everything as before — the
SFX slider trims sound effects without touching music, and vice
versa.

---

## 2026-05-14 — Charter contracts + 4 new planes

### Passenger charters

New contract type paralleling cargo: pay-up-front passenger one-offs.
"Fly N pax from A to B by day Z for $X." Same lifecycle — accept,
dispatch, deliver — but uses passenger seats instead of cargo
capacity, and pays a **1.5× premium** over what filling those seats
at fair fare would yield. Real charter customers pay extra for
guaranteed bulk seats and scheduling flexibility; the game now
captures that.

**Files:**
- `state/Charter.ts` — `CharterContract` interface, `CharterStatus`
  union (same shape as cargo).
- `systems/Charters.ts` — full system: `rollCharter` generation,
  `refreshCharterOffers` (top to 6 listings/day with 2–7 day lead),
  `acceptCharter`, `dispatchCharter`, `landArrivedCharters`,
  `expireMissedCharters`. Hooks daily for housekeeping + per-tick
  for landings.
- `state/Plane.ts` — new `'charter'` status variant matching the
  cargo positioning-then-delivery shape (plane positions empty to
  `from`, flies full to `to`, lands idle at destination).
- `state/GameState.ts` — `charterOffers / charterActive /
  charterCompleted / charterCounter` arrays, persisted in snapshot,
  back-compat defaults to empty arrays.

**Dispatch model**: identical to cargo — plane must be idle, have
≥ paxCount seats, and have range ≥ city distance. Charges fuel for
both positioning + delivery legs up front. Plane lands at
destination on `arrivesAt`.

**Pricing math**: `payment = paxCount × suggestedTicketPrice(dist) ×
1.5`. A 100-pax LAX→JFK charter at $635 fair fare pays ~$95K — vs
~$63K you'd net carrying the same pax on a regular route flight
(and you don't need to fill the seats organically — the contract is
guaranteed).

### Contracts Hall (renamed from Cargo Hall)

The cargo room button was the natural place to fold charters in.
Renamed: **📦 Cargo Hall → 📋 Contracts Hall**. Inside, two tabs
following the Workshop pattern:

- **Cargo (N)** — existing cargo board, unchanged.
- **Charter (N)** — new charter board.

Counts in tab labels so you can see new offers without switching.
Tab state persists within one visit; resets to Cargo on re-entry.

### AI bids on charters

New `aiBidCharter` mirrors `aiBidCargo`: scans the charter board
for offers the AI can fulfil with an idle plane (seats + range),
scores by net-of-fuel margin, accepts up to `cfg.aiCargoMaxPerDay`
per day at ≥ `cfg.aiCargoMinMargin` margin (1/2/3/4 day at
50/35/25/15% margin across Easy/Normal/Hard/Brutal). Reuses the
existing cargo difficulty knobs — charters and cargo count as the
same daily contract intake budget, which feels right since both
compete for the same fleet attention.

### 4 new planes in the catalog

Filling the $130M–$360M gap between A220 ($80M) and B747 ($240M)
that's been sparse:

| Plane | Class | Price | Seats | Range | Fuel/km |
|---|---|---|---|---|---|
| Airbus A321neo | narrowbody | $130M | 220 | 7,400 km | 4.5 L |
| Boeing 787-9 Dreamliner | widebody | $290M | 296 | 14,140 km | 11.5 L |
| Airbus A350-900 | widebody | $320M | 325 | 15,000 km | 12.0 L |
| Boeing 777-300ER | widebody | $360M | 396 | 13,650 km | 14.5 L |

The A321neo plugs the narrowbody upgrade path between A220 and the
B737. The B787 / A350 / B777 give three distinct widebody picks
between the A220 tier and the A380 ($445M) — each with different
seat/range/fuel tradeoffs so they're not just "more expensive A220s."

These are now the natural target planes for big charters and long-
haul cargo. AI rivals shop them through the existing buy + used-
market logic without any further changes.

---

## 2026-05-13 (phase 5) — Smarter AI: sponsors, lounge, loans

Three player-only mechanics opened to AI participation. The symmetry
theme that's been the through-line of today's AI work is now complete:
every system AI rivals can touch, they do.

### AI accepts sponsor contracts

`Sponsors.trackArrival` used to early-return on AI (`if (player.isAI)
return`). The gate is gone — every arrival now ticks any matching
active sponsor regardless of owner.

New `aiAcceptSponsors`:
- Checks each available offer against the AI's reachable cities (hubs
  + every route endpoint).
- Skips offers with < 5 days lead time (too tight to plausibly fill).
- Caps at 3 active per AI (same MAX_ACTIVE the human respects).
- One acceptance per day so the AI doesn't sweep the offer board.

Net effect: if you're slow to grab a sponsor offer that lines up with
an AI rival's network, expect the AI to grab it first.

### AI visits VIP Lounge contacts

`visitContact` was open to any player, but no AI code path ever
called it. New `aiVisitLounge` picks situational contacts that solve
a real problem:

| Trigger | Contact | Min cash |
|---|---|---|
| Fleet avg condition < 0.5 | Maintenance Inspector | $1.2M |
| Reputation < 60 | Press Baron | $1.0M |
| Reputation < 70 | Marketing Guru | $400K |
| Fuel price > $0.95 | Commodities Trader | $400K |

Daily roll at `aiBuyChance × 0.25` — Lounge visits are luxuries, not
routine. AI lounge visits silently consume the shared
`state.loungeContacts` pool, same one the human shops from. (News
push is suppressed for AI visits so the ticker isn't flooded.)

### AI takes & repays loans

`Bank.applyMonthlyLoanPayment` was wired only for `state.human` and
the creditor-seize cascade was gated behind `!p.isAI`. Both fixed:

- Monthly principal payment now runs for **every active player** on
  day 1 of each month.
- The 3-strike creditor-seize **also fires for AI** (with a news
  announcement: "★ Creditors have seized {airline} after 3 missed
  loan payments."). It's possible to outlast a struggling rival.

New `aiManageLoans` (AI side):
- **Borrow**: cash < $2M AND no current loan → take min($5M, credit
  room) for liquidity.
- **Repay**: cash > 2× loan AND cash > $5M → repay min(loan, cash ×
  25%) per day until cleared.

The cash-flow asymmetry that used to favor AI (they had no required
loan principal, no creditor risk) is gone — they can win or lose by
loan management just like the human.

---

## 2026-05-13 (phase 4) — Smarter AI: leader targeting, defense, yield pricing

Four behaviors that make AI rivals feel like they're actually paying
attention to who's winning and what they can charge.

### Run-leader targeting (sabotage + stocks)

**Sabotage**: AIs were targeting whoever had the highest *cash* —
which rewarded leading-the-pack players who'd just sold a fleet but
ignored the actual run leader sitting on $200M of planes + $50M cash.
Target picker now uses `netWorth()` (cash + savings + 0.4×fleet +
holdings − loan) so the dominant player gets pressure regardless of
their cash position.

**Stocks**: `aiTradeStocks` value-buy score gets a `leaderBonus` term:

```
leadMargin = clamp((leaderNW − myNW) / leaderNW, 0, 1)
score += (target is leader ? leadMargin * 0.5 : 0)
```

The bigger the lead, the more AIs gang up on the leader's stock —
which (combined with the existing 25%/40% takeover alerts) means
sustained dominance comes with a real hostile-takeover threat.

### AI buys defense items

`aiBuyDefense` runs each daily turn — rolls at `aiBuyChance × 0.5`
baseline, **doubled to up to 70%** when there's recent sabotage news
in the last 8 events (the AI just got woken up). Picks the cheapest
defense item the AI doesn't already own with a 2× cash buffer:
**CCTV → K-9 → Cyber Shield**. The chain matches the human's natural
defensive buy order.

Net effect: by mid-game, expect AI rivals to be partially or fully
defended. Your sabotage attempts against them will more often be
blocked + detected (rep hit on the attacker).

### Yield-management pricing

`aiRebalancePrices` was one-way (only stepped DOWN toward an undercut
rival, never up). Now two-way:

- **Down**: same as before — step $5/day toward the cheapest rival,
  floor at 60% of fair.
- **Up (new)**: when AI is already cheapest (or uncontested) AND
  expected load factor is >85%, step $5/day UP toward a ceiling of
  1.5× fair. Captures yield on monopoly routes where the AI used to
  leave money on the table.

The ceiling at 1.5× fair means even maxed-out AI pricing stays
roughly competitive — no $9999 tickets — but the AI now extracts
meaningful premium on routes where they've got pricing power.

---

## 2026-05-13 (phase 3) — Smarter AI: crew rotation, dividends, fleet pruning

Three behaviors that close loops left open by today's earlier work
(crew morale, dividends, used-plane market). AI rivals now react to
their own morale, return capital when flush, and feed the used market.

### `aiManageCrew` — morale-aware staffing

Old behavior: hire to `planes + 1` while cash > $50K. Always the same
buffer regardless of how strained the crew was.

New behavior: buffer scales with morale.

| Morale | Hire target |
|---|---|
| ≥50 | `planes + 1` (baseline) |
| <50 | `planes + 2` (strained → ease utilization) |
| <30 | `planes + 3` (burned out → emergency relief) |

Plus a utilization > 1.0 catch: if the AI just bought a plane and the
crew hasn't caught up yet, one extra pilot hire is forced through if
cash allows. Same `PILOT_COST/MECH_COST` the human pays — no AI
cheating.

### `aiManageDividends` — return capital when flush

AI rivals now declare quarterly dividends in line with their balance
sheet:

| Cash + reputation gates | Dividend |
|---|---|
| rep < 60 OR cash < $50M | $0 (cancel any existing) |
| cash > $50M | $0.10 / share |
| cash > $100M | $0.50 / share |
| cash > $300M | $1.00 / share |
| cash > $500M | $2.00 / share |

Reuses `setDividend()` from Stocks.ts so payouts run through the same
quarterly hook the human's dividends do. If the human owns shares in
a dividend-paying AI rival, those credits show up in the news ticker
the same as before.

### `aiManageFleet` — sell to the used market

Old behavior: AI bought planes (new + used) but never sold. Idle,
low-condition planes sat on the apron forever.

New behavior: each daily turn the AI checks its idle, route-less
planes for one of two sale triggers:

1. **Can't repair**: condition < 35% AND AI cash < 1.5× the repair
   cost. The AI cuts losses instead of letting an unflyable plane
   rot.
2. **Over cap**: fleet size > 5 (rare — usually only after a
   takeover absorbs a rival's fleet).

Modest 35% daily roll so liquidation is gradual. Sales use
`sellPlane()` from `UsedMarket.ts` — same code path the human's
Workshop Sell button runs, with `ex-${airline}` source label.
Net effect: the human's used-market shopping board now has a
steady supply of trade-ins to scoop up at a discount.

---

## 2026-05-13 (toggle) — "Run while tab is hidden" setting

The earlier hidden-tab fix (auto-pausing music) was the wrong call —
the user wanted the **opposite**: keep the whole game running, music
and all, when the tab is in the background. Now it's a setting.

### What the setting does

New `GameSettings.runInBackground: boolean` (default **off**):

- **Off** (default, browser-standard): tab away → Phaser's auto-pause
  freezes the simulation AND the music suspends. Returning re-wakes both
  cleanly. This is what most browser games do; least surprising.
- **On**: tab away → Phaser still tries to pause, but our HIDDEN handler
  wakes the loop right back up. Music keeps playing. Useful if you want
  to leave the game ticking in another tab.

### Plumbing

- `fps.forceSetTimeOut: true` in the Phaser config so the loop uses
  `setTimeout` instead of `requestAnimationFrame`. RAF stops dead in
  hidden tabs; setTimeout is only throttled (to ~1Hz background-rate)
  so the loop still ticks.
- `main.ts` listens for `Phaser.Core.Events.HIDDEN` / `VISIBLE`. On
  HIDDEN: if the setting is on, `game.loop.wake()`; otherwise
  `sound.suspendMusic()`. On VISIBLE: wake the loop AND
  `sound.resumeMusic()` (idempotent).
- `Sound.ts` exposes `suspendMusic()` / `resumeMusic()` as public
  methods. `desiredTrack` survives the suspend so the same track
  resumes when the tab is visible again.

### Background tick rate

At browser-throttled ~1Hz the in-game clock will still advance —
just slower in real-time. At 4× speed the ratio is roughly 4 in-game
minutes per real second; at the throttled rate that's still meaningful
progression while you're on another tab.

---

## 2026-05-13 (fix-superseded) — Music pauses with the game on tab switch

Initial fix for the "music plays while game pauses" report — replaced
by the toggle above. The visibility-handler logic is now wired through
`main.ts` and gated on the `runInBackground` setting, so the previous
unconditional auto-suspend is no longer present.

---

## 2026-05-13 (balance) — Short-haul yield lift

**Reported complaint**: "$300/flight starting out in HNL feels punishingly
grindy." Confirmed — a starter Cessna on HNL→OGG netted ~$334/flight
under the old fare model, and recouping the $1.2M Cessna cost took
~1,800 round-trips.

### What changed

`suggestedTicketPrice` formula:

| | Before | After |
|---|---|---|
| Base fare | $30 | **$60** |
| Per-km | $0.12 | $0.12 (unchanged) |
| Floor | $40 | **$60** |

The base fare represents fixed costs (taxes, boarding, terminal use,
ground handling) that don't scale with distance. Doubling it lifts
short-haul where the per-km term is small, while leaving long-haul
(where per-km dominates) roughly unchanged.

### Concrete impact

| Route | Distance | Old fare | New fare | Δ |
|---|---|---|---|---|
| HNL → OGG (Maui) | 150 km | $45 | $70 | +55% |
| HNL → KOA (Kona) | 280 km | $55 | $85 | +55% |
| HNL → LAX | 4,100 km | $600 | $635 | +6% |
| LHR → JFK | 5,550 km | $1,045 | $1,090 | +4% |

**Starter Cessna HNL→OGG profit**: $334 → **$604** per flight (+81%).

Long-haul barely moves — at 4,000+ km the per-km term ($0.12 × 4000 =
$480) swamps the base bump. So big planes on big routes aren't getting
over-buffed; small planes on short hops are getting the help they need.

### Migration (v3)

`CURRENT_BALANCE_VERSION` bumped 2 → 3. New v3 migration walks every
existing route on load and bumps any that's priced below **70% of the
new fair fare** up to the new fair. Same threshold as v1 (the previous
yield rebalance), just against the new formula. News ticker announces
how many fares were updated on the first load after the patch.

Pre-patch saves continue to load fine — they just get the price bump
applied on first launch after the update.

---

## 2026-05-13 (one more) — Crew morale + fatigue

The last shallow system. Personnel was "hire enough pilots/mechanics,
done" forever. Now crews have a morale score that drops when
overworked and after crashes/incidents, and bounces back when rested.

### State

New `Player.morale: number = 70` (persisted in snapshot, defaults to 70
for pre-feature saves). Symmetric — AI rivals carry their own morale
and hit the same feedback loops.

### Daily morale tick

Driven by **crew utilization** = `(planes assigned to routes) / pilots`:

| Utilization | Daily delta |
|---|---|
| > 1.5  (severely overworked) | −3 |
| > 1.0  (overworked)          | −1 |
| 0.5..1.0 (balanced)          | 0  |
| < 0.5  (rested)              | +2 |

Below **30** morale ("In revolt"), there's a **10% daily chance** a
crew member resigns — biased toward whichever role is bigger so the
fleet doesn't get stranded by the last pilot walking. After the quit,
morale jumps +10 because the remaining crew is now less overworked
(captures the "things have to get worse before they get better"
dynamic).

### Event-driven hits

- **Crash**: −10 morale on top of the existing −25 rep + plane loss.
- **Incident**: −3 morale on top of −5 rep + emergency repair.

### Gameplay effects

- **Load factor** (Economy.flightProfit): morale ≥80 gives **+3% LF**;
  morale ≤40 gives **−3% LF**. Neutral middle band has no effect.
- **Mishap chance** (Flights.maybeMishap): existing `failChance`
  multiplied by `1 + max(0, 50−morale)/100`. At morale 0 mishaps are
  50% more likely than a baseline neglected plane; at morale ≥50 it's
  the same as before.
- **Hire bonus**: hiring a pilot or mechanic bumps morale +2 (small
  symbolic signal that help is on the way).

### Personnel scene

New "Crew morale" section above the pilots/mechanics rows:
- 240px morale bar color-coded by band (Energized green / Content
  amber / Strained orange / Burned out pink / In revolt red).
- Current utilization % + label so you can see *why* morale is
  trending.
- One-liner explaining the cutoffs: ≥80 +3% LF, ≤40 −3% LF + more
  mishaps, <30 crew may quit.

### Bands (`moraleLabel`)

| Range  | Label       | Color   |
|--------|-------------|---------|
| 80–100 | Energized   | green   |
| 60–79  | Content     | amber   |
| 40–59  | Strained    | orange  |
| 20–39  | Burned out  | pink    |
| 0–19   | In revolt   | red     |

---

## 2026-05-13 (closing) — Workshop tabs

Adding the used-plane market on top of the buy table + fleet list made
the Workshop scene a 60-row vertical scroll. Now it's three tabs at the
top of the room, matching the pattern Travel Agency uses:

- **Buy new** — the PLANE_MODELS catalog table.
- **Used market (N)** — listings, counter in the tab label so you can
  see how many used planes are out there without switching.
- **Your fleet (N)** — owned planes with Repair / Outfit / Rename /
  Sell. Counter in the tab label, same shape as Used.

Tab state persists across `rebuild()` calls inside one scene visit
(clicking Repair or Sell rebuilds and keeps you on Fleet) but resets
to **Buy new** on re-entering the room. The Outfit sub-view still
takes over the whole panel — `← Back` from outfit lands you on the
Fleet tab.

**Behavior preserved**: all the buttons, modals, and tooltips work
exactly as before — this is pure layout. No state changes, no save-
format changes.

---

## 2026-05-13 (still) — Smarter AI phase 2: hubs, upgrades, boosts

Three player-only mechanics the AI was just… not using. Now wired in.

### AI expands to new hubs

Each AI rival was stuck at their starting home (`HNL/LAX/JFK/LHR`) for
the whole run. New `aiExpandHubs`:

- Requires fleet ≥3 planes AND cash ≥ 3× the hub cost (so they don't
  bankrupt themselves buying real estate they can't use).
- Capped at **3 hubs per AI** to prevent late-game sprawl into every
  city on the map.
- Roll probability `aiBuyChance × 0.5` so expansion stays occasional.
- Scoring is the same shape as route picking: `demand × 10 − rivalHubsHere × 4`,
  so AIs spread out instead of all dogpiling JFK.

`hubCost` was a private function in `WorldMapScene` — moved to
`state/Player.ts` alongside `gateExpansionCost` so the AI calls the
same formula the human pays.

### AI outfits its fleet

Plane upgrades (livery / interior / entertainment from the Workshop's
Outfit tab) were a human-only economic advantage. New `aiBuyUpgrades`:

- Rolls at `aiBuyChance × 0.4` — even Brutal AIs upgrade about every
  third day rather than nightly.
- Priority: **interior** (biggest LF multiplier) → **entertainment**.
  Skips livery — pure cosmetic, AI doesn't care about tail-fin colors.
- Tier-capped by plane class so the AI doesn't equip $1.2M lie-flat
  suites on a $1.2M Cessna: turboprop ≤ $200K, narrowbody ≤ $600K,
  widebody ≤ $1.5M.
- Picks the highest LF-bump option that fits both the ceiling and the
  AI's cash. One upgrade per daily turn so spending is gradual.
- Freighters (seats=0) skip — they'd derive no benefit.

### AI uses Duty Free boosts

`Marketing Campaign`, `Press Conference`, `Pilot Training Course`
were also human-only. New `aiUseBoosts`:

- **Press Spin** ($50K, +3 rep) or **Marketing** ($100K, +5 rep) when
  reputation < 70. Press spin first since it's the cheaper rescue.
- **Pilot Training Course** ($150K, +20% condition to all planes) when
  fleet average condition < 0.6 — cheaper than hand-repairing each
  airframe.
- Respects the same per-item one-per-day cooldown via
  `player.boostUsedOn` so AI can't double-dip in a way the human can't.

### Refactors to enable this

- `hubCost(city)` moved from `WorldMapScene.ts` → `state/Player.ts`.
- `applyBoost` extracted from `DutyFreeScene` → `applyBoostEffect(player, itemId)`
  in `state/items.ts`. Both DutyFreeScene and AI call the shared
  function so any future boost effect lands in one place.

---

## 2026-05-13 (latest) — Difficulty-scaled AI: cargo, stock sells, used market

The recently-shipped AI behaviors (cargo bidding, stock selling, used-
market shopping) were all using uniform thresholds — Brutal rivals
played the same tactical game as Easy ones, just with more starting
chances baked in. Now the tactics themselves scale.

### New difficulty knobs in `DIFFICULTIES`

| Knob                          | Easy | Normal | Hard | Brutal |
|-------------------------------|------|--------|------|--------|
| `aiCargoMaxPerDay`            | 1    | 2      | 3    | 4      |
| `aiCargoMinMargin` (fuel net) | 50%  | 35%    | 25%  | 15%    |
| `aiSellOvervalueThreshold`    | 1.15 | 1.25   | 1.35 | 1.50   |

**Cargo aggression** — `aiBidCargo` now reads `aiCargoMaxPerDay` and
`aiCargoMinMargin` from difficulty. At Easy a single AI accepts at
most one contract per day and only if it nets 50%+ over fuel.
At Brutal, four contracts/day with a 15% margin bar — they'll grab
contracts the player would walk past.

**Stock sell threshold** — `aiTradeStocks` sell pass reads
`aiSellOvervalueThreshold`. Easy AIs sell at 15% over fundamental
(eager profit-takers, low takeover threat in the long run). Brutal
AIs hold until 50% overvalued, so positions accumulate and the 25%
→ 40% takeover-alert tiers fire much more often.

### AI shops the used market

New `aiShopUsed(player)` runs each daily turn. Roll probability is
`aiBuyChance × 0.5` so even Brutal AIs (35% daily) leave most
listings for the human. When the roll passes, the AI scores
affordable listings by `(capacity × condition) / askPrice`
— freighters fall back to `cargoCapacityKg / 100` so widebody
freight metal isn't penalized vs passenger metal — and buys the
best fit. Respects the existing 5-plane fleet cap and keeps a 10%
liquidity buffer (`ask × 1.1 ≤ cash`) so the purchase doesn't crater
operating cash.

**Effect**: on Brutal, expect to see AI rivals sniping used 747-400Fs
and pristine A220s off the market within hours of them listing — they
shop new AND used now. On Easy, used listings sit around until they
expire or you grab them.

---

## 2026-05-13 (even later) — Used-plane market

Workshop got the back-half it was missing. Until now the only fleet
operations were "buy new" and "repair" — old planes with low
condition were dead capital you couldn't recover. New `Sell` button
per plane and a `Used market` section that sits between the new-plane
list and your fleet.

### Selling

Each fleet row gets a `Sell ${price}` button (disabled with "Busy"
when the plane is mid-flight, ferrying, or in maintenance).
Confirmation modal warns about lost upgrades on sale. Sale price:

```
sellPrice = model.price × max(condition, 0.1) × 0.6
```

The `max(condition, 0.1)` floor means even a near-dead plane recovers
some scrap value — selling a 5%-condition Cessna isn't worse than
keeping it. Upgrades (livery / interior / entertainment) drop on
sale; the buyer gets a stripped airframe.

### Buying used

Each listing shows: silhouette, model, condition %, source label
(`ex-${SellerName}` for player trade-ins or `market` for synthetic),
asking price, and days left before the listing expires (red ≤5
days). Ask price:

```
askPrice = model.price × condition × 0.75
```

There's a deliberate **15-point spread** between sell (0.6×) and buy
(0.75×) multipliers — you can't arbitrage by flipping. The buyer
covers any repair cost from the listed condition back to pristine,
on the standard Workshop formula.

Big-purchase guardrail (≥$50M) still applies — used 747s with their
~$130M ask still trigger the confirm modal, with the modal showing
both the ask and the expected repair-to-100% cost.

### Market refresh

- Daily hook tops the market up to **6 listings**, expiring anything
  older than **30 days**. Refreshed at boot too, so day 1 has stock.
- Synthetic listings get random model + 0.4..0.75 condition — chunky
  but recoverable, never near-pristine (would undercut the new-plane
  buy table).
- Player trade-ins go into the same pool with `ex-${seller}` labels,
  so the human's old planes do show up for AI rivals to grab if they
  shopped — currently AI doesn't shop used, but the supply path is
  ready when that's wired.

**Wire format**: New `state.usedPlanes: UsedPlaneListing[]` +
`usedListingCounter` persisted in the snapshot. Pre-feature saves
load with `usedPlanes = []` and get topped up on the next daily
tick.

---

## 2026-05-13 (later) — Dividends, takeover alerts, AI sells shares

Closing the IPO arc that landed earlier today. The buy/sell loop is
now two-sided, the hostile-takeover threat actually communicates
itself, and dividends give shareholders (incl. AI) a reason to hold.

### Quarterly dividends

New row in the Stock Market treasury panel. Pick a per-share rate
from `[Off, $0.10, $0.50, $1.00, $2.00]`. Every **90 in-game days**
the dividend pays out:

- **Cost to issuer**: `dividendPerShare × float`. At a 1M float and
  $1.00/share that's $1M/quarter; at $2.00 with a post-IPO 1.25M
  float, $2.5M/quarter — meaningful pressure on cash.
- **Credit to holders**: each player credited `perShare × ownedShares`.
  Public-float shares drain the issuer but don't credit anyone
  (the "public" isn't tracked).
- **Reputation bump**: `+1 + floor(perShare)` per payment — investor-
  friendly behavior. Capped at 100.
- **Skip-on-empty**: if the issuer can't cover the payment, the
  payment is skipped, the dividend clock still resets (no infinite
  catch-up debt), and the human eats a `-2` rep hit + news warning.

**Why a recurring drain matters**: dividends pair with IPO. Mint
shares to raise cash today, and the larger float makes every future
dividend more expensive. There's now a real tradeoff between "issue
to fund growth" and "issue and regret it next quarter."

**AI prefers dividend stocks**: `aiTradeStocks` value score now adds
`(annualYield × 0.8)`. A 4% yield is worth as much to an AI as a
4-point undervaluation, so paying dividends actually attracts AI
buyers — useful when you want AI to absorb your float instead of a
specific takeover hunter.

### Takeover early-warning news

The buy logic was already hunting takeover targets — but a rival
silently crossing 30%, 40%, 45% of your float gave you no signal
until they hit the 50% takeover threshold. New `checkTakeoverAlerts`
fires news entries at **25%** and **40%** ownership tiers per
(target, acquirer) pair. Each tier announces at most once per pair
per run; the alert state is cleared if the target is acquired.

Headlines targeting the human are prefixed with `⚠` so they pop in
the news ticker. AI-vs-AI ownership shows without the prefix.

New `state.takeoverAlerts: Record<string, number>` (`"target|acquirer"`
→ highest tier already announced) is persisted in the snapshot.

### AI sells shares

`aiTradeStocks` was buy-only — rival holdings accumulated forever
without a counterweight. New sell pass at the top of each daily AI
turn:

- Skips any target it's actively trying to take over (`ownedFrac >
  0.3`).
- Sells if **price > 1.25 × fundamental** (overvalued exit), OR if
  **cash < $500K** (forced rebalance for liquidity).
- Trades cap at 25K shares/day or 25% of holdings, whichever is
  smaller — prevents one AI dumping a million shares and tanking
  the price overnight.

This is what closes the loop: AI buys cheap, sells expensive,
preserves takeover threats, and prices now move in both directions
from rival activity.

---

## 2026-05-13 — IPO, buyback, freighter fleet, AI cargo

Two long-standing "fully built but one-sided" systems got their
missing halves wired in, plus a new fleet category that gives the
cargo board something to actually shop for.

### IPO + buyback (treasury actions for the human)

Stocks were trade-only until now: you could buy rival shares but had
no way to issue or retire your own. New IPO and buyback panel at the
top of the Stock Market room:

- **Issue shares (IPO)** — mint new shares of your airline at the
  current market price. Cash lands in your account immediately; the
  float grows by however many shares you printed. Capped at **25% of
  current float per round** so a single click can't double the share
  count. Dilution shows up the next day: with more shares chasing the
  same equity, the per-share fundamental drifts down.
- **Buy back shares** — retire shares from the public float at market
  price. Costs cash, shrinks the float, nudges price up, and (the
  reason you actually care) reduces the share pool any rival can use
  to launch a hostile takeover.

**Why it matters**: Loans are the only other fast-cash mechanic, and
they hit a credit-limit ceiling early-mid game. IPO is the second
lever — and it has different tradeoffs (no interest, but permanent
ownership dilution). Buyback is a defensive tool once an AI rival
starts accumulating your shares — `aiTradeStocks` has been hunting
takeover targets for a few patches now, so this is the answer.

**Wire format**: New `sharesOutstanding: Record<string, number>` on
GameState, seeded to 1,000,000 per airline at bootstrap and
persisted in the snapshot. Pre-IPO saves backfill the legacy
1,000,000-per-airline default in `loadFrom`, so existing runs load
without surprise.

**Math under the hood** — fundamental price was `equity / 1_000_000 *
repMod`; it's now `equity / float(id) * repMod`, with `float(id)`
reading from the new state. `buyShares`/`sellShares` impact also
scales by float fraction now, so highly-issued airlines absorb the
same dollar order with less price movement (correct — that's what a
deeper book actually does).

### Freighter fleet (3 new planes)

The cargo board has been pulling double duty as an excuse to fly
your passenger fleet on dead-mile legs. Now there's purpose-built
freight metal:

- **ATR 72-600F** — $22M, 9,000 kg, 3,500 km. Regional freight
  workhorse.
- **Airbus A330-200F** — $220M, 70,000 kg, 7,400 km. Long-haul
  mid-tier.
- **Boeing 747-400F** — $280M, 113,000 kg, 8,200 km. The whale —
  best $/kg of capacity in the catalog.

All three have **`seats: 0`** so they're useless on passenger routes
(zero revenue). The Workshop buy list now labels them "freighter" in
gold instead of showing a seat count, and the per-model tooltip
swaps `$ per seat` for `$ per kg of capacity` so the freighter
economics actually compare. The PlaneIcon silhouette falls back to a
class-appropriate display size when seats is 0, so a 747F renders at
widebody scale instead of as a 4-pixel dot.

### AI rivals work the cargo board

The cargo offer pool was a single-player feature: only the human
ever called `acceptContract`. Rivals now compete for the same
contracts on every daily tick:

- For each idle, range-and-capacity-capable plane in their fleet,
  the AI scores available contracts by net-of-fuel margin.
- Requires **≥35% margin after fuel** before accepting, capped at
  **2 contracts/AI/day** so one rival can't sweep the whole board.
- Accepts via `acceptContract` and immediately dispatches via
  `dispatchCargo` — same call paths the player uses, so the AI pays
  fuel upfront and lands the plane idle at the destination.

This is the natural counterpart to `aiTradeStocks` (rivals already
buy each other's shares) — the cargo board was the last big
mechanic without AI participation.

---

## 2026-05-12 — Save export / import (survive a localStorage wipe)

Saves now live in two places: localStorage (as before) **and** any
JSON files the player chooses to keep. If the browser cache gets
cleared or you swap machines, you can re-import your save and pick
up where you left off.

**Per-slot — in the BootScene slot list:**
- **Filled slots** now have a 2×2 button grid: Continue / New
  (overwrite) up top, **Export** / Delete below. Export downloads
  `hubspoke-slot{N}-{airline}-{YYYYMMDD}.json` (airline name is
  slug-sanitized).
- **Empty slots** get a new **Import save** button next to New
  Game. Opens a file picker, validates the file, writes it into
  the slot, and refreshes the list.

**Bulk — in Settings → Save:**
- **Download backup** bundles every filled slot into a single
  `hubspoke-backup-{YYYYMMDD}.json` for one-click portability.
- **Restore backup** reads a backup file, summarizes which slots
  it contains, asks for destructive-action confirmation, then
  overwrites those slot ids in localStorage.

**Wire format** — wrapped JSON, not bare snapshots, so the format
can evolve independently of the in-game `GameSnapshot`:
```
{ format: "hubspoke-save-v1",   exportedAt, saveVersion, snapshot }
{ format: "hubspoke-backup-v1", exportedAt, saveVersion, slots: { "1": snap, ... } }
```
Imports validate both `format` and `saveVersion === SAVE_VERSION`
before touching storage; mismatches are rejected with a clear
error. (Same version-gate as the existing `readSlot` path — a
save from a different game build won't silently corrupt your
session.)

**Implementation** — file picker uses a transient
`<input type=file>` with a window-focus fallback so dismissed
pickers reject instead of hanging. Downloads use a Blob + a
temporary `<a download>` click, with the object URL revoked
~1s later to give the browser time to claim it.

**Why now**: localStorage is fragile — extension misbehavior,
browser-data-clear UI, and "log out everywhere" actions all wipe
it without warning. Now there's a real recovery path that
doesn't need a backend.

---

## 2026-05-12 — Dawn Takeoff cinematic intro

Hub & Spoke now has an opening cinematic, reversing the original
2026-05-09 scoping decision to skip one. Plays once on first launch
(gated by `localStorage['hub-and-spoke-intro-seen']`), replayable
any time from a new button in Settings → Interface → Cinematic
intro.

**Storyboard** — four phases, ~14.5 seconds total, skippable on
any pointerdown or keypress:

1. **Pre-dawn airport** (0–2.5s) — navy sky with 60 twinkling
   stars, distant mountain silhouettes, lit terminal windows
   (8×3 grid with ~55% lit), runway with edge lights and
   center-line dashes, Cessna parked at Gate 1 facing the
   runway.
2. **Sunrise + takeoff** (2.5–7s) — sky lerps through purple
   twilight into dawn orange (RGB-interpolated via
   `Phaser.Display.Color.Interpolate.ColorWithColor`), an
   orange sun + warm halo rise from the right horizon, the
   Cessna taxis to the runway then accelerates and lifts off
   (rotates −0.35 rad, climbs, recedes off-screen). Fires the
   existing `'takeoff'` SFX.
3. **Network grows** (7–11.5s) — cross-fade to a stylized world
   (cool-blue base, curved earth horizon, six abstract continent
   blobs). A gold pulsing hub dot anchors the left side; six
   destination dots receive routes one by one, each route drawn
   progressively as a quadratic-bezier arc with a tiny plane
   silhouette flying the curve (rotated to the path tangent).
4. **Title card** (11.5–14.5s) — dark veil fades in over the
   map, **HUB & SPOKE** scales up with a `Back.easeOut` ease,
   tagline _"a small airline. a big sky."_ fades in below, then
   a blinking _"[ Click to begin ]"_ prompt.

**Implementation** — new scene at `src/scenes/IntroScene.ts` is
now the first entry in `main.ts`'s scene array. On boot it
checks `hasSeenIntro()`; if `true` and not in replay mode it
calls `scene.start('BootScene')` immediately, otherwise it plays
through and hands off at the end. Replay path
(`{ replay: true }` from Settings) launches on top of the
running game and `scene.stop()`s itself when done — the
underlying scene continues uninterrupted. Skipping mid-cinematic
fast-forwards to the title card (so the user always sees the
"Click to begin" prompt) rather than dumping straight to the
slot picker.

**Why now**: the user reversed the no-cinematic call — the boot
flow had always felt abrupt going straight into a slot list.
This sequence reuses the engine's existing visual vocabulary
(plane silhouettes via `makePlaneIcon`, day/night palette,
procedural title music via `sound.startMusic('title')`) so it
costs almost no new asset weight while giving the game an
identity moment.

---

## 2026-05-11 — Intervention pool expansion v2: +21 templates (pool now 37)

Doubled (and then some) the intervention pool from 16 to **37**.
New events are grouped into broad themes so the variety reads
clearly even across many in-game weeks.

**Safety / ops** (3)
- **Cabin Fire Drill Training** — $8k preventative or skip (−2 rep).
- **Bird Strike Damage** — $15k emergency repair or defer (−10%
  condition on a random plane).
- **Weather Delay Compensation** — $20k vouchers or stand pat
  (−4 rep).

**HR / crew** (4)
- **Mechanics' Grievance** — $12k bonus or refuse (−3 rep).
- **Pilot Fatigue Lawsuit** — settle $30k or litigate (60% $0 /
  40% $80k).
- **Flight Attendant Strike Threat** — $18k bonus or 50% chance
  walkout (−5 rep).
- **Crew Uniform Redesign** — $15k for +4 rep, or pass.

**Marketing / brand** (4)
- **Sports Team Sponsorship** — $35k for +6 rep, or pass.
- **Trade Show Booth** — $12k for +3 rep, or skip.
- **Influencer Partnership** — $10k gamble (60% +4 rep / 40% −2 rep).
- **Loyalty Program Launch** — $50k for +8 rep, or hold off.

**Finance** (1)
- **Tax Audit** — $15k accountant or 50% chance of $25k fine.

**Industry** (2)
- **Aviation Magazine Cover** — $5k for +5 rep.
- **Airline Alliance Invitation** — $30k for +7 rep (requires
  multi-hub airline).

**Maintenance** (1)
- **Preventative Wing Inspection** — $15k or skip (random plane
  −10% condition).

**Public relations** (4)
- **Customer Complaint Storm** — $5k campaign or ride it out
  (−3 rep).
- **Lost Luggage Policy** — $10k for +3 rep.
- **Holiday Surge Pricing Scandal** — $20k refunds or stand pat
  (−3 rep).
- **Streaming Documentary** — free access (+3 rep) or refuse
  (−1 rep).

**Flavor** (2)
- **Earthquake Terminal Damage** — $30k repair or delay (−5 rep).
- **Internal Ethics Program** — $20k for +5 rep.

**Eligibility tiers** ensure early-game players don't get hit with
mid/late-game events:
- Always-available — VIP Lounge Renovation, TV Interview, Trade
  Show, etc.
- Tier 1 (>3 flights) — stowaway / influencer
- Tier 2 (>10 flights) — magazine, lost luggage, surge pricing
- Tier 3 (>20 flights) — industry conference, tax audit, ethics
- Tier 4 (>30 flights) — documentary

---

## 2026-05-11 — Intervention pool expansion: +10 event templates

Bumped the intervention pool from 6 to **16 templates** so the same
half-dozen events don't repeat once you're a few in-game weeks in.
Each new event has eligibility filters (some need flights flown,
some need crew, some need planes) so the pool feels appropriate
to your run's stage.

**New event templates** ([Interventions.ts](src/systems/Interventions.ts))

- **Regulator Audit** — pay $20k for clean prep, or refuse and roll
  50/50 on a $50k fine + −5 rep. Requires >10 flights.
- **Rival Poaching Pilot** — counter with $25k retention bonus, or
  let the captain go (−1 pilot, −2 rep). Requires >2 pilots.
- **Regional Festival Surge** — fund a $15k ad campaign for a
  variable $25k–$50k revenue boost, or skip. Requires ≥1 route.
- **Stowaway Discovered** — quiet $5k settlement, or 40% chance the
  story goes public for −3 rep. Requires >3 flights.
- **VIP Lounge Renovation** — invest $40k for +6 rep, or defer.
- **Insurance Premium Hike** — accept $30k hike, or pay $5k lawyer
  retainer and negotiate (60% → $20k+$5k, 40% → $30k+$5k).
  Requires ≥1 plane.
- **Local TV Interview** — accept and gamble (70% +6 rep / 30% −3
  rep), or decline politely.
- **Plane Naming Contest** — $10k PR contest for +4 rep, or pass.
  Requires ≥1 plane.
- **Cargo Pilfering Scandal** — settle quietly with $20k severance,
  or open public investigation (−3 rep). Requires >5 flights.
- **Industry Conference Keynote** — $20k for keynote slot and +5
  rep, or send regrets. Requires >20 flights (mid-game tier).

**Variety the pool now covers:**
- Theme: regulation, HR, marketing, PR, ops, charity, industry
- Outcome type: certain trade, probabilistic gamble (50/50, 60/40,
  70/30, 40%), revenue investment, pure pay-for-rep
- Stake size: $5k stowaway settlement up to $40k lounge renovation

---

## 2026-05-11 — Random intervention events

Six modal decision events that fire on a rolling weekly cadence,
turning a mostly-automatic game into one that actually asks you to
stop and choose. Each event has two options with real cost /
reputation / state tradeoffs.

**System** ([Interventions.ts](src/systems/Interventions.ts))
- Daily `clock.onDay` hook with a 5-day cooldown and an 18% roll
  chance — averages ~one event per game-week.
- Eligible events filter by player state: maintenance events
  require a plane, the whistleblower needs ≥5 flights flown, etc.
- Module-scope `pending` + `consumePendingIntervention()` —
  same polling pattern as the weekly newspaper. HUDScene drains
  it each tick and launches the modal.
- `resetInterventions()` called from `BootScene.go()` so a fresh
  run on the same tab doesn't carry state forward.
- Each event roll plays the `sponsor` chime so a heads-down
  player notices the modal coming up.

**Events**
1. **Engine Inspection Flag** — random plane flagged. Full
   overhaul ($30k, +30% condition) vs patch ($5k, −10% condition).
2. **Pilots' Union Demands** — pay $15k bonus (+5 rep) vs refuse
   (−3 rep).
3. **Celebrity Charter Offer** — accept (+$40k, +3 rep) vs decline.
4. **Anonymous Threat** — pay $15k hush vs ignore (70% it goes
   public for −8 rep, 30% it was a bluff).
5. **Fuel Supplier Kickback** — accept rebate (+$25k) vs decline.
6. **Charity Gala Sponsorship** — donate $30k (+8 rep) vs skip
   (−1 rep).

**Scene** ([InterventionScene.ts](src/scenes/InterventionScene.ts))
- Modal panel with gold accent stripe (matches milestone popup +
  tutorial banner). Title, body, optional context footer, two
  side-by-side choice buttons.
- Pauses HUDScene on create — the clock waits for the player.
- Disabled options (can't afford) render greyed with an inline
  red reason underneath. Esc dismisses without acting and pushes
  a "Deferred:" news entry so the player isn't confused why
  nothing happened.

**Settings** — new `showInterventions` toggle (default on) added
to `GameSettings` and the Settings room.

---

## 2026-05-11 — Livery preview + tail-accent on every silhouette

Liveries are no longer cosmetic-name-only — each one now actually
shows on the plane's tail fin everywhere a silhouette renders. The
Workshop Outfit view also gains a live hover preview so the player
can see what a livery looks like before paying for it.

**Accent colors per livery**
([upgrades.ts](src/state/upgrades.ts))
- New `accentColor` field on `Upgrade` (livery-only):
  - Classic Stripe: `0xa0a8b4` (cool gray)
  - Tropical Sunset: `0xff8855` (warm orange)
  - Gold Trim: `0xffd700` (gold)
  - Carbon Matte: `0x2a2a2a` (deep matte)
- New `liveryAccent(upgrades)` helper returns the equipped livery's
  accent or `undefined` for un-liveried planes.

**Silhouette tail paints accent**
([PlaneIcon.ts](src/ui/PlaneIcon.ts))
- `makePlaneIcon` gains an `accentColor?` parameter that tints the
  tail fin (turboprop / narrowbody / widebody — all three shapes).
  When omitted, the tail uses the base airline color so plain
  un-liveried planes render exactly as before. No regression.

**Apron picks it up automatically**
([AirportScene.ts](src/scenes/AirportScene.ts))
- All 6 `makePlaneIcon` call sites in AirportScene (parked, visitor,
  takeoff anim, landing anim, visitor takeoff/landing) now pass
  `liveryAccent(plane.upgrades)`. Your fleet's liveries are visible
  on the apron — equip Carbon Matte and the parked plane's tail
  goes dark.

**Workshop Outfit preview**
([WorkshopScene.ts](src/scenes/rooms/WorkshopScene.ts))
- New preview silhouette in the top-right of the Outfit view,
  scaled 2×. Defaults to showing the equipped livery's accent.
- Each livery row gets a transparent interactive rect underneath;
  hovering anywhere on the row previews that livery's accent on
  the silhouette above. Mouseout returns to the equipped accent.
- Buying a livery rebuilds the view; preview now shows the
  newly-equipped accent as the default.

---

## 2026-05-11 — Last native dialogs replaced with Modal

Two stragglers from the original save-slot UI still used the browser's
`confirm()` — overwrite-slot and delete-slot. Replaced both with
`Modal.confirm` so the new-game / delete-save flows match the rest of
the game's look-and-feel.

**Changes** ([BootScene.ts](src/scenes/BootScene.ts))
- "New (overwrite)" button now pops `Modal.confirm` with the saved
  airline's name in the message, a destructive-styled "Overwrite"
  button, and a "Cancel" button.
- "Delete" button similarly pops `Modal.confirm` with the airline
  name and a destructive "Delete" button.

Verified with a tree-wide grep — the only remaining `alert` /
`confirm` / `prompt` references in src/ are the Modal class methods
themselves. The codebase is now 100% custom-modal.

---

## 2026-05-11 — Custom airline name + tail color at new-game time

New step in the new-game flow lets the player name their airline and
pick a tail color before takeoff. No more being locked into the
default "Honey Air" gold from `DEFAULT_AIRLINES[0]` — every silhouette,
every news headline, and every passenger letter now reflect the
player's choice.

**Flow** ([BootScene.ts](src/scenes/BootScene.ts))
- Difficulty pick → CEO pick → **Airline pick** (new) → game starts.
- The new picker shows a live preview at the top: a class-narrowbody
  silhouette scaled 2.5× in the chosen color, with the chosen name
  centered below. Both update instantly when the player changes
  either side.
- **Rename airline** button pops a `Modal.prompt` with the current
  name pre-filled (default `Honey Air`, 1–32 chars).
- **Color grid** of 10 distinct colors as 40-px circles in a 5×2
  layout: gold (classic), coral, pink, purple, sky blue, mint,
  green, orange, white, slate. Clicked color gets a white stroke
  so the active selection is unambiguous.
- **Back** returns to the CEO picker (so a player who picked the
  wrong CEO can step back). **Start Game** commits with a green
  button.

**Plumbing** ([GameState.ts](src/state/GameState.ts))
- `GameState.reset(difficulty, ceoId, customAirline?)` and
  `bootstrap(ceoId, customAirline?)` take an optional `{ name,
  color }` and apply it only to player 0 (the human) when
  building the players array. AI rivals keep their catalog-
  defined names and colors so the world-map / standings reads
  consistently regardless of what the player picked.

Save compat: existing saves load via `loadFrom` which restores the
player's stored name + color, untouched. The new picker only affects
fresh games.

---

## 2026-05-11 — Workshop silhouettes + big-purchase confirm + tutorial banner

Three polish wins bundled together.

**Workshop buy list silhouettes**
([WorkshopScene.ts](src/scenes/rooms/WorkshopScene.ts),
[PlaneIcon.ts](src/ui/PlaneIcon.ts))
- Refactored the plane-icon drawing out of `AirportScene` into a
  shared `src/ui/PlaneIcon.ts` so any scene can render the same
  class-differentiated silhouettes without copy-pasting 120 lines of
  Graphics calls. AirportScene's local method is now a thin
  one-liner delegating to the shared helper.
- Workshop's buy list now shows the airline-colored silhouette of
  each model in a new 50 px column at the row's left. Turboprops,
  narrowbodies, and widebodies are visibly different — the buy
  experience is finally visual instead of pure text.
- The `withShadow` option on the shared helper (default true) is
  set false for list rendering so a soft drop shadow doesn't smear
  under the tabular row backgrounds.

**Confirm modal for $50M+ purchases**
([WorkshopScene.ts](src/scenes/rooms/WorkshopScene.ts))
- Buying any plane priced ≥ $50M (B737, A320neo, A220, B747, A380)
  now pops a `Modal.confirm` with the plane name, price, and
  cash-after-purchase line. Cheaper planes (Cessna, ATR, Q400)
  skip the confirm so the early-game buy flow doesn't feel naggy.
- Saves a B747 misclick from burning $240M.

**First-run tutorial banner**
([Tutorial.ts](src/systems/Tutorial.ts),
[TutorialBanner.ts](src/ui/TutorialBanner.ts))
- Three-step onboarding shown as a slim banner below the HUD bar:
  1. **Welcome** — click WORKSHOP to buy a plane.
  2. **Plane bought** — click TRAVEL AGENCY to open a route.
  3. **Route opened** — watch the apron for the takeoff.
- Each step auto-advances when its goal is met (live state check
  per HUDScene tick: `planes.length > 0` → `routes.length > 0` →
  `stats.flights > 0`). No "next" button needed — playing the game
  IS the next button.
- Banner has a "Skip" button that sets a localStorage flag so the
  player never sees it again.
- `BootScene.go()` auto-dismisses for loaded saves that already
  have flights flown, so resuming an existing run doesn't pop a
  pointless banner.
- Floats below the HUD bar (y=60), gold-accent stroke matching the
  milestone popup, depth 100 so it sits above any open room.

---

## 2026-05-11 — Differentiated plane silhouettes + SFX pass

Two polish wins paired up.

**Plane silhouettes vary by class**
([catalog.ts](src/state/catalog.ts), [AirportScene.ts](src/scenes/AirportScene.ts))
- New `cls: 'turboprop' | 'narrowbody' | 'widebody'` field on every
  `PlaneModel`. Assignments:
  - **Turboprop**: Cessna 208, ATR-72, Q400
  - **Narrowbody**: A220, B737, A320
  - **Widebody**: B747, A380
- `makePlaneIcon` now branches on class and draws three distinct
  silhouettes:
  - **Turboprop** — shorter, blunter nose (no streamlined point) +
    straighter rectangular wings + two small dark prop-disc circles
    on the wing leading edge.
  - **Narrowbody** — original sleek pointed fuselage with swept M-
    wings. Baseline shape.
  - **Widebody** — longer/fatter fuselage + bigger swept wings +
    four small dark engine pods slung under each wing pair + a taller
    tail fin.
- Size still scales by `seats` so within a class a bigger plane is
  visibly larger. Default class (`'narrowbody'`) keeps any future
  call sites that omit the parameter rendering the same as before.
- All 6 call sites in AirportScene updated (parked layer, visitor
  layer, takeoff anim, landing anim, visitor takeoff anim, visitor
  landing anim) to pass `plane.model.cls`.

**SFX pass — achievement / sponsor / paper**
([Sound.ts](src/systems/Sound.ts))
- New synth sounds:
  - `achievement` — 4-note ascending triangle-wave fanfare (C5 → E5 →
    G5 → C6). Fires when `checkAchievements` unlocks anything; one
    ding per check tick, not per id, so a batch unlock doesn't cause
    a 4-arpeggio cascade.
  - `sponsor` — two-tone sine chime (988 Hz → 1318 Hz). Fires when
    `Sponsors.rollDailyOffers` generates a new offer.
  - `paper` — soft noise burst + 440 Hz mid tone. Fires when the
    weekly newspaper modal opens, so a player heads-down in another
    room hears the page-turn.

---

## 2026-05-11 — Apron condition warnings + per-route lifetime stats

Two polish wins paired up.

**Apron condition warnings**
([AirportScene.ts](src/scenes/AirportScene.ts))
- Every parked plane now shows a `⚠` badge next to its id label when
  its condition drops below 50%. Two tiers:
  - **Yellow** (`#ffd44a`) between 30%–50% — caution. Mid-flight
    failure odds kick in below 50% so this is the "you should think
    about maintenance" tier.
  - **Red** (`#ff6644`) below 30% — critical. Crashes get
    increasingly likely.
- Threshold-based via a new `conditionTier(condition)` helper. The
  parked-layer signature now folds in `tier` so a per-flight 0.1%
  drip doesn't force a rebuild every flight — only when crossing a
  30%/50% threshold.
- Pairs with the existing plane numbering: a plane reads as
  `P3 ⚠` when it needs work, glanceable from the apron without
  opening Workshop.

**Per-route lifetime stats**
([Route.ts](src/state/Route.ts), [Flights.ts](src/systems/Flights.ts),
[TravelAgencyScene.ts](src/scenes/rooms/TravelAgencyScene.ts))
- New fields on Route: `lifetimeFlights`, `lifetimePassengers`,
  `lifetimeRevenue`, `lifetimeFuel`, `lifetimeProfit`. Bumped on
  every successful arrival in `Flights.landArrivedPlanes` for the
  owner (so AI routes track too).
- Optional in `RouteSnapshot` for save-compat; pre-tracking routes
  load with all zeros and start accumulating immediately.
- Travel Agency route detail panel gains a "Lifetime" line below
  the per-flight profit estimate showing `N flights · M pax (avg
  LF X%) · ±$profit`. Hidden until the route has at least one
  arrival so freshly-opened routes don't show "0 / 0 / 0%". Profit
  text turns red when net negative.

Pairs with the plane catalog rebalance — players can now see
which routes are actually carrying their weight when deciding
which plane to assign or whether to close an underperformer.

---

## 2026-05-11 — Plane catalog audit: fix broken B737, A320neo, Q400 niches

Full pass through `PLANE_MODELS` after the ATR range bump exposed three
trap purchases. All three were "buy it and lose to a cheaper option."

**B737-800 fuel burn was 3× reality** ([catalog.ts](src/state/catalog.ts))
- Was: `12.5 L/km`. Real B737-800 burns 3-4 L/km.
- Comparison case: on a 4,000 km route the B737 burnt $28k *more*
  fuel than the A220-300 to earn only $4k more revenue from extra
  seats. Strictly worse than the cheaper A220 on every metric except
  seat count.
- Fixed → `5.0 L/km`. Slightly worse than reality so the A220 keeps
  its "modern efficient narrowbody" niche, but the B737's +40 seats
  over A220 (189 vs 149) now actually translate to ~$15k more profit
  per long flight.

**A320neo fuel burn was 4× reality**
- Was: `11.8 L/km` despite being literally the "New Engine Option"
  variant — the most fuel-efficient narrowbody in service. Real ~3 L/km.
- Fixed → `4.0 L/km`. Slightly worse than the A220 (3.5) but premium-
  grade — the +6 seats and +400 km range now justify the $30M premium
  over A220 and $18M over B737.

**Q400 redundant after the ATR range bump**
- Was: $30M for +8 seats / faster speed / less than half the range vs
  the $18M ATR. Hard to justify the $12M premium.
- Dropped price to **$25M**. Q400 is now "premium short-haul regional"
  — +8 seats, ~30% faster, half the fuel burn — and ATR is "long-range
  turboprop workhorse." They occupy different niches by route length.

**What I checked and left alone**: Cessna 208 numbers, ATR-72 (just
rebalanced), A220-300, B747-400 (fuel inflated but plane is correctly
profitable only on long high-demand routes), A380-800 (endgame prestige,
numbers work), all speeds, all maintenance/hr (scale with size), all 31
city positions (Haversine distance is correct), all city demand values
(0.6–1.5 spread gives meaningful pricing variance).

---

## 2026-05-11 — ATR-72 range bump: 1,500 km → 4,500 km

The ATR was undercutting itself as a "step up" plane — at 1,500 km it
had *less* range than the Cessna 208 (1,900 km), so spending $18M on
an ATR opened zero new destinations from a HNL home base. The next
cities out from Honolulu — Pago Pago (4,200 km), Papeete (4,400 km),
LAX (4,100 km), SFO (3,900 km) — were all out of reach until the
player jumped straight to the $80M A220 or $92M B737.

Bumped ATR range to **4,500 km** in [catalog.ts](src/state/catalog.ts).
Now the mid-tier $18M / 70-seat plane can hit the natural next ring
of routes out of Honolulu, restoring a meaningful three-tier
progression: Cessna for local hops → ATR for medium-haul Pacific →
A220/B737 for transcontinental.

(Real ATR-72-600 range is ~1,500 km; this is a deliberate game-
balance liberty, noted in the file comment.)

---

## 2026-05-11 — Balance pass: starting cash, crew, repairs, sponsors

Six tuning adjustments driven by play-feedback that the early game
felt scrappier than intended even on Easy.

**Starting cash bumps** ([Difficulty.ts](src/state/Difficulty.ts))
- Easy: $15M → **$25M** (room for 2 Cessnas, crew, and exploration)
- Normal: $8M → **$14M** (a genuine buffer for the "recommended first run")
- Hard: $4M → **$6M** (still tight, not punishing on turn 1)
- Brutal: unchanged ($2M — it's brutal by design)

**Starting crew bumps** ([Difficulty.ts](src/state/Difficulty.ts))
- Easy: 2P/2M → **3P/3M**
- Normal: 1P/1M → **2P/2M** (you can fly 2 planes day 1 instead of
  being stuck with 1 until you hire)
- Hard: unchanged (1P/1M)
- Brutal: unchanged (0P/0M)

**Workshop repair coefficient halved** — `0.02 → 0.01` of plane price
per condition point ([WorkshopScene.ts](src/scenes/rooms/WorkshopScene.ts),
[Flights.ts](src/systems/Flights.ts), [AI.ts](src/systems/AI.ts) —
three call sites, same coefficient). A B737 at 50% condition used
to cost $46M to fully repair, nearly the price of a new one and
incentivizing scrap-and-buy over maintenance. Now $23M — still
significant but in the right ballpark for choosing to keep the
plane. Igor's CEO repair-cost perk continues to halve this on top.

**Sponsor rewards bumped** ([Sponsors.ts](src/systems/Sponsors.ts))
- Rate per pax: `$22-$32` → `$28-$40`. A 2,000-pax sponsor now pays
  ~$68k instead of ~$54k. Sponsors should feel like a meaningful
  reason to take a contract, not a small decoration on top of
  normal revenue.

**Normal monthly principal softened** ([Difficulty.ts](src/state/Difficulty.ts))
- Normal: 5% → **4%** of outstanding loan per month. A $10M loan
  now costs $400k/month in principal instead of $500k — less
  railroading on the "recommended first run." Hard (7%) and
  Brutal (10%) unchanged.

Save compat: existing saves keep their current difficulty's
runtime values, but the new monthly cycle and tuned constants
take effect immediately on next month rollover / next visit to
Workshop / next sponsor offer roll.

---

## 2026-05-11 — Required monthly loan principal (difficulty-scaled)

Loans used to be interest-only forever — the daily-interest bleed
was the only cost, and a player could carry max debt indefinitely
with no urgency to pay it down. Now Normal+ difficulties charge a
monthly principal payment on the 1st of every game-month, with a
miss cascade that ends in creditors seizing the airline after three
consecutive failures.

**Difficulty scaling** ([Difficulty.ts](src/state/Difficulty.ts))
- Easy: `0%` — interest-only forever (same as before).
- Normal: `5%` of outstanding loan per month, $50k floor.
- Hard: `7%`, $75k floor.
- Brutal: `10%`, $100k floor.

The difficulty picker card in BootScene now shows the loan
obligation alongside the other tier stats so players know what
they're signing up for.

**Monthly tick** ([Bank.ts](src/systems/Bank.ts))
- New `monthlyPrincipalDue(player)` returns the required amount for
  the current difficulty.
- New `applyMonthlyLoanPayment(player)` is called from the existing
  daily hook when `state.date.day === 1` (day-listener fires after
  the month rolls over, so day === 1 indicates a fresh month):
  - Charges cash first, then dips into savings.
  - Paid in full → `missedLoanPayments` resets to 0, news entry.
  - Shortfall → late fee of 5% × shortfall added back to principal,
    −2 reputation, `missedLoanPayments++`, ⚠ news warning showing
    how many missed payments remain before seizure.
  - 3 missed → `state.takenOverBy[human.id] = '_creditors_'`,
    which the existing HUDScene game-over check picks up and routes
    into the defeat flow with a creditor-specific message.

**State** — new `missedLoanPayments` field on Player (defaults 0,
persists with the save).

**UI** ([BankScene.ts](src/scenes/rooms/BankScene.ts)) — Loans
section now shows the monthly principal due alongside APR + credit
limit. When the player has missed payments, the line turns red and
counts down how many remain before seizure.

Save compat: existing saves load with `missedLoanPayments = 0` (the
default), and pick up the new monthly cycle on the next month
rollover.

---

## 2026-05-11 — Bank: combined pay-off + auto-rules

Two additions to the Bank scene that turn it from a "look at the
numbers" room into something you'd actually visit and configure.

**Combined pay-off** ([Bank.ts](src/systems/Bank.ts) →
`payOffLoanCombined`) — new helper drains cash first, then dips
into savings to clear whatever's left of the loan. The Bank scene
shows a green "Pay off loan in full (uses cash + savings)" button
whenever `cash + savings >= loan`; an amber "Pay all available"
button if you can't fully clear it but still want to put everything
toward it. No more two-step withdraw-then-repay dance.

**Auto-rules** ([Bank.ts](src/systems/Bank.ts) → `applyAutoBank`,
wired into `registerBankHooks`) — two thresholds on Player:

- `autoSaveAboveCash` — any cash above this value gets moved to
  savings on the daily hook. Presets: Off / $1M / $5M / $10M /
  $25M / $50M.
- `autoWithdrawBelowCash` — if cash drops below this value, savings
  tops it back up (up to the savings balance). Presets: Off /
  $100K / $500K / $1M / $2M / $5M.

Set in a new "Auto-rules" section at the bottom of the Bank scene.
Both default Off; values persist with the save via the new
optional fields on `PlayerSnapshot`. AI rivals don't use these —
their finances are managed inline by `AI.ts`.

Both rules apply *after* daily interest so the post-interest cash
position is what the thresholds compare against. Net effect: a
late-game player who's done growing their fleet can set
`autoSaveAboveCash: $10M` and watch savings yield compound on the
excess passively, instead of leaving idle cash in the checking
account.

---

## 2026-05-11 — Achievements / medals

Unified achievement system that includes the four existing net-worth
milestones plus 23 new ones across operations, fleet, network, and
notable categories. All visible in the Stats panel with progress
bars for locked ones and a green ✓ Unlocked indicator for done.

**Registry** ([achievements.ts](src/state/achievements.ts))
- 27 achievements total, organized into 5 categories:
  Wealth (4 — the existing $10M / $100M / $500M / $1B milestones,
  same ids for save-compat), Operations (8 — first flight, 100 /
  1,000 / 10,000 flights, 1k / 10k / 100k / 1M passengers), Fleet
  (4 — 3 / 5 / 10 / 20 planes), Network (5 — 3 / 5 / 10 routes,
  2 / 4 hubs), Notable (4 — One month / One year / Hard lessons /
  Big payday).
- Each achievement has `progress(state)` to read live state and a
  `target`. Unlock fires when `progress >= target`.

**System** ([Milestones.ts](src/systems/Milestones.ts))
- `checkMilestones` renamed to `checkAchievements` — now iterates
  the full ACHIEVEMENTS registry instead of just the 4 wealth
  tiers. `MILESTONES` is now a derived filter (`category === 'wealth'`)
  preserved for HUDScene's celebration-popup eligibility check —
  wealth-tier unlocks get the big banner; everything else fires a
  quieter news entry only.
- News copy reads `★ Milestone: …` for wealth tiers (unchanged)
  and `★ Achievement: …` for everything else.

**State** ([GameState.ts](src/state/GameState.ts))
- Renamed `milestonesReached` → `achievementsUnlocked` (a string[]
  of unlocked ids). Save migration is transparent: `loadFrom` uses
  `snap.achievementsUnlocked ?? snap.milestonesReached ?? []`, so
  any existing wealth-tier unlocks carry across without re-firing.
  HUDScene and GameOverScene updated to read the new field.

**UI** ([StatsScene.ts](src/scenes/rooms/StatsScene.ts))
- New Achievements section below the existing career stats block.
  Shows total progress (X / 27) at the top, then category-by-
  category groupings. Each row has a medal icon, name +
  description, and either a green "✓ Unlocked" pill OR a progress
  bar with `current / target` count. Money targets format as
  $-strings; counter targets format as commas-separated numbers.

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
