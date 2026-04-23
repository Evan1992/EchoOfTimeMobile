import { Lap } from '../LapContext';

const DB_URL = 'https://echo-of-time-8a0aa-default-rtdb.firebaseio.com';
const TODAY_PLANS_PATH = (userId: string) =>
  `${DB_URL}/${userId}/active_plan/today/today_plans.json`;
const TODAY_PLAN_PATH = (userId: string, fbIndex: number) =>
  `${DB_URL}/${userId}/active_plan/today/today_plans/${fbIndex}.json`;

// The app day runs 2:00am–1:59am, so shift back 2 hours before extracting the date.
function getTodayDateString(): string {
  const d = new Date(Date.now() - 2 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function fetchTasks(userId: string, token: string): Promise<Lap[]> {
  const [todayRes, shortTermRes] = await Promise.all([
    fetch(`${DB_URL}/${userId}/active_plan/today.json?auth=${token}`),
    fetch(`${DB_URL}/${userId}/active_plan/short_term_plan/daily_plans.json?auth=${token}`),
  ]);
  if (!todayRes.ok) throw new Error(`Failed to fetch tasks: ${todayRes.status}`);
  if (!shortTermRes.ok) throw new Error(`Failed to fetch short_term_plan: ${shortTermRes.status}`);

  const todayData = await todayRes.json();
  const todayPlans: any[] = todayData?.today_plans ?? [];
  const dailyPlans: any[] = (await shortTermRes.json()) ?? [];
  const today = getTodayDateString();

  // resultMap keyed by plan id to deduplicate; today_plans take priority
  const resultMap = new Map<string, { plan: any; fbIndex: number | undefined }>();
  dailyPlans.forEach((plan: any) => {
    if (!plan.completed && plan.date === today) {
      resultMap.set(plan.id, { plan, fbIndex: undefined });
    }
  });
  todayPlans.forEach((plan: any, index: number) => {
    if (!plan.completed && plan.date === today) {
      resultMap.set(plan.id, { plan, fbIndex: index });
    }
  });

  // Sort so parents appear immediately before their children.
  // Only treat a task as a child if its parent is also in the visible set.
  const idSet = new Set(resultMap.keys());
  const childrenByParent = new Map<string, string[]>();
  const rootIds: string[] = [];
  for (const [id, { plan }] of resultMap) {
    if (plan.parent_id && idSet.has(plan.parent_id)) {
      const arr = childrenByParent.get(plan.parent_id) ?? [];
      arr.push(id);
      childrenByParent.set(plan.parent_id, arr);
    } else {
      rootIds.push(id);
    }
  }

  const sorted: Lap[] = [];
  function addWithChildren(id: string) {
    const { plan, fbIndex } = resultMap.get(id)!;
    const parentId = (plan.parent_id && idSet.has(plan.parent_id)) ? plan.parent_id as string : undefined;
    sorted.push({ name: plan.title, time: (plan.seconds ?? 0) * 1000, id: plan.id, fbIndex, parentId });
    (childrenByParent.get(id) ?? []).forEach(addWithChildren);
  }
  rootIds.forEach(addWithChildren);

  return sorted;
}

export async function addTask(userId: string, token: string, name: string, seconds: number, id: string): Promise<number> {
  // Fetch current array, append new plan, PUT back
  const res = await fetch(`${TODAY_PLANS_PATH(userId)}?auth=${token}`);
  if (!res.ok) throw new Error(`Failed to fetch today_plans: ${res.status}`);
  const current: any[] = (await res.json()) ?? [];
  const newPlan = {
    id,
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
  return current.length; // fbIndex of the newly added plan
}

export async function addToUsedTime(userId: string, token: string, elapsedSeconds: number): Promise<void> {
  const res = await fetch(`${DB_URL}/${userId}/active_plan/today.json?auth=${token}`);
  if (!res.ok) throw new Error(`Failed to fetch today: ${res.status}`);
  const today = await res.json();
  const newUsedTime = (today?.used_time ?? 0) + elapsedSeconds;
  const patchRes = await fetch(`${DB_URL}/${userId}/active_plan/today.json?auth=${token}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ used_time: newUsedTime }),
  });
  if (!patchRes.ok) throw new Error(`Failed to update today used_time: ${patchRes.status}`);
}

export async function updateTaskSeconds(
  userId: string,
  token: string,
  fbIndex: number | undefined,
  seconds: number,
  planId: string,
  elapsedSeconds: number,
): Promise<void> {
  const updates: Promise<void>[] = [];

  if (fbIndex !== undefined) {
    updates.push(
      fetch(`${TODAY_PLAN_PATH(userId, fbIndex)}?auth=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds }),
      }).then(res => { if (!res.ok) throw new Error(`Failed to update today_plans seconds: ${res.status}`); })
    );
  }

  // Also update short_term_plan/daily_plans by planId
  updates.push(
    fetch(`${DB_URL}/${userId}/active_plan/short_term_plan/daily_plans.json?auth=${token}`)
      .then(res => { if (!res.ok) throw new Error(`Failed to fetch daily_plans: ${res.status}`); return res.json(); })
      .then(async (dailyPlans: any[]) => {
        if (!dailyPlans) return;
        const idx = dailyPlans.findIndex((p: any) => p.id === planId);
        if (idx === -1) return;
        const res = await fetch(
          `${DB_URL}/${userId}/active_plan/short_term_plan/daily_plans/${idx}.json?auth=${token}`,
          { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds }) }
        );
        if (!res.ok) throw new Error(`Failed to update daily_plans seconds: ${res.status}`);
      })
  );

  // Add elapsed seconds to active_plan/today.used_time
  updates.push(addToUsedTime(userId, token, elapsedSeconds));

  await Promise.all(updates);
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
  fbIndex: number | undefined,
  title: string,
  planId: string,
): Promise<void> {
  const updates: Promise<void>[] = [];

  if (fbIndex !== undefined) {
    updates.push(
      fetch(`${TODAY_PLAN_PATH(userId, fbIndex)}?auth=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }).then(res => { if (!res.ok) throw new Error(`Failed to rename in today_plans: ${res.status}`); })
    );
  }

  updates.push(
    fetch(`${DB_URL}/${userId}/active_plan/short_term_plan/daily_plans.json?auth=${token}`)
      .then(res => { if (!res.ok) throw new Error(`Failed to fetch daily_plans: ${res.status}`); return res.json(); })
      .then(async (dailyPlans: any[]) => {
        if (!dailyPlans) return;
        const idx = dailyPlans.findIndex((p: any) => p.id === planId);
        if (idx === -1) return;
        const res = await fetch(
          `${DB_URL}/${userId}/active_plan/short_term_plan/daily_plans/${idx}.json?auth=${token}`,
          { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }
        );
        if (!res.ok) throw new Error(`Failed to rename in daily_plans: ${res.status}`);
      })
  );

  await Promise.all(updates);
}
