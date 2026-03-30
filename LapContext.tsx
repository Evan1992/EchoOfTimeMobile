import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { fetchTasks } from './services/firebase';

export type Lap = {
  name: string;
  time: number;    // milliseconds
  id?: string;     // Firebase plan id
  fbIndex?: number; // index in today_plans array
};

type LapContextType = {
  laps: Lap[];
  setLaps: React.Dispatch<React.SetStateAction<Lap[]>>;
  activeIndices: number[];       // FIFO queue, max 5, indices into laps[]
  activateTask: (index: number) => void; // push to tail, drop head
  prependActive: (index: number) => void; // push to head, drop tail
  refresh: () => Promise<void>;
};

const LapContext = createContext<LapContextType | null>(null);

export function LapProvider({ children }: { children: React.ReactNode }) {
  const [laps, setLaps] = useState<Lap[]>([]);
  const [activeIndices, setActiveIndices] = useState<number[]>([]);
  const { auth, getToken } = useAuth();
  const initialLoadDone = useRef(false);

  // Load from Firebase when auth is available
  useEffect(() => {
    if (!auth) return;
    initialLoadDone.current = false;
    getToken()
      .then(token => fetchTasks(auth.userId, token))
      .then(data => {
        setLaps(data);
        setActiveIndices(data.slice(0, 5).map((_, i) => i));
        initialLoadDone.current = true;
      })
      .catch(err => {
        console.error('Failed to load tasks:', err);
        initialLoadDone.current = true;
      });
  }, [auth?.userId]);

  const activateTask = (index: number) => {
    setActiveIndices(prev => {
      if (prev.includes(index)) return prev;
      const next = [...prev.slice(-(4)), index]; // keep last 4, append new
      return next;
    });
  };

  const prependActive = (index: number) => {
    setActiveIndices(prev => {
      if (prev.includes(index)) return prev;
      return [index, ...prev.slice(0, 4)]; // push to head, drop tail
    });
  };

  const refresh = async () => {
    if (!auth) return;
    const token = await getToken();
    const data = await fetchTasks(auth.userId, token);
    // Preserve Today screen order by mapping IDs to new indices
    const idToNewIndex = new Map(data.map((lap, i) => [lap.id, i]));
    const newActiveIndices = activeIndices
      .map(oldIdx => laps[oldIdx]?.id)
      .filter((id): id is string => id !== undefined)
      .map(id => idToNewIndex.get(id))
      .filter((i): i is number => i !== undefined)
      .slice(0, 5);
    setLaps(data);
    setActiveIndices(newActiveIndices);
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
