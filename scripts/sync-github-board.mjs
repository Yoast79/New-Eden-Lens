/**
 * Syncs New Eden Lens roadmap items to GitHub Issues (Yoast79/New-Eden-Lens)
 * and places them into columns on GitHub Project #4.
 *
 * Usage (in PowerShell inside e:\New Eden Lens):
 *   $env:GITHUB_TOKEN = "your_classic_pat_with_repo_and_project_scopes"
 *   node scripts/sync-github-board.mjs
 */

const OWNER = 'Yoast79';
const REPO = 'New-Eden-Lens';
const PROJECT_NUMBER = 4;

const TOKEN = process.env.GITHUB_TOKEN?.trim();
if (!TOKEN) {
  console.error('Error: GITHUB_TOKEN environment variable is not set.');
  console.error('Run: $env:GITHUB_TOKEN = "ghp_..."');
  process.exit(1);
}

const BOARD_CARDS = [
  // === DONE ===
  {
    status: 'Done',
    title: 'Core Electron + SQLite (sql.js) App Shell',
    body: 'Electron Main/Preload/Renderer shell with typed IPC bridge, WAL/atomic SQLite persistence (`electron/db/connection.ts`), and schema migrations.'
  },
  {
    status: 'Done',
    title: 'EVE Photon UI, Neocom Left Rail & Faction Theme Switcher',
    body: 'In-game Neocom left icon rail, TopBar telemetry, and 7 switchable faction themes (`Photon`, `Caldari`, `Amarr`, `Gallente`, `Minmatar`, `Triglavian`, `Sisters of EVE`).'
  },
  {
    status: 'Done',
    title: 'Modular Plugin Registry & Hot-Swap Module Manager',
    body: 'Self-contained `src/modules/<name>/` folders, enable/disable/reorder Module Manager, ESI scope guard, and per-module `ErrorBoundary`.'
  },
  {
    status: 'Done',
    title: 'EVE SSO PKCE Multi-Account & Character Manager',
    body: 'Serverless OAuth2 PKCE (`http://127.0.0.1:14580/callback`), `safeStorage` token encryption, auto-refresh, Account groups, Main character selector, and official-style `LOG IN with EVE Online` button.'
  },
  {
    status: 'Done',
    title: 'Local Fuzzwork SDE Importer',
    body: 'Downloads and indexes Fuzzwork `/dump/latest/csv/` tables (`invTypes`, `invVolumes`, `mapSolarSystems`, `mapSolarSystemJumps`, `mapLocationWormholeClasses`, `dgm*`) or imports a local `.sqlite` dump.'
  },
  {
    status: 'Done',
    title: 'Modern ESI Client & Image Disk Cache (eve-img://)',
    body: 'Targets `https://esi.evetech.net` with `X-Compatibility-Date` (`2026-08-18`), respects `429 Retry-After` & `X-ESI-Error-Limit-Remain`, and caches `images.evetech.net` assets locally via `eve-img://`.'
  },
  {
    status: 'Done',
    title: 'EVE Clipboard Parser & Auto-Router',
    body: 'Auto-detects EFT fittings, D-Scan, Cosmic Signatures, Hangar/Contracts, Route Waypoints, and Local pilot lists (`tests/eveClipboard.test.ts`).'
  },
  {
    status: 'Done',
    title: 'Module 4: Item & Hangar Evaluator (Janice-Style)',
    body: 'Evaluates pasted hangar/cargo/contract lists with SDE volume, official item icons, and cached Jita/Amarr/Dodixie/Rens Buy/Sell/Split quotes.'
  },
  {
    status: 'Done',
    title: 'Module 8: Skill & Injector Planner',
    body: 'Recursive Dogma skill prerequisite solver for searched items or EFT fits, attribute training time (`d/h/m`), and diminishing-returns Large/Small Skill Injector math (`tests/injectorMath.test.ts`).'
  },
  {
    status: 'Done',
    title: 'Quick Windows Launcher (Launch-NewEdenLens.bat)',
    body: 'Double-clickable `.bat` launcher to run `npm run dev` from File Explorer.'
  },

  // === READY ===
  {
    status: 'Ready',
    title: 'Character select icons',
    existingNumber: 1,
    body: 'Have it show profile pictures per character (polish: show active pilot portrait on top Neocom button & verify live `eve-img://` caching).'
  },
  {
    status: 'Ready',
    title: 'Module 8 Polish: Active Implants Breakdown',
    body: 'Display individual active implant names and attribute bonuses from SDE in the Skill & Injector Planner.'
  },
  {
    status: 'Ready',
    title: 'Module 1: Tactical Stargate & Activity Map',
    body: 'Interactive 2D/2.5D star map using SDE coordinates with Ship/Pod/NPC kills & Jumps overlays, security/sov coloring, Ice Belt markers/timers, and right-click ESI Set Destination / Add Waypoint.'
  },
  {
    status: 'Ready',
    title: 'Module 2: Shareable Route Planner',
    body: 'Custom A*/Dijkstra pathfinder (Highsec-only, avoid systems/regions, Thera/Turnur shortcuts), parse pasted EVE routes, export compact fleet share code, and push major turns or all jumps to EVE autopilot.'
  },
  {
    status: 'Ready',
    title: 'Module 3: Local Intel & D-Scan Threat Analyzer',
    body: 'Instant paste for Local chat & D-Scan; group D-Scan by ship hull class (Logi, Recon, HAC, Capital) and cross-reference Local pilots via ESI/zKillboard for cyno hunters & hot-droppers.'
  },

  // === BACKLOG ===
  {
    status: 'Backlog',
    title: 'Module 6: Live & Historical Killboard (zKillboard RedisQ)',
    body: 'Stream live killmails from `redisq.zkillboard.com` into SQLite with custom watchlists for ship types, entities (pilots/corps/alliances/NPC officers), and structures, plus audio/desktop alerts.'
  },
  {
    status: 'Backlog',
    title: 'Module 5: Market & Investment Tracker',
    body: 'Search tradable items, view Recharts price/volume history (`/markets/{region_id}/history/`), and track personal buy/sell investments net of broker fees and sales tax.'
  },
  {
    status: 'Backlog',
    title: 'Module 7: Ship Fitter & Skill-Aware Simulator',
    body: 'Full fitting window (High, Mid, Low, Rig, Subsystem, Drone bays) via SDE Dogma, EFT import/export, ESI fittings sync, and live Cap/DPS/EHP/Targeting/Align Time using character skills.'
  },
  {
    status: 'Backlog',
    title: 'Module 9: Pilot Analytics, Wealth & Clone Tracker',
    body: 'Wallet + asset net worth history charts, ISK/hr/day/week/month, K/D ratio, most expensive asset/ship, Abyssal/PvE journal ticks, active implants, Jump Clone locations & live cooldown timer.'
  },
  {
    status: 'Backlog',
    title: 'Module 10: Wormhole Chain Mapper (Pathfinder-Style)',
    body: 'React Flow graph with 5-second `/characters/{id}/location/` polling auto-creating nodes & connections, WH class/statics/effects, mass/EOL tags, and Cosmic Signature paste box.'
  },
  {
    status: 'Backlog',
    title: 'Windows Standalone .exe Packaging & E2E QA',
    body: 'Configure `electron-builder` for standalone Windows `.exe` distribution and perform end-to-end QA across live ESI, SDE, and all 10 modules.'
  }
];

async function githubRest(path, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'NewEdenLens-BoardSync',
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`REST ${res.status} ${path}: ${txt}`);
  }
  return res.json();
}

async function githubGraphql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'NewEdenLens-BoardSync',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`Reading Project #${PROJECT_NUMBER} for ${OWNER}...`);
  const projData = await githubGraphql(
    `query($login: String!, $num: Int!) {
      user(login: $login) {
        projectV2(number: $num) {
          id
          title
          fields(first: 30) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options { id name }
              }
            }
          }
          items(first: 100) {
            nodes {
              id
              content {
                ... on Issue { id number title }
              }
            }
          }
        }
      }
    }`,
    { login: OWNER, num: PROJECT_NUMBER }
  );

  const project = projData.user?.projectV2;
  if (!project) {
    throw new Error(`Could not access Project #${PROJECT_NUMBER} for ${OWNER}. Check token "project" scope.`);
  }

  const statusField = project.fields.nodes.find(
    (f) => f?.name?.toLowerCase() === 'status' && Array.isArray(f.options)
  );
  if (!statusField) {
    throw new Error('Could not find "Status" single-select field on Project #4.');
  }

  const optionIdByName = new Map(
    statusField.options.map((o) => [o.name.toLowerCase(), o.id])
  );

  const existingProjectItemsByIssueId = new Map();
  for (const item of project.items.nodes) {
    if (item?.content?.id) {
      existingProjectItemsByIssueId.set(item.content.id, item.id);
    }
  }

  console.log(`Fetching existing issues in ${OWNER}/${REPO}...`);
  const existingIssues = await githubRest(
    `/repos/${OWNER}/${REPO}/issues?state=all&per_page=100`
  );
  const issueByTitle = new Map(
    existingIssues.map((iss) => [iss.title.trim().toLowerCase(), iss])
  );
  const issueByNumber = new Map(existingIssues.map((iss) => [iss.number, iss]));

  for (const card of BOARD_CARDS) {
    let issue =
      (card.existingNumber ? issueByNumber.get(card.existingNumber) : undefined) ??
      issueByTitle.get(card.title.trim().toLowerCase());

    if (!issue) {
      console.log(`Creating issue: "${card.title}"...`);
      issue = await githubRest(`/repos/${OWNER}/${REPO}/issues`, {
        method: 'POST',
        body: { title: card.title, body: card.body }
      });
      await sleep(250);
    } else {
      console.log(`Found existing issue #${issue.number}: "${issue.title}"`);
    }

    const desiredState = card.status === 'Done' ? 'closed' : 'open';
    if (issue.state !== desiredState) {
      await githubRest(`/repos/${OWNER}/${REPO}/issues/${issue.number}`, {
        method: 'PATCH',
        body: { state: desiredState }
      });
      await sleep(200);
    }

    let projectItemId = existingProjectItemsByIssueId.get(issue.node_id);
    if (!projectItemId) {
      const addRes = await githubGraphql(
        `mutation($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
            item { id }
          }
        }`,
        { projectId: project.id, contentId: issue.node_id }
      );
      projectItemId = addRes.addProjectV2ItemById.item.id;
      await sleep(200);
    }

    const optionId = optionIdByName.get(card.status.toLowerCase());
    if (!optionId) {
      console.warn(`Warning: Status column "${card.status}" not found on board.`);
      continue;
    }

    await githubGraphql(
      `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { singleSelectOptionId: $optionId }
          }
        ) {
          projectV2Item { id }
        }
      }`,
      {
        projectId: project.id,
        itemId: projectItemId,
        fieldId: statusField.id,
        optionId
      }
    );
    console.log(`  -> Placed #${issue.number} in "${card.status}"`);
    await sleep(200);
  }

  console.log('\nAll cards synced to GitHub Project #4!');
}

main().catch((err) => {
  console.error('\nSync failed:', err.message);
  process.exit(1);
});

