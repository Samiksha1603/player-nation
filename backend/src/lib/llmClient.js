/**
 * PlayerNation match report pipeline - LLM stage.
 *
 * Builds the prompt from aggregated match features and calls Groq's
 * OpenAI-compatible chat completions endpoint, asking for a structured
 * JSON report (not free-form prose) so the app can render distinct,
 * styled sections rather than a wall of text.
 *
 * NOTE: originally built against Gemini, but Gemini's free-tier project
 * returned a persistent 429 with limit:0 (an account/billing provisioning
 * issue on Google's side, not a code bug - documented in the write-up).
 * Swapped to Groq, which uses an OpenAI-compatible schema and has a
 * reliably-active free tier with no billing link required.
 *
 * PROMPT DESIGN: the JSON schema IS the enforcement mechanism. Instead
 * of writing rules like "cite momentum windows" and hoping the model
 * complies, we create fields like `momentumWindow` and `statEvidence`
 * that literally cannot be filled without using the data. This makes
 * compliance structural, not optional.
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_INSTRUCTIONS = `You are an expert football (soccer) analyst writing a match report for \
PlayerNation. You produce JSON reports that are data-dense and specific — the way a sharp coach \
would break down a game, not a generic recap.

ABSOLUTE RULES — violating any makes the output unusable:

1. EVERY claim must cite a number from the provided data. Never write \
"dominated possession" — write "held 54.8% possession". \
Never write "several yellow cards" — write "received 6 yellow cards".

2. BANNED PHRASES (if you catch yourself writing these, STOP and replace \
with a specific stat): "high level of intensity", "numerous scoring \
opportunities", "constant threat", "exceptional vision", "key factor", \
"proved effective", "showed resilience", "clinical finishing".

3. Momentum windows are your most valuable asset. The data gives you \
15-minute possession splits. USE THEM BY NAME. Write "in the 0–15' window \
Argentina controlled 60.6%" — not "Argentina started strong".

4. For each field below, the schema tells you what data source to use. \
If a field says "cite from momentumByWindow", you MUST name a specific \
window like "60–75'" with its exact percentage from the data.

Important context about the data:
- Match minutes are computed from event timestamps and can be off by several \
minutes. Use "around the Nth minute" rather than stating them as exact.
- Percentages and counts (possession, pass accuracy, duels, shots) are \
computed from real event data and ARE reliable.
- "topPlayers" is a simple involvement ranking, not an official rating.

You must respond with ONLY valid JSON matching the schema in the user prompt, \
no markdown fences, no preamble, no text outside the JSON object.`;

function buildUserPrompt(features) {
  return `Here is the full match data. Every field in your response must \
reference specific values from this data. Do not invent statistics.

=== MATCH DATA ===
${JSON.stringify(features, null, 2)}
=== END MATCH DATA ===

Respond with ONLY a JSON object matching this exact schema:

{
  "matchSummary": "(string) 3-4 sentences. MUST include: final score, \
total shots for each team (from teamStats.shots), possession split \
(from teamStats.possessionPct), total yellow card count (count from \
timeline), and reference at least one momentum window by name with \
its percentage from momentumByWindow.",

  "keyMoments": [
    {
      "minute": "(number) match minute from timeline",
      "event": "(string) what happened — goal, card, key pass, etc.",
      "player": "(string) player name exactly as in timeline",
      "team": "(string) team name",
      "scoreline": "(string) scoreline after this event, e.g. '2-1 France'",
      "momentumContext": "(string) REQUIRED: name the momentum window \
this minute falls in, cite its exact percentage from momentumByWindow, \
and explain how this event relates to that window's story. \
e.g. 'This fell in the 15–30\\' window where Argentina controlled 66.1% \
of possession — their sustained pressure eventually producing the equaliser.'"
    }
  ],

  "standoutPerformances": [
    {
      "player": "(string) player name from topPlayers",
      "team": "(string)",
      "goals": "(number) from topPlayers",
      "assists": "(number) from topPlayers",
      "shots": "(number) from topPlayers",
      "touches": "(number) from topPlayers",
      "duelsWon": "(number) from topPlayers",
      "narrative": "(string) 1-2 sentences that reference at least 2 of \
the stats above by their actual number. No generic phrases."
    }
  ],

  "teamAnalysis": {
    "TEAM_A_NAME": {
      "style": "(string) 1 sentence on tactical approach",
      "possessionPct": "(number) from teamStats",
      "passAccuracyPct": "(number) from teamStats",
      "shotsToGoals": "(string) e.g. '4 goals from 5 shots'",
      "bestWindow": "(string) their highest momentum window by name \
with percentage, e.g. '60–75\\' at 54.5%'",
      "worstWindow": "(string) their lowest momentum window by name \
with percentage",
      "patternExplanation": "(string) 2-3 sentences. MUST reference \
bestWindow and worstWindow by name and percentage, and explain WHY \
the pattern shifted using timeline events (goals, cards) from those windows."
    },
    "TEAM_B_NAME": {
      "style": "(string)",
      "possessionPct": "(number)",
      "passAccuracyPct": "(number)",
      "shotsToGoals": "(string)",
      "bestWindow": "(string)",
      "worstWindow": "(string)",
      "patternExplanation": "(string) same rules as above"
    }
  },

  "actionableInsights": [
    {
      "claim": "(string) the tactical observation",
      "evidence": "(string) MUST contain at least 2 specific numbers \
from the match data to support the claim. e.g. 'France scored 4 goals \
from 5 shots (80% conversion) vs Argentina's 3 from 9 (33%).'",
      "recommendation": "(string) what a coach or player should do"
    }
  ]
}

Replace TEAM_A_NAME and TEAM_B_NAME with the actual team names from the data.
Return exactly 5 keyMoments (prioritise goals), 4 standoutPerformances, \
and 3 actionableInsights.`;
}

// ─── Validation ─────────────────────────────────────────────────────
// Post-generation safety net. Catches obvious failures before they
// reach the client. Logs warnings; doesn't block the response.

const BANNED_PHRASES = [
  "high level of intensity",
  "numerous scoring opportunities",
  "constant threat",
  "exceptional vision",
  "key factor",
  "proved effective",
  "showed resilience",
  "clinical finishing",
];

function validate(report, features) {
  const warnings = [];

  // Do keyMoments cite momentum windows?
  const windowNames = (features.momentumByWindow || []).map((w) => w.window);
  for (const moment of report.keyMoments || []) {
    const ctx = (moment.momentumContext || "").replace(/'/g, "'");
    const citesWindow = windowNames.some((w) => ctx.includes(w.replace("'", "'")));
    if (!citesWindow) {
      warnings.push(
        `keyMoment at ${moment.minute}' missing momentum window citation`
      );
    }
  }

  // Do actionableInsights contain at least 2 numbers each?
  for (const insight of report.actionableInsights || []) {
    const nums = (insight.evidence || "").match(/\d+/g);
    if (!nums || nums.length < 2) {
      warnings.push(
        `Insight "${(insight.claim || "").slice(0, 40)}..." has <2 numbers in evidence`
      );
    }
  }

  // Banned phrase scan
  const fullText = JSON.stringify(report).toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (fullText.includes(phrase)) {
      warnings.push(`Banned phrase found: "${phrase}"`);
    }
  }

  if (warnings.length > 0) {
    console.warn("⚠️  Report validation warnings:", warnings);
    report._validationWarnings = warnings;
  }

  return report;
}

// ─── Groq API call ──────────────────────────────────────────────────
// Retry logic preserved from original: retries on 429/5xx and timeouts,
// fails fast on 4xx auth/bad-request errors.

async function callGroq(features, apiKey, { maxRetries = 2 } = {}) {
  const payload = {
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: SYSTEM_INSTRUCTIONS },
      { role: "user", content: buildUserPrompt(features) },
    ],
    temperature: 0.3, // lower = more faithful to data
    response_format: { type: "json_object" },
  };

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const bodyText = await response.text();
        const isRetryable = response.status === 429 || response.status >= 500;
        const error = new Error(
          `Groq API error ${response.status}: ${bodyText}`
        );
        error.status = response.status;
        if (!isRetryable || attempt === maxRetries) throw error;
        lastError = error;
        await sleep(500 * Math.pow(2, attempt));
        continue;
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error("Groq response missing expected message content");
      }

      try {
        const parsed = JSON.parse(text);
        return validate(parsed, features);
      } catch (parseErr) {
        throw new Error(
          `Groq returned invalid JSON: ${parseErr.message}. Raw text: ${text.slice(0, 200)}`
        );
      }
    } catch (err) {
      if (err.name === "TimeoutError") {
        lastError = new Error("Groq request timed out after 30s");
        if (attempt === maxRetries) throw lastError;
        continue;
      }
      if (attempt === maxRetries) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { callGroq };