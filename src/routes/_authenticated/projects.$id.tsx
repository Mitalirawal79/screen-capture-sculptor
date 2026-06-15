import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Plus, Trash2, Milestone, MessageSquare, UserPlus, FileText,
  Upload, Download, Image as ImageIcon, History, Activity,
  HardHat, Users, Banknote, CheckCircle2, XCircle, CalendarCheck,
  ClipboardList, ChevronRight, Phone,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  getProject,
  updateProject,
  deleteProject,
  addProjectUpdate,
  assignWorker,
  unassignWorker,
  getSignedFileUrl,
} from "@/lib/projects.functions";
import { listWorkers } from "@/lib/workers.functions";
import { getProjectStats } from "@/lib/stats.functions";
import { getProjectWorkAreaCosts } from "@/lib/attendance.functions";
import { generateMonthlyReport } from "@/lib/reports.functions";
import { recordQuotation, deleteQuotation } from "@/lib/quotations.functions";
import { uploadProjectFile } from "@/lib/upload";
import { EditProjectButton } from "@/components/edit-project-dialog";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  component: ProjectPage,
});

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
};

const STATUS_COLOR: Record<string, string> = {
  planning: "secondary",
  active: "default",
  on_hold: "secondary",
  completed: "secondary",
};

function ProjectPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getFn = useServerFn(getProject);
  const updateFn = useServerFn(updateProject);
  const delFn = useServerFn(deleteProject);
  const addNoteFn = useServerFn(addProjectUpdate);
  const assignFn = useServerFn(assignWorker);
  const unassignFn = useServerFn(unassignWorker);
  const workersFn = useServerFn(listWorkers);
  const statsFn = useServerFn(getProjectStats);
  const reportFn = useServerFn(generateMonthlyReport);

  const { data } = useQuery({ queryKey: ["project", id], queryFn: () => getFn({ data: { id } }) });
  const { data: workers = [] } = useQuery({ queryKey: ["workers"], queryFn: () => workersFn() });
  const { data: stats } = useQuery({ queryKey: ["project-stats", id], queryFn: () => statsFn({ data: { id } }) });
  const areaCostsFn = useServerFn(getProjectWorkAreaCosts);
  const { data: areaCosts = [] } = useQuery({
    queryKey: ["project-area-costs", id],
    queryFn: () => areaCostsFn({ data: { project_id: id } }),
  });

  const [reportBusy, setReportBusy] = useState(false);

  const update = useMutation({
    mutationFn: (patch: any) => updateFn({ data: { id, ...patch } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/projects" });
    },
  });

  const addNote = useMutation({
    mutationFn: (v: { note: string; is_milestone: boolean; photo_path?: string | null }) =>
      addNoteFn({ data: { project_id: id, ...v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", id] }),
  });

  const assign = useMutation({
    mutationFn: (worker_id: string) => assignFn({ data: { project_id: id, worker_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["project-stats", id] });
      toast.success("Worker assigned");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const unassign = useMutation({
    mutationFn: (worker_id: string) => unassignFn({ data: { project_id: id, worker_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["project-stats", id] });
      toast.success("Worker removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function handleDownloadReport() {
    setReportBusy(true);
    try {
      const now = new Date();
      const result = await reportFn({
        data: {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          project_id: id,
          worker_id: null,
        },
      });
      const link = document.createElement("a");
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.base64}`;
      link.download = result.filename;
      link.click();
      toast.success("Report downloaded");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate report");
    } finally {
      setReportBusy(false);
    }
  }

  if (!data) return null;
  const { project, assignments, updates, quotations, activity } = data as any;
  const assignedIds = new Set(assignments.map((a: any) => a.worker_id));
  const unassigned = workers.filter((w) => !assignedIds.has(w.id));
  const currentQuote = quotations.find((q: any) => q.is_current);

  // Build a lookup of worker stats from the breakdown
  const breakdownMap = new Map((stats?.breakdown ?? []).map((r: any) => [r.worker_id, r]));

  return (
    <div className="space-y-5 pb-6">
      {/* Back nav */}
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/projects"><ArrowLeft className="size-4" /> Projects</Link>
      </Button>

      {/* ── PROJECT HERO ─────────────────────────────────────── */}
      <Card className="p-5 glass">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant={STATUS_COLOR[project.status] as any}>
                {STATUS_LABEL[project.status] ?? project.status}
              </Badge>
              {project.client && (
                <span className="text-xs text-muted-foreground truncate">{project.client}</span>
              )}
            </div>
            <h1 className="text-xl font-bold leading-tight">{project.name}</h1>
            {project.location && (
              <p className="text-sm text-muted-foreground mt-0.5">{project.location}</p>
            )}
            <div className="flex items-center gap-3 mt-3">
              <Progress value={project.progress_pct} className="h-2 flex-1" />
              <span className="text-sm font-semibold tabular-nums text-primary shrink-0">
                {project.progress_pct}%
              </span>
            </div>
            {(project.start_date || project.expected_end) && (
              <p className="text-xs text-muted-foreground mt-2 tabular-nums">
                {project.start_date && <>Start: {project.start_date}</>}
                {project.start_date && project.expected_end && " · "}
                {project.expected_end && <>End: {project.expected_end}</>}
                {Number(project.contract_value) > 0 && (
                  <> · {formatCurrency(project.contract_value)}</>
                )}
              </p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <EditProjectButton project={project} />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => confirm("Delete this project? This cannot be undone.") && del.mutate()}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        </div>

        {/* Inline progress slider */}
        <div className="mt-4 border-t pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Adjust Progress</span>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Status</Label>
              <Select defaultValue={project.status} onValueChange={(v) => update.mutate({ status: v })}>
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Slider
            defaultValue={[project.progress_pct]}
            min={0}
            max={100}
            step={5}
            onValueCommit={(v) => update.mutate({ progress_pct: v[0] })}
          />
        </div>
      </Card>

      {/* ── WORKFORCE SUMMARY ─────────────────────────────────── */}
      {stats && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-0.5">
            Workforce Summary
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<Users className="size-4" />}
              label="Assigned"
              value={formatNumber(stats.assignedCount)}
              sub="workers on site"
            />
            <StatCard
              icon={<CheckCircle2 className="size-4 text-emerald-500" />}
              label="Present Today"
              value={formatNumber(stats.presentToday)}
              sub="marked present"
              tone="success"
            />
            <StatCard
              icon={<XCircle className="size-4 text-amber-500" />}
              label="Absent Today"
              value={formatNumber(stats.absentToday)}
              sub="not marked"
              tone="warning"
            />
            <StatCard
              icon={<Banknote className="size-4 text-primary" />}
              label="Month Labour"
              value={formatCurrency(stats.monthCost)}
              sub="this month"
            />
          </div>
        </section>
      )}

      {/* ── QUICK ACTIONS ─────────────────────────────────────── */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-0.5">
          Quick Actions
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <Link to="/attendance" className="contents">
            <button className="flex flex-col items-center gap-2 rounded-xl border bg-card p-3.5 hover:bg-accent/50 transition-colors tap-target text-center">
              <CalendarCheck className="size-5 text-primary" />
              <span className="text-xs font-medium leading-tight">Mark Attendance</span>
            </button>
          </Link>
          <AssignDialog unassigned={unassigned} onAssign={(wid) => assign.mutate(wid)}>
            <button className="flex flex-col items-center gap-2 rounded-xl border bg-card p-3.5 hover:bg-accent/50 transition-colors tap-target text-center w-full">
              <UserPlus className="size-5 text-primary" />
              <span className="text-xs font-medium leading-tight">Add Worker</span>
            </button>
          </AssignDialog>
          <button
            onClick={handleDownloadReport}
            disabled={reportBusy}
            className="flex flex-col items-center gap-2 rounded-xl border bg-card p-3.5 hover:bg-accent/50 transition-colors tap-target text-center disabled:opacity-50"
          >
            <Download className="size-5 text-primary" />
            <span className="text-xs font-medium leading-tight">
              {reportBusy ? "Generating…" : "Download Report"}
            </span>
          </button>
        </div>
      </section>

      {/* ── WORKERS ON SITE ───────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2 px-0.5">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Workers on Site ({assignments.length})
          </h2>
          <AssignDialog unassigned={unassigned} onAssign={(wid) => assign.mutate(wid)}>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
              <UserPlus className="size-3.5" /> Assign
            </Button>
          </AssignDialog>
        </div>

        {assignments.length === 0 ? (
          <Card className="p-6 text-center">
            <HardHat className="size-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No workers assigned to this site yet.</p>
            <AssignDialog unassigned={unassigned} onAssign={(wid) => assign.mutate(wid)}>
              <Button size="sm" className="mt-3 gap-1">
                <UserPlus className="size-4" /> Assign First Worker
              </Button>
            </AssignDialog>
          </Card>
        ) : (
          <div className="space-y-2">
            {assignments.map((a: any) => {
              const wb = breakdownMap.get(a.worker_id) as any;
              const phone = a.workers?.mobile;
              return (
                <Card key={a.worker_id} className="p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          to="/workers/$id"
                          params={{ id: a.worker_id }}
                          className="font-semibold text-sm hover:underline truncate"
                        >
                          {a.workers?.full_name}
                        </Link>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {a.workers?.worker_type || "Worker"} · {formatCurrency(a.workers?.daily_wage ?? 0)}/day
                      </p>
                      {wb && (
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[11px] bg-accent/70 px-2 py-0.5 rounded font-medium tabular-nums">
                            <CalendarCheck className="size-3 text-muted-foreground" />
                            {wb.days} days this month
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] bg-accent/70 px-2 py-0.5 rounded font-medium tabular-nums text-primary">
                            <Banknote className="size-3" />
                            {formatCurrency(wb.earnings)} earned
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      {phone && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full"
                          asChild
                        >
                          <a href={`tel:${phone}`}>
                            <Phone className="size-4 text-muted-foreground" />
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        onClick={() =>
                          confirm(`Remove ${a.workers?.full_name} from this project?`) &&
                          unassign.mutate(a.worker_id)
                        }
                      >
                        <Trash2 className="size-4 text-destructive/70" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ── LABOUR COST BREAKDOWN ─────────────────────────────── */}
      {stats && stats.breakdown.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-0.5">
            Labour Cost Breakdown
          </h2>
          <Card className="divide-y">
            {stats.breakdown.map((r: any) => (
              <div key={r.worker_id} className="p-3 flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.type || "Worker"} · {r.days} days</p>
                </div>
                <span className="font-semibold tabular-nums text-primary">{formatCurrency(r.earnings)}</span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* ── QUOTATION ─────────────────────────────────────────── */}
      <QuotationsSection projectId={id} quotations={quotations} currentQuote={currentQuote} />

      {/* ── PROGRESS NOTES ────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2 px-0.5">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Progress Notes & Site Photos
          </h2>
          <NoteDialog projectId={id} onAdd={(v) => addNote.mutate(v)} />
        </div>
        <Card className="divide-y">
          {updates.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No updates yet.</p>
          )}
          {updates.map((u: any) => (
            <UpdateRow key={u.id} update={u} />
          ))}
        </Card>
      </section>

      {/* ── ACTIVITY LOG ──────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-2 px-0.5">
          <Activity className="size-3.5 text-muted-foreground" />
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Activity Log
          </h2>
        </div>
        <Card className="divide-y">
          {activity.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No activity yet.</p>
          )}
          {activity.map((a: any) => (
            <div key={a.id} className="p-3 text-sm">
              <p>{a.description || a.action}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(a.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}

/* ── Stat Card ─────────────────────────────────────────────────── */
function StatCard({
  icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "warning";
}) {
  const valueClass = {
    default: "text-primary",
    success: "text-emerald-500",
    warning: "text-amber-500",
  }[tone];
  return (
    <div className="rounded-xl border bg-card p-3.5 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <p className="text-xs font-medium">{label}</p>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/* ── Assign Dialog ─────────────────────────────────────────────── */
function AssignDialog({
  unassigned,
  onAssign,
  children,
}: {
  unassigned: any[];
  onAssign: (id: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Assign worker to project</DialogTitle></DialogHeader>
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {unassigned.length === 0 && (
            <p className="text-sm text-muted-foreground py-3">
              All workers are already assigned to this project.
            </p>
          )}
          {unassigned.map((w) => (
            <button
              key={w.id}
              onClick={() => { onAssign(w.id); setOpen(false); }}
              className="w-full text-left p-3 rounded-md hover:bg-accent text-sm tap-target flex items-center justify-between"
            >
              <div>
                <p className="font-medium">{w.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {w.worker_type || "Worker"} · {formatCurrency(w.daily_wage)}/day
                </p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Quotations Section ────────────────────────────────────────── */
function QuotationsSection({
  projectId,
  quotations,
  currentQuote,
}: {
  projectId: string;
  quotations: any[];
  currentQuote: any;
}) {
  const qc = useQueryClient();
  const recordFn = useServerFn(recordQuotation);
  const delFn = useServerFn(deleteQuotation);
  const urlFn = useServerFn(getSignedFileUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const meta = await uploadProjectFile(file, "quotations", projectId);
      await recordFn({
        data: {
          project_id: projectId,
          file_path: meta.path,
          file_name: meta.name,
          file_type: meta.type || null,
          file_size: meta.size,
        },
      });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      toast.success(currentQuote ? "Quotation replaced" : "Quotation uploaded");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function openFile(path: string) {
    try {
      const { url } = await urlFn({ data: { file_path: path } });
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", projectId] }),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <section>
      <div className="flex items-center justify-between mb-2 px-0.5">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Quotation</h2>
        <div className="flex gap-1">
          {quotations.length > 1 && (
            <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
              <History className="size-4" /> v{quotations.length}
            </Button>
          )}
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Upload className="size-4" /> {currentQuote ? "Replace" : "Upload"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,.xls,.xlsx,.csv,image/*"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      </div>
      <Card className="p-4">
        {!currentQuote ? (
          <p className="text-sm text-muted-foreground">
            No quotation uploaded. Upload PDF, Excel, or image.
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="size-8 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">{currentQuote.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  v{currentQuote.version} · Uploaded {new Date(currentQuote.created_at).toLocaleString()}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => openFile(currentQuote.file_path)}>
              <Download className="size-4" /> Open
            </Button>
          </div>
        )}
      </Card>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Quotation history</DialogTitle></DialogHeader>
          <div className="divide-y max-h-[70vh] overflow-y-auto">
            {quotations.map((q: any) => (
              <div key={q.id} className="py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    v{q.version} · {q.file_name}{" "}
                    {q.is_current && <Badge className="ml-1" variant="secondary">Current</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(q.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => openFile(q.file_path)}>Open</Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => confirm("Delete this version?") && del.mutate(q.id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ── Update Row ────────────────────────────────────────────────── */
function UpdateRow({ update }: { update: any }) {
  const urlFn = useServerFn(getSignedFileUrl);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  async function loadPhoto() {
    if (photoUrl || !update.photo_path) return;
    try {
      const { url } = await urlFn({ data: { file_path: update.photo_path } });
      setPhotoUrl(url);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="p-3 flex items-start gap-3 text-sm">
      {update.is_milestone
        ? <Milestone className="size-4 text-primary mt-0.5" />
        : <MessageSquare className="size-4 text-muted-foreground mt-0.5" />}
      <div className="flex-1 min-w-0">
        <p>{update.note}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {new Date(update.created_at).toLocaleString()}
        </p>
        {update.photo_path && (
          <div className="mt-2">
            {photoUrl ? (
              <img src={photoUrl} alt="Site photo" className="rounded-md max-h-64 border" />
            ) : (
              <Button size="sm" variant="outline" onClick={loadPhoto}>
                <ImageIcon className="size-4" /> View photo
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Note Dialog ───────────────────────────────────────────────── */
function NoteDialog({
  projectId,
  onAdd,
}: {
  projectId: string;
  onAdd: (v: { note: string; is_milestone: boolean; photo_path?: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-4" /> Note</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add update</DialogTitle></DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const note = String(f.get("note") || "").trim();
            if (!note) return;
            const photo = f.get("photo") as File | null;
            setBusy(true);
            try {
              let photo_path: string | null = null;
              if (photo && photo.size > 0) {
                const meta = await uploadProjectFile(photo, "photos", projectId);
                photo_path = meta.path;
              }
              onAdd({ note, is_milestone: f.get("is_milestone") === "on", photo_path });
              setOpen(false);
            } catch (err: any) {
              toast.error(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Textarea name="note" required rows={3} placeholder="Foundation completed, electrical started…" />
          <div className="space-y-1.5">
            <Label htmlFor="photo">Site photo (optional)</Label>
            <Input id="photo" name="photo" type="file" accept="image/*" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_milestone" /> Mark as milestone
          </label>
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Add"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
