import { Lap } from '../LapContext';

const DB_URL = 'https://echo-of-time-8a0aa-default-rtdb.firebaseio.com';
const TODAY_PLANS_PATH = (userId: string) =>
  `${DB_URL}/${userId}/active_plan/today/today_plans.json`;
const TODAY_PLAN_PATH = (userId: string, fbIndex: number) =>
  `${DB_URL}/${userId}/active_plan/today/today_plans/${fbIndex}.json`;

export async function fetchTasks(userId: string, token: string): Promise<Lap[]> {
  const res = await fetch(`${DB_URL}/${userId}/active_plan/today.json?auth=${token}`);
  if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.status}`);
  const data = await res.json();
  if (!data || !data.today_plans) return [];
  return data.today_plans
    .map((plan: any, index: number) => ({ plan, index }))
    .filter(({ plan }: any) => plan.parent_id === undefined)
    .map(({ plan, index }: any) => ({
      name: plan.title,
      time: (plan.seconds ?? 0) * 1000,
      id: plan.id,
      fbIndex: index,
    }));
}

export async function addTask(userId: string, token: string, name: string, seconds: number): Promise<void> {
  // Fetch current array, append new plan, PUT back
  const res = await fetch(`${TODAY_PLANS_PATH(userId)}?auth=${token}`);
  if (!res.ok) throw new Error(`Failed to fetch today_plans: ${res.status}`);
  const current: any[] = (await res.json()) ?? [];
  const newPlan = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    rank: 0,
    title: name,
    comment: "",
    date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(),
    seconds,
    expected_hours: 0,
    expected_minutes: 0,
    priority: 0,
    has_children: false,
    show_plan: true,
    completed: false,
  };
  const updated = [...current, newPlan];
  const putRes = await fetch(`${TODAY_PLANS_PATH(userId)}?auth=${token}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updated),
  });
  if (!putRes.ok) throw new Error(`Failed to add task: ${putRes.status}`);
}

export async function updateTaskSeconds(
  userId: string,
  token: string,
  fbIndex: number,
  seconds: number,
): Promise<void> {
  const res = await fetch(`${TODAY_PLAN_PATH(userId, fbIndex)}?auth=${token}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seconds }),
  });
  if (!res.ok) throw new Error(`Failed to update task seconds: ${res.status}`);
}

export async function deleteTask(userId: string, token: string, fbIndex: number): Promise<void> {
  const res = await fetch(`${TODAY_PLANS_PATH(userId)}?auth=${token}`);
  if (!res.ok) throw new Error(`Failed to fetch today_plans: ${res.status}`);
  const current: any[] = (await res.json()) ?? [];
  const updated = current.filter((_, i) => i !== fbIndex);
  const putRes = await fetch(`${TODAY_PLANS_PATH(userId)}?auth=${token}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updated),
  });
  if (!putRes.ok) throw new Error(`Failed to delete task: ${putRes.status}`);
}

export async function renameTask(
  userId: string,
  token: string,
  fbIndex: number,
  title: string,
): Promise<void> {
  const res = await fetch(`${TODAY_PLAN_PATH(userId, fbIndex)}?auth=${token}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to rename task: ${res.status}`);
}
