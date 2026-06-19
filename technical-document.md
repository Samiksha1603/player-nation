# PlayerNation

## 1. Data Pre-Processing

The main engineering challenge was converting around 1,400 raw Wyscout events per match into compact, structured data that an LLM can understand.

Raw event data creates two problems:

1. It can exceed practical context limits.
2. LLMs tend to generate generic summaries when given unstructured data, often producing statements like "it was an intense match" instead of highlighting specific patterns.

The aggregation pipeline (`aggregate.js`) creates two outputs.

### Track 1 — Timeline Events

The pipeline scans all events to identify goals, cards, assists, and key passes. It converts player and team IDs into readable names.

Each timeline entry includes:

* Match minute
* Match period
* Relevant details such as body part used or event subtype

A chronological anomaly detector checks whether the calculated minute breaks the expected event order. If it does, the event is marked with `minuteReliable: false` so the LLM can express uncertainty when needed.

### Track 2 — Aggregate Statistics

Team-level metrics such as possession percentage, pass accuracy, shot conversion rate, duel success rate, and crosses are calculated directly from event counts.

These metrics are reliable and provide the foundation for the report's quantitative analysis.

### Momentum Windows

The key feature of the pipeline is the momentum analysis.

Events are grouped into 15-minute windows, and each team's share of possession events is calculated for every window.

This gives the LLM temporal context. Instead of seeing only an overall possession value like "54.8%," it can identify changes throughout the match—for example, Argentina controlling 66.1% possession during the 15–30 minute window but only 45.5% during the 60–75 minute window.

This allows the model to explain momentum shifts rather than simply reporting overall averages.

### Pre-Computed Counts

Early testing showed that LLMs often make mistakes when counting items in arrays. For example, the model reported 10 yellow cards when the actual number was 8.

To solve this, the pipeline pre-computes values such as:

* `yellowCardCount`
* `redCardCount`
* `totalGoals`

This ensures the model reads fixed values instead of counting events itself.

A top-player ranking system uses weighted scores based on goals, assists, key passes, and shots to identify the six most influential players. This gives the LLM a focused set of players to discuss instead of evaluating all 22+ players.

## 2. Prompt Design

### The Core Idea: Use Schema to Enforce Quality

The first version of the prompt relied on free-text fields and natural language instructions such as "cite momentum windows" and "avoid generic phrases."

Although the LLM understood these instructions, it did not consistently follow them. It still generated phrases like "high level of intensity" or "proved effective" despite explicit guidance.

The solution was to redesign the JSON schema so that compliance became part of the structure rather than a suggestion.

For example:

* Instead of a generic `context` field, each key moment requires a `momentumContext` field that must include a specific 15-minute window and its percentage.
* Instead of free-form insights, each insight requires an `evidence` field containing at least two numerical values.

### Enforcement Mechanisms

* `keyMoments` require `momentumContext`, `scoreline`, and `minute` as separate fields.
* `teamAnalysis` includes `bestWindow`, `worstWindow`, and `patternExplanation`, which must reference specific windows and explain changes using timeline events.
* `actionableInsights` are divided into `claim`, `evidence`, and `recommendation`, with the evidence field requiring at least two numbers.
* `standoutPerformances` include structured fields such as `goals`, `assists`, `shots`, `touches`, and `duelsWon`, while the narrative must reference at least two of these values.

### Post-Generation Validation

A `validate()` function runs after each LLM response and checks three things:

1. Whether key moments reference momentum windows by name
2. Whether evidence fields contain at least two numbers
3. Whether banned phrases are present

Any issues are logged as `_validationWarnings`.

This provides a safety net that helps detect regressions without blocking the response.

In a production environment, the system would automatically re-prompt the model with the validation issues attached.

### Temperature and Model Selection

The temperature is set to 0.3 to prioritize accuracy and reduce unnecessary creativity.

The application uses Llama 3.3 70B through Groq because it provides strong structured reasoning capabilities with low latency on the free tier.

## 3. Architecture and Key Trade-Offs

### Backend-First Design

Inference runs on an Express backend instead of directly on the mobile device for three reasons:

1. **Security** — The Groq API key remains on the server and is not exposed in the APK.
2. **Caching** — An in-memory `Map` stores reports by match ID, preventing repeated LLM calls for the same match.
3. **Centralized Error Handling** — Retry logic, rate limiting, and validation are managed in one place instead of being duplicated across mobile screens.

### Groq Instead of Gemini

The project initially used Gemini's free API tier.

However, it consistently returned HTTP 429 responses with `limit:0`, indicating a billing or provisioning issue.

Groq was chosen instead because it provides an OpenAI-compatible API, a reliable free tier, and sub-second response times with Llama 3.3 70B.

### Auto-Discovery Instead of Hardcoding

On startup, the server scans the `data/` directory for `match_*.json` files and automatically builds the match registry.

A setup script (`setup-matches.js`) downloads all 64 World Cup matches from the Wyscout open dataset.

Adding new matches requires no code changes—simply add the file and restart the server.

### Retry with Exponential Backoff

LLM API requests retry up to two times for HTTP 429 and 5xx errors.

The retry delay follows the formula:

`500ms × 2^attempt`

Non-retryable errors such as HTTP 400 and 401 fail immediately.

A 30-second timeout prevents requests from hanging indefinitely.

## 4. What I'd Improve with More Time

* **Retry on validation warnings** — When the validator detects banned phrases or missing citations, automatically re-prompt the LLM with the identified issues.

* **Momentum visualization** — Display the 15-minute possession windows as a timeline chart within the app instead of showing them only as text.

* **Persistent caching** — Replace the in-memory `Map` with SQLite or Redis so reports remain available after server restarts.

* **Multi-match comparison** — Allow users to compare two matches side by side to analyze changes in team performance across games.

* **Minute accuracy** — Cross-reference calculated minutes with official match timelines to improve accuracy or make uncertainty more visible in the UI.

* **Streaming responses** — Use Groq's streaming API to display reports progressively, reducing perceived waiting time.
