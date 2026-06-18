import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculateGroupedEarnings } from "./wages";

export const getWorkerSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { worker_id: string }) => z.object({ worker_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const [worker, attMonth, attAll, payments] = await Promise.all([
      sb.from("workers").select("*").eq("id", data.worker_id).maybeSingle(),
      sb
        .from("attendance")
        .select("type, date, project_id")
        .eq("worker_id", data.worker_id)
        .gte("date", monthStart)
        .lte("date", monthEnd),
      sb.from("attendance").select("type, date, project_id").eq("worker_id", data.worker_id),
      sb.from("payments").select("amount").eq("worker_id", data.worker_id),
    ]);
    for (const r of [worker, attMonth, attAll, payments]) {
      if ((r as any).error) throw new Error((r as any).error.message);
    }
    if (!worker.data) throw new Error("Worker not found");

    const wage = Number(worker.data.daily_wage);
    const monthEarnings = calculateGroupedEarnings(attMonth.data ?? [], wage);
    const lifetimeEarnings = calculateGroupedEarnings(attAll.data ?? [], wage);
    const totalPaid = (payments.data ?? []).reduce((s, p) => s + Number(p.amount), 0);

    const present = (attMonth.data ?? []).filter((a) => a.type !== "absent").length;
    const overtime = (attMonth.data ?? []).filter((a) => a.type === "overtime").length;

    return {
      worker: worker.data,
      monthPresent: present,
      monthOvertime: overtime,
      monthEarnings,
      lifetimeEarnings,
      totalPaid: Math.round(totalPaid),
      balance: Math.round(lifetimeEarnings - totalPaid),
    };
  });
