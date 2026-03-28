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
    AsyncStorage.multiGet(['token', 'refreshToken', 'userId']).then(pairs => {
      const map = Object.fromEntries(pairs.map(([k, v]) => [k, v]));
      if (map.token && map.refreshToken && map.userId) {
        setAuth({ token: map.token, refreshToken: map.refreshToken, userId: map.userId });
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

  const refreshIdToken = async (currentRefreshToken: string): Promise<AuthState> => {
    const res = await fetch(REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: currentRefreshToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error('Token refresh failed');
    const next: AuthState = {
      token: data.id_token,
      refreshToken: data.refresh_token,
      userId: data.user_id,
    };
    await persist(next);
    return next;
  };

  // Returns a valid token, refreshing if needed
  const getToken = async (): Promise<string> => {
    if (!auth) throw new Error('Not authenticated');
    try {
      // Try a lightweight token validation by refreshing proactively when needed
      return auth.token;
    } catch {
      const next = await refreshIdToken(auth.refreshToken);
      return next.token;
    }
  };

  return <AuthContext.Provider value={{ auth, login, logout, getToken }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
