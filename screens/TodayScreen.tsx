import { StatusBar } from 'expo-status-bar';
import { useRef, useState, useEffect } from 'react';
import { ActivityIndicator, AppState, Keyboard, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import * as Notifications from 'expo-notifications';

function formatElapsedMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} minutes have passed.`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourPart = hours === 1 ? '1 hour' : `${hours} hours`;
  if (minutes === 0) return `${hourPart} have passed.`;
  const minutePart = minutes === 1 ? '1 minute' : `${minutes} minutes`;
  return `${hourPart} and ${minutePart} have passed.`;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
import { styles } from '../AppStyles';
import { useLaps } from '../LapContext';
import { useAuth } from '../AuthContext';
import { addTask, updateTaskSeconds, addToUsedTime, renameTask, deleteTask } from '../services/firebase';
import SwipeableLapRow, { SwipeableLapRowHandle } from '../components/SwipeableLapRow';
import { startLiveActivity, updateLiveActivity, stopLiveActivity } from '../services/EchoTimer';

export default function TodayScreen() {
  const [elapsed, setElapsed] = useState(0); // milliseconds
  const [running, setRunning] = useState(false);
  const { laps, setLaps, activeIndices, prependActive, refresh } = useLaps();
  const [refreshing, setRefreshing] = useState(false);
  const { auth, getToken } = useAuth();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastTapRef = useRef<{ index: number; time: number } | null>(null);
  const swipeableRefs = useRef<Map<number, SwipeableLapRowHandle>>(new Map());
  const runningRef = useRef(false);
  runningRef.current = running;
  const activityIdRef = useRef<string | null>(null);
  // Keep a ref so interval callbacks always read the current task name.
  const taskNameRef = useRef('Timer');

  useEffect(() => {
    Notifications.requestPermissionsAsync();
    // Cancel any notifications left over from a previous session.
    Notifications.cancelAllScheduledNotificationsAsync();
  }, []);

  // When the app returns to foreground, reschedule the next notification if
  // the timer is running, or cancel any leftovers if it isn't.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (runningRef.current) {
        scheduleNextNotification(Date.now() - startTimeRef.current);
      } else {
        Notifications.cancelAllScheduledNotificationsAsync();
      }
    });
    return () => sub.remove();
  }, []);

  // When a notification fires while the app is in the foreground, schedule
  // the one after it.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => {
      if (runningRef.current) {
        scheduleNextNotification(Date.now() - startTimeRef.current);
      }
    });
    return () => sub.remove();
  }, []);

  const scheduleNextNotification = async (elapsedMs: number) => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const INTERVAL_MS = 45 * 60 * 1000;
    const markNumber = Math.floor(elapsedMs / INTERVAL_MS) + 1;
    const secondsFromNow = Math.ceil((markNumber * INTERVAL_MS - elapsedMs) / 1000);
    const body = formatElapsedMinutes(markNumber * 45);
    await Notifications.scheduleNotificationAsync({
      identifier: 'timer-next',
      content: { title: 'Time check', body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondsFromNow, repeats: false },
    });
  };

  const taskName = (selectedIndex !== null && selectedIndex < laps.length)
    ? laps[selectedIndex].name
    : 'Timer';
  taskNameRef.current = taskName;

  const start = () => {
    startTimeRef.current = Date.now() - elapsed;
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 1000);
    setRunning(true);
    scheduleNextNotification(elapsed);
    startLiveActivity(taskName, startTimeRef.current)
      .then(id => { activityIdRef.current = id; })
      .catch(() => {});
  };

  const pause = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (activityIdRef.current) {
      updateLiveActivity(activityIdRef.current, taskNameRef.current, startTimeRef.current, false)
        .catch(() => {});
    }
  };

  const stop = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (activityIdRef.current) {
      stopLiveActivity(activityIdRef.current).catch(() => {});
      activityIdRef.current = null;
    }
    if (elapsed > 0 && auth) {
      const token = await getToken();
      if (selectedIndex !== null && selectedIndex < laps.length) {
        const target = laps[selectedIndex];
        const newSeconds = Math.floor((target.time + elapsed) / 1000);
        setLaps(prev => prev.map((lap, i) => i === selectedIndex ? { ...lap, time: lap.time + elapsed } : lap));
        if (target.id !== undefined) {
          updateTaskSeconds(auth.userId, token, target.fbIndex, newSeconds, target.id, Math.floor(elapsed / 1000))
            .catch(err => console.error('Failed to update task seconds:', err));
        }
      } else {
        const name = `Lap ${laps.length + 1}`;
        const seconds = Math.floor(elapsed / 1000);
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const newIndex = laps.length;
        setLaps(prev => [...prev, { name, time: elapsed, id }]);
        prependActive(newIndex);
        addTask(auth.userId, token, name, seconds, id)
          .then(fbIndex => setLaps(prev => prev.map(lap => lap.id === id ? { ...lap, fbIndex } : lap)))
          .catch(err => console.error('Failed to add task:', err));
        addToUsedTime(auth.userId, token, seconds)
          .catch(err => console.error('Failed to update used_time:', err));
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

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refresh().catch(err => console.error('Failed to refresh:', err)),
      new Promise(r => setTimeout(r, 2000)),
    ]);
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="transparent" />}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable style={styles.pressableContainer} onPress={dismissEditing}>
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
      </Pressable>
    </ScrollView>
    {refreshing && (
      <ActivityIndicator
        size="large"
        color="#ffffff"
        style={{ position: 'absolute', top: 60, alignSelf: 'center' }}
      />
    )}
    </View>
  );
}
