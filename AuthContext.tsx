// eslint-disable-next-line @typescript-eslint/no-var-requires
const AsyncStorage = require('@react-native-async-storage/async-storage').default ?? require('@react-native-async-storage/async-storage');
import { createContext, useContext, useEffect, useState } from 'react';

const API_KEY = 'AIzaSyDmXWs4VOOgIxnptitzMKI3tNOSjP67TfI';
const SIGN_IN_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
const REFRESH_URL = `https://securetoken.googleapis.com/v1/token?key=${API_KEY}`;

type AuthState = {
  token: string;
  refreshToken: string;
  userId: string;
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

  useEffect(() => {
    AsyncStorage.multiGet(['token', 'refreshToken', 'userId']).then(async (pairs: [string, string | null][]) => {
      const map = Object.fromEntries(pairs.map(([k, v]: [string, string | null]) => [k, v]));
      if (map.refreshToken && map.userId) {
        try {
          // Always refresh on startup — stored idToken may be expired
          const res = await fetch(REFRESH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: map.refreshToken }),
          });
          const data = await res.json();
          if (res.ok) {
            await persist({ token: data.id_token, refreshToken: data.refresh_token, userId: data.user_id });
          }
        } catch {
          // Refresh failed — user will need to log in again
        }
      }
    });
  }, []);

  const persist = async (state: AuthState) => {
    await AsyncStorage.multiSet([
      ['token', state.token],
      ['refreshToken', state.refreshToken],
      ['userId', state.userId],
    ]);
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
    await persist({ token: data.idToken, refreshToken: data.refreshToken, userId: data.localId });
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(['token', 'refreshToken', 'userId']);
    setAuth(null);
  };

  // Returns the current token (always fresh — refreshed on app startup)
  const getToken = async (): Promise<string> => {
    if (!auth) throw new Error('Not authenticated');
    return auth.token;
  };

  return <AuthContext.Provider value={{ auth, login, logout, getToken }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
