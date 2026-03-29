import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timer: {
    fontSize: 80,
    fontVariant: ['tabular-nums'],
    color: '#ffffff',
    marginBottom: 56,
  },
  buttons: {
    flexDirection: 'row',
    gap: 20,
  },
  button: {
    width: 120,
    height: 120,
    borderRadius: 60,
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
    marginTop: 40,
    width: 320,
  },
  lapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    borderRadius: 6,
  },
  lapRowSelected: {
    backgroundColor: '#2a2a2a',
  },
  lapLabel: {
    color: '#aaaaaa',
    fontSize: 18,
  },
  lapLabelSelected: {
    color: '#ffffff',
  },
  lapInput: {
    color: '#ffffff',
    fontSize: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#555555',
    minWidth: 140,
    paddingVertical: 0,
  },
  lapTime: {
    color: '#ffffff',
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
  },
});
