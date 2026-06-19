import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { fetchMatches } from "../api/client";
import { MatchSummary } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "MatchList">;

type LoadState = "loading" | "success" | "error";

export default function MatchListScreen({ navigation }: Props) {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadMatches = useCallback(async () => {
    try {
      const data = await fetchMatches();
      setMatches(data.matches);
      setState("success");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Couldn't load matches."
      );
      setState("error");
    }
  }, []);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMatches();
    setRefreshing(false);
  }, [loadMatches]);

  if (state === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#D98E3D" />
        <Text style={styles.loadingText}>Loading matches…</Text>
      </View>
    );
  }

  if (state === "error") {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Couldn't load matches</Text>
        <Text style={styles.errorDetail}>{errorMessage}</Text>
        <Text style={styles.errorHint}>
          Check that the backend server is running and reachable from this device.
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadMatches}>
          <Text style={styles.retryButtonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerBlock}>
        <Text style={styles.eyebrow}>MATCH ARCHIVE</Text>
        <Text style={styles.headerTitle}>Select a match to debrief</Text>
      </View>

      <FlatList
        data={matches}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D98E3D" />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.matchCard}
            onPress={() => navigation.navigate("MatchReport", { match: item })}
            activeOpacity={0.7}
          >
            <View style={styles.matchCardTopRule} />
            <Text style={styles.competition}>{item.competition}</Text>
            <View style={styles.matchupRow}>
              <Text style={styles.teamName}>{item.homeTeam}</Text>
              <Text style={styles.score}>{item.score}</Text>
              <Text style={styles.teamName}>{item.awayTeam}</Text>
            </View>
            <Text style={styles.date}>{item.date}</Text>
            <Text style={styles.viewReport}>View report →</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B1E3D",
  },
  centered: {
    flex: 1,
    backgroundColor: "#0B1E3D",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    color: "#F7F5F0",
    marginTop: 12,
    fontSize: 15,
  },
  errorTitle: {
    color: "#F7F5F0",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  errorDetail: {
    color: "#C9CFDB",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 6,
  },
  errorHint: {
    color: "#8C95A8",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: "#D98E3D",
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 4,
  },
  retryButtonText: {
    color: "#0B1E3D",
    fontWeight: "700",
    fontSize: 15,
  },
  headerBlock: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  eyebrow: {
    color: "#D98E3D",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 6,
  },
  headerTitle: {
    color: "#F7F5F0",
    fontSize: 24,
    fontWeight: "700",
    fontFamily: "serif",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  matchCard: {
    backgroundColor: "#F7F5F0",
    borderRadius: 6,
    padding: 18,
    marginBottom: 14,
    overflow: "hidden",
  },
  matchCardTopRule: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "#D98E3D",
  },
  competition: {
    color: "#6B6356",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  matchupRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  teamName: {
    color: "#0B1E3D",
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  score: {
    color: "#0B1E3D",
    fontSize: 20,
    fontWeight: "800",
    fontFamily: "serif",
    marginHorizontal: 12,
  },
  date: {
    color: "#8C8472",
    fontSize: 13,
    marginBottom: 10,
  },
  viewReport: {
    color: "#D98E3D",
    fontSize: 14,
    fontWeight: "700",
  },
});
