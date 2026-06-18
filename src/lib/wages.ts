// Wage calculation rules — kept pure so server + client can share.
export type AttendanceType = "absent" | "half" | "full" | "overtime";

export const ATTENDANCE_MULTIPLIER: Record<AttendanceType, number> = {
  absent: 0,
  half: 0.5,
  full: 1,
  // Overtime = 1.5x the full-day wage (e.g. ₹1000/day → ₹1500 OT)
  overtime: 1.5,
};

export function wageFor(type: AttendanceType, dailyWage: number): number {
  return Math.round(ATTENDANCE_MULTIPLIER[type] * Number(dailyWage) * 100) / 100;
}

export const ATTENDANCE_LABEL: Record<AttendanceType, string> = {
  absent: "Absent",
  half: "Half day",
  full: "Full day",
  overtime: "Overtime",
};

export const ATTENDANCE_SHORT: Record<AttendanceType, string> = {
  absent: "A",
  half: "½",
  full: "F",
  overtime: "OT",
};

/**
 * Safely extracts the day number (1-31) from a date string of format YYYY-MM-DD.
 * Safe from timezone offset errors associated with Date parsing.
 */
export function getDayFromDateString(dateStr: string): number {
  if (!dateStr || typeof dateStr !== "string") return 1;
  const parts = dateStr.slice(0, 10).split("-");
  return Number(parts[2] || 1);
}

/**
 * Calculates rounded earnings for a list of attendance records.
 * Groups records by project and month (YYYY-MM-project_id) to apply the consistent
 * rounding strategy across all screens, preventing cumulative rounding errors.
 */
export function calculateGroupedEarnings(
  records: { type: string; date: string; project_id: string | null }[],
  dailyWage: number,
): number {
  const groups = new Map<string, number>();
  for (const r of records) {
    if (!r.date || !r.project_id) continue;
    const monthStr = r.date.slice(0, 7); // "YYYY-MM"
    const key = `${monthStr}_${r.project_id}`;
    const wage = wageFor(r.type as AttendanceType, dailyWage);
    groups.set(key, (groups.get(key) ?? 0) + wage);
  }
  let total = 0;
  for (const val of groups.values()) {
    total += Math.round(val);
  }
  return total;
}
