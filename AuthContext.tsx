// eslint-disable-next-line @typescript-eslint/no-var-requires
const AsyncStorage = require('@react-native-async-storage/async-storage').default ?? require('@react-native-async-storage/async-storage');
import { createContext, useContext, useEffect, useRef, useState } from 'react';

const API_KEY = 'AIzaSyDmXWs4VOOgIxnptitzMKI3tNOSjP67TfI';
const SIGN_IN_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
const REFRESH_URL = `https://securetoken.googleapis.com/v1/token?key=${API_KEY}`;
const TOKEN_LIFETIME_MS = 55 * 60 * 1000; // 55 min — refresh before the 1h expiry

type AuthState = {
  token: string;
  refreshToken: string;
  userId: string;
  tokenExpiry: number; // unix ms
};

type AuthContextType = {
  auth: AuthState | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const authRef = useRef<AuthState | null>(null);

  useEffect(() => {
    AsyncStorage.multiGet(['token', 'refreshToken', 'userId']).then(async (pairs: [string, string | null][]) => {
      const map = Object.fromEntries(pairs.map(([k, v]: [string, string | null]) => [k, v]));
      if (map.refreshToken && map.userId) {
        try {
          // Always refresh on startup — stored idToken may be expired
          const data = await doRefresh(map.refreshToken);
          await persist({ token: data.id_token, refreshToken: data.refresh_token, userId: data.user_id, tokenExpiry: Date.now() + TOKEN_LIFETIME_MS });
        } catch {
          // Refresh failed — user will need to log in again
        }
      }
    });
  }, []);

  const doRefresh = async (refreshToken: string) => {
    const res = await fetch(REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error('Token refresh failed');
    return data;
  };

  const persist = async (state: AuthState) => {
    await AsyncStorage.multiSet([
      ['token', state.token],
      ['refreshToken', state.refreshToken],
      ['userId', state.userId],
    ]);
    authRef.current = state;
    setAuth(state);
  };

  const login = async (email: string, password: string) => {
    const res = await fetch(SIGN_IN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? 'Login failed');
    await persist({ token: data.idToken, refreshToken: data.refreshToken, userId: data.localId, tokenExpiry: Date.now() + TOKEN_LIFETIME_MS });
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(['token', 'refreshToken', 'userId']);
    authRef.current = null;
    setAuth(null);
  };

  const getToken = async (): Promise<string> => {
    const current = authRef.current;
    if (!current) throw new Error('Not authenticated');
    if (Date.now() >= current.tokenExpiry) {
      const data = await doRefresh(current.refreshToken);
      const refreshed: AuthState = { token: data.id_token, refreshToken: data.refresh_token, userId: data.user_id, tokenExpiry: Date.now() + TOKEN_LIFETIME_MS };
      await persist(refreshed);
      return refreshed.token;
    }
    return current.token;
  };

  return <AuthContext.Provider value={{ auth, login, logout, getToken }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
