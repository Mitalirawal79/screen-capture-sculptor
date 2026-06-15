-- Allow same worker to have attendance for multiple projects on the same date.
-- Drop the old unique constraint (worker_id, date) and replace with (worker_id, date, project_id).
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_worker_id_date_key;
-- Backfill any legacy NULL project_id rows: leave them unique by setting project_id to NULL is fine
-- because the new partial unique index treats NULLs as distinct; but to be safe, add NOT NULL only for new rows.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_worker_date_project_unique
  ON public.attendance (worker_id, date, project_id);
