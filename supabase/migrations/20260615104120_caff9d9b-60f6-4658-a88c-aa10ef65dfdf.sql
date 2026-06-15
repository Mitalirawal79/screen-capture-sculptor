ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS work_area text;
CREATE INDEX IF NOT EXISTS idx_attendance_work_area ON public.attendance(project_id, work_area);