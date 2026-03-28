import { Lap } from '../LapContext';

const DB_URL = 'https://echo-of-time-8a0aa-default-rtdb.firebaseio.com';

export async function fetchTasks(userId: string, token: string): Promise<Lap[]> {
  const res = await fetch(`${DB_URL}/${userId}/active_plan/today.json?auth=${token}`);
  if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.status}`);
  const data = await res.json();
  if (!data || !data.today_plans) return [];
  return data.today_plans
    .filter((plan: any) => plan.parent_id === undefined)
    .map((plan: any) => ({ name: plan.title, time: (plan.seconds ?? 0) * 1000 }));
}

export async function saveTasks(userId: string, token: string, laps: Lap[]): Promise<void> {
  const res = await fetch(`${DB_URL}/${userId}/laps.json?auth=${token}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(laps),
  });
  if (!res.ok) throw new Error(`Failed to save tasks: ${res.status}`);
}
