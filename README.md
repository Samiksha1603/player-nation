# PlayerNation Match Report - Backend (Work in Progress)

## What's working

- `src/lib/wyscoutTags.js` - decodes Wyscout's numeric event tags (goal, card, accurate pass, etc.)
- `src/lib/aggregate.js` - turns ~1,400 raw match events into compact structured features
  (goals/cards timeline, team stats, momentum by 15-min window, top player involvement).
  Verified against the real France 4-3 Argentina (2018 WC R16) scoreline - correct scorers,
  correct score, correct cards.
- `src/lib/llmClient.js` - builds the Gemini prompt and calls the API, with retry/backoff on
  rate limits and server errors.
- `src/server.js` - Express server exposing:
  - `GET /api/matches` - list available matches
  - `GET /api/matches/:id/report` - aggregate + call Gemini + return structured report (cached after first call)
  - `GET /api/health` - confirms server is up and whether GEMINI_API_KEY is configured

## Known bugs we found and fixed (worth keeping in your write-up)

1. **Penalty goals are tagged `eventName: "Free Kick"`, not `"Shot"`.** Our first goal-finder
   missed Griezmann's penalty entirely because it only checked Shot events.
2. **Goalkeepers' "Save attempt" events carry the same `goal` tag (101) as the actual goal**,
   meaning a naive tag check credits the goalkeeper with scoring. Fixed by only counting goals
   on `Shot`/`Free Kick` event types.
3. **Match minute timestamps can be systematically wrong.** Verified: Griezmann's penalty computes
   to minute ~12 but actually happened around minute 26 in the real match. This can't be detected
   from internal consistency alone (events are still in correct chronological order), only by
   checking against ground truth. We flag all minutes as approximate in the data and tell the
   LLM to hedge ("around the Nth minute") rather than state them as fact.

## What's NOT done yet

- React Native app: screens are written and TYPE-CHECKED CLEAN, and the Android JS bundle
  builds successfully (808 modules, verified via `npx expo export --platform android`), but
  has NOT been run on a real emulator/device yet - do that next on your machine
- Only one match (2058003) is wired up; AVAILABLE_MATCHES in server.js needs more entries
  for a real match-picker experience
- No automated tests yet
- Technical write-up (docs/ folder is empty)
- APK has not been built yet (next step: `eas build -p android --profile preview`)

## Mobile app structure

```
mobile/src/
├── types.ts                       - shared types mirroring backend's exact JSON shape
├── api/client.ts                   - fetch wrapper, timeout handling, typed errors
├── navigation/AppNavigator.tsx     - 2-screen stack: MatchList -> MatchReport
└── screens/
    ├── MatchListScreen.tsx         - match picker, loading/error/refresh states
    └── MatchReportScreen.tsx       - renders all 5 LLM report sections + data transparency footer
```

### IMPORTANT before running the app: set your backend URL

`mobile/src/api/client.ts` has `API_BASE_URL` hardcoded to `http://10.0.2.2:3001/api`,
which is the special alias an ANDROID EMULATOR uses to reach your computer's localhost.

- Using an Android emulator: leave as-is (assuming backend runs on port 3001)
- Using a physical Android phone on the same WiFi: change this to
  `http://<your-computer's-LAN-IP>:3001/api` (find your IP with `ipconfig` on Windows
  or `ifconfig`/`ip addr` on Mac/Linux)
- This is the single most common setup mistake in RN + local backend development -
  "localhost" from the phone's perspective means the phone itself, not your dev machine.

### To run the mobile app

```bash
cd mobile
npm install
npx expo start
# press 'a' to open on Android emulator, or scan the QR code with Expo Go on a physical device
```

Make sure the backend (`cd backend && npm start`) is running first.

### To build the actual APK (final deliverable)

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview
```

This requires a free Expo account. The build runs on Expo's servers and gives you a
downloadable .apk link when done - no local Android Studio/Gradle setup needed.

## To run this yourself

You need this on a machine WITHOUT a restrictive network egress allowlist (the dev sandbox
this was built in blocks generativelanguage.googleapis.com, which is why the LLM call hasn't
been tested with a real response yet - everything else has been verified).

```bash
cd backend
npm install
cp .env.example .env
# edit .env and paste your real Gemini API key
npm start
```

Then test:
```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/matches
curl http://localhost:3001/api/matches/2058003/report
```

## IMPORTANT SECURITY NOTE

If you tested this in a shared/temporary environment with your real Gemini key (as we did in
this session), rotate that key in Google AI Studio - generate a new one and revoke the old one -
before using it for real, since it appeared in chat/session history.
