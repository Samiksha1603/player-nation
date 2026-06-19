import { MatchesResponse, MatchReportResponse, ApiErrorResponse } from "../types";

/**
 * IMPORTANT - Android networking gotcha:
 * - Android EMULATOR: use http://10.0.2.2:3001 (special alias to host machine's localhost)
 * - Physical Android DEVICE on same WiFi: use http://<your-computer's-LAN-IP>:3001
 * - "localhost" from the phone's perspective means the PHONE itself, not your dev machine -
 *   this is the single most common setup mistake when connecting an RN app to a local backend.
 *
 * Set this to match your setup. For the final shipped APK, this should point to a deployed
 * backend (e.g. on Render/Railway), not a local IP, since the phone won't be on your network.
 */
export const API_BASE_URL = "http://192.168.1.4:3001/api";

const REQUEST_TIMEOUT_MS = 30000; // report generation can be slow (LLM call)

class ApiError extends Error {
  status?: number;
  retryable: boolean;

  constructor(message: string, status?: number, retryable = false) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError(
        "Request timed out. The server might be slow or unreachable.",
        undefined,
        true
      );
    }
    throw new ApiError(
      "Network request failed. Check that the backend is running and reachable.",
      undefined,
      true
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchMatches(): Promise<MatchesResponse> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/matches`, REQUEST_TIMEOUT_MS);
  if (!response.ok) {
    throw new ApiError(`Failed to load matches (status ${response.status})`, response.status);
  }
  return response.json();
}

export async function fetchMatchReport(matchId: string): Promise<MatchReportResponse> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/matches/${matchId}/report`,
    REQUEST_TIMEOUT_MS
  );

  if (!response.ok) {
    let errorBody: ApiErrorResponse | null = null;
    try {
      errorBody = await response.json();
    } catch {
      // response wasn't JSON - fall through to generic message
    }
    throw new ApiError(
      errorBody?.error || `Failed to generate report (status ${response.status})`,
      response.status,
      errorBody?.retryable ?? response.status === 429
    );
  }

  return response.json();
}

export { ApiError };
