import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const workerInput = z.object({
  full_name: z.string().min(1).max(120),
  mobile: z.string().max(30).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  worker_type: z.string().max(60).optional().nullable(),
  joining_date: z.string().min(1),
  daily_wage: z.number().min(0).max(1_000_000),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const listWorkers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("workers")
      .select("*")
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getWorker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: worker, error } = await context.supabase
      .from("workers")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!worker) throw new Error("Worker not found");
    return worker;
  });

export const createWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => workerInput.parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("workers")
      .insert({ ...data, owner_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("activity_log").insert({
      owner_id: context.userId,
      actor_id: context.userId,
      entity_type: "worker",
      entity_id: row.id,
      action: "worker_added",
      description: `Added worker ${row.full_name}`,
    });
    return row;
  });

export const updateWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    workerInput.partial().extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("workers")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("activity_log").insert({
      owner_id: context.userId,
      actor_id: context.userId,
      entity_type: "worker",
      entity_id: id,
      action: "worker_updated",
      description: `Updated worker ${row.full_name}`,
      meta: patch as any,
    });
    return row;
  });

export const deleteWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: w } = await context.supabase
      .from("workers").select("full_name").eq("id", data.id).maybeSingle();
    const { error } = await context.supabase.from("workers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("activity_log").insert({
      owner_id: context.userId,
      actor_id: context.userId,
      entity_type: "worker",
      entity_id: data.id,
      action: "worker_deleted",
      description: `Deleted worker ${w?.full_name ?? ""}`.trim(),
    });
    return { ok: true };
  });
