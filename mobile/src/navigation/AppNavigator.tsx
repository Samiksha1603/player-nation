import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MatchListScreen from "../screens/MatchListScreen";
import MatchReportScreen from "../screens/MatchReportScreen";
import { MatchSummary } from "../types";

export type RootStackParamList = {
  MatchList: undefined;
  MatchReport: { match: MatchSummary };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="MatchList"
        screenOptions={{
          headerStyle: { backgroundColor: "#0B1E3D" },
          headerTintColor: "#FFFFFF",
          headerTitleStyle: { fontWeight: "700" },
        }}
      >
        <Stack.Screen
          name="MatchList"
          component={MatchListScreen}
          options={{ title: "Matches" }}
        />
        <Stack.Screen
          name="MatchReport"
          component={MatchReportScreen}
          options={{ title: "Match Report" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
