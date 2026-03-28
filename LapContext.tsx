import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { fetchTasks, saveTasks } from './services/firebase';

export type Lap = { name: string; time: number };

type LapContextType = {
  laps: Lap[];
  setLaps: React.Dispatch<React.SetStateAction<Lap[]>>;
};

const LapContext = createContext<LapContextType | null>(null);

export function LapProvider({ children }: { children: React.ReactNode }) {
  const [laps, setLaps] = useState<Lap[]>([]);
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
        initialLoadDone.current = true;
      })
      .catch(err => {
        console.error('Failed to load laps:', err);
        initialLoadDone.current = true;
      });
  }, [auth?.userId]);

  // Save to Firebase whenever laps change (skip initial load)
  useEffect(() => {
    if (!initialLoadDone.current || !auth) return;
    getToken()
      .then(token => saveTasks(auth.userId, token, laps))
      .catch(err => console.error('Failed to save laps:', err));
  }, [laps]);

  return <LapContext.Provider value={{ laps, setLaps }}>{children}</LapContext.Provider>;
}

export function useLaps() {
  const ctx = useContext(LapContext);
  if (!ctx) throw new Error('useLaps must be used within LapProvider');
  return ctx;
}
