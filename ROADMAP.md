# New Eden Lens — Project Roadmap & To-Do List

> **How we use this file:**
> - `[x]` = Implemented & verified in `e:\New Eden Lens`.
> - `[ ]` = Planned / upcoming.
> - **Add your own ideas or requests** in the **User Wishlist & Notes** section below (or open Issues on `https://github.com/Yoast79/New-Eden-Lens/issues` — I can read both!).

---

## GitHub Project #4 Sync (`users/Yoast79/projects/4`)
*(Board columns: Backlog · Ready · In progress · In review · Done)*

- **Backlog**
  - [ ] `#1` **Character select icons** — *"Have it show profile pictures per character"* (`Yoast79/New-Eden-Lens#1`)
    *(Note: `TopBar.tsx` and `AccountManagerModal.tsx` already request `eve-img://characters/{id}/portrait?size=64`; remaining polish is showing the active pilot portrait on the Neocom top icon & verifying live portrait caching after SSO login.)*

---

## User Wishlist & Custom Requests
*(Add anything you want built, changed, or prioritized here!)*
- [ ] *(Example: Add custom alert sound selection for Killboard watchlists)*

---

## Phase 1: Core Infrastructure & App Shell
- [x] **Electron + React + TypeScript + Tailwind Shell** (`electron/main.ts`, `electron/preload.ts`, `src/App.tsx`)
- [x] **EVE Online Photon UI & Neocom Left Icon Rail** (`src/core/components/NeocomSidebar.tsx`, `src/core/components/TopBar.tsx`)
- [x] **In-Game Faction Color Theme Switcher** — Photon Dark, Caldari, Amarr, Gallente, Minmatar, Triglavian, Sisters of EVE (`src/styles/photon.css`, `src/core/components/ThemeSwitcherPopover.tsx`)
- [x] **Local SQLite Persistence (`sql.js`)** — WAL/atomic disk persistence & schema migrations (`electron/db/connection.ts`, `electron/db/schema.sql`)
- [x] **Modular Plugin Registry & Hot-Swap Module Manager** — Enable, disable, reorder, ESI scope guard, per-module `ErrorBoundary` (`src/modules/registry.ts`, `src/core/components/ModuleManagerModal.tsx`, `src/core/contexts/ModuleContext.tsx`)
- [x] **Per-Module Self-Contained Folder Structure** — Every module isolated under `src/modules/<module-name>/`
- [x] **EVE SSO PKCE Multi-Account & Character Manager** — No client secret, `safeStorage` token encryption, auto-refresh loop, EVE Account groups, Main Character default selector, official-style `LOG IN with EVE Online` button, and "All Characters" aggregate mode (`electron/services/auth-pkce.ts`, `src/core/components/AccountManagerModal.tsx`, `src/core/components/EveLoginButton.tsx`)
- [x] **Local SDE Importer (Fuzzwork)** — Online `/dump/latest/csv/` downloader + local `.sqlite` file import (`electron/services/sde-importer.ts`, `src/core/components/SdeWizardModal.tsx`)
- [x] **EVE Image Server Disk Cache (`eve-img://`)** — Caches portraits & type icons locally (`electron/services/image-cache.ts`, `src/core/components/EveIcon.tsx`)
- [x] **Modern ESI Client (`X-Compatibility-Date`)** — Respects `429 Retry-After` and `X-ESI-Error-Limit-Remain` (`electron/services/esi-client.ts`)
- [x] **EVE Clipboard Parser** — Auto-detects EFT fittings, D-Scan, Cosmic Signatures, Hangar/Contracts, Route Waypoints, and Local pilot lists (`src/core/parsers/eveClipboard.ts`, tested in `tests/eveClipboard.test.ts`)
- [x] **Quick Windows Launcher** (`Launch-NewEdenLens.bat`)

---

## Phase 2: Self-Contained Utility Modules (ESI / SDE Verification)
- [x] **Module 4: Item & Hangar Evaluator (Janice-Style)** (`src/modules/item-evaluator/`)
  - [x] Paste hangar/cargo/contract lists & aggregate duplicate lines
  - [x] Resolve SDE `typeId`, group, and packaged/unpackaged m³ volume
  - [x] Fetch & cache ESI orders for Jita, Amarr, Dodixie, and Rens (Buy, Sell, Split)
  - [x] Copy appraisal summary to clipboard
- [x] **Module 8: Skill & Injector Planner** (`src/modules/skill-planner/`)
  - [x] Recursive SDE Dogma skill prerequisite solver for items or pasted EFT fits
  - [x] Character trained skill comparison & attribute-based training time (`Days, Hours, Minutes`)
  - [x] Diminishing-returns Large/Small Skill Injector calculator across `<5M`, `5M–50M`, `50M–80M`, `>80M` SP brackets (tested in `tests/injectorMath.test.ts`)
  - [ ] Show individual active implant names/bonuses breakdown from SDE in UI

---

## Phase 3: Navigation & Intel Modules
- [ ] **Module 1: Tactical Stargate & Activity Map** (`src/modules/tactical-map/`)
  - [ ] Interactive 2D/2.5D star map using SDE `position2Dx/y` or `x/y/z` coordinates & stargates (`@xyflow/react` or Canvas)
  - [ ] Live ESI overlays: Ship Kills, Pod Kills, NPC Kills (`/universe/system_kills`), Jumps (`/universe/system_jumps`)
  - [ ] Security status colors, Sovereignty alliance overlay (`/sovereignty/map`), & custom Ice Belt markers + timers (`system_notes`)
  - [ ] Right-click system context menu: **Set Destination** / **Add Waypoint** via ESI (`/ui/autopilot/waypoint`)
- [ ] **Module 2: Shareable Route Planner** (`src/modules/route-planner/`)
  - [ ] A*/Dijkstra pathfinder over `sde_stargates`
  - [ ] Security filters (Highsec-only, Avoid Low/Null), avoid specific systems/regions, & Thera/Turnur shortcut integration
  - [ ] Parse pasted EVE autopilot routes & export compact shareable route string/JSON for fleet mates
  - [ ] Toggle to push/export **major turns only** vs. **every jump** to the live EVE client
- [ ] **Module 3: Local Intel & D-Scan Threat Analyzer** (`src/modules/local-intel/`)
  - [ ] Instant paste box & auto-routing for D-Scan and Local chat
  - [ ] Group D-Scan results by ship hull class (Logistics, Recon, HAC, Capital, etc.) with totals
  - [ ] Cross-reference Local pilot names against ESI (`/universe/ids`, `/characters/{id}`) & zKillboard threat signals (cyno hunters, hot-droppers, hostile alliances)

---

## Phase 4: Markets, Live Killboard, Fitting & Analytics
- [ ] **Module 5: Market & Investment Tracker** (`src/modules/market-tracker/`)
  - [ ] Search any tradable item & render historical price/volume charts (`/markets/{region_id}/history`) with Recharts
  - [ ] Personal buy/sell investment ledger (`market_investments`) calculating net profit after broker fees & sales tax
  - [ ] Optional sync with character's active ESI market orders
- [ ] **Module 6: Live & Historical Killboard (zKillboard RedisQ)** (`src/modules/killboard/`)
  - [ ] Background worker streaming `https://redisq.zkillboard.com/listen.php` into SQLite `killmails`
  - [ ] Custom watchlists (`kill_watchlists`) for Ship Types, Entities (pilot/corp/alliance/NPC officers), and Structures/Deployables
  - [ ] Desktop & audio alert triggers on watchlist matches
- [ ] **Module 7: Ship Fitter & Skill-Aware Simulator** (`src/modules/ship-fitter/`)
  - [ ] Full slot UI: High, Mid, Low, Rig, Subsystem, and Drone bays using SDE Dogma attributes & effects
  - [ ] EFT import/export & ESI `/characters/{id}/fittings` read/write sync
  - [ ] Live skill-aware stats: Capacitor stability, DPS, EHP, Targeting Range, Align Time
- [ ] **Module 9: Pilot Analytics, Wealth & Clone Tracker** (`src/modules/pilot-analytics/`)
  - [ ] Wallet + Asset net worth history charts (`Recharts`) from SQLite snapshots
  - [ ] KPIs: ISK gained/lost (hr/day/week/month), K/D ratio, most expensive asset & ship owned
  - [ ] Abyssal / PvE Loot & Bounty Tick Tracker from `/characters/{id}/wallet/journal`
  - [ ] Active implants, Jump Clone locations, and live Jump Clone cooldown countdown (`/characters/{id}/clones`)
- [ ] **Module 10: Wormhole Chain Mapper (Pathfinder-Style)** (`src/modules/wormhole-mapper/`)
  - [ ] React Flow node graph of connected systems
  - [ ] 5-second background polling of `/characters/{id}/location` across linked characters to auto-create nodes & jump edges
  - [ ] Wormhole class (`C1–C6`, Shattered, Thera), statics, system effects, mass/EOL tags, & Cosmic Signature paste table

---

## Phase 5: Packaging & Release
- [ ] **Windows Standalone Installer / `.exe`** (`electron-builder` configuration)
- [ ] **End-to-End Integration Verification** (Live ESI PKCE, SDE import, and all 10 modules)

