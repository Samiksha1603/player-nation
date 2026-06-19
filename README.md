# PlayerNation — AI-Powered Match Reports

A React Native (Expo) app that transforms raw football match event data into insightful, data-driven match reports using LLM-powered analysis.

Built for the PlayerNation Software Engineer assignment.

## Demo

Select any FIFA World Cup 2018 match → the app generates a structured report covering match summary, key moments with momentum context, standout performances with real stats, team tactical analysis, and actionable coaching insights.

## Architecture

```
┌──────────────┐        ┌──────────────────┐        ┌──────────┐
│  Expo App    │──API──▶│  Express Backend  │──API──▶│  Groq    │
│  (React      │        │                  │        │  (Llama  │
│   Native)    │◀──JSON─│  • Aggregation   │◀──JSON─│   3.3    │
│              │        │  • Caching       │        │   70B)   │
└──────────────┘        │  • Validation    │        └──────────┘
                        └──────────────────┘
```

**Why a backend?** Three reasons: (1) keeps the Groq API key off the device, (2) caches generated reports so repeated views don't burn LLM quota, (3) centralizes retry logic and error handling in one place instead of duplicating it in mobile code.

## Project Structure

```
playernation-project-wip/
├── backend/
│   └── src/
│       ├── server.js            # Express API — auto-discovers matches
│       ├── setup-matches.js     # One-time script to download WC dataset
│       ├── .env.example         # Template for API key config
│       ├── lib/
│       │   ├── aggregate.js     # Raw events → structured features
│       │   ├── llmClient.js     # Prompt engineering + Groq integration
│       │   └── wyscoutTags.js   # Wyscout tag decoder
│       └── data/                # Match JSON files (gitignored)
├── mobile/                      # Expo React Native app
│   ├── app.json
│   ├── src/
│   │   ├── screens/
│   │   └── components/
│   └── ...
├── app-release.apk             # Installable APK
├── WRITEUP.md                  # Technical write-up
└── README.md                   # This file
```

## Setup & Run

### Prerequisites

- Node.js 18+
- npm
- Android device or emulator (for APK testing)
- Free Groq API key from [console.groq.com](https://console.groq.com)

### 1. Backend

```bash
cd backend

# Install dependencies
npm install

# Configure API key
cp src/.env.example .env
# Edit .env and add: GROQ_API_KEY=your_key_here

# Download World Cup 2018 dataset (one-time, ~2 min)
node src/setup-matches.js

# Start the server
npm start
```

The server starts at `http://localhost:3001` and auto-discovers all 64 World Cup match files.

### 2. Mobile App

```bash
cd mobile

# Install dependencies
npm install

# Start Expo dev server
npx expo start

# Press 'a' to open on Android emulator
# Or scan QR code with Expo Go on a physical device
```

### 3. Install the APK

For testing on a physical Android device:

1. Transfer `app-release.apk` to the device
2. Enable "Install from unknown sources" in Settings
3. Tap the APK file to install
4. Ensure the backend is running and accessible from the device's network

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/matches` | List all available matches |
| `GET /api/matches/:id/report` | Generate (or return cached) match report |
| `GET /api/matches/:id/report?regenerate=true` | Force regeneration |
| `GET /api/health` | Server status check |

## LLM Configuration

The app uses **Groq** (Llama 3.3 70B) via their free tier. To switch providers, edit `lib/llmClient.js` — the prompt and schema are provider-agnostic; only the API URL and auth header need to change.

**Why Groq over Gemini:** Originally built against Gemini's free tier, but it returned a persistent 429 with `limit:0` — an account/billing provisioning issue on Google's side, not a code bug. Groq's free tier works reliably with no billing link required.

## Known Limitations

- Match minutes are derived from event timestamps and can be off by several minutes from broadcast time. The app uses "around the Nth minute" phrasing to reflect this.
- LLM output is validated post-generation but not retried on validation failures — a production system would re-prompt with the specific violations attached.
- Backend uses in-memory caching — reports are lost on server restart. A production system would use Redis or a database.
