import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import { fetchTasks } from './services/firebase';
import { useFirebaseSSE, SSEPayload } from './hooks/useFirebaseSSE';

export type Lap = {
  name: string;
  time: number;     // milliseconds
  id?: string;      // Firebase plan id
  fbIndex?: number; // index in today_plans array
};

type LapContextType = {
  laps: Lap[];
  setLaps: React.Dispatch<React.SetStateAction<Lap[]>>;
  activeIndices: number[];       // FIFO queue, max 5, indices into laps[]
  activateTask: (index: number) => void;
  prependActive: (index: number) => void;
  refresh: () => Promise<void>;
};

const LapContext = createContext<LapContextType | null>(null);

// ------- pure helpers (module-level, no React deps) -------

// Firebase stores JS arrays as objects with numeric string keys over SSE.
// Convert back to a JS array, preserving index order.
function firebaseToArray(val: unknown): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') {
    return Object.keys(val as Record<string, unknown>)
      .sort((a, b) => Number(a) - Number(b))
      .map(k => (val as Record<string, unknown>)[k])
      .filter(Boolean);
  }
  return [];
}

// Derive Lap[] from raw today_plans / daily_plans received via SSE or REST.
// Mirrors the logic in fetchTasks so both code paths produce identical results.
function computeLaps(rawTodayPlans: unknown, rawDailyPlans: unknown): Lap[] {
  const todayPlans = firebaseToArray(rawTodayPlans);
  const dailyPlans = firebaseToArray(rawDailyPlans);

  const idPlanMap = new Map<string, any>();
  for (const plan of dailyPlans) idPlanMap.set(plan.id, plan);
  for (const plan of todayPlans) idPlanMap.set(plan.id, plan);

  const findRoot = (plan: any): any => {
    if (plan.parent_id === undefined) return plan;
    const parent = idPlanMap.get(plan.parent_id);
    if (!parent) return plan;
    return findRoot(parent);
  };

  const resultMap = new Map<string, { plan: any; fbIndex: number | undefined }>();
  todayPlans.forEach((plan: any, index: number) => {
    if (plan.parent_id === undefined) {
      if (!plan.completed) resultMap.set(plan.id, { plan, fbIndex: index });
    } else {
      if (!plan.completed) {
        const root = findRoot(plan);
        if (!resultMap.has(root.id)) {
          const rootFbIndex = todayPlans.findIndex((p: any) => p.id === root.id);
          resultMap.set(root.id, { plan: root, fbIndex: rootFbIndex >= 0 ? rootFbIndex : undefined });
        }
      }
    }
  });

  return Array.from(resultMap.values()).map(({ plan, fbIndex }) => ({
    name: plan.title,
    time: (plan.seconds ?? 0) * 1000,
    id: plan.id,
    fbIndex,
  }));
}

// Apply a Firebase SSE `put` event: replaces the value at path.
function applyPut(current: unknown, path: string, data: unknown): unknown {
  if (path === '/') return data;
  const parts = path.split('/').filter(Boolean);
  const result: Record<string, unknown> = { ...(current as Record<string, unknown> ?? {}) };
  let node = result;
  for (let i = 0; i < parts.length - 1; i++) {
    node[parts[i]] = { ...(node[parts[i]] as Record<string, unknown> ?? {}) };
    node = node[parts[i]] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = data;
  return result;
}

// Apply a Firebase SSE `patch` event: shallow-merges data keys at path.
function applyPatch(current: unknown, path: string, data: Record<string, unknown>): unknown {
  if (path === '/') return { ...(current as Record<string, unknown> ?? {}), ...data };
  const parts = path.split('/').filter(Boolean);
  const result: Record<string, unknown> = { ...(current as Record<string, unknown> ?? {}) };
  let node = result;
  for (let i = 0; i < parts.length - 1; i++) {
    node[parts[i]] = { ...(node[parts[i]] as Record<string, unknown> ?? {}) };
    node = node[parts[i]] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  node[last] = { ...(node[last] as Record<string, unknown> ?? {}), ...data };
  return result;
}

// ------- provider -------

export function LapProvider({ children }: { children: React.ReactNode }) {
  const [laps, setLaps] = useState<Lap[]>([]);
  const [activeIndices, setActiveIndices] = useState<number[]>([]);
  // sseToken drives the SSE connection URLs; changing it closes and reopens both connections.
  const [sseToken, setSseToken] = useState<string | null>(null);
  const { auth, getToken } = useAuth();

  // Refs let SSE callbacks always read the latest values without stale closures.
  const lapsRef = useRef<Lap[]>([]);
  const activeIndicesRef = useRef<number[]>([]);
  const todayPlansRef = useRef<unknown>(null);
  const dailyPlansRef = useRef<unknown>(null);
  lapsRef.current = laps;
  activeIndicesRef.current = activeIndices;

  // When auth changes: reset raw state and obtain a fresh SSE token.
  useEffect(() => {
    if (!auth) { setSseToken(null); return; }
    todayPlansRef.current = null;
    dailyPlansRef.current = null;
    getToken().then(setSseToken).catch(console.error);
  }, [auth?.userId]);

  // Reconnect SSE whenever the app returns to the foreground — the connection
  // may have silently died while the app was backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && auth) {
        getToken().then(setSseToken).catch(console.error);
      }
    });
    return () => sub.remove();
  }, [auth?.userId]);

  // Derive laps and remap activeIndices after any raw-data change.
  // If laps were previously empty (first meaningful data), initialise activeIndices
  // from scratch; otherwise preserve the user's selection by remapping plan IDs.
  const applyAndUpdate = () => {
    const newLaps = computeLaps(todayPlansRef.current, dailyPlansRef.current);

    let newActiveIndices: number[];
    if (lapsRef.current.length === 0) {
      newActiveIndices = newLaps.slice(0, 5).map((_, i) => i);
    } else {
      const idToNewIndex = new Map(newLaps.map((lap, i) => [lap.id, i]));
      newActiveIndices = activeIndicesRef.current
        .map(oldIdx => lapsRef.current[oldIdx]?.id)
        .filter((id): id is string => id !== undefined)
        .map(id => idToNewIndex.get(id))
        .filter((i): i is number => i !== undefined)
        .slice(0, 5);
    }

    // Update refs immediately so rapid back-to-back SSE events see fresh values.
    lapsRef.current = newLaps;
    activeIndicesRef.current = newActiveIndices;
    setLaps(newLaps);
    setActiveIndices(newActiveIndices);
  };

  // Called when Firebase rejects the token (cancel event).
  const handleAuthRevoked = async () => {
    try {
      const newToken = await getToken();
      setSseToken(newToken);
    } catch (err) {
      console.error('SSE token refresh failed:', err);
    }
  };

  const todayPath = auth ? `/${auth.userId}/active_plan/today/today_plans` : null;
  const dailyPath = auth ? `/${auth.userId}/active_plan/short_term_plan/daily_plans` : null;

  useFirebaseSSE(
    todayPath,
    sseToken,
    ({ path, data }: SSEPayload) => {
      todayPlansRef.current = applyPut(todayPlansRef.current, path, data);
      applyAndUpdate();
    },
    ({ path, data }: SSEPayload) => {
      todayPlansRef.current = applyPatch(todayPlansRef.current, path, data as Record<string, unknown>);
      applyAndUpdate();
    },
    handleAuthRevoked,
  );

  useFirebaseSSE(
    dailyPath,
    sseToken,
    ({ path, data }: SSEPayload) => {
      dailyPlansRef.current = applyPut(dailyPlansRef.current, path, data);
      applyAndUpdate();
    },
    ({ path, data }: SSEPayload) => {
      dailyPlansRef.current = applyPatch(dailyPlansRef.current, path, data as Record<string, unknown>);
      applyAndUpdate();
    },
    handleAuthRevoked,
  );

  const activateTask = (index: number) => {
    setActiveIndices(prev => {
      if (prev.includes(index)) return prev;
      return [...prev.slice(-4), index];
    });
  };

  const prependActive = (index: number) => {
    setActiveIndices(prev => {
      if (prev.includes(index)) return prev;
      return [index, ...prev.slice(0, 4)];
    });
  };

  // Pull-to-refresh: re-fetch via REST for an immediate confirmed snapshot,
  // then force-reconnect SSE so raw refs are back in sync with the server.
  const refresh = async () => {
    if (!auth) return;
    const token = await getToken();
    const data = await fetchTasks(auth.userId, token);
    const idToNewIndex = new Map(data.map((lap, i) => [lap.id, i]));
    const newActiveIndices = lapsRef.current.length === 0
      ? data.slice(0, 5).map((_, i) => i)
      : activeIndicesRef.current
          .map(oldIdx => lapsRef.current[oldIdx]?.id)
          .filter((id): id is string => id !== undefined)
          .map(id => idToNewIndex.get(id))
          .filter((i): i is number => i !== undefined)
          .slice(0, 5);
    lapsRef.current = data;
    activeIndicesRef.current = newActiveIndices;
    setLaps(data);
    setActiveIndices(newActiveIndices);
    // Reset raw refs and reconnect SSE so it re-receives the initial put event,
    // keeping todayPlansRef/dailyPlansRef in sync with the REST snapshot.
    todayPlansRef.current = null;
    dailyPlansRef.current = null;
    setSseToken(token);
  };

  return (
    <LapContext.Provider value={{ laps, setLaps, activeIndices, activateTask, prependActive, refresh }}>
      {children}
    </LapContext.Provider>
  );
}

export function useLaps() {
  const ctx = useContext(LapContext);
  if (!ctx) throw new Error('useLaps must be used within LapProvider');
  return ctx;
}
