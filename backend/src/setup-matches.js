#!/usr/bin/env node

/**
 * setup-matches.js
 *
 * Downloads the 64 FIFA World Cup 2018 match files from the Wyscout
 * open dataset repo into ./data (or ./src/data if that's your structure).
 *
 * Run once:  node setup-matches.js
 *
 * Each downloaded file is already in the format your aggregate.js expects:
 * { events: [...], players: {...}, teams: {...} }
 */

const fs = require("fs");
const path = require("path");

// ── Adjust this if your data folder is elsewhere ──
// e.g. path.join(__dirname, "src", "data") if your structure uses src/
const DATA_DIR = path.join(__dirname, "data");

// All 64 FIFA World Cup 2018 match IDs from the Wyscout dataset
const WORLD_CUP_MATCH_IDS = [
  2057954, 2057955, 2057956, 2057957, 2057958, 2057959, 2057960, 2057961,
  2057962, 2057963, 2057964, 2057965, 2057966, 2057967, 2057968, 2057969,
  2057970, 2057971, 2057972, 2057973, 2057974, 2057975, 2057976, 2057977,
  2057978, 2057979, 2057980, 2057981, 2057982, 2057983, 2057984, 2057985,
  2057986, 2057987, 2057988, 2057989, 2057990, 2057991, 2057992, 2057993,
  2057994, 2057995, 2057996, 2057997, 2057998, 2057999, 2058000, 2058001,
  2058002, 2058003, 2058004, 2058005, 2058006, 2058007, 2058008, 2058009,
  2058010, 2058011, 2058012, 2058013, 2058014, 2058015, 2058016, 2058017,
];

const BASE_URL =
  "https://raw.githubusercontent.com/koenvo/wyscout-soccer-match-event-dataset/main/processed/files";

async function downloadMatch(matchId) {
  const url = `${BASE_URL}/${matchId}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for match ${matchId}`);
  }
  return res.text(); // save raw text to avoid re-serializing
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Setting up World Cup 2018 match data...\n");

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const matchId of WORLD_CUP_MATCH_IDS) {
    const filename = `match_${matchId}.json`;
    const filepath = path.join(DATA_DIR, filename);

    // Skip if already downloaded
    if (fs.existsSync(filepath)) {
      skipped++;
      continue;
    }

    try {
      const data = await downloadMatch(matchId);

      // Quick sanity check: must be valid JSON with events
      const parsed = JSON.parse(data);
      const eventCount = parsed.events?.length || 0;
      const teamNames = Object.values(parsed.teams || {}).map((t) => t.name);

      fs.writeFileSync(filepath, data);
      downloaded++;

      console.log(
        `  ✓ ${filename} — ${teamNames.join(" vs ")} (${eventCount} events)`
      );

      // Small delay to be polite to GitHub's CDN
      await sleep(200);
    } catch (err) {
      failed++;
      console.warn(`  ✗ ${filename} — ${err.message}`);
    }
  }

  console.log(
    `\nDone! Downloaded: ${downloaded}, Skipped (existing): ${skipped}, Failed: ${failed}`
  );
  console.log(`Match files are in: ${DATA_DIR}/`);
  console.log("Restart your server to auto-discover them.");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});