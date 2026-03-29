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

  const refresh = async () => {
    if (!auth) return;
    const token = await getToken();
    const data = await fetchTasks(auth.userId, token);
    setLaps(data);
    setActiveIndices(data.slice(0, 5).map((_, i) => i));
  };

  return (
    <LapContext.Provider value={{ laps, setLaps, activeIndices, activateTask, refresh }}>
      {children}
    </LapContext.Provider>
  );
}

export function useLaps() {
  const ctx = useContext(LapContext);
  if (!ctx) throw new Error('useLaps must be used within LapProvider');
  return ctx;
}
