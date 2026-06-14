import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { wageFor, type AttendanceType } from "./wages";

function monthBounds(d = new Date()) {
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

function boundsFor(year: number, month1: number) {
  const from = new Date(year, month1 - 1, 1);
  const to = new Date(year, month1, 0);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

/* --------------------------------- DASHBOARD --------------------------------- */
export const getDashboardOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const today = new Date().toISOString().slice(0, 10);
    const { from, to } = monthBounds();

    const [workersRes, projectsRes, todayAttRes, monthAttRes, assignsRes] = await Promise.all([
      sb.from("workers").select("id, full_name, daily_wage, status"),
      sb.from("projects").select("id, name, status, location, progress_pct"),
      sb.from("attendance").select("worker_id, type, project_id").eq("date", today),
      sb.from("attendance").select("worker_id, type, date, project_id").gte("date", from).lte("date", to),
      sb.from("project_workers").select("project_id, worker_id"),
    ]);
    for (const r of [workersRes, projectsRes, todayAttRes, monthAttRes, assignsRes]) {
      if ((r as any).error) throw new Error((r as any).error.message);
    }
    const workers = workersRes.data ?? [];
    const wageMap = new Map(workers.map((w) => [w.id, Number(w.daily_wage)]));
    const projects = projectsRes.data ?? [];
    const activeProjects = projects.filter((p) => p.status === "active");
    const totalWorkers = workers.filter((w) => w.status === "active").length;
    const todayAtt = todayAttRes.data ?? [];
    const presentToday = todayAtt.filter((a) => a.type !== "absent").length;

    // Monthly cost per worker (overall + per project)
    const monthAtt = monthAttRes.data ?? [];
    let monthLabourCost = 0;
    const costPerProject = new Map<string, number>();
    const earningsPerWorker = new Map<string, number>();
    const presentDaysPerWorker = new Map<string, number>();
    const attendancePerProject = new Map<string, number>();
    for (const a of monthAtt) {
      const w = wageMap.get(a.worker_id) ?? 0;
      const e = wageFor(a.type as AttendanceType, w);
      monthLabourCost += e;
      earningsPerWorker.set(a.worker_id, (earningsPerWorker.get(a.worker_id) ?? 0) + e);
      if (a.type !== "absent") {
        presentDaysPerWorker.set(a.worker_id, (presentDaysPerWorker.get(a.worker_id) ?? 0) + 1);
      }
      if (a.project_id) {
        costPerProject.set(a.project_id, (costPerProject.get(a.project_id) ?? 0) + e);
        attendancePerProject.set(a.project_id, (attendancePerProject.get(a.project_id) ?? 0) + 1);
      }
    }

    // Site status per active project
    const assignsByProject = new Map<string, Set<string>>();
    for (const a of assignsRes.data ?? []) {
      if (!assignsByProject.has(a.project_id)) assignsByProject.set(a.project_id, new Set());
      assignsByProject.get(a.project_id)!.add(a.worker_id);
    }
    const presentByProject = new Map<string, number>();
    for (const a of todayAtt) {
      if (a.type === "absent" || !a.project_id) continue;
      presentByProject.set(a.project_id, (presentByProject.get(a.project_id) ?? 0) + 1);
    }
    const sites = activeProjects.map((p) => ({
      id: p.id,
      name: p.name,
      location: p.location,
      assigned: assignsByProject.get(p.id)?.size ?? 0,
      presentToday: presentByProject.get(p.id) ?? 0,
      monthCost: Math.round(costPerProject.get(p.id) ?? 0),
    }));

    // Insights
    const workerName = new Map(workers.map((w) => [w.id, w.full_name]));
    const topProject = [...costPerProject.entries()].sort((a, b) => b[1] - a[1])[0];
    const mostActive = [...attendancePerProject.entries()].sort((a, b) => b[1] - a[1])[0];
    const topWorker = [...earningsPerWorker.entries()].sort((a, b) => b[1] - a[1])[0];
    const activeIds = workers.filter((w) => w.status === "active").map((w) => w.id);
    const lowestWorker = activeIds
      .map((id) => ({ id, n: presentDaysPerWorker.get(id) ?? 0 }))
      .sort((a, b) => a.n - b.n)[0];

    const projName = new Map(projects.map((p) => [p.id, p.name]));

    return {
      activeProjects: activeProjects.length,
      totalProjects: projects.length,
      totalWorkers,
      presentToday,
      monthLabourCost: Math.round(monthLabourCost),
      sites,
      insights: {
        topProject: topProject ? { name: projName.get(topProject[0]) ?? "—", value: Math.round(topProject[1]) } : null,
        mostActiveProject: mostActive ? { name: projName.get(mostActive[0]) ?? "—", days: mostActive[1] } : null,
        topWorker: topWorker ? { name: workerName.get(topWorker[0]) ?? "—", value: Math.round(topWorker[1]) } : null,
        lowestWorker: lowestWorker ? { name: workerName.get(lowestWorker.id) ?? "—", days: lowestWorker.n } : null,
      },
    };
  });

/* --------------------------------- PROJECTS --------------------------------- */
export const listProjectsWithStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const { from, to } = monthBounds();
    const today = new Date().toISOString().slice(0, 10);

    const [projRes, workersRes, assignRes, attRes] = await Promise.all([
      sb.from("projects").select("*").order("created_at", { ascending: false }),
      sb.from("workers").select("id, daily_wage"),
      sb.from("project_workers").select("project_id, worker_id"),
      sb.from("attendance").select("worker_id, type, project_id, date").gte("date", from).lte("date", to),
    ]);
    for (const r of [projRes, workersRes, assignRes, attRes]) {
      if ((r as any).error) throw new Error((r as any).error.message);
    }
    const wageMap = new Map((workersRes.data ?? []).map((w) => [w.id, Number(w.daily_wage)]));
    const assignedCount = new Map<string, number>();
    for (const a of assignRes.data ?? []) {
      assignedCount.set(a.project_id, (assignedCount.get(a.project_id) ?? 0) + 1);
    }
    const costByProject = new Map<string, number>();
    const presentTodayByProject = new Map<string, number>();
    for (const a of attRes.data ?? []) {
      if (!a.project_id) continue;
      const e = wageFor(a.type as AttendanceType, wageMap.get(a.worker_id) ?? 0);
      costByProject.set(a.project_id, (costByProject.get(a.project_id) ?? 0) + e);
      if (a.date === today && a.type !== "absent") {
        presentTodayByProject.set(a.project_id, (presentTodayByProject.get(a.project_id) ?? 0) + 1);
      }
    }
    return (projRes.data ?? []).map((p) => ({
      ...p,
      assignedCount: assignedCount.get(p.id) ?? 0,
      monthCost: Math.round(costByProject.get(p.id) ?? 0),
      presentToday: presentTodayByProject.get(p.id) ?? 0,
    }));
  });

export const getProjectStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const { from, to } = monthBounds();
    const today = new Date().toISOString().slice(0, 10);

    const [assignRes, attRes] = await Promise.all([
      sb.from("project_workers")
        .select("worker_id, workers(id, full_name, worker_type, daily_wage)")
        .eq("project_id", data.id),
      sb.from("attendance")
        .select("worker_id, type, date")
        .eq("project_id", data.id)
        .gte("date", from).lte("date", to),
    ]);
    for (const r of [assignRes, attRes]) {
      if ((r as any).error) throw new Error((r as any).error.message);
    }
    const assigns = assignRes.data ?? [];
    const att = attRes.data ?? [];
    const todayAtt = att.filter((a) => a.date === today);
    const presentToday = todayAtt.filter((a) => a.type !== "absent").length;
    const absentToday = Math.max(0, assigns.length - presentToday);

    const breakdown = assigns.map((a: any) => {
      const wage = Number(a.workers?.daily_wage ?? 0);
      const wAtt = att.filter((x) => x.worker_id === a.worker_id);
      const days = wAtt.filter((x) => x.type !== "absent").length;
      const earnings = wAtt.reduce((s, x) => s + wageFor(x.type as AttendanceType, wage), 0);
      return {
        worker_id: a.worker_id,
        name: a.workers?.full_name ?? "—",
        type: a.workers?.worker_type ?? "",
        wage,
        days,
        earnings: Math.round(earnings),
      };
    });
    const monthCost = breakdown.reduce((s, r) => s + r.earnings, 0);
    return {
      assignedCount: assigns.length,
      presentToday,
      absentToday,
      monthCost: Math.round(monthCost),
      breakdown: breakdown.sort((a, b) => b.earnings - a.earnings),
    };
  });

/* --------------------------------- WORKERS --------------------------------- */
export const listWorkersWithStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const { from, to } = monthBounds();

    const [workersRes, assignRes, attRes] = await Promise.all([
      sb.from("workers").select("*").order("full_name"),
      sb.from("project_workers").select("worker_id, project_id, projects(name)"),
      sb.from("attendance").select("worker_id, type").gte("date", from).lte("date", to),
    ]);
    for (const r of [workersRes, assignRes, attRes]) {
      if ((r as any).error) throw new Error((r as any).error.message);
    }
    const projectsByWorker = new Map<string, string[]>();
    for (const a of (assignRes.data ?? []) as any[]) {
      const name = a.projects?.name;
      if (!name) continue;
      if (!projectsByWorker.has(a.worker_id)) projectsByWorker.set(a.worker_id, []);
      projectsByWorker.get(a.worker_id)!.push(name);
    }
    const attByWorker = new Map<string, { type: string }[]>();
    for (const a of attRes.data ?? []) {
      if (!attByWorker.has(a.worker_id)) attByWorker.set(a.worker_id, []);
      attByWorker.get(a.worker_id)!.push(a);
    }
    return (workersRes.data ?? []).map((w) => {
      const wage = Number(w.daily_wage);
      const wAtt = attByWorker.get(w.id) ?? [];
      const days = wAtt.filter((a) => a.type !== "absent").length;
      const earnings = wAtt.reduce((s, a) => s + wageFor(a.type as AttendanceType, wage), 0);
      return {
        ...w,
        assignedProjects: projectsByWorker.get(w.id) ?? [],
        monthDays: days,
        monthEarnings: Math.round(earnings),
      };
    });
  });

export const getWorkerDetailStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { worker_id: string; year?: number; month?: number }) =>
    z.object({
      worker_id: z.string().uuid(),
      year: z.number().int().optional(),
      month: z.number().int().min(1).max(12).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const now = new Date();
    const year = data.year ?? now.getFullYear();
    const month = data.month ?? now.getMonth() + 1;
    const { from, to } = boundsFor(year, month);

    const [wRes, attRes, payRes, assignRes, lifetimeAttRes, lifetimePayRes] = await Promise.all([
      sb.from("workers").select("*").eq("id", data.worker_id).maybeSingle(),
      sb.from("attendance").select("type, date, project_id").eq("worker_id", data.worker_id).gte("date", from).lte("date", to),
      sb.from("payments").select("amount, paid_on, note").eq("worker_id", data.worker_id).gte("paid_on", from).lte("paid_on", to),
      sb.from("project_workers").select("project_id, assigned_at, projects(id, name)").eq("worker_id", data.worker_id),
      sb.from("attendance").select("type").eq("worker_id", data.worker_id),
      sb.from("payments").select("amount").eq("worker_id", data.worker_id),
    ]);
    for (const r of [wRes, attRes, payRes, assignRes, lifetimeAttRes, lifetimePayRes]) {
      if ((r as any).error) throw new Error((r as any).error.message);
    }
    if (!wRes.data) throw new Error("Worker not found");

    const wage = Number(wRes.data.daily_wage);
    const att = attRes.data ?? [];
    const counts = {
      full: att.filter((a) => a.type === "full").length,
      half: att.filter((a) => a.type === "half").length,
      overtime: att.filter((a) => a.type === "overtime").length,
      absent: att.filter((a) => a.type === "absent").length,
    };
    const presentDays = counts.full + counts.half + counts.overtime;
    const earnings = att.reduce((s, a) => s + wageFor(a.type as AttendanceType, wage), 0);
    const paid = (payRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0);

    const lifetimeEarnings = (lifetimeAttRes.data ?? []).reduce(
      (s, a) => s + wageFor(a.type as AttendanceType, wage), 0,
    );
    const lifetimePaid = (lifetimePayRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0);

    return {
      worker: wRes.data,
      period: { year, month, from, to },
      assignments: (assignRes.data ?? []) as any[],
      counts,
      presentDays,
      monthEarnings: Math.round(earnings),
      monthPaid: Math.round(paid),
      monthPending: Math.round(earnings - paid),
      lifetimeEarnings: Math.round(lifetimeEarnings),
      lifetimePaid: Math.round(lifetimePaid),
      lifetimeBalance: Math.round(lifetimeEarnings - lifetimePaid),
    };
  });

/* --------------------------------- ATTENDANCE --------------------------------- */
export const getProjectAssignedWorkers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("project_workers")
      .select("worker_id, workers(id, full_name, worker_type, daily_wage, status)")
      .eq("project_id", data.project_id);
    if (error) throw new Error(error.message);
    return (rows ?? [])
      .map((r: any) => r.workers)
      .filter((w: any) => w && w.status === "active")
      .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name));
  });

export const getAttendanceForProjectDay = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string; date: string }) =>
    z.object({ project_id: z.string().uuid(), date: z.string().min(8) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("attendance")
      .select("worker_id, type")
      .eq("project_id", data.project_id)
      .eq("date", data.date);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* --------------------------------- REPORTS (calendar matrix) --------------------------------- */
export const getAttendanceMatrix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { year: number; month: number; project_id?: string | null }) =>
    z.object({
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      project_id: z.string().uuid().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const { from, to } = boundsFor(data.year, data.month);
    const days = Number(to.slice(-2));

    let workersQ = sb.from("workers").select("id, full_name, daily_wage").order("full_name");
    if (data.project_id) {
      const { data: pw } = await sb.from("project_workers").select("worker_id").eq("project_id", data.project_id);
      const ids = (pw ?? []).map((x) => x.worker_id);
      if (ids.length === 0) return { days, workers: [], rows: [] };
      workersQ = workersQ.in("id", ids);
    }

    let attQ = sb.from("attendance").select("worker_id, date, type").gte("date", from).lte("date", to);
    if (data.project_id) attQ = attQ.eq("project_id", data.project_id);

    const [workersRes, attRes] = await Promise.all([workersQ, attQ]);
    if (workersRes.error) throw new Error(workersRes.error.message);
    if (attRes.error) throw new Error(attRes.error.message);

    const attMap = new Map<string, Map<number, string>>();
    for (const a of attRes.data ?? []) {
      const d = Number(a.date.slice(-2));
      if (!attMap.has(a.worker_id)) attMap.set(a.worker_id, new Map());
      attMap.get(a.worker_id)!.set(d, a.type);
    }
    const rows = (workersRes.data ?? []).map((w) => {
      const m = attMap.get(w.id) ?? new Map();
      const cells: string[] = [];
      for (let d = 1; d <= days; d++) cells.push(m.get(d) ?? "");
      return { worker_id: w.id, name: w.full_name, cells };
    });
    return { days, workers: workersRes.data ?? [], rows };
  });
