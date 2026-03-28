import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
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
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    borderRadius: 6,
  },
  lapRowSelected: {
    backgroundColor: '#2a2a2a',
  },
  lapLabel: {
    color: '#aaaaaa',
    fontSize: 16,
  },
  lapLabelSelected: {
    color: '#ffffff',
  },
  lapInput: {
    color: '#ffffff',
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#555555',
    minWidth: 120,
    paddingVertical: 0,
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
