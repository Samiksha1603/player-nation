/**
 * PlayerNation backend server.
 *
 * GET /api/matches              -> list of available matches
 * GET /api/matches/:id/report   -> generate (or return cached) match report
 *
 * Architecture note: inference and data aggregation happen here, not on
 * the phone. This keeps the Groq API key off the device, lets us cache
 * generated reports (LLM calls are slow + cost quota), and centralizes
 * error handling/retries in one place instead of duplicating it in the
 * mobile app.
 *
 * CHANGE FROM ORIGINAL: matches are now auto-discovered by scanning the
 * data/ directory on startup, instead of being hardcoded. This means
 * running `node setup-matches.js` once populates all World Cup matches
 * automatically.
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const { buildMatchFeatures } = require("./lib/aggregate");
const { callGroq } = require("./lib/llmClient");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DATA_DIR = path.join(__dirname, "data");

// Simple in-memory cache so we don't re-call the LLM for the same match
const reportCache = new Map();

// ─── Auto-discover matches ──────────────────────────────────────────
// Scans data/ for match_*.json files, reads each one just enough to
// extract the team names and score, then builds the match registry.
// Runs once on startup — no hardcoding needed.

function discoverMatches() {
  if (!fs.existsSync(DATA_DIR)) {
    console.warn(`Data directory not found: ${DATA_DIR}`);
    console.warn("Run 'node setup-matches.js' to download the World Cup dataset.");
    return [];
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.startsWith("match_") && f.endsWith(".json"))
    .sort();

  console.log(`Found ${files.length} match files in ${DATA_DIR}/`);

  const matches = [];

  for (const file of files) {
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(DATA_DIR, file), "utf-8")
      );

      const id = file.replace("match_", "").replace(".json", "");
      const teamNames = Object.values(raw.teams || {}).map((t) => t.name);

      // Compute score from events (same logic as aggregate.js)
      const goals = (raw.events || []).filter((e) => {
        const tags = (e.tags || []).map((t) => (typeof t === "object" ? t.id : t));
        return (
          (e.eventName === "Shot" || e.eventName === "Free Kick") &&
          tags.includes(101)
        );
      });

      const score = {};
      for (const t of teamNames) score[t] = 0;
      for (const g of goals) {
        const team =
          raw.teams[g.teamId]?.name || teamNames[0] || "Unknown";
        score[team] = (score[team] || 0) + 1;
      }

      const scoreStr = teamNames.map((t) => score[t] || 0).join("-");

      // Extract date and competition from matchMeta if available
      const meta = raw.matchMeta || {};
      const date = meta.dateutc
        ? meta.dateutc.split(" ")[0]
        : null;

      matches.push({
        id,
        homeTeam: teamNames[0] || "Unknown",
        awayTeam: teamNames[1] || "Unknown",
        score: scoreStr,
        competition: "FIFA World Cup 2018",
        date,
        label: meta.label || `${teamNames[0]} vs ${teamNames[1]}`,
        file,
      });
    } catch (err) {
      console.warn(`  Skipping ${file}: ${err.message}`);
    }
  }

  // Sort by date (most recent first), then by matchId
  matches.sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date);
    return a.id.localeCompare(b.id);
  });

  console.log(
    `Registered ${matches.length} matches:`,
    matches.map((m) => `${m.homeTeam} vs ${m.awayTeam} (${m.score})`).join(", ")
  );

  return matches;
}

const AVAILABLE_MATCHES = discoverMatches();

// ─── Routes ─────────────────────────────────────────────────────────

app.get("/api/matches", (req, res) => {
  res.json({
    matches: AVAILABLE_MATCHES.map(({ file, ...rest }) => rest),
  });
});

app.get("/api/matches/:id/report", async (req, res) => {
  const { id } = req.params;
  const match = AVAILABLE_MATCHES.find((m) => m.id === id);

  if (!match) {
    return res.status(404).json({ error: `Match ${id} not found` });
  }

  const forceRegenerate = req.query.regenerate === "true";
  if (reportCache.has(id) && !forceRegenerate) {
    return res.json({ cached: true, ...reportCache.get(id) });
  }

  if (!GROQ_API_KEY) {
    return res.status(500).json({
      error:
        "Server misconfigured: GROQ_API_KEY is not set. " +
        "Add it to a .env file in the backend directory.",
    });
  }

  try {
    const filePath = path.join(DATA_DIR, match.file);
    const matchData = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    const features = buildMatchFeatures(matchData);
    const report = await callGroq(features, GROQ_API_KEY);

    const result = { matchInfo: match, features, report };
    reportCache.set(id, result);

    res.json({ cached: false, ...result });
  } catch (err) {
    console.error(`Error generating report for match ${id}:`, err);

    const statusCode = err.status === 429 ? 429 : 502;
    res.status(statusCode).json({
      error: "Failed to generate match report",
      detail: err.message,
      retryable: statusCode === 429,
    });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    groqConfigured: Boolean(GROQ_API_KEY),
    matchCount: AVAILABLE_MATCHES.length,
  });
});

app.listen(PORT, () => {
  console.log(`PlayerNation backend running on http://localhost:${PORT}`);
  console.log(`Groq API key configured: ${Boolean(GROQ_API_KEY)}`);
  console.log(`Matches available: ${AVAILABLE_MATCHES.length}`);
});