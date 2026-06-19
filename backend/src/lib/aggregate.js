/**
 * PlayerNation match report pipeline - Aggregation stage.
 *
 * Turns ~1,400 raw Wyscout events for one match into compact, structured
 * features an LLM can reason about well.
 *
 * Two tracks:
 *   1. discrete narrative events (goals, cards, big chances) -> timeline
 *   2. aggregate stats (possession, passing, shots, territory) -> numbers
 *
 * Known data quirk (found by inspection against the real France 4-3
 * Argentina scoreline, not assumed): eventSec-derived minutes can be
 * systematically off from real broadcast minutes. We flag this rather
 * than hide it - see data_notes in the output.
 */

const { decodeTags, hasTag } = require("./wyscoutTags");

function buildPlayerLookup(data) {
  const lookup = {};
  for (const group of Object.values(data.players)) {
    for (const p of group) {
      const info = p.player;
      lookup[p.playerId] = {
        name: info.shortName,
        fullName: `${info.firstName} ${info.lastName}`.trim(),
        role: info.role.name,
        teamId: info.currentNationalTeamId,
        foot: info.foot || null,
      };
    }
  }
  return lookup;
}

function buildTeamLookup(data) {
  const lookup = {};
  for (const [tid, t] of Object.entries(data.teams)) {
    lookup[Number(tid)] = t.name;
  }
  return lookup;
}

function computeMinute(event) {
  const base = event.matchPeriod === "2H" ? 45 : 0;
  return base + Math.floor(event.eventSec / 60);
}

function detectMinuteAnomalies(timelineEvents) {
  const anomalies = new Set();
  for (let i = 1; i < timelineEvents.length; i++) {
    if (timelineEvents[i].minute < timelineEvents[i - 1].minute) {
      anomalies.add(timelineEvents[i].id);
      anomalies.add(timelineEvents[i - 1].id);
    }
  }
  return anomalies;
}

function extractTimeline(events, playerLookup, teamLookup) {
  const timeline = [];

  for (const e of events) {
    const tags = e.tags || [];
    const minute = computeMinute(e);
    const player = playerLookup[e.playerId] || {};
    const team = teamLookup[e.teamId] || "Unknown";

    // Goals: tagged 101, can appear under Shot or Free Kick (penalties)
    if ((e.eventName === "Shot" || e.eventName === "Free Kick") && hasTag(tags, 101)) {
      timeline.push({
        id: e.id,
        type: "goal",
        minute,
        period: e.matchPeriod,
        team,
        player: player.name || "Unknown",
        detail: e.subEventName,
        bodyPart: decodeTags(tags).find((t) =>
          ["left_foot", "right_foot", "head/body"].includes(t)
        ) || null,
      });
    }

    if (hasTag(tags, 102)) {
      timeline.push({
        id: e.id,
        type: "own_goal",
        minute,
        period: e.matchPeriod,
        team,
        player: player.name || "Unknown",
      });
    }

    if (hasTag(tags, 1701) || hasTag(tags, 1703)) {
      timeline.push({
        id: e.id,
        type: "red_card",
        minute,
        period: e.matchPeriod,
        team,
        player: player.name || "Unknown",
      });
    }
    if (hasTag(tags, 1702)) {
      timeline.push({
        id: e.id,
        type: "yellow_card",
        minute,
        period: e.matchPeriod,
        team,
        player: player.name || "Unknown",
      });
    }

    if (e.eventName === "Pass" && (hasTag(tags, 301) || hasTag(tags, 302))) {
      timeline.push({
        id: e.id,
        type: hasTag(tags, 301) ? "assist" : "key_pass",
        minute,
        period: e.matchPeriod,
        team,
        player: player.name || "Unknown",
      });
    }
  }

  timeline.sort((a, b) => {
    if (a.period !== b.period) return a.period === "1H" ? -1 : 1;
    return a.minute - b.minute;
  });

  const anomalies = detectMinuteAnomalies(timeline);
  for (const ev of timeline) {
    ev.minuteApproximate = true;
    ev.minuteReliable = !anomalies.has(ev.id);
  }

  return timeline;
}

function extractTeamStats(events, teamLookup) {
  const stats = {};
  for (const name of Object.values(teamLookup)) {
    stats[name] = {
      possessionEvents: 0,
      passesAttempted: 0,
      passesAccurate: 0,
      shots: 0,
      shotsOnTargetOrGoal: 0,
      duelsWon: 0,
      duelsTotal: 0,
      foulsCommitted: 0,
      crosses: 0,
    };
  }

  for (const e of events) {
    const team = teamLookup[e.teamId];
    if (!team) continue;
    const tags = e.tags || [];
    const s = stats[team];

    s.possessionEvents += 1;

    if (e.eventName === "Pass") {
      s.passesAttempted += 1;
      if (hasTag(tags, 1801)) s.passesAccurate += 1;
      if (e.subEventName === "Cross") s.crosses += 1;
    }

    if (e.eventName === "Shot") {
      s.shots += 1;
      if (hasTag(tags, 101) || !hasTag(tags, 2101)) {
        s.shotsOnTargetOrGoal += 1;
      }
    }

    if (e.eventName === "Duel") {
      s.duelsTotal += 1;
      if (hasTag(tags, 703)) s.duelsWon += 1;
    }

    if (e.eventName === "Foul") {
      s.foulsCommitted += 1;
    }
  }

  const totalPossessionEvents = Object.values(stats).reduce(
    (sum, s) => sum + s.possessionEvents,
    0
  );

  for (const s of Object.values(stats)) {
    s.possessionPct = totalPossessionEvents
      ? round1((100 * s.possessionEvents) / totalPossessionEvents)
      : null;
    s.passAccuracyPct = s.passesAttempted
      ? round1((100 * s.passesAccurate) / s.passesAttempted)
      : null;
    s.duelSuccessPct = s.duelsTotal
      ? round1((100 * s.duelsWon) / s.duelsTotal)
      : null;
  }

  return stats;
}

function extractMomentum(events, teamLookup, windowMinutes = 15) {
  const buckets = {};
  const teamNames = Object.values(teamLookup);

  for (const e of events) {
    const team = teamLookup[e.teamId];
    if (!team) continue;
    const minute = computeMinute(e);
    const windowStart = Math.floor(minute / windowMinutes) * windowMinutes;
    const key = `${windowStart}-${windowStart + windowMinutes}'`;

    if (!buckets[key]) {
      buckets[key] = {};
      for (const t of teamNames) buckets[key][t] = 0;
    }
    buckets[key][team] += 1;
  }

  const sortedKeys = Object.keys(buckets).sort(
    (a, b) => parseInt(a) - parseInt(b)
  );

  return sortedKeys
    .map((key) => {
      const counts = buckets[key];
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      if (total === 0) return null;
      const entry = { window: key };
      for (const t of teamNames) {
        entry[t] = round1((100 * counts[t]) / total);
      }
      return entry;
    })
    .filter(Boolean);
}

function extractPlayerInvolvement(events, playerLookup, teamLookup, topN = 6) {
  const playerStats = {};

  for (const e of events) {
    const pid = e.playerId;
    if (pid == null || !playerLookup[pid]) continue;
    const tags = e.tags || [];

    if (!playerStats[pid]) {
      playerStats[pid] = {
        name: playerLookup[pid].name,
        role: playerLookup[pid].role,
        team: teamLookup[e.teamId] || "Unknown",
        touches: 0,
        shots: 0,
        goals: 0,
        keyPasses: 0,
        assists: 0,
        duelsWon: 0,
      };
    }
    const p = playerStats[pid];

    p.touches += 1;
    if (e.eventName === "Shot") p.shots += 1;

    // IMPORTANT: the 'goal' tag (101) also appears on the GOALKEEPER's
    // "Save attempt" event for the goal conceded against them. Only credit
    // a goal scored when the event itself is the shot/free kick that
    // produced it - same fix applied in extractTimeline.
    if ((e.eventName === "Shot" || e.eventName === "Free Kick") && hasTag(tags, 101)) {
      p.goals += 1;
    }
    if (hasTag(tags, 302)) p.keyPasses += 1;
    if (hasTag(tags, 301)) p.assists += 1;
    if (e.eventName === "Duel" && hasTag(tags, 703)) p.duelsWon += 1;
  }

  return Object.values(playerStats)
    .sort(
      (a, b) =>
        b.goals * 4 + b.assists * 3 + b.keyPasses * 1.5 + b.shots * 0.5 -
        (a.goals * 4 + a.assists * 3 + a.keyPasses * 1.5 + a.shots * 0.5)
    )
    .slice(0, topN);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function buildMatchFeatures(matchData) {
  const events = matchData.events;
  const playerLookup = buildPlayerLookup(matchData);
  const teamLookup = buildTeamLookup(matchData);
  const teamNames = Object.values(teamLookup);

  const timeline = extractTimeline(events, playerLookup, teamLookup);
  const teamStats = extractTeamStats(events, teamLookup);
  const momentum = extractMomentum(events, teamLookup);
  const topPlayers = extractPlayerInvolvement(events, playerLookup, teamLookup);

  const goalsAndOwnGoals = timeline.filter(
    (t) => t.type === "goal" || t.type === "own_goal"
  );
  const finalScore = {};
  for (const t of teamNames) finalScore[t] = 0;
  for (const g of goalsAndOwnGoals) {
    if (g.type === "own_goal") {
      const other = teamNames.find((t) => t !== g.team);
      finalScore[other] += 1;
    } else {
      finalScore[g.team] += 1;
    }
  }

const yellowCards = timeline.filter((t) => t.type === "yellow_card").length;
const redCards = timeline.filter((t) => t.type === "red_card").length;
const totalGoals = timeline.filter((t) => t.type === "goal").length;


  return {
    matchId: events.length ? events[0].matchId : null,
    teams: teamNames,
    finalScore,
    timeline,
    teamStats,
    momentumByWindow: momentum,
    topPlayers,
    rawEventCount: events.length,
    dataNotes: [
      "Match minutes are computed from event timestamps and may be " +
        "systematically inaccurate (verified against this match's real " +
        "scoreline); treat all minute values as approximate.",
      "minuteReliable=false flags events that broke chronological order " +
        "relative to neighboring events of the same type.",
    ],
  };
}

module.exports = { buildMatchFeatures };
