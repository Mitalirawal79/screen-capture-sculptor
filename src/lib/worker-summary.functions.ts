import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { wageFor, type AttendanceType } from "./wages";

export const getWorkerSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { worker_id: string }) =>
    z.object({ worker_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    const [worker, attMonth, attAll, payments] = await Promise.all([
      sb.from("workers").select("*").eq("id", data.worker_id).maybeSingle(),
      sb
        .from("attendance")
        .select("type, date")
        .eq("worker_id", data.worker_id)
        .gte("date", monthStart)
        .lte("date", monthEnd),
      sb.from("attendance").select("type").eq("worker_id", data.worker_id),
      sb
        .from("payments")
        .select("amount")
        .eq("worker_id", data.worker_id),
    ]);
    for (const r of [worker, attMonth, attAll, payments]) {
      if ((r as any).error) throw new Error((r as any).error.message);
    }
    if (!worker.data) throw new Error("Worker not found");

    const wage = Number(worker.data.daily_wage);
    const monthEarnings = (attMonth.data ?? []).reduce(
      (s, a) => s + wageFor(a.type as AttendanceType, wage),
      0,
    );
    const lifetimeEarnings = (attAll.data ?? []).reduce(
      (s, a) => s + wageFor(a.type as AttendanceType, wage),
      0,
    );
    const totalPaid = (payments.data ?? []).reduce((s, p) => s + Number(p.amount), 0);

    const present = (attMonth.data ?? []).filter((a) => a.type !== "absent").length;
    const overtime = (attMonth.data ?? []).filter((a) => a.type === "overtime").length;

    return {
      worker: worker.data,
      monthPresent: present,
      monthOvertime: overtime,
      monthEarnings: Math.round(monthEarnings * 100) / 100,
      lifetimeEarnings: Math.round(lifetimeEarnings * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      balance: Math.round((lifetimeEarnings - totalPaid) * 100) / 100,
    };
  });
