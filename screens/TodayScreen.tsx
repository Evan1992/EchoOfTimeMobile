import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, TouchableWithoutFeedback, View } from 'react-native';
import { styles } from '../AppStyles';
import { useLaps } from '../LapContext';
import { useAuth } from '../AuthContext';
import { addTask, updateTaskSeconds, renameTask, deleteTask } from '../services/firebase';
import SwipeableLapRow, { SwipeableLapRowHandle } from '../components/SwipeableLapRow';

export default function TodayScreen() {
  const [elapsed, setElapsed] = useState(0); // milliseconds
  const [running, setRunning] = useState(false);
  const { laps, setLaps, activeIndices } = useLaps();
  const { auth, getToken } = useAuth();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastTapRef = useRef<{ index: number; time: number } | null>(null);
  const swipeableRefs = useRef<Map<number, SwipeableLapRowHandle>>(new Map());

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

  const stop = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    if (elapsed > 0 && auth) {
      const token = await getToken();
      if (selectedIndex !== null && selectedIndex < laps.length) {
        const target = laps[selectedIndex];
        const newSeconds = Math.floor((target.time + elapsed) / 1000);
        setLaps(prev => prev.map((lap, i) => i === selectedIndex ? { ...lap, time: lap.time + elapsed } : lap));
        if (target.id !== undefined) {
          updateTaskSeconds(auth.userId, token, target.fbIndex, newSeconds, target.id)
            .catch(err => console.error('Failed to update task seconds:', err));
        }
      } else {
        const name = `Lap ${laps.length + 1}`;
        const seconds = Math.floor(elapsed / 1000);
        setLaps(prev => [{ name, time: elapsed }, ...prev]);
        addTask(auth.userId, token, name, seconds)
          .catch(err => console.error('Failed to add task:', err));
      }
    }
    setElapsed(0);
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditingName(laps[index].name);
  };

  const commitEdit = async () => {
    if (editingIndex === null) return;
    const trimmed = editingName.trim();
    if (trimmed.length > 0 && auth) {
      const token = await getToken();
      const target = laps[editingIndex];
      setLaps(prev => {
        const renamed = prev.map((lap, i) => i === editingIndex ? { ...lap, name: trimmed } : lap);
        const matchIndex = renamed.findIndex((lap, i) => i !== editingIndex && lap.name === trimmed);
        if (matchIndex === -1) return renamed;
        // Merge: sum times into the match, remove the renamed entry
        return renamed
          .map((lap, i) => i === matchIndex ? { ...lap, time: lap.time + renamed[editingIndex].time } : lap)
          .filter((_, i) => i !== editingIndex);
      });
      if (target.id !== undefined) {
        renameTask(auth.userId, token, target.fbIndex, trimmed, target.id)
          .catch(err => console.error('Failed to rename task:', err));
      }
    }
    setEditingIndex(null);
  };

  const closeAllSwipeables = () => {
    swipeableRefs.current.forEach(ref => ref.close());
  };

  const dismissEditing = () => {
    Keyboard.dismiss();
    commitEdit();
    setSelectedIndex(null);
    closeAllSwipeables();
  };

  const format = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <TouchableWithoutFeedback onPress={dismissEditing}>
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
            {activeIndices.map((lapIdx) => {
              const lap = laps[lapIdx];
              if (!lap) return null;
              return (
                <SwipeableLapRow
                  key={lapIdx}
                  ref={el => { if (el) swipeableRefs.current.set(lapIdx, el); else swipeableRefs.current.delete(lapIdx); }}
                  onDelete={async () => {
                  setLaps(prev => prev.filter((_, j) => j !== lapIdx));
                  if (auth && lap.fbIndex !== undefined) {
                    const token = await getToken();
                    deleteTask(auth.userId, token, lap.fbIndex!)
                      .catch(err => console.error('Failed to delete task:', err));
                  }
                  }}>
                  <Pressable
                    style={[styles.lapRow, selectedIndex === lapIdx && styles.lapRowSelected]}
                    onPress={(e) => {
                      e.stopPropagation();
                      const now = Date.now();
                      if (lastTapRef.current?.index === lapIdx && now - lastTapRef.current.time < 300) {
                        lastTapRef.current = null;
                        startEditing(lapIdx);
                      } else {
                        lastTapRef.current = { index: lapIdx, time: now };
                        setSelectedIndex(lapIdx === selectedIndex ? null : lapIdx);
                      }
                    }}
                  >
                    {editingIndex === lapIdx ? (
                      <TextInput
                        style={styles.lapInput}
                        value={editingName}
                        onChangeText={setEditingName}
                        onBlur={commitEdit}
                        onSubmitEditing={commitEdit}
                        autoFocus
                        selectTextOnFocus
                      />
                    ) : (
                      <Text style={[styles.lapLabel, selectedIndex === lapIdx && styles.lapLabelSelected]}>{lap.name}</Text>
                    )}
                    <Text style={styles.lapTime}>{format(lap.time)}</Text>
                  </Pressable>
                </SwipeableLapRow>
              );
            })}
          </View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}
