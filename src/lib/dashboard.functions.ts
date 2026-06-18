import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { wageFor, type AttendanceType, calculateGroupedEarnings } from "./wages";

function monthBounds(d = new Date()) {
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { from, to } = monthBounds();
    const sb = context.supabase;

    const [workersRes, todayAttRes, monthAttRes, projectsRes, paymentsRes] = await Promise.all([
      sb.from("workers").select("id, full_name, daily_wage, status"),
      sb.from("attendance").select("worker_id, type").eq("date", today),
      sb
        .from("attendance")
        .select("worker_id, type, date, project_id")
        .gte("date", from)
        .lte("date", to),
      sb.from("projects").select("id, name, status, progress_pct"),
      sb.from("payments").select("worker_id, amount").gte("paid_on", from).lte("paid_on", to),
    ]);

    for (const r of [workersRes, todayAttRes, monthAttRes, projectsRes, paymentsRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const workers = workersRes.data ?? [];
    const wageMap = new Map(workers.map((w) => [w.id, Number(w.daily_wage)]));
    const activeWorkers = workers.filter((w) => w.status === "active").length;

    const todayAtt = todayAttRes.data ?? [];
    const presentToday = todayAtt.filter((a) => a.type !== "absent").length;
    const absentToday = activeWorkers - presentToday;
    const overtimeToday = todayAtt.filter((a) => a.type === "overtime").length;

    const attByWorker = new Map<string, NonNullable<typeof monthAttRes.data>>();
    for (const a of monthAttRes.data ?? []) {
      if (!attByWorker.has(a.worker_id)) {
        attByWorker.set(a.worker_id, []);
      }
      attByWorker.get(a.worker_id)!.push(a);
    }

    let totalMonthCost = 0;
    for (const [wid, workerAtt] of attByWorker.entries()) {
      const w = wageMap.get(wid) ?? 0;
      totalMonthCost += calculateGroupedEarnings(workerAtt, w);
    }

    const totalPaidThisMonth = (paymentsRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0);

    const projects = projectsRes.data ?? [];
    const activeProjects = projects.filter((p) => p.status === "active").length;

    // Pending wages estimate: month earnings minus paid this month (lower bound)
    const pendingWages = Math.max(0, totalMonthCost - totalPaidThisMonth);

    return {
      activeWorkers,
      presentToday: Math.max(0, presentToday),
      absentToday: Math.max(0, absentToday),
      overtimeToday,
      activeProjects,
      totalProjects: projects.length,
      monthLabourCost: totalMonthCost,
      pendingWages: Math.round(pendingWages),
    };
  });

export const getRecentActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const [att, workers, updates] = await Promise.all([
      sb
        .from("attendance")
        .select("id, date, type, worker_id, created_at, workers(full_name)")
        .order("created_at", { ascending: false })
        .limit(8),
      sb
        .from("workers")
        .select("id, full_name, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      sb
        .from("project_updates")
        .select("id, note, created_at, is_milestone, projects(name)")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    if (att.error) throw new Error(att.error.message);
    if (workers.error) throw new Error(workers.error.message);
    if (updates.error) throw new Error(updates.error.message);

    type Item = { id: string; kind: "attendance" | "worker" | "project"; text: string; at: string };
    const items: Item[] = [];
    for (const a of att.data ?? []) {
      items.push({
        id: "a-" + a.id,
        kind: "attendance",
        text: `${(a.workers as any)?.full_name ?? "Worker"} — ${a.type} on ${a.date}`,
        at: a.created_at as string,
      });
    }
    for (const w of workers.data ?? []) {
      items.push({
        id: "w-" + w.id,
        kind: "worker",
        text: `Added worker ${w.full_name}`,
        at: w.created_at as string,
      });
    }
    for (const u of updates.data ?? []) {
      items.push({
        id: "u-" + u.id,
        kind: "project",
        text: `${(u.projects as any)?.name ?? "Project"} — ${u.note}`,
        at: u.created_at as string,
      });
    }
    items.sort((a, b) => (a.at < b.at ? 1 : -1));
    return items.slice(0, 12);
  });
