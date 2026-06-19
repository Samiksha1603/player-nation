import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { fetchMatchReport, ApiError } from "../api/client";
import { MatchReportResponse } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "MatchReport">;

type LoadState = "loading" | "success" | "error";

const LOADING_MESSAGES = [
  "Reviewing the match events…",
  "Identifying key moments…",
  "Writing the report…",
];

export default function MatchReportScreen({ route }: Props) {
  const { match } = route.params;
  const [data, setData] = useState<MatchReportResponse | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryable, setRetryable] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  const loadReport = useCallback(async () => {
    setState("loading");
    try {
      const result = await fetchMatchReport(match.id);
      setData(result);
      setState("success");
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
        setRetryable(err.retryable);
      } else {
        setErrorMessage("Something went wrong generating this report.");
        setRetryable(true);
      }
      setState("error");
    }
  }, [match.id]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  useEffect(() => {
    if (state !== "loading") return;
    const interval = setInterval(() => {
      setLoadingMessageIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [state]);

  if (state === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#D98E3D" />
        <Text style={styles.loadingText}>{LOADING_MESSAGES[loadingMessageIndex]}</Text>
        <Text style={styles.loadingHint}>This can take up to 15 seconds.</Text>
      </View>
    );
  }

  if (state === "error") {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Couldn't generate this report</Text>
        <Text style={styles.errorDetail}>{errorMessage}</Text>
        {retryable && (
          <TouchableOpacity style={styles.retryButton} onPress={loadReport}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (!data) return null;
  const { report, matchInfo, features } = data;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.scoreHeader}>
        <Text style={styles.competition}>{matchInfo.competition}</Text>
        <View style={styles.matchupRow}>
          <Text style={styles.teamName}>{matchInfo.homeTeam}</Text>
          <Text style={styles.score}>{matchInfo.score}</Text>
          <Text style={styles.teamName}>{matchInfo.awayTeam}</Text>
        </View>
      </View>

      <Section eyebrow="THE STORY" title="Match Summary">
        <Text style={styles.bodyText}>{report.matchSummary}</Text>
      </Section>

      <Section eyebrow="TURNING POINTS" title="Key Moments">
        {report.keyMoments.map((km, i) => (
          <View key={i} style={styles.momentRow}>
            <View style={styles.momentMarker} />
            <View style={styles.momentTextBlock}>
              <Text style={styles.momentText}>
                {km.minute}&apos; — {km.player} ({km.team}) {km.event}
              </Text>
              <Text style={styles.momentScoreline}>{km.scoreline}</Text>
              <Text style={styles.momentContext}>{km.momentumContext}</Text>
            </View>
          </View>
        ))}
      </Section>

      <Section eyebrow="ON THE PITCH" title="Standout Performances">
        {report.standoutPerformances.map((sp, i) => (
          <View key={i} style={styles.performanceCard}>
            <View style={styles.performanceHeader}>
              <Text style={styles.performancePlayer}>{sp.player}</Text>
              <Text style={styles.performanceTeam}>{sp.team}</Text>
            </View>
            <View style={styles.statRow}>
              <StatPill label="Goals" value={sp.goals} />
              <StatPill label="Assists" value={sp.assists} />
              <StatPill label="Shots" value={sp.shots} />
              <StatPill label="Duels won" value={sp.duelsWon} />
            </View>
            <Text style={styles.bodyText}>{sp.narrative}</Text>
          </View>
        ))}
      </Section>

      <Section eyebrow="TACTICAL PICTURE" title="Team Analysis">
        {Object.entries(report.teamAnalysis).map(([team, analysis]) => (
          <View key={team} style={styles.patternBlock}>
            <Text style={styles.patternTeam}>{team}</Text>
            <Text style={styles.bodyText}>{analysis.style}</Text>
            <View style={styles.windowRow}>
              <Text style={styles.windowLabel}>
                Best window: <Text style={styles.windowValue}>{analysis.bestWindow}</Text>
              </Text>
              <Text style={styles.windowLabel}>
                Worst window: <Text style={styles.windowValue}>{analysis.worstWindow}</Text>
              </Text>
            </View>
            <Text style={[styles.bodyText, styles.patternExplanation]}>
              {analysis.patternExplanation}
            </Text>
          </View>
        ))}
      </Section>

      <Section eyebrow="WHAT TO WORK ON" title="Actionable Insights" accent>
        {report.actionableInsights.map((insight, i) => (
          <View key={i} style={styles.insightCard}>
            <Text style={styles.insightClaim}>{insight.claim}</Text>
            <Text style={styles.insightEvidence}>{insight.evidence}</Text>
            <Text style={styles.insightRecommendation}>→ {insight.recommendation}</Text>
          </View>
        ))}
      </Section>

      {report._validationWarnings && report._validationWarnings.length > 0 && (
        <View style={styles.warningsBlock}>
          <Text style={styles.warningsTitle}>⚠ Report quality flags</Text>
          {report._validationWarnings.map((w, i) => (
            <Text key={i} style={styles.warningText}>
              • {w}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Generated from {features.rawEventCount} match events.
        </Text>
        {features.dataNotes.map((note, i) => (
          <Text key={i} style={styles.footerNote}>
            • {note}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statPillValue}>{value}</Text>
      <Text style={styles.statPillLabel}>{label}</Text>
    </View>
  );
}

function Section({
  eyebrow,
  title,
  children,
  accent = false,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <View style={[styles.section, accent && styles.sectionAccent]}>
      <Text style={[styles.sectionEyebrow, accent && styles.sectionEyebrowAccent]}>
        {eyebrow}
      </Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1E3D" },
  scrollContent: { paddingBottom: 40 },
  centered: {
    flex: 1,
    backgroundColor: "#0B1E3D",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: { color: "#F7F5F0", marginTop: 16, fontSize: 16, fontWeight: "600" },
  loadingHint: { color: "#8C95A8", marginTop: 6, fontSize: 13 },
  errorTitle: { color: "#F7F5F0", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  errorDetail: { color: "#C9CFDB", fontSize: 14, textAlign: "center", marginBottom: 20 },
  retryButton: {
    backgroundColor: "#D98E3D",
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 4,
  },
  retryButtonText: { color: "#0B1E3D", fontWeight: "700", fontSize: 15 },
  scoreHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },
  competition: {
    color: "#8C95A8",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  matchupRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  teamName: { color: "#F7F5F0", fontSize: 17, fontWeight: "700", flex: 1 },
  score: {
    color: "#D98E3D",
    fontSize: 26,
    fontWeight: "800",
    fontFamily: "serif",
    marginHorizontal: 12,
  },
  section: {
    backgroundColor: "#F7F5F0",
    marginHorizontal: 20,
    marginBottom: 14,
    borderRadius: 6,
    padding: 18,
    borderTopWidth: 3,
    borderTopColor: "#0B1E3D",
  },
  sectionAccent: { borderTopColor: "#6B8F71" },
  sectionEyebrow: { color: "#8C8472", fontSize: 11, fontWeight: "700", letterSpacing: 1.5, marginBottom: 4 },
  sectionEyebrowAccent: { color: "#6B8F71" },
  sectionTitle: { color: "#0B1E3D", fontSize: 18, fontWeight: "700", fontFamily: "serif", marginBottom: 12 },
  bodyText: { color: "#3A3A3A", fontSize: 14.5, lineHeight: 21 },
  momentRow: { flexDirection: "row", marginBottom: 12 },
  momentMarker: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#D98E3D", marginTop: 6, marginRight: 10 },
  momentTextBlock: { flex: 1 },
  momentText: { color: "#0B1E3D", fontSize: 15, fontWeight: "700", marginBottom: 2 },
  momentContext: { color: "#3A3A3A", fontSize: 13.5, lineHeight: 19 },
  momentScoreline: { color: "#D98E3D", fontSize: 13, fontWeight: "700", marginBottom: 3 },
  statRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10, gap: 8 },
  statPill: {
    backgroundColor: "#EDE9E1",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: "center",
    minWidth: 64,
  },
  statPillValue: { color: "#0B1E3D", fontSize: 16, fontWeight: "800" },
  statPillLabel: { color: "#8C8472", fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },
  windowRow: { marginTop: 6, marginBottom: 6 },
  windowLabel: { color: "#8C8472", fontSize: 12.5, marginBottom: 2 },
  windowValue: { color: "#0B1E3D", fontWeight: "700" },
  patternExplanation: { marginTop: 6 },
  insightCard: { backgroundColor: "#EEF2EC", borderRadius: 6, padding: 12, marginBottom: 10 },
  insightClaim: { color: "#0B1E3D", fontSize: 14.5, fontWeight: "700", marginBottom: 4 },
  insightEvidence: { color: "#3A3A3A", fontSize: 13, lineHeight: 18, marginBottom: 6 },
  insightRecommendation: { color: "#3F6B45", fontSize: 13.5, fontWeight: "600" },
  warningsBlock: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 14,
    padding: 12,
    backgroundColor: "#3A2A1A",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#8C6A3D",
  },
  warningsTitle: { color: "#D98E3D", fontSize: 12, fontWeight: "700", marginBottom: 4 },
  warningText: { color: "#C9B896", fontSize: 11.5, lineHeight: 16 },
  performanceCard: { marginBottom: 14 },
  performanceHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 },
  performancePlayer: { color: "#0B1E3D", fontSize: 15.5, fontWeight: "700" },
  performanceTeam: { color: "#8C8472", fontSize: 12.5, fontWeight: "600" },
  patternBlock: { marginBottom: 12 },
  patternTeam: { color: "#0B1E3D", fontSize: 14, fontWeight: "700", marginBottom: 3 },
  footer: { marginHorizontal: 20, marginTop: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#1E2F4D" },
  footerText: { color: "#8C95A8", fontSize: 12, marginBottom: 6 },
  footerNote: { color: "#6B7488", fontSize: 11, lineHeight: 16, marginBottom: 4 },
});