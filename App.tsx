import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function App() {
  const [elapsed, setElapsed] = useState(0); // milliseconds
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const start = () => {
    startTimeRef.current = Date.now() - elapsed;
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 1000);
    setRunning(true);
  };

  const pause = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
  };

  const stop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    if (elapsed > 0) {
      setLaps(prev => [elapsed, ...prev].slice(0, 5));
    }
    setElapsed(0);
  };

  const format = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.timer}>{format(elapsed)}</Text>
      <View style={styles.buttons}>
        <Pressable
          style={[styles.button, styles.resetButton]}
          onPress={stop}
        >
          <Text style={styles.buttonText}>Stop</Text>
        </Pressable>
        <Pressable
          style={[styles.button, running ? styles.pauseButton : styles.startButton]}
          onPress={running ? pause : start}
        >
          <Text style={styles.buttonText}>{running ? 'Pause' : 'Start'}</Text>
        </Pressable>
      </View>
      {laps.length > 0 && (
        <View style={styles.laps}>
          {laps.map((lap, i) => (
            <View key={i} style={styles.lapRow}>
              <Text style={styles.lapLabel}>Lap {laps.length - i}</Text>
              <Text style={styles.lapTime}>{format(lap)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timer: {
    fontSize: 64,
    fontVariant: ['tabular-nums'],
    color: '#ffffff',
    marginBottom: 48,
  },
  buttons: {
    flexDirection: 'row',
    gap: 16,
  },
  button: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButton: {
    backgroundColor: '#34c759',
  },
  pauseButton: {
    backgroundColor: '#ff9f0a',
  },
  resetButton: {
    backgroundColor: '#3a3a3a',
  },
  laps: {
    marginTop: 32,
    width: 260,
  },
  lapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  lapLabel: {
    color: '#aaaaaa',
    fontSize: 16,
  },
  lapTime: {
    color: '#ffffff',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
});
