# SiteCrew Contractor Upgrade Plan

Goal: turn SiteCrew into a project-first workforce system without changing the visual style, navigation, auth, or wage logic. Reuse the existing `wages.ts` calculation, current cards, dialogs, and color tokens.

## What's already there (reused as-is)

- `workers`, `projects`, `project_workers`, `attendance` (with `project_id`), `payments`, `activity_log`, `project_quotations`, `project_updates` tables.
- `wageFor()` logic (Full=1x, Half=0.5x, Overtime=1.5x — preserved).
- Existing routes: Dashboard, Workers, Projects, Attendance, Reports. No new top-level navigation.

## 1. Data layer

- No migration needed (schema already supports project-linked attendance via `attendance.project_id`).
- Add indexes only if missing on `attendance(project_id, date)` and `project_workers(project_id)` (migration if needed).

## 2. New / extended server functions

- `projects.functions.ts`
  - `listProjectsWithStats()` → for each project: assigned count, present-today count, monthly labour cost.
  - `getProjectStats(id)` → assigned, present today, absent today, monthly labour cost, per-worker breakdown (days, earnings).
- `workers.functions.ts`
  - `listWorkersWithStats()` → assigned projects (names), monthly attendance count, monthly earnings.
  - `getWorkerStats(id, month)` → full/half/OT/absent counts, total earnings, paid, pending, active assignments.
- `dashboard.functions.ts`
  - Extend `getDashboard` with: activeProjects, totalWorkers, presentToday, monthLabourCost, insights (top project by cost, most active project, top earning worker, lowest attendance worker), per-project site status array.
- `attendance.functions.ts`
  - `getProjectAssignedWorkers(project_id)` → only active assignments.
  - `getAttendanceForProjectDay(project_id, date)`.
  - Existing `upsertAttendance` already accepts `project_id` — enforce it from UI.
- `reports.functions.ts`
  - Filters: month, year, project_id?, worker_id?.
  - Workforce summary, attendance calendar matrix (P/H/O/A), labour cost report per project.

## 3. UI changes (extend existing components, same styling)

- **Dashboard (`_authenticated/index.tsx`)**: replace metric cards with Active Projects / Total Workers / Today's Attendance / Monthly Labour Cost. Add "Site Status" list (one card per active project: assigned, present today, monthly cost). Add Insights section (4 small cards). Keep existing Quick Actions, add Add Project + Assign Worker shortcuts.
- **Workers list**: each card adds assigned project chips, this-month attendance count, this-month earnings.
- **Worker detail**: add "Assigned Projects" section, "Attendance Statistics" (F/H/OT/A counts), "Financial Summary" (earnings / paid / pending). Current-month default with month picker.
- **Projects list**: cards show assigned worker count + monthly labour cost alongside progress.
- **Project detail**: add Assigned Workers section with Assign/Remove (bottom-sheet dialog of available workers), Project Statistics (assigned / present today / absent today / monthly cost), Labour Cost Breakdown table (worker, days, earnings).
- **Attendance flow**: turn into 2-step project-first flow.
  - Step 1: project picker (cards of active projects).
  - Step 2: show only that project's assigned workers; mark F/H/OT/A. Saves with `project_id`.
  - Back button to switch project.
- **Reports**: add Project + Worker filter dropdowns alongside existing month/year. Three report tabs/sections: Workforce Summary, Attendance Calendar (matrix), Labour Cost per Project. XLSX export reuses existing styled exporter.

## 4. Preserved

- Auth, Supabase client setup, routes, root layout, design tokens, mobile-first Tailwind classes, existing dialogs and edit buttons, wage formula, XLSX header style.

## Technical notes

- All new aggregations are server-side via `createServerFn` + `requireSupabaseAuth` (RLS enforced).
- Stats use single queries with in-memory grouping (cheap at contractor scale).
- TanStack Query keys: `["dashboard"]`, `["projects","stats"]`, `["project",id,"stats"]`, `["workers","stats"]`, `["worker",id,"stats",month]`, `["attendance",projectId,date]`.
- No new packages.

## Out of scope (ask if needed)

- Push notifications, role-based access beyond current contractor login, project budget alerts, payroll exports beyond current XLSX.
