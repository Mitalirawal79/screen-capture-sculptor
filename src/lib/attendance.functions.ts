import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const typeEnum = z.enum(["absent", "half", "full", "overtime"]);

export const getAttendanceForDay = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { date: string }) => z.object({ date: z.string().min(8) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("attendance")
      .select("id, worker_id, type, project_id")
      .eq("date", data.date);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        worker_id: z.string().uuid(),
        date: z.string().min(8),
        type: typeEnum,
        project_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("attendance")
      .upsert(
        {
          worker_id: data.worker_id,
          date: data.date,
          type: data.type,
          project_id: data.project_id,
          owner_id: context.userId,
        },
        { onConflict: "worker_id,date,project_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const bulkUpsertAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        date: z.string().min(8),
        project_id: z.string().uuid(),
        workers: z.array(
          z.object({
            worker_id: z.string().uuid(),
            type: typeEnum,
          })
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
  .inputValidator((d: unknown) =>
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
  .inputValidator((d: { worker_id: string; from: string; to: string }) =>
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
      .select("date, type, project_id")
      .eq("worker_id", data.worker_id)
      .gte("date", data.from)
      .lte("date", data.to)
      .order("date", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
