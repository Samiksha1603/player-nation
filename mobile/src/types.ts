/**
 * Types mirroring the backend's response shapes exactly.
 * Keep these in sync with backend/src/server.js and backend/src/lib/*.js -
 * if the backend's JSON shape changes, update here too.
 */

export interface MatchSummary {
  id: string;
  homeTeam: string;
  awayTeam: string;
  score: string;
  competition: string;
  date: string;
}

export interface MatchesResponse {
  matches: MatchSummary[];
}

// ---- Aggregated features (the "data" half) ----

export interface TimelineEvent {
  id: number;
  type: "goal" | "own_goal" | "red_card" | "yellow_card" | "assist" | "key_pass";
  minute: number;
  period: "1H" | "2H";
  team: string;
  player: string;
  detail?: string;
  bodyPart?: string | null;
  minuteApproximate: boolean;
  minuteReliable: boolean;
}

export interface TeamStats {
  possessionEvents: number;
  passesAttempted: number;
  passesAccurate: number;
  shots: number;
  shotsOnTargetOrGoal: number;
  duelsWon: number;
  duelsTotal: number;
  foulsCommitted: number;
  crosses: number;
  possessionPct: number | null;
  passAccuracyPct: number | null;
  duelSuccessPct: number | null;
}

export interface MomentumWindow {
  window: string;
  [teamName: string]: string | number;
}

export interface TopPlayer {
  name: string;
  role: string;
  team: string;
  touches: number;
  shots: number;
  goals: number;
  keyPasses: number;
  assists: number;
  duelsWon: number;
}

export interface MatchFeatures {
  matchId: number | null;
  teams: string[];
  finalScore: Record<string, number>;
  timeline: TimelineEvent[];
  teamStats: Record<string, TeamStats>;
  momentumByWindow: MomentumWindow[];
  topPlayers: TopPlayer[];
  rawEventCount: number;
  dataNotes: string[];
}

// ---- LLM-generated report (the "story" half) ----

export interface KeyMoment {
  minute: number;
  event: string;
  player: string;
  team: string;
  scoreline: string;
  momentumContext: string;
}

export interface StandoutPerformance {
  player: string;
  team: string;
  goals: number;
  assists: number;
  shots: number;
  touches: number;
  duelsWon: number;
  narrative: string;
}

export interface TeamAnalysisEntry {
  style: string;
  possessionPct: number;
  passAccuracyPct: number;
  shotsToGoals: string;
  bestWindow: string;
  worstWindow: string;
  patternExplanation: string;
}

export interface ActionableInsight {
  claim: string;
  evidence: string;
  recommendation: string;
}

export interface MatchReport {
  matchSummary: string;
  keyMoments: KeyMoment[];
  standoutPerformances: StandoutPerformance[];
  teamAnalysis: Record<string, TeamAnalysisEntry>;
  actionableInsights: ActionableInsight[];
  _validationWarnings?: string[];
}

export interface MatchReportResponse {
  cached: boolean;
  matchInfo: MatchSummary & { file?: string };
  features: MatchFeatures;
  report: MatchReport;
}

export interface ApiErrorResponse {
  error: string;
  detail?: string;
  retryable?: boolean;
}