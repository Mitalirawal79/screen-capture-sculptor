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
