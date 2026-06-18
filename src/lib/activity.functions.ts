import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const logActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        entity_type: z.string().max(40),
        entity_id: z.string().uuid().optional().nullable(),
        project_id: z.string().uuid().optional().nullable(),
        action: z.string().max(40),
        description: z.string().max(500).optional().nullable(),
        meta: z.record(z.string(), z.any()).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("activity_log").insert({
      ...data,
      owner_id: context.userId,
      actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        project_id: z.string().uuid().optional().nullable(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.project_id) q = q.eq("project_id", data.project_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
