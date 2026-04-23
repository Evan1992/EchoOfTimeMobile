import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLaps } from '../LapContext';
import { useAuth } from '../AuthContext';
import { deleteTask } from '../services/firebase';
import SwipeableLapRow from '../components/SwipeableLapRow';

export default function TasksScreen() {
  const { laps: tasks, setLaps: setTasks, activeIndices, prependActive, deactivateTask } = useLaps();
  const { auth, getToken } = useAuth();

  const format = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <View style={styles.container}>
      {tasks.length === 0 ? (
        <Text style={styles.empty}>No tasks yet</Text>
      ) : (
        <View style={styles.list}>
          {tasks.map((task, i) => {
            const isActive = activeIndices.includes(i);
            return (
              <SwipeableLapRow key={i} onDelete={async () => {
                setTasks(prev => prev.filter((_, j) => j !== i));
                if (auth && tasks[i].fbIndex !== undefined) {
                  const token = await getToken();
                  deleteTask(auth.userId, token, tasks[i].fbIndex!)
                    .catch(err => console.error('Failed to delete task:', err));
                }
              }}>
                <Pressable
                  style={[styles.row, task.parentId && styles.rowChild, isActive && styles.rowActive]}
                  onPress={() => {
                    if (isActive) deactivateTask(i);
                    else prependActive(i);
                  }}
                >
                  <Text style={[styles.name, isActive && styles.nameActive]}>{task.name}</Text>
                  <Text style={[styles.time, isActive && styles.timeActive]}>{format(task.time)}</Text>
                </Pressable>
              </SwipeableLapRow>
            );
          })}
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
  empty: {
    color: '#666666',
    fontSize: 18,
  },
  list: {
    width: 300,
    marginTop: 32,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  rowChild: {
    borderLeftWidth: 3,
    borderLeftColor: '#4a4a4a',
    paddingLeft: 8,
  },
  rowActive: {
    borderLeftWidth: 2,
    borderLeftColor: '#34c759',
    paddingLeft: 8,
  },
  name: {
    color: '#aaaaaa',
    fontSize: 18,
  },
  nameActive: {
    color: '#ffffff',
  },
  timeActive: {
    color: '#34c759',
  },
  time: {
    color: '#ffffff',
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
});
