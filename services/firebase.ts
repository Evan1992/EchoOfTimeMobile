import { Lap } from '../LapContext';

const DB_URL = 'https://echo-of-time-8a0aa-default-rtdb.firebaseio.com';
const TODAY_PLANS_PATH = (userId: string) =>
  `${DB_URL}/${userId}/active_plan/today/today_plans.json`;
const TODAY_PLAN_PATH = (userId: string, fbIndex: number) =>
  `${DB_URL}/${userId}/active_plan/today/today_plans/${fbIndex}.json`;

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

  // Build id→plan map; today_plans take priority over daily_plans
  const idPlanMap = new Map<string, any>();
  for (const plan of dailyPlans) {
    idPlanMap.set(plan.id, plan);
  }
  for (const plan of todayPlans) {
    idPlanMap.set(plan.id, plan);
  }

  const findRoot = (plan: any): any => {
    if (plan.parent_id === undefined) return plan;
    const parent = idPlanMap.get(plan.parent_id);
    if (!parent) return plan;
    return findRoot(parent);
  };

  // resultMap keyed by plan id to deduplicate
  const resultMap = new Map<string, { plan: any; fbIndex: number | undefined }>();

  todayPlans.forEach((plan: any, index: number) => {
    if (plan.parent_id === undefined) {
      if (!plan.completed) {
        resultMap.set(plan.id, { plan, fbIndex: index });
      }
    } else {
      const root = findRoot(plan);
      if (!resultMap.has(root.id)) {
        const rootFbIndex = todayPlans.findIndex((p: any) => p.id === root.id);
        resultMap.set(root.id, { plan: root, fbIndex: rootFbIndex >= 0 ? rootFbIndex : undefined });
      }
    }
  });

  return Array.from(resultMap.values()).map(({ plan, fbIndex }) => ({
    name: plan.title,
    time: (plan.seconds ?? 0) * 1000,
    id: plan.id,
    fbIndex,
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
  fbIndex: number | undefined,
  seconds: number,
  planId: string,
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
