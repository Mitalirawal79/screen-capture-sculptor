import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  listProjectsWithStats,
  getProjectAssignedWorkers,
  getAttendanceForProjectDay,
  getAttendanceMatrix,
  listWorkersWithStats,
} from "@/lib/stats.functions";
import {
  upsertAttendance,
  bulkUpsertAttendance,
  listProjectWorkAreas,
  clearAttendance,
  getAttendanceForDay,
} from "@/lib/attendance.functions";
import { assignWorker } from "@/lib/projects.functions";
import { ATTENDANCE_LABEL, type AttendanceType } from "@/lib/wages";
import { toast } from "sonner";
import {
  Calendar,
  ArrowLeft,
  HardHat,
  ChevronRight,
  UserPlus,
  Sparkles,
  MapPin,
  Plus,
  Trash2,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

interface WorkerType {
  id: string;
  full_name: string;
  worker_type: string | null;
  daily_wage: string | number;
  status: string;
  assignedProjects?: string[];
  monthDays?: number;
  monthEarnings?: number;
}

interface AttendanceRow {
  worker_id: string;
  type: AttendanceType;
  work_area: string | null;
}

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendancePage,
});

const TYPES: AttendanceType[] = ["full", "half", "overtime", "absent"];

function AttendancePage() {
  const [projectId, setProjectId] = useState<string | null>(null);

  return projectId ? (
    <ProjectAttendance projectId={projectId} onBack={() => setProjectId(null)} />
  ) : (
    <ProjectPicker onPick={setProjectId} />
  );
}

function ProjectPicker({ onPick }: { onPick: (id: string) => void }) {
  const fn = useServerFn(listProjectsWithStats);
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", "stats"],
    queryFn: () => fn(),
  });
  const active = projects.filter((p) => p.status === "active" || p.status === "planning");

  return (
    <div className="space-y-4">
      <Card className="p-4 glass flex items-center gap-3">
        <HardHat className="size-5 text-primary" />
        <div>
          <p className="font-medium text-sm">Select project</p>
          <p className="text-xs text-muted-foreground">
            Mark attendance for workers assigned to this site.
          </p>
        </div>
      </Card>

      {active.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">
          No active projects. Create a project and assign workers first.
        </Card>
      ) : (
        <Card className="divide-y">
          {active.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p.id)}
              className="w-full text-left p-4 hover:bg-accent/40 transition-colors flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground truncate">{p.location || "—"}</p>
                <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                  {p.assignedCount} assigned · {p.presentToday} present today
                </p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}

function ProjectAttendance({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const qc = useQueryClient();

  const workersFn = useServerFn(getProjectAssignedWorkers);
  const dayFn = useServerFn(getAttendanceForProjectDay);
  const upsertFn = useServerFn(upsertAttendance);
  const bulkUpsertFn = useServerFn(bulkUpsertAttendance);
  const projectsFn = useServerFn(listProjectsWithStats);
  const listAllWorkersWithStatsFn = useServerFn(listWorkersWithStats);
  const assignFn = useServerFn(assignWorker);
  const areasFn = useServerFn(listProjectWorkAreas);
  const clearAttendanceFn = useServerFn(clearAttendance);
  const getAttendanceForDayFn = useServerFn(getAttendanceForDay);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", "stats"],
    queryFn: () => projectsFn(),
  });
  const project = projects.find((p) => p.id === projectId);
  const { data: recentAreas = [] } = useQuery({
    queryKey: ["work-areas", projectId],
    queryFn: () => areasFn({ data: { project_id: projectId } }),
  });

  const { data: workers = [] } = useQuery({
    queryKey: ["project-workers", projectId, date],
    queryFn: () => workersFn({ data: { project_id: projectId, date } }),
  });
  const { data: dayRows = [] } = useQuery({
    queryKey: ["attendance", projectId, date],
    queryFn: () => dayFn({ data: { project_id: projectId, date } }),
  });
  const byWorker = new Map<string, { type: AttendanceType; work_area: string | null }>(
    dayRows.map((r) => [r.worker_id, { type: r.type as AttendanceType, work_area: r.work_area }]),
  );

  // Yesterday's reference
  const selectedDate = new Date(date + "T00:00:00");
  selectedDate.setDate(selectedDate.getDate() - 1);
  const yesterdayStr = selectedDate.toISOString().slice(0, 10);
  const { data: yesterdayRows = [] } = useQuery({
    queryKey: ["attendance", projectId, yesterdayStr],
    queryFn: () => dayFn({ data: { project_id: projectId, date: yesterdayStr } }),
  });
  const yesterdayByWorker = new Map<string, { type: AttendanceType; work_area: string | null }>(
    yesterdayRows.map((r) => [
      r.worker_id,
      { type: r.type as AttendanceType, work_area: r.work_area },
    ]),
  );

  const [bulkArea, setBulkArea] = useState<string>("");

  const { data: allWorkersWithStats = [] } = useQuery({
    queryKey: ["workers", "stats"],
    queryFn: () => listAllWorkersWithStatsFn(),
  });
  const workerIdsOnSite = new Set((workers as { id: string }[]).map((w) => w.id));
  const addableWorkers = (allWorkersWithStats as WorkerType[]).filter(
    (w) => w.status === "active" && !workerIdsOnSite.has(w.id),
  );

  // Query all today's attendance across all projects to prevent duplicates
  const { data: allTodayAtt = [] } = useQuery({
    queryKey: ["all-attendance", date],
    queryFn: () => getAttendanceForDayFn({ data: { date } }),
  });
  const todayAttMap = new Map(allTodayAtt.map((r) => [r.worker_id, r.project_id]));

  // State to track unmarked/unselected worker IDs in the current session
  const [unmarkedWorkerIds, setUnmarkedWorkerIds] = useState<Set<string>>(new Set());

  // Reset unmarked workers when project or date changes
  const [lastDateProject, setLastDateProject] = useState("");
  useEffect(() => {
    const key = `${date}_${projectId}`;
    if (key !== lastDateProject) {
      setUnmarkedWorkerIds(new Set());
      setLastDateProject(key);
    }
  }, [date, projectId, lastDateProject]);

  // Mutation to initialize the default team in today's attendance (default to 'absent')
  const initAttendance = useMutation({
    mutationFn: (workersToInit: { id: string }[]) =>
      bulkUpsertFn({
        data: {
          date,
          project_id: projectId,
          work_area: null,
          workers: workersToInit.map((w) => ({
            worker_id: w.id,
            type: "absent" as AttendanceType,
            work_area: null,
          })),
        },
      }),
    onSuccess: (_, workersToInit) => {
      setUnmarkedWorkerIds(new Set(workersToInit.map((w) => w.id)));
      qc.invalidateQueries({ queryKey: ["attendance", projectId, date] });
      qc.invalidateQueries({ queryKey: ["project-workers", projectId, date] });
      qc.invalidateQueries({ queryKey: ["all-attendance", date] });
    },
  });

  // Preload default team as unmarked if today's attendance is empty
  useEffect(() => {
    if (workers.length > 0 && dayRows.length === 0 && !initAttendance.isPending) {
      initAttendance.mutate(workers);
    }
  }, [workers, dayRows, date, projectId, initAttendance]);

  const mark = useMutation({
    mutationFn: (vars: { worker_id: string; type: AttendanceType; work_area?: string | null }) =>
      upsertFn({ data: { ...vars, date, project_id: projectId } }),
    onMutate: async ({ worker_id, type, work_area }) => {
      await qc.cancelQueries({ queryKey: ["attendance", projectId, date] });
      const prev = qc.getQueryData<AttendanceRow[]>(["attendance", projectId, date]) ?? [];
      const existing = prev.find((r) => r.worker_id === worker_id);
      const nextArea = work_area !== undefined ? work_area : (existing?.work_area ?? null);
      const next = [
        ...prev.filter((r) => r.worker_id !== worker_id),
        { worker_id, type, work_area: nextArea },
      ];
      qc.setQueryData(["attendance", projectId, date], next);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(["attendance", projectId, date], ctx?.prev);
      toast.error("Couldn't save");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["attendance", projectId, date] });
      qc.invalidateQueries({ queryKey: ["all-attendance", date] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["projects", "stats"] });
      qc.invalidateQueries({ queryKey: ["work-areas", projectId] });
    },
  });

  const markAllFull = useMutation({
    mutationFn: () =>
      bulkUpsertFn({
        data: {
          date,
          project_id: projectId,
          work_area: bulkArea || null,
          workers: (workers as { id: string }[]).map((w) => {
            const cur = byWorker.get(w.id);
            return {
              worker_id: w.id,
              type: "full" as AttendanceType,
              work_area: (cur?.work_area ?? bulkArea) || null,
            };
          }),
        },
      }),
    onSuccess: () => {
      // Clear unmarked state for all workers when bulk-marking
      setUnmarkedWorkerIds((prev) => {
        const next = new Set(prev);
        for (const w of workers) {
          next.delete(w.id);
        }
        return next;
      });
      qc.invalidateQueries({ queryKey: ["attendance", projectId, date] });
      qc.invalidateQueries({ queryKey: ["all-attendance", date] });
      qc.invalidateQueries({ queryKey: ["projects", "stats"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["work-areas", projectId] });
      toast.success("Marked all as Full Day");
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't save bulk attendance"),
  });

  const assign = useMutation({
    mutationFn: (worker_id: string) => assignFn({ data: { project_id: projectId, worker_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-workers", projectId] });
      qc.invalidateQueries({ queryKey: ["workers", "stats"] });
      qc.invalidateQueries({ queryKey: ["projects", "stats"] });
      toast.success("Worker assigned to project");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Mutation to remove a worker from today's workforce (deletes the attendance record)
  const removeMutation = useMutation({
    mutationFn: (worker_id: string) => clearAttendanceFn({ data: { worker_id, date } }),
    onMutate: async (worker_id) => {
      await qc.cancelQueries({ queryKey: ["attendance", projectId, date] });
      const prev = qc.getQueryData<AttendanceRow[]>(["attendance", projectId, date]) ?? [];
      const next = prev.filter((r) => r.worker_id !== worker_id);
      qc.setQueryData(["attendance", projectId, date], next);

      setUnmarkedWorkerIds((prevSet) => {
        const nextSet = new Set(prevSet);
        nextSet.delete(worker_id);
        return nextSet;
      });

      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(["attendance", projectId, date], ctx?.prev);
      toast.error("Couldn't remove worker");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["attendance", projectId, date] });
      qc.invalidateQueries({ queryKey: ["project-workers", projectId, date] });
      qc.invalidateQueries({ queryKey: ["all-attendance", date] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["projects", "stats"] });
    },
  });

  const present = dayRows.filter((r) => r.type !== "absent").length;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
        <ArrowLeft className="size-4" /> Change project
      </Button>

      <Card className="p-4 glass">
        <div className="flex items-center gap-3 mb-3">
          <HardHat className="size-5 text-primary" />
          <div className="min-w-0">
            <p className="font-medium truncate">{project?.name ?? "Project"}</p>
            <p className="text-xs text-muted-foreground truncate">{project?.location || "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Calendar className="size-4 text-muted-foreground" />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1"
          />
          <Badge variant="secondary" className="tabular-nums">
            {present}/{workers.length}
          </Badge>
        </div>
      </Card>

      {workers.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">
          No workers on this site yet. Add workers from the list below to build today's workforce.
        </Card>
      ) : (
        <div className="space-y-3">
          <WorkAreaBulkRow value={bulkArea} onChange={setBulkArea} recent={recentAreas} />

          <Button
            variant="outline"
            className="w-full gap-2 hover:bg-accent border-primary/20 text-xs font-semibold py-5"
            onClick={() => markAllFull.mutate()}
            disabled={markAllFull.isPending || workers.length === 0}
          >
            <Sparkles className="size-3.5 text-primary" />
            {markAllFull.isPending
              ? "Saving..."
              : `Mark All Full Day${bulkArea ? ` · ${bulkArea}` : ""}`}
          </Button>

          <div className="space-y-2">
            {(workers as WorkerType[]).map((w) => {
              const current = byWorker.get(w.id);
              const yest = yesterdayByWorker.get(w.id);
              const effectiveArea = current?.work_area ?? bulkArea ?? "";
              const isUnmarked = unmarkedWorkerIds.has(w.id) || !current;

              return (
                <Card key={w.id} className="p-3">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{w.full_name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <span>{w.worker_type || "Worker"}</span>
                        {yest && (
                          <span className="text-[10px] text-muted-foreground/85 bg-accent/60 px-1 py-0.2 rounded font-normal tabular-nums">
                            Yesterday: {ATTENDANCE_LABEL[yest.type]}
                            {yest.work_area ? ` · ${yest.work_area}` : ""}
                          </span>
                        )}
                      </p>
                    </div>
                    <WorkAreaPicker
                      value={effectiveArea}
                      recent={recentAreas}
                      onChange={(area) =>
                        mark.mutate({
                          worker_id: w.id,
                          type: current?.type ?? "absent",
                          work_area: area || null,
                        })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {TYPES.map((t) => {
                      const isSelected = !isUnmarked && current?.type === t;
                      return (
                        <button
                          key={t}
                          onClick={() => {
                            setUnmarkedWorkerIds((prev) => {
                              const next = new Set(prev);
                              next.delete(w.id);
                              return next;
                            });
                            mark.mutate({
                              worker_id: w.id,
                              type: t,
                              work_area: current?.work_area ?? bulkArea ?? null,
                            });
                          }}
                          className={`tap-target rounded-md text-xs font-medium px-1 py-2 border transition-colors ${
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background hover:bg-accent border-border"
                          }`}
                        >
                          {ATTENDANCE_LABEL[t]}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => removeMutation.mutate(w.id)}
                      disabled={removeMutation.isPending}
                      className={`tap-target rounded-md text-xs font-medium px-1 py-2 border transition-colors flex items-center justify-center gap-1 ${
                        removeMutation.isPending && removeMutation.variables === w.id
                          ? "bg-destructive text-destructive-foreground border-destructive"
                          : "bg-background border-destructive text-destructive hover:bg-destructive/10"
                      }`}
                    >
                      <Trash2 className="size-3.5" />
                      Remove
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {addableWorkers.length > 0 && (
        <section className="space-y-2 mt-6 border-t pt-4">
          <div className="flex items-center gap-2 mb-2">
            <UserPlus className="size-3.5 text-muted-foreground" />
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Add worker to this site ({addableWorkers.length})
            </h3>
          </div>
          <p className="text-[11px] text-muted-foreground mb-2">
            Workers move freely between sites — adding here only logs them on {date}.
          </p>
          <div className="space-y-2">
            {addableWorkers.map((w) => {
              const existingProjId = todayAttMap.get(w.id);
              const isAlreadyAddedElsewhere = !!existingProjId && existingProjId !== projectId;
              const existingProjName = isAlreadyAddedElsewhere
                ? projects.find((p) => p.id === existingProjId)?.name || "another site"
                : "";

              return (
                <Card key={w.id} className="p-3 bg-muted/40 border-dashed">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{w.full_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {w.worker_type || "Worker"}
                        {isAlreadyAddedElsewhere ? (
                          <span className="text-destructive font-medium block mt-0.5">
                            Already added to {existingProjName} today
                          </span>
                        ) : w.assignedProjects && w.assignedProjects.length > 0 ? (
                          ` · Default: ${w.assignedProjects.join(", ")}`
                        ) : (
                          " · No default site"
                        )}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => {
                        setUnmarkedWorkerIds((prev) => {
                          const next = new Set(prev);
                          next.add(w.id);
                          return next;
                        });
                        mark.mutate({
                          worker_id: w.id,
                          type: "absent",
                          work_area: bulkArea || null,
                        });
                      }}
                      disabled={mark.isPending || isAlreadyAddedElsewhere}
                    >
                      <Plus className="size-3.5 mr-1" />
                      Add to Site
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

const DEFAULT_AREAS = ["Bedroom", "Hall", "Kitchen", "Bath", "Plumbing", "Electrical"];

function mergeAreas(recent: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of [...recent, ...DEFAULT_AREAS]) {
    const v = (a || "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= 8) break;
  }
  return out;
}

function WorkAreaBulkRow({
  value,
  onChange,
  recent,
}: {
  value: string;
  onChange: (v: string) => void;
  recent: string[];
}) {
  const areas = mergeAreas(recent);
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="size-3.5 text-primary" />
        <p className="text-xs font-medium">Default work area for the day</p>
        {value && (
          <button
            className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => onChange("")}
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {areas.map((a) => (
          <button
            key={a}
            onClick={() => onChange(a)}
            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
              value === a
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-accent border-border"
            }`}
          >
            {a}
          </button>
        ))}
        <CustomAreaInput
          onAdd={(v) => onChange(v)}
          trigger={
            <button className="text-xs px-2 py-1 rounded-full border border-dashed border-border hover:bg-accent text-muted-foreground inline-flex items-center gap-1">
              <Plus className="size-3" /> Custom
            </button>
          }
        />
      </div>
    </Card>
  );
}

function WorkAreaPicker({
  value,
  recent,
  onChange,
}: {
  value: string;
  recent: string[];
  onChange: (v: string) => void;
}) {
  const areas = mergeAreas(recent);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`shrink-0 text-[11px] px-2 py-1 rounded-md border inline-flex items-center gap-1 max-w-[140px] truncate ${
            value
              ? "bg-accent/60 border-border text-foreground"
              : "border-dashed border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">{value || "Set area"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Work area
        </p>
        <div className="flex flex-wrap gap-1.5">
          {areas.map((a) => (
            <button
              key={a}
              onClick={() => onChange(a)}
              className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                value === a
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-accent border-border"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
        <CustomAreaInput
          onAdd={(v) => onChange(v)}
          trigger={
            <button className="text-xs w-full px-2 py-1.5 rounded-md border border-dashed border-border hover:bg-accent text-muted-foreground inline-flex items-center justify-center gap-1">
              <Plus className="size-3" /> Add custom area
            </button>
          }
        />
        {value && (
          <button
            onClick={() => onChange("")}
            className="text-xs w-full px-2 py-1.5 rounded-md hover:bg-accent text-muted-foreground"
          >
            Clear area
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function CustomAreaInput({
  onAdd,
  trigger,
}: {
  onAdd: (v: string) => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="flex gap-1.5">
          <Input
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="e.g. Interior, 2F"
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && val.trim()) {
                onAdd(val.trim());
                setVal("");
                setOpen(false);
              }
            }}
          />
          <Button
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => {
              if (!val.trim()) return;
              onAdd(val.trim());
              setVal("");
              setOpen(false);
            }}
          >
            Add
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
