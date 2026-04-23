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
  parentId?: string; // set only when the parent is also in the visible task list
};

type LapContextType = {
  laps: Lap[];
  setLaps: React.Dispatch<React.SetStateAction<Lap[]>>;
  activeIndices: number[];       // FIFO queue, max 5, indices into laps[]
  activateTask: (index: number) => void;
  prependActive: (index: number) => void;
  deactivateTask: (index: number) => void;
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

// The app day runs 2:00am–1:59am, so shift back 2 hours before extracting the date.
function getTodayDateString(): string {
  const d = new Date(Date.now() - 2 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Derive Lap[] from raw today_plans / daily_plans received via SSE or REST.
// Mirrors the logic in fetchTasks so both code paths produce identical results.
function computeLaps(rawTodayPlans: unknown, rawDailyPlans: unknown): Lap[] {
  const todayPlans = firebaseToArray(rawTodayPlans);
  const dailyPlans = firebaseToArray(rawDailyPlans);
  const today = getTodayDateString();

  // today_plans take priority: process daily_plans first, then overwrite with today_plans
  const resultMap = new Map<string, { plan: any; fbIndex: number | undefined }>();
  dailyPlans.forEach((plan: any) => {
    if (!plan.completed && plan.date === today) {
      resultMap.set(plan.id, { plan, fbIndex: undefined });
    }
  });
  todayPlans.forEach((plan: any, index: number) => {
    if (!plan.completed && plan.date === today) {
      resultMap.set(plan.id, { plan, fbIndex: index });
    }
  });

  // Sort so parents appear immediately before their children.
  // Only treat a task as a child if its parent is also in the visible set.
  const idSet = new Set(resultMap.keys());
  const childrenByParent = new Map<string, string[]>();
  const rootIds: string[] = [];
  for (const [id, { plan }] of resultMap) {
    if (plan.parent_id && idSet.has(plan.parent_id)) {
      const arr = childrenByParent.get(plan.parent_id) ?? [];
      arr.push(id);
      childrenByParent.set(plan.parent_id, arr);
    } else {
      rootIds.push(id);
    }
  }

  const sorted: Lap[] = [];
  function addWithChildren(id: string) {
    const { plan, fbIndex } = resultMap.get(id)!;
    const parentId = (plan.parent_id && idSet.has(plan.parent_id)) ? plan.parent_id as string : undefined;
    sorted.push({ name: plan.title, time: (plan.seconds ?? 0) * 1000, id: plan.id, fbIndex, parentId });
    (childrenByParent.get(id) ?? []).forEach(addWithChildren);
  }
  rootIds.forEach(addWithChildren);

  return sorted;
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
  const [sseNonce, setSseNonce] = useState(0);
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
        getToken()
          .then(token => { setSseToken(token); setSseNonce(n => n + 1); })
          .catch(console.error);
      }
    });
    return () => sub.remove();
  }, [auth?.userId]);

  // Derive laps and remap activeIndices after any raw-data change.
  // If laps were previously empty (first meaningful data), initialise activeIndices
  // from scratch; otherwise preserve the user's selection by remapping plan IDs.
  const applyAndUpdate = () => {
    const firebaseLaps = computeLaps(todayPlansRef.current, dailyPlansRef.current);
    const firebaseIds = new Set(firebaseLaps.map(l => l.id));

    // Laps that exist locally but haven't been confirmed by Firebase yet
    // (optimistic adds with fbIndex still undefined). Preserve them so an
    // SSE event that arrives before the write completes doesn't silently
    // drop them from the list.
    const pendingLaps = lapsRef.current.filter(
      l => l.fbIndex === undefined && l.id && !firebaseIds.has(l.id)
    );
    const newLaps = [...firebaseLaps, ...pendingLaps];

    let newActiveIndices: number[];
    if (lapsRef.current.length === 0) {
      newActiveIndices = firebaseLaps.slice(0, 5).map((_, i) => i);
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
    sseNonce,
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
    sseNonce,
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

  const deactivateTask = (index: number) => {
    setActiveIndices(prev => prev.filter(i => i !== index));
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
    setSseNonce(n => n + 1);
  };

  return (
    <LapContext.Provider value={{ laps, setLaps, activeIndices, activateTask, prependActive, deactivateTask, refresh }}>
      {children}
    </LapContext.Provider>
  );
}

export function useLaps() {
  const ctx = useContext(LapContext);
  if (!ctx) throw new Error('useLaps must be used within LapProvider');
  return ctx;
}
