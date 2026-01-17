import type { SpotifyState } from "./state";
import { STORAGE_KEYS, getClientId } from "../config";

type StoreLike = {
  getState: () => SpotifyState;
  update: (fn: (s: SpotifyState) => SpotifyState) => void;
  set: (s: SpotifyState) => void;
};

type Deps = {
  store: StoreLike;
  stopPlaybackPolling: () => void;
  webPlaybackDisconnect: () => void;
};

export function clearPersisted() {
  localStorage.removeItem(STORAGE_KEYS.accessToken);
  localStorage.removeItem(STORAGE_KEYS.refreshToken);
  localStorage.removeItem(STORAGE_KEYS.expiresAt);
}

export function persistTokens(
  store: StoreLike,
  args: {
    accessToken: string;
    refreshToken?: string | null;
    expiresIn: number;
  },
) {
  const expiresAt = Date.now() + args.expiresIn * 1000;
  localStorage.setItem(STORAGE_KEYS.accessToken, args.accessToken);
  localStorage.setItem(STORAGE_KEYS.expiresAt, String(expiresAt));

  // Only update refresh token if explicitly provided (not undefined)
  // This preserves the existing refresh token when Spotify doesn't return a new one
  if (args.refreshToken !== undefined) {
    if (args.refreshToken) {
      localStorage.setItem(STORAGE_KEYS.refreshToken, args.refreshToken);
    }
    // Note: We no longer remove refresh token if it's null - we keep the existing one
    // This prevents losing the refresh token if Spotify doesn't return one during refresh
  }

  // Read the current refresh token from localStorage to ensure we have the latest
  const currentRefreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);

  store.update((s) => ({
    ...s,
    accessToken: args.accessToken,
    refreshToken:
      args.refreshToken !== undefined && args.refreshToken
        ? args.refreshToken
        : (currentRefreshToken ?? s.refreshToken),
    expiresAt,
  }));
}

export function safeLogout(deps: Deps, message?: string) {
  deps.stopPlaybackPolling();
  clearPersisted();
  deps.webPlaybackDisconnect();

  deps.store.set({
    ...deps.store.getState(),
    status: "idle",
    error: message ?? null,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    user: null,
    playlists: [],
    featuredPlaylists: [],
    topArtists: [],
    current: null,
  });
}

export function loadPersistedSession(store: StoreLike) {
  const accessToken = localStorage.getItem(STORAGE_KEYS.accessToken);
  const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);
  const expiresAtRaw = localStorage.getItem(STORAGE_KEYS.expiresAt);
  const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : null;

  return { accessToken, refreshToken, expiresAt };
}

// Track if we're currently refreshing to prevent multiple simultaneous refresh attempts
let refreshInProgress: Promise<string | null> | null = null;

export function ensureFreshTokenFactory(deps: Deps) {
  return async function ensureFreshToken(): Promise<string | null> {
    const state = deps.store.getState();
    let accessToken = state.accessToken;
    let refreshToken = state.refreshToken;
    let expiresAt = state.expiresAt;

    // Also check localStorage in case state is stale
    const storedAccessToken = localStorage.getItem(STORAGE_KEYS.accessToken);
    const storedRefreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);
    const storedExpiresAt = localStorage.getItem(STORAGE_KEYS.expiresAt);

    // Use stored values if they're newer/available
    if (!accessToken && storedAccessToken) {
      accessToken = storedAccessToken;
    }
    if (!refreshToken && storedRefreshToken) {
      refreshToken = storedRefreshToken;
    }
    if (!expiresAt && storedExpiresAt) {
      expiresAt = Number(storedExpiresAt);
    }

    if (!accessToken) return null;

    // Refresh 5 minutes before expiry instead of 1 minute
    // This gives more buffer time and handles cases where the app was backgrounded
    const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

    if (expiresAt && expiresAt - Date.now() > REFRESH_BUFFER_MS) {
      return accessToken;
    }

    // If no refresh token available, check if we can still use the current token
    if (!refreshToken) {
      // Try to get from localStorage one more time
      const lastChanceRefresh = localStorage.getItem(STORAGE_KEYS.refreshToken);
      if (lastChanceRefresh) {
        refreshToken = lastChanceRefresh;
      } else {
        // No refresh token - if token is expired, logout; otherwise return current token
        if (expiresAt && expiresAt <= Date.now()) {
          safeLogout(deps, "Spotify session expired. Please log in again.");
          return null;
        }
        return accessToken;
      }
    }

    // Check if electron bridge is available
    if (!window.electron?.spotifyRefresh) {
      if (expiresAt && expiresAt <= Date.now()) {
        safeLogout(deps, "Spotify session expired. Please log in again.");
        return null;
      }
      return accessToken;
    }

    // If a refresh is already in progress, wait for it
    if (refreshInProgress) {
      try {
        return await refreshInProgress;
      } catch {
        // If the in-progress refresh failed, we'll try again below
      }
    }

    const clientId = getClientId();

    // Start the refresh
    refreshInProgress = (async () => {
      try {
        console.log("[auth] Refreshing Spotify token...");
        const spotifyRefresh = window.electron?.spotifyRefresh;
        if (!spotifyRefresh) {
          throw new Error("Electron bridge not available");
        }
        const refreshed = await spotifyRefresh({
          clientId,
          refreshToken: refreshToken!,
        });

        if (!refreshed?.accessToken) {
          throw new Error("Spotify token refresh returned empty response");
        }

        console.log(
          "[auth] Token refreshed successfully, expires in",
          refreshed.expiresIn,
          "seconds",
        );

        // Persist the new tokens
        // If Spotify returns a new refresh token, use it; otherwise keep the old one
        const newRefreshToken =
          "refreshToken" in refreshed &&
          typeof refreshed.refreshToken === "string"
            ? refreshed.refreshToken
            : undefined;
        persistTokens(deps.store, {
          accessToken: refreshed.accessToken,
          refreshToken: newRefreshToken, // undefined means "keep existing"
          expiresIn: refreshed.expiresIn,
        });

        return refreshed.accessToken;
      } catch (e: any) {
        const msg = String(e?.message || e || "");
        console.error("[auth] Token refresh failed:", msg);

        const isRevoked = /revoked|invalid_grant|invalid_client/i.test(msg);
        const expired = !!expiresAt && expiresAt <= Date.now();

        if (isRevoked) {
          console.log("[auth] Refresh token revoked, logging out");
          safeLogout(deps, "Spotify session expired. Please log in again.");
          return null;
        }

        if (expired) {
          console.log("[auth] Token expired and refresh failed, logging out");
          safeLogout(deps, "Spotify session expired. Please log in again.");
          return null;
        }

        // Token not yet expired, show error but keep trying
        deps.store.update((s) => ({
          ...s,
          error: "Spotify refresh failed. Retrying…",
        }));

        // Return the current token even though refresh failed - it might still work
        return accessToken;
      } finally {
        refreshInProgress = null;
      }
    })();

    return refreshInProgress;
  };
}
