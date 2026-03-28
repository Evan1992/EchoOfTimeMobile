import { createContext, useContext, useState } from 'react';

export type Lap = { name: string; time: number };

type LapContextType = {
  laps: Lap[];
  setLaps: React.Dispatch<React.SetStateAction<Lap[]>>;
};

const LapContext = createContext<LapContextType | null>(null);

export function LapProvider({ children }: { children: React.ReactNode }) {
  const [laps, setLaps] = useState<Lap[]>([]);
  return <LapContext.Provider value={{ laps, setLaps }}>{children}</LapContext.Provider>;
}

export function useLaps() {
  const ctx = useContext(LapContext);
  if (!ctx) throw new Error('useLaps must be used within LapProvider');
  return ctx;
}
