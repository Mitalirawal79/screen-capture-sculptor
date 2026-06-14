import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { wageFor, type AttendanceType } from "./wages";

function monthBounds(year: number, month0: number) {
  const from = new Date(year, month0, 1);
  const to = new Date(year, month0 + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to), daysInMonth: to.getDate() };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/* ─── COLORS ────────────────────────────────────────────────── */
const HEADER_BG  = "FF1E3A5F";
const HEADER_FG  = "FFFFFFFF";
const SUBHEADER  = "FF2B5D8C";
const TOTAL_BG   = "FFF0F4F8";
const BORDER_CLR = "FFCBD5E1";
const BORDER_DARK = "FF94A3B8";

// Attendance calendar cell colors
const ATT_COLORS: Record<string, { bg: string; fg: string }> = {
  full:     { bg: "FFC6EFCE", fg: "FF276221" },  // Green
  half:     { bg: "FFFFEB9C", fg: "FF9C6500" },  // Yellow
  overtime: { bg: "FFBDD7EE", fg: "FF1F4E79" },  // Blue
  absent:   { bg: "FFFFC7CE", fg: "FF9C0006" },  // Red
};

const ATT_CODE: Record<string, string> = {
  full: "P", half: "H", overtime: "O", absent: "A",
};

const currencyFmt = '₹#,##0;[Red]-₹#,##0';

/* ─── Helper: style a header row ────────────────────────────── */
function styleHeaderRow(
  row: any,
  colCount: number,
  bg = HEADER_BG,
  fg = HEADER_FG,
  height = 28,
) {
  row.height = height;
  for (let i = 1; i <= colCount; i++) {
    const c = row.getCell(i);
    c.font = { bold: true, color: { argb: fg }, size: 11 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = {
      top:    { style: "thin", color: { argb: BORDER_DARK } },
      left:   { style: "thin", color: { argb: BORDER_DARK } },
      bottom: { style: "thin", color: { argb: BORDER_DARK } },
      right:  { style: "thin", color: { argb: BORDER_DARK } },
    };
  }
}

function applyBorders(row: any, colCount: number) {
  for (let i = 1; i <= colCount; i++) {
    row.getCell(i).border = {
      top:    { style: "thin", color: { argb: BORDER_CLR } },
      left:   { style: "thin", color: { argb: BORDER_CLR } },
      bottom: { style: "thin", color: { argb: BORDER_CLR } },
      right:  { style: "thin", color: { argb: BORDER_CLR } },
    };
  }
}

/* ─══════════════════════════════════════════════════════════════
   MAIN EXPORT FUNCTION — 3 WORKSHEETS
   ═══════════════════════════════════════════════════════════════ */
export const generateMonthlyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        year: z.number().int().min(2000).max(2100),
        month: z.number().int().min(1).max(12),
        project_id: z.string().uuid().optional().nullable(),
        worker_id: z.string().uuid().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { from, to, daysInMonth } = monthBounds(data.year, data.month - 1);
    const sb = context.supabase;
    const monthLabel = `${MONTH_NAMES[data.month - 1]} ${data.year}`;

    /* ── Fetch all data in parallel ──────────────────────────── */
    let workersQuery = sb
      .from("workers")
      .select("id, full_name, daily_wage, worker_type, status")
      .order("full_name");
    if (data.worker_id) workersQuery = workersQuery.eq("id", data.worker_id);

    const [workersRes, attRes, payRes, projRes, pwRes] = await Promise.all([
      workersQuery,
      sb.from("attendance")
        .select("worker_id, type, date, project_id")
        .gte("date", from)
        .lte("date", to),
      sb.from("payments")
        .select("worker_id, amount, paid_on, note")
        .gte("paid_on", from)
        .lte("paid_on", to),
      sb.from("projects")
        .select("id, name, location, status"),
      sb.from("project_workers")
        .select("project_id, worker_id"),
    ]);
    for (const r of [workersRes, attRes, payRes, projRes, pwRes]) {
      if ((r as any).error) throw new Error((r as any).error.message);
    }

    let workers = workersRes.data ?? [];
    const allAtt = attRes.data ?? [];
    const allPay = payRes.data ?? [];
    const projects = projRes.data ?? [];
    const projWorkers = pwRes.data ?? [];

    // If project filter, narrow workers to those assigned
    if (data.project_id) {
      const allowed = new Set(
        projWorkers
          .filter((pw: any) => pw.project_id === data.project_id)
          .map((pw: any) => pw.worker_id),
      );
      workers = workers.filter((w) => allowed.has(w.id));
    }

    // Filter attendance by project if selected
    const filteredAtt = data.project_id
      ? allAtt.filter((a) => a.project_id === data.project_id)
      : allAtt;

    // Build per-worker attendance maps
    const attByWorker = new Map<string, Map<number, string>>();
    for (const a of filteredAtt) {
      if (!attByWorker.has(a.worker_id)) attByWorker.set(a.worker_id, new Map());
      const dayNum = Number(a.date.slice(-2));
      attByWorker.get(a.worker_id)!.set(dayNum, a.type);
    }

    // Build per-worker payment maps: day → { amount, note }
    const payByWorker = new Map<string, Map<number, { amount: number; note: string | null }[]>>();
    for (const p of allPay) {
      if (!payByWorker.has(p.worker_id)) payByWorker.set(p.worker_id, new Map());
      const dayNum = Number(p.paid_on.slice(-2));
      const dayMap = payByWorker.get(p.worker_id)!;
      if (!dayMap.has(dayNum)) dayMap.set(dayNum, []);
      dayMap.get(dayNum)!.push({ amount: Number(p.amount), note: p.note ?? null });
    }

    // Pre-compute worker stats
    type WorkerRow = {
      id: string;
      name: string;
      type: string;
      wage: number;
      full: number;
      half: number;
      ot: number;
      absent: number;
      earnings: number;
      paid: number;
      attMap: Map<number, string>;
      payMap: Map<number, { amount: number; note: string | null }[]>;
    };

    const workerRows: WorkerRow[] = workers.map((w) => {
      const wage = Number(w.daily_wage);
      const wAtt = filteredAtt.filter((a) => a.worker_id === w.id);
      const full = wAtt.filter((a) => a.type === "full").length;
      const half = wAtt.filter((a) => a.type === "half").length;
      const ot = wAtt.filter((a) => a.type === "overtime").length;
      const absent = wAtt.filter((a) => a.type === "absent").length;
      const earnings = wAtt.reduce((s, a) => s + wageFor(a.type as AttendanceType, wage), 0);
      const paid = allPay
        .filter((p) => p.worker_id === w.id)
        .reduce((s, p) => s + Number(p.amount), 0);
      return {
        id: w.id,
        name: w.full_name,
        type: w.worker_type ?? "",
        wage,
        full,
        half,
        ot,
        absent,
        earnings: Math.round(earnings),
        paid: Math.round(paid),
        attMap: attByWorker.get(w.id) ?? new Map(),
        payMap: payByWorker.get(w.id) ?? new Map(),
      };
    });

    /* ── ExcelJS setup ───────────────────────────────────────── */
    const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
    const wb = new (ExcelJS as any).Workbook();
    wb.creator = "SiteCrew";
    wb.created = new Date();

    const selectedProjectName = data.project_id
      ? projects.find((p) => p.id === data.project_id)?.name ?? "Project"
      : "All Projects";

    /* ═══════════════════════════════════════════════════════════
       WORKSHEET 1: Workforce Summary
       ═══════════════════════════════════════════════════════════ */
    const ws1 = wb.addWorksheet("Workforce Summary", {
      views: [{ state: "frozen", ySplit: 4 }],
    });

    // Title block — rows 1-3
    ws1.mergeCells("A1:I1");
    const titleCell = ws1.getRow(1).getCell(1);
    titleCell.value = "SiteCrew — Workforce Summary";
    titleCell.font = { bold: true, size: 16, color: { argb: HEADER_FG } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    ws1.getRow(1).height = 30;

    ws1.mergeCells("A2:D2");
    ws1.getRow(2).getCell(1).value = `Period: ${monthLabel}`;
    ws1.getRow(2).getCell(1).font = { bold: true, color: { argb: "FF334155" } };
    ws1.mergeCells("E2:I2");
    ws1.getRow(2).getCell(5).value = `Project: ${selectedProjectName}`;
    ws1.getRow(2).getCell(5).font = { color: { argb: "FF334155" } };

    ws1.mergeCells("A3:I3");
    ws1.getRow(3).getCell(1).value = `Generated: ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`;
    ws1.getRow(3).getCell(1).font = { italic: true, size: 9, color: { argb: "FF64748B" } };
    ws1.getRow(3).height = 18;

    // Headers — row 4
    const ws1Headers = [
      "Worker Name", "Worker Type", "Daily Wage",
      "Full Days", "Half Days", "OT Days",
      "Total Absent", "Total Earnings", "Amount Paid",
    ];
    const hRow = ws1.getRow(4);
    ws1Headers.forEach((h, i) => { hRow.getCell(i + 1).value = h; });
    styleHeaderRow(hRow, ws1Headers.length);

    // Data rows — starting at row 5
    workerRows.forEach((r, idx) => {
      const row = ws1.getRow(5 + idx);
      row.getCell(1).value = r.name;
      row.getCell(1).alignment = { horizontal: "left" };
      row.getCell(2).value = r.type;
      row.getCell(3).value = r.wage;
      row.getCell(3).numFmt = currencyFmt;
      row.getCell(4).value = r.full;
      row.getCell(5).value = r.half;
      row.getCell(6).value = r.ot;
      row.getCell(7).value = r.absent;
      row.getCell(8).value = r.earnings;
      row.getCell(8).numFmt = currencyFmt;
      row.getCell(9).value = r.paid;
      row.getCell(9).numFmt = currencyFmt;
      applyBorders(row, ws1Headers.length);
      if (idx % 2 === 1) {
        for (let c = 1; c <= ws1Headers.length; c++) {
          row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        }
      }
    });

    // Summary rows
    const sumStart = 5 + workerRows.length + 1;
    const totalEarnings = workerRows.reduce((s, r) => s + r.earnings, 0);
    const totalPaid = workerRows.reduce((s, r) => s + r.paid, 0);
    const summaryItems: [string, number | string, string?][] = [
      ["Total Workers", workerRows.length],
      ["Total Labour Cost", totalEarnings, currencyFmt],
      ["Total Amount Paid", totalPaid, currencyFmt],
    ];

    summaryItems.forEach((item, i) => {
      const row = ws1.getRow(sumStart + i);
      ws1.mergeCells(sumStart + i, 1, sumStart + i, 6);
      ws1.mergeCells(sumStart + i, 7, sumStart + i, 9);
      const labelCell = row.getCell(1);
      const valCell = row.getCell(7);
      labelCell.value = item[0];
      labelCell.font = { bold: true, size: 11, color: { argb: "FF1E3A5F" } };
      labelCell.alignment = { horizontal: "right", vertical: "middle" };
      valCell.value = item[1];
      if (item[2]) valCell.numFmt = item[2];
      valCell.font = { bold: true, size: 12, color: { argb: "FF1E3A5F" } };
      valCell.alignment = { horizontal: "center", vertical: "middle" };
      labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
      valCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
      applyBorders(row, 9);
    });

    // Column widths
    [24, 14, 12, 10, 10, 10, 12, 16, 14].forEach((w, i) => { ws1.getColumn(i + 1).width = w; });

    /* ═══════════════════════════════════════════════════════════
       WORKSHEET 2: Attendance Calendar  (THE MAIN ONE)
       ═══════════════════════════════════════════════════════════ */
    const dateColStart = 4; // columns: A=Name, B=Type, C=Wage, D..=dates
    const totalColStart = dateColStart + daysInMonth; // after date columns
    const calTotalCols = totalColStart + 4; // +P, +H, +OT, +A, +Earnings = 5 more
    const calColCount = calTotalCols;

    const ws2 = wb.addWorksheet("Attendance Calendar", {
      views: [{
        state: "frozen",
        xSplit: 3,
        ySplit: 3,
      }],
    });

    // Row 1: Title bar spanning all columns
    ws2.mergeCells(1, 1, 1, calColCount);
    const cal1 = ws2.getRow(1).getCell(1);
    cal1.value = `Attendance Register — ${monthLabel}`;
    cal1.font = { bold: true, size: 14, color: { argb: HEADER_FG } };
    cal1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cal1.alignment = { vertical: "middle", horizontal: "center" };
    ws2.getRow(1).height = 28;

    // Row 2: Sub-header — project name + legend
    ws2.mergeCells(2, 1, 2, 3);
    const projCell = ws2.getRow(2).getCell(1);
    projCell.value = `Project: ${selectedProjectName}`;
    projCell.font = { bold: true, size: 10, color: { argb: "FF334155" } };
    projCell.alignment = { vertical: "middle", horizontal: "left" };

    // Legend across date columns
    ws2.mergeCells(2, dateColStart, 2, dateColStart + Math.min(daysInMonth - 1, 10));
    const legendCell = ws2.getRow(2).getCell(dateColStart);
    legendCell.value = "P = Present  |  H = Half Day  |  O = Overtime  |  A = Absent";
    legendCell.font = { italic: true, size: 9, color: { argb: "FF64748B" } };
    legendCell.alignment = { vertical: "middle", horizontal: "left" };
    ws2.getRow(2).height = 20;

    // Row 3: Column headers
    const row3 = ws2.getRow(3);
    row3.getCell(1).value = "Worker Name";
    row3.getCell(2).value = "Type";
    row3.getCell(3).value = "Daily Wage";

    for (let d = 1; d <= daysInMonth; d++) {
      row3.getCell(dateColStart + d - 1).value = d;
    }
    row3.getCell(totalColStart).value = "Total P";
    row3.getCell(totalColStart + 1).value = "Total H";
    row3.getCell(totalColStart + 2).value = "Total OT";
    row3.getCell(totalColStart + 3).value = "Total A";
    row3.getCell(totalColStart + 4).value = "Total Earnings";
    styleHeaderRow(row3, calColCount, SUBHEADER);
    // Left-align worker name header
    row3.getCell(1).alignment = { vertical: "middle", horizontal: "left", wrapText: true };

    // Data rows — starting row 4
    workerRows.forEach((wr, idx) => {
      const row = ws2.getRow(4 + idx);
      row.getCell(1).value = wr.name;
      row.getCell(1).font = { bold: true, size: 10 };
      row.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
      row.getCell(2).value = wr.type;
      row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(3).value = wr.wage;
      row.getCell(3).numFmt = currencyFmt;
      row.getCell(3).alignment = { horizontal: "center", vertical: "middle" };

      // Date cells
      for (let d = 1; d <= daysInMonth; d++) {
        const cell = row.getCell(dateColStart + d - 1);
        const att = wr.attMap.get(d);
        if (att && ATT_CODE[att]) {
          cell.value = ATT_CODE[att];
          cell.font = { bold: true, size: 10, color: { argb: ATT_COLORS[att].fg } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ATT_COLORS[att].bg } };
        }
        cell.alignment = { horizontal: "center", vertical: "middle" };

        // Payment comments on date cells
        const payments = wr.payMap.get(d);
        if (payments && payments.length > 0) {
          const payText = payments
            .map((p) => `Payment: ₹${p.amount.toLocaleString("en-IN")}${p.note ? ` — ${p.note}` : ""}`)
            .join("\n");
          cell.note = {
            texts: [{ text: payText, font: { size: 9 } }],
          };
        }
      }

      // Totals
      row.getCell(totalColStart).value = wr.full;
      row.getCell(totalColStart).font = { bold: true, color: { argb: ATT_COLORS.full.fg } };
      row.getCell(totalColStart + 1).value = wr.half;
      row.getCell(totalColStart + 1).font = { bold: true, color: { argb: ATT_COLORS.half.fg } };
      row.getCell(totalColStart + 2).value = wr.ot;
      row.getCell(totalColStart + 2).font = { bold: true, color: { argb: ATT_COLORS.overtime.fg } };
      row.getCell(totalColStart + 3).value = wr.absent;
      row.getCell(totalColStart + 3).font = { bold: true, color: { argb: ATT_COLORS.absent.fg } };
      row.getCell(totalColStart + 4).value = wr.earnings;
      row.getCell(totalColStart + 4).numFmt = currencyFmt;
      row.getCell(totalColStart + 4).font = { bold: true };

      // Center-align totals
      for (let c = totalColStart; c <= totalColStart + 4; c++) {
        row.getCell(c).alignment = { horizontal: "center", vertical: "middle" };
      }

      applyBorders(row, calColCount);

      // Zebra stripe
      if (idx % 2 === 1) {
        for (let c = 1; c <= 3; c++) {
          row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        }
        // Don't override attendance cell colors for date columns, only apply to blank ones
        for (let d = 1; d <= daysInMonth; d++) {
          const att = wr.attMap.get(d);
          if (!att) {
            row.getCell(dateColStart + d - 1).fill = {
              type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" },
            };
          }
        }
        for (let c = totalColStart; c <= totalColStart + 4; c++) {
          row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        }
      }
    });

    // Grand total row at bottom of calendar
    const calSumRow = ws2.getRow(4 + workerRows.length + 1);
    ws2.mergeCells(4 + workerRows.length + 1, 1, 4 + workerRows.length + 1, 3);
    calSumRow.getCell(1).value = "TOTALS";
    calSumRow.getCell(1).font = { bold: true, size: 11, color: { argb: HEADER_FG } };
    calSumRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    calSumRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };

    // Sum each date column
    for (let d = 1; d <= daysInMonth; d++) {
      const col = dateColStart + d - 1;
      const count = workerRows.filter((wr) => {
        const att = wr.attMap.get(d);
        return att && att !== "absent";
      }).length;
      const cell = calSumRow.getCell(col);
      cell.value = count || "";
      cell.font = { bold: true, size: 9, color: { argb: "FF1E3A5F" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }

    const grandTotals = workerRows.reduce(
      (acc, r) => ({
        full: acc.full + r.full,
        half: acc.half + r.half,
        ot: acc.ot + r.ot,
        absent: acc.absent + r.absent,
        earnings: acc.earnings + r.earnings,
      }),
      { full: 0, half: 0, ot: 0, absent: 0, earnings: 0 },
    );

    calSumRow.getCell(totalColStart).value = grandTotals.full;
    calSumRow.getCell(totalColStart + 1).value = grandTotals.half;
    calSumRow.getCell(totalColStart + 2).value = grandTotals.ot;
    calSumRow.getCell(totalColStart + 3).value = grandTotals.absent;
    calSumRow.getCell(totalColStart + 4).value = grandTotals.earnings;
    calSumRow.getCell(totalColStart + 4).numFmt = currencyFmt;
    for (let c = totalColStart; c <= totalColStart + 4; c++) {
      calSumRow.getCell(c).font = { bold: true, size: 11, color: { argb: HEADER_FG } };
      calSumRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
      calSumRow.getCell(c).alignment = { horizontal: "center", vertical: "middle" };
    }
    applyBorders(calSumRow, calColCount);

    // Column widths for calendar
    ws2.getColumn(1).width = 22; // Worker Name
    ws2.getColumn(2).width = 12; // Type
    ws2.getColumn(3).width = 12; // Wage
    for (let d = 1; d <= daysInMonth; d++) {
      ws2.getColumn(dateColStart + d - 1).width = 4.5; // Narrow date cols
    }
    ws2.getColumn(totalColStart).width = 9;
    ws2.getColumn(totalColStart + 1).width = 9;
    ws2.getColumn(totalColStart + 2).width = 9;
    ws2.getColumn(totalColStart + 3).width = 9;
    ws2.getColumn(totalColStart + 4).width = 14;

    /* ═══════════════════════════════════════════════════════════
       WORKSHEET 3: Labour Cost Summary (project-wise)
       ═══════════════════════════════════════════════════════════ */
    const ws3 = wb.addWorksheet("Labour Cost Summary", {
      views: [{ state: "frozen", ySplit: 3 }],
    });

    // Title
    ws3.mergeCells("A1:E1");
    const lc1 = ws3.getRow(1).getCell(1);
    lc1.value = `Labour Cost Summary — ${monthLabel}`;
    lc1.font = { bold: true, size: 14, color: { argb: HEADER_FG } };
    lc1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    lc1.alignment = { vertical: "middle", horizontal: "center" };
    ws3.getRow(1).height = 28;

    ws3.mergeCells("A2:E2");
    ws3.getRow(2).getCell(1).value = `Generated: ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`;
    ws3.getRow(2).getCell(1).font = { italic: true, size: 9, color: { argb: "FF64748B" } };
    ws3.getRow(2).height = 18;

    // Headers — row 3
    const ws3Headers = [
      "Project Name", "Site Location", "Assigned Workers",
      "Total Attendance Days", "Monthly Labour Cost",
    ];
    const h3Row = ws3.getRow(3);
    ws3Headers.forEach((h, i) => { h3Row.getCell(i + 1).value = h; });
    styleHeaderRow(h3Row, ws3Headers.length);
    h3Row.getCell(1).alignment = { vertical: "middle", horizontal: "left", wrapText: true };

    // Build project-level data
    const pwByProject = new Map<string, Set<string>>();
    for (const pw of projWorkers) {
      if (!pwByProject.has(pw.project_id)) pwByProject.set(pw.project_id, new Set());
      pwByProject.get(pw.project_id)!.add(pw.worker_id);
    }

    const wageMap = new Map(workers.map((w) => [w.id, Number(w.daily_wage)]));
    // Also include workers not in our filtered list
    const allWorkerWages = new Map(
      (workersRes.data ?? []).map((w: any) => [w.id, Number(w.daily_wage)]),
    );

    type ProjectRow = {
      name: string;
      location: string;
      assigned: number;
      attDays: number;
      cost: number;
    };

    const projectRows: ProjectRow[] = projects.map((p) => {
      const assignedSet = pwByProject.get(p.id) ?? new Set();
      const projAtt = allAtt.filter(
        (a) => a.project_id === p.id,
      );
      const attDays = projAtt.filter((a) => a.type !== "absent").length;
      const cost = projAtt.reduce((s, a) => {
        const w = allWorkerWages.get(a.worker_id) ?? 0;
        return s + wageFor(a.type as AttendanceType, w);
      }, 0);
      return {
        name: p.name,
        location: p.location ?? "—",
        assigned: assignedSet.size,
        attDays,
        cost: Math.round(cost),
      };
    }).filter((p) => p.assigned > 0 || p.cost > 0)
      .sort((a, b) => b.cost - a.cost);

    // Data rows
    projectRows.forEach((pr, idx) => {
      const row = ws3.getRow(4 + idx);
      row.getCell(1).value = pr.name;
      row.getCell(1).alignment = { horizontal: "left" };
      row.getCell(1).font = { bold: true };
      row.getCell(2).value = pr.location;
      row.getCell(2).alignment = { horizontal: "left" };
      row.getCell(3).value = pr.assigned;
      row.getCell(3).alignment = { horizontal: "center" };
      row.getCell(4).value = pr.attDays;
      row.getCell(4).alignment = { horizontal: "center" };
      row.getCell(5).value = pr.cost;
      row.getCell(5).numFmt = currencyFmt;
      row.getCell(5).alignment = { horizontal: "center" };
      applyBorders(row, ws3Headers.length);
      if (idx % 2 === 1) {
        for (let c = 1; c <= ws3Headers.length; c++) {
          row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        }
      }
    });

    // Total row
    const totalCostRow = ws3.getRow(4 + projectRows.length + 1);
    ws3.mergeCells(4 + projectRows.length + 1, 1, 4 + projectRows.length + 1, 4);
    totalCostRow.getCell(1).value = "TOTAL LABOUR COST";
    totalCostRow.getCell(1).font = { bold: true, size: 12, color: { argb: HEADER_FG } };
    totalCostRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    totalCostRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
    totalCostRow.getCell(5).value = projectRows.reduce((s, p) => s + p.cost, 0);
    totalCostRow.getCell(5).numFmt = currencyFmt;
    totalCostRow.getCell(5).font = { bold: true, size: 12, color: { argb: HEADER_FG } };
    totalCostRow.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    totalCostRow.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
    totalCostRow.height = 28;
    applyBorders(totalCostRow, ws3Headers.length);

    // Column widths
    [28, 20, 16, 20, 20].forEach((w, i) => { ws3.getColumn(i + 1).width = w; });

    /* ── Serialize & return ──────────────────────────────────── */
    const buffer = await wb.xlsx.writeBuffer();
    const u8 = new Uint8Array(buffer as ArrayBuffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + chunk)) as any);
    }
    const base64 = btoa(binary);

    return {
      filename: `sitecrew-report-${data.year}-${String(data.month).padStart(2, "0")}.xlsx`,
      base64,
      rowCount: workerRows.length,
    };
  });
