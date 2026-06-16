import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listProjectsWithStats, getProjectAssignedWorkers, getAttendanceForProjectDay, getAttendanceMatrix, listWorkersWithStats } from "@/lib/stats.functions";
import { upsertAttendance, bulkUpsertAttendance, listProjectWorkAreas } from "@/lib/attendance.functions";
import { assignWorker } from "@/lib/projects.functions";
import { ATTENDANCE_LABEL, type AttendanceType } from "@/lib/wages";
import { toast } from "sonner";
import { Calendar, ArrowLeft, HardHat, ChevronRight, UserPlus, Sparkles, MapPin, Plus } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendancePage,
});

const TYPES: AttendanceType[] = ["full", "half", "overtime", "absent"];

function AttendancePage() {
  const [projectId, setProjectId] = useState<string | null>(null);

  return projectId
    ? <ProjectAttendance projectId={projectId} onBack={() => setProjectId(null)} />
    : <ProjectPicker onPick={setProjectId} />;
}

function ProjectPicker({ onPick }: { onPick: (id: string) => void }) {
  const fn = useServerFn(listProjectsWithStats);
  const { data: projects = [] } = useQuery({ queryKey: ["projects", "stats"], queryFn: () => fn() });
  const active = projects.filter((p) => p.status === "active" || p.status === "planning");

  return (
    <div className="space-y-4">
      <Card className="p-4 glass flex items-center gap-3">
        <HardHat className="size-5 text-primary" />
        <div>
          <p className="font-medium text-sm">Select project</p>
          <p className="text-xs text-muted-foreground">Mark attendance for workers assigned to this site.</p>
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

  const { data: projects = [] } = useQuery({ queryKey: ["projects", "stats"], queryFn: () => projectsFn() });
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
  const byWorker = new Map(
    dayRows.map((r) => [r.worker_id, { type: r.type as AttendanceType, work_area: (r as any).work_area as string | null }]),
  );

  // Yesterday's reference
  const selectedDate = new Date(date + "T00:00:00");
  selectedDate.setDate(selectedDate.getDate() - 1);
  const yesterdayStr = selectedDate.toISOString().slice(0, 10);
  const { data: yesterdayRows = [] } = useQuery({
    queryKey: ["attendance", projectId, yesterdayStr],
    queryFn: () => dayFn({ data: { project_id: projectId, date: yesterdayStr } }),
  });
  const yesterdayByWorker = new Map(
    yesterdayRows.map((r) => [r.worker_id, { type: r.type as AttendanceType, work_area: (r as any).work_area as string | null }]),
  );

  const [bulkArea, setBulkArea] = useState<string>("");

  const { data: allWorkersWithStats = [] } = useQuery({
    queryKey: ["workers", "stats"],
    queryFn: () => listAllWorkersWithStatsFn(),
  });
  const workerIdsOnSite = new Set(workers.map((w: any) => w.id));
  const addableWorkers = allWorkersWithStats.filter(
    (w: any) => w.status === "active" && !workerIdsOnSite.has(w.id),
  );


  const mark = useMutation({
    mutationFn: (vars: { worker_id: string; type: AttendanceType; work_area?: string | null }) =>
      upsertFn({ data: { ...vars, date, project_id: projectId } }),
    onMutate: async ({ worker_id, type, work_area }) => {
      await qc.cancelQueries({ queryKey: ["attendance", projectId, date] });
      const prev = qc.getQueryData<any[]>(["attendance", projectId, date]) ?? [];
      const existing = prev.find((r) => r.worker_id === worker_id);
      const nextArea = work_area !== undefined ? work_area : existing?.work_area ?? null;
      const next = [...prev.filter((r) => r.worker_id !== worker_id), { worker_id, type, work_area: nextArea }];
      qc.setQueryData(["attendance", projectId, date], next);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(["attendance", projectId, date], ctx?.prev);
      toast.error("Couldn't save");
    },
    onSettled: () => {
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
          workers: workers.map((w: any) => {
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
      qc.invalidateQueries({ queryKey: ["attendance", projectId, date] });
      qc.invalidateQueries({ queryKey: ["projects", "stats"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["work-areas", projectId] });
      toast.success("Marked all as Full Day");
    },
    onError: (e: any) => toast.error(e.message || "Couldn't save bulk attendance"),
  });

  const assign = useMutation({
    mutationFn: (worker_id: string) => assignFn({ data: { project_id: projectId, worker_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-workers", projectId] });
      qc.invalidateQueries({ queryKey: ["workers", "stats"] });
      qc.invalidateQueries({ queryKey: ["projects", "stats"] });
      toast.success("Worker assigned to project");
    },
    onError: (e: any) => toast.error(e.message),
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
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1" />
          <Badge variant="secondary" className="tabular-nums">{present}/{workers.length}</Badge>
        </div>
      </Card>

      {workers.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">
          No workers on this site yet. Add workers from the list below to build today's workforce.
        </Card>
      ) : (
        <div className="space-y-3">
          <WorkAreaBulkRow
            value={bulkArea}
            onChange={setBulkArea}
            recent={recentAreas}
          />

          <Button
            variant="outline"
            className="w-full gap-2 hover:bg-accent border-primary/20 text-xs font-semibold py-5"
            onClick={() => markAllFull.mutate()}
            disabled={markAllFull.isPending || workers.length === 0}
          >
            <Sparkles className="size-3.5 text-primary" />
            {markAllFull.isPending ? "Saving..." : `Mark All Full Day${bulkArea ? ` · ${bulkArea}` : ""}`}
          </Button>

          <div className="space-y-2">
            {workers.map((w: any) => {
              const current = byWorker.get(w.id);
              const yest = yesterdayByWorker.get(w.id);
              const effectiveArea = current?.work_area ?? bulkArea ?? "";
              return (
                <Card key={w.id} className="p-3">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{w.full_name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <span>{w.worker_type || "Worker"}</span>
                        {yest && (
                          <span className="text-[10px] text-muted-foreground/85 bg-accent/60 px-1 py-0.2 rounded font-normal tabular-nums">
                            Yesterday: {ATTENDANCE_LABEL[yest.type]}{yest.work_area ? ` · ${yest.work_area}` : ""}
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
                          type: current?.type ?? "full",
                          work_area: area || null,
                        })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {TYPES.map((t) => (
                      <button
                        key={t}
                        onClick={() =>
                          mark.mutate({
                            worker_id: w.id,
                            type: t,
                            work_area: current?.work_area ?? bulkArea ?? null,
                          })
                        }
                        className={`tap-target rounded-md text-xs font-medium px-1 py-2 border transition-colors ${
                          current?.type === t
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-accent border-border"
                        }`}
                      >
                        {ATTENDANCE_LABEL[t]}
                      </button>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {unassignedWorkers.length > 0 && (
        <section className="space-y-2 mt-6 border-t pt-4">
          <div className="flex items-center gap-2 mb-2">
            <UserPlus className="size-3.5 text-muted-foreground" />
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Unassigned Workers ({unassignedWorkers.length})</h3>
          </div>
          <div className="space-y-2">
            {unassignedWorkers.map((w: any) => (
              <Card key={w.id} className="p-3 bg-muted/40 border-dashed">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{w.full_name}</p>
                    <p className="text-xs text-destructive font-medium mt-0.5">This worker is not assigned to any project.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => assign.mutate(w.id)}
                    disabled={assign.isPending}
                  >
                    <UserPlus className="size-3.5 mr-1" />
                    Assign
                  </Button>
                </div>
              </Card>
            ))}
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
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Work area</p>
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
