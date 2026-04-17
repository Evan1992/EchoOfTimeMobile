import { NativeModules, Platform } from 'react-native';

const { EchoTimerModule } = NativeModules;
const isSupported = Platform.OS === 'ios' && EchoTimerModule != null;

/**
 * Start a Live Activity for the timer.
 * @param taskName  Label shown on the lock screen.
 * @param startDateMs  Effective start timestamp in ms (= Date.now() - elapsed),
 *                     so iOS can compute elapsed time natively without JS updates.
 * @returns Activity ID to pass to updateLiveActivity / stopLiveActivity, or null.
 */
export function startLiveActivity(
  taskName: string,
  startDateMs: number,
): Promise<string | null> {
  if (!isSupported) return Promise.resolve(null);
  return EchoTimerModule.startActivity(taskName, startDateMs);
}

/**
 * Update the Live Activity when the timer is paused/resumed.
 */
export function updateLiveActivity(
  activityId: string,
  taskName: string,
  startDateMs: number,
  isRunning: boolean,
): Promise<void> {
  if (!isSupported) return Promise.resolve();
  return EchoTimerModule.updateActivity(activityId, taskName, startDateMs, isRunning);
}

/**
 * End the Live Activity when the timer is stopped.
 */
export function stopLiveActivity(activityId: string): Promise<void> {
  if (!isSupported) return Promise.resolve();
  return EchoTimerModule.stopActivity(activityId);
}
