import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listQuotations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ project_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("project_quotations")
      .select("*")
      .eq("project_id", data.project_id)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const recordQuotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        project_id: z.string().uuid(),
        file_path: z.string().min(1).max(500),
        file_name: z.string().min(1).max(200),
        file_type: z.string().max(120).optional().nullable(),
        file_size: z.number().int().min(0).optional().nullable(),
        note: z.string().max(500).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    // Find next version & mark previous as not current
    const { data: existing, error: eErr } = await sb
      .from("project_quotations")
      .select("version")
      .eq("project_id", data.project_id)
      .order("version", { ascending: false })
      .limit(1);
    if (eErr) throw new Error(eErr.message);
    const nextVersion = (existing?.[0]?.version ?? 0) + 1;

    if (nextVersion > 1) {
      const { error: upErr } = await sb
        .from("project_quotations")
        .update({ is_current: false })
        .eq("project_id", data.project_id)
        .eq("is_current", true);
      if (upErr) throw new Error(upErr.message);
    }

    const { data: row, error } = await sb
      .from("project_quotations")
      .insert({
        owner_id: context.userId,
        uploaded_by: context.userId,
        project_id: data.project_id,
        version: nextVersion,
        file_path: data.file_path,
        file_name: data.file_name,
        file_type: data.file_type ?? null,
        file_size: data.file_size ?? null,
        note: data.note ?? null,
        is_current: true,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await sb.from("activity_log").insert({
      owner_id: context.userId,
      actor_id: context.userId,
      entity_type: "quotation",
      entity_id: row.id,
      project_id: data.project_id,
      action: nextVersion === 1 ? "quotation_uploaded" : "quotation_replaced",
      description: `${nextVersion === 1 ? "Uploaded" : "Replaced"} quotation (v${nextVersion}): ${data.file_name}`,
      meta: { version: nextVersion, file_name: data.file_name },
    });

    return row;
  });

export const deleteQuotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const { data: row, error: gErr } = await sb
      .from("project_quotations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!row) throw new Error("Quotation not found");

    await sb.storage.from("project-files").remove([row.file_path]);

    const { error } = await sb.from("project_quotations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    if (row.is_current) {
      const { data: latest } = await sb
        .from("project_quotations")
        .select("id")
        .eq("project_id", row.project_id)
        .order("version", { ascending: false })
        .limit(1);
      if (latest?.[0]) {
        await sb.from("project_quotations").update({ is_current: true }).eq("id", latest[0].id);
      }
    }

    await sb.from("activity_log").insert({
      owner_id: context.userId,
      actor_id: context.userId,
      entity_type: "quotation",
      entity_id: row.id,
      project_id: row.project_id,
      action: "quotation_deleted",
      description: `Deleted quotation v${row.version}: ${row.file_name}`,
    });

    return { ok: true };
  });

export const getQuotationUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ file_path: z.string().min(1) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("project-files")
      .createSignedUrl(data.file_path, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
