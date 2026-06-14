import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const projectInput = z.object({
  name: z.string().min(1).max(200),
  client: z.string().max(200).optional().nullable(),
  location: z.string().max(300).optional().nullable(),
  start_date: z.string().optional().nullable(),
  expected_end: z.string().optional().nullable(),
  contract_value: z.number().min(0).max(1_000_000_000).default(0),
  status: z.enum(["planning", "active", "on_hold", "completed"]).default("planning"),
  progress_pct: z.number().int().min(0).max(100).default(0),
  notes: z.string().max(5000).optional().nullable(),
});

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const [pRes, aRes, uRes, qRes, lRes] = await Promise.all([
      sb.from("projects").select("*").eq("id", data.id).maybeSingle(),
      sb.from("project_workers")
        .select("worker_id, workers(id, full_name, worker_type, daily_wage, status)")
        .eq("project_id", data.id),
      sb.from("project_updates").select("*").eq("project_id", data.id).order("created_at", { ascending: false }),
      sb.from("project_quotations").select("*").eq("project_id", data.id).order("version", { ascending: false }),
      sb.from("activity_log").select("*").eq("project_id", data.id).order("created_at", { ascending: false }).limit(50),
    ]);
    if (pRes.error) throw new Error(pRes.error.message);
    if (aRes.error) throw new Error(aRes.error.message);
    if (uRes.error) throw new Error(uRes.error.message);
    if (qRes.error) throw new Error(qRes.error.message);
    if (lRes.error) throw new Error(lRes.error.message);
    if (!pRes.data) throw new Error("Project not found");
    return {
      project: pRes.data,
      assignments: aRes.data ?? [],
      updates: uRes.data ?? [],
      quotations: qRes.data ?? [],
      activity: lRes.data ?? [],
    };
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => projectInput.parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("projects")
      .insert({ ...data, owner_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    projectInput.partial().extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("projects").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ project_id: z.string().uuid(), worker_id: z.string().uuid() })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("project_workers")
      .upsert({ ...data, owner_id: context.userId }, { onConflict: "project_id,worker_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unassignWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ project_id: z.string().uuid(), worker_id: z.string().uuid() })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("project_workers")
      .delete()
      .eq("project_id", data.project_id)
      .eq("worker_id", data.worker_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addProjectUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        project_id: z.string().uuid(),
        note: z.string().min(1).max(2000),
        is_milestone: z.boolean().default(false),
        photo_path: z.string().max(500).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("project_updates")
      .insert({ ...data, owner_id: context.userId });
    if (error) throw new Error(error.message);
    await context.supabase.from("activity_log").insert({
      owner_id: context.userId,
      actor_id: context.userId,
      entity_type: "project_update",
      project_id: data.project_id,
      action: data.is_milestone ? "milestone_added" : "note_added",
      description: data.note.slice(0, 200),
      meta: data.photo_path ? { photo_path: data.photo_path } : null,
    });
    return { ok: true };
  });

export const getSignedFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ file_path: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("project-files")
      .createSignedUrl(data.file_path, 60 * 60);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
