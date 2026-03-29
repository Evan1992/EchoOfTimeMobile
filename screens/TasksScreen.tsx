import { StyleSheet, Text, View } from 'react-native';
import { useLaps } from '../LapContext';
import { useAuth } from '../AuthContext';
import { deleteTask } from '../services/firebase';
import SwipeableLapRow from '../components/SwipeableLapRow';

export default function TasksScreen() {
  const { laps: tasks, setLaps: setTasks } = useLaps();
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
          {tasks.map((task, i) => (
            <SwipeableLapRow key={i} onDelete={async () => {
                setTasks(prev => prev.filter((_, j) => j !== i));
                if (auth && tasks[i].fbIndex !== undefined) {
                  const token = await getToken();
                  deleteTask(auth.userId, token, tasks[i].fbIndex!)
                    .catch(err => console.error('Failed to delete task:', err));
                }
              }}>
              <View style={styles.row}>
                <Text style={styles.name}>{task.name}</Text>
                <Text style={styles.time}>{format(task.time)}</Text>
              </View>
            </SwipeableLapRow>
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
  empty: {
    color: '#666666',
    fontSize: 16,
  },
  list: {
    width: 260,
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
  name: {
    color: '#aaaaaa',
    fontSize: 16,
  },
  time: {
    color: '#ffffff',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
});
