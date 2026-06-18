import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const typeEnum = z.enum(["absent", "half", "full", "overtime"]);
const workAreaSchema = z.string().trim().max(80).optional().nullable();

export const getAttendanceForDay = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { date: string }) => z.object({ date: z.string().min(8) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("attendance")
      .select("id, worker_id, type, project_id, work_area")
      .eq("date", data.date);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        worker_id: z.string().uuid(),
        date: z.string().min(8),
        type: typeEnum,
        project_id: z.string().uuid(),
        work_area: workAreaSchema,
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("attendance").upsert(
      {
        worker_id: data.worker_id,
        date: data.date,
        type: data.type,
        project_id: data.project_id,
        work_area: data.work_area ? data.work_area : null,
        owner_id: context.userId,
      },
      { onConflict: "worker_id,date,project_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkUpsertAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        date: z.string().min(8),
        project_id: z.string().uuid(),
        work_area: workAreaSchema,
        workers: z.array(
          z.object({
            worker_id: z.string().uuid(),
            type: typeEnum,
            work_area: workAreaSchema,
          }),
        ),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const rows = data.workers.map((w) => ({
      worker_id: w.worker_id,
      date: data.date,
      type: w.type,
      project_id: data.project_id,
      work_area: (w.work_area ?? data.work_area) || null,
      owner_id: context.userId,
    }));
    const { error } = await context.supabase
      .from("attendance")
      .upsert(rows, { onConflict: "worker_id,date,project_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ worker_id: z.string().uuid(), date: z.string().min(8) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("attendance")
      .delete()
      .eq("worker_id", data.worker_id)
      .eq("date", data.date);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getWorkerAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { worker_id: string; from: string; to: string }) =>
    z
      .object({
        worker_id: z.string().uuid(),
        from: z.string().min(8),
        to: z.string().min(8),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("attendance")
      .select("date, type, project_id, work_area, projects(name)")
      .eq("worker_id", data.worker_id)
      .gte("date", data.from)
      .lte("date", data.to)
      .order("date", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listProjectWorkAreas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("attendance")
      .select("work_area, date")
      .eq("project_id", data.project_id)
      .not("work_area", "is", null)
      .order("date", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rows ?? []) {
      const wa = (r as any).work_area as string | null;
      if (!wa) continue;
      if (seen.has(wa)) continue;
      seen.add(wa);
      out.push(wa);
      if (out.length >= 12) break;
    }
    return out;
  });

export const getProjectWorkAreaCosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { project_id: string; from?: string; to?: string }) =>
    z
      .object({
        project_id: z.string().uuid(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    let q = sb
      .from("attendance")
      .select("type, work_area, workers(daily_wage)")
      .eq("project_id", data.project_id);
    if (data.from) q = q.gte("date", data.from);
    if (data.to) q = q.lte("date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const { wageFor } = await import("./wages");
    const map = new Map<string, { area: string; days: number; cost: number }>();
    for (const r of (rows ?? []) as any[]) {
      const area = r.work_area || "Unassigned";
      const wage = Number(r.workers?.daily_wage ?? 0);
      const cost = wageFor(r.type, wage);
      const cur = map.get(area) ?? { area, days: 0, cost: 0 };
      cur.cost += cost;
      if (r.type !== "absent") cur.days += 1;
      map.set(area, cur);
    }
    return Array.from(map.values())
      .map((x) => ({ ...x, cost: Math.round(x.cost) }))
      .sort((a, b) => b.cost - a.cost);
  });
