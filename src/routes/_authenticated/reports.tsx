import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { generateMonthlyReport } from "@/lib/reports.functions";
import { listProjects } from "@/lib/projects.functions";
import { listWorkers } from "@/lib/workers.functions";
import { getAttendanceMatrix, listProjectsWithStats } from "@/lib/stats.functions";
import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ReportsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [projectId, setProjectId] = useState<string>("all");
  const [workerId, setWorkerId] = useState<string>("all");

  const projectsFn = useServerFn(listProjects);
  const workersFn = useServerFn(listWorkers);
  const genFn = useServerFn(generateMonthlyReport);
  const matrixFn = useServerFn(getAttendanceMatrix);
  const projStatsFn = useServerFn(listProjectsWithStats);

  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });
  const { data: workers = [] } = useQuery({ queryKey: ["workers"], queryFn: () => workersFn() });
  const { data: matrix } = useQuery({
    queryKey: ["att-matrix", year, month, projectId],
    queryFn: () =>
      matrixFn({ data: { year, month, project_id: projectId === "all" ? null : projectId } }),
  });
  const { data: projStats = [] } = useQuery({
    queryKey: ["projects", "stats"],
    queryFn: () => projStatsFn(),
  });

  const gen = useMutation({
    mutationFn: () =>
      genFn({
        data: {
          year,
          month,
          project_id: projectId === "all" ? null : projectId,
          worker_id: workerId === "all" ? null : workerId,
        },
      }),
    onSuccess: (res) => {
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${res.rowCount} rows exported`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Month</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Worker</Label>
            <Select value={workerId} onValueChange={setWorkerId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All workers</SelectItem>
                {workers.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="summary">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="cost">Labour cost</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
                <FileSpreadsheet className="size-5" />
              </div>
              <div>
                <h2 className="font-semibold">Contractor Report (XLSX)</h2>
                <p className="text-xs text-muted-foreground">
                  3 sheets: Workforce Summary, Attendance Calendar, Labour Cost.
                </p>
              </div>
            </div>
            <Button
              onClick={() => gen.mutate()}
              disabled={gen.isPending}
              className="w-full tap-target"
            >
              <Download className="size-4" />
              {gen.isPending ? "Generating…" : "Download XLSX"}
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <Card className="p-3 overflow-x-auto">
            {!matrix || matrix.rows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">
                No attendance for this period.
              </p>
            ) : (
              <table className="text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-background text-left p-2 border-b">Worker</th>
                    {Array.from({ length: matrix.days }, (_, i) => i + 1).map((d) => (
                      <th key={d} className="p-1.5 border-b text-center font-medium w-7">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map((r: any) => (
                    <tr key={r.worker_id} className="border-b">
                      <td className="sticky left-0 bg-background p-2 font-medium whitespace-nowrap">
                        {r.name}
                      </td>
                      {r.cells.map((c: string, i: number) => (
                        <td key={i} className={`text-center p-1.5 tabular-nums ${cellClass(c)}`}>
                          {cellLabel(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-3 text-xs text-muted-foreground px-2">
              P = present (full), H = half day, O = overtime, A = absent.
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="cost" className="mt-4">
          <Card className="divide-y">
            {projStats.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground text-center">No projects.</p>
            )}
            {projStats.map((p: any) => (
              <div key={p.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {p.assignedCount} workers · avg{" "}
                      {formatCurrency(
                        p.assignedCount > 0 ? Math.round(p.monthCost / p.assignedCount) : 0,
                      )}
                      /worker
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums text-primary">
                    {formatCurrency(p.monthCost)}
                  </span>
                </div>
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function cellLabel(c: string) {
  if (c === "full") return "P";
  if (c === "half") return "H";
  if (c === "overtime") return "O";
  if (c === "absent") return "A";
  return "";
}
function cellClass(c: string) {
  if (c === "full") return "bg-primary/15 text-primary font-medium";
  if (c === "half") return "bg-[var(--warning)]/15 text-[var(--warning)] font-medium";
  if (c === "overtime") return "bg-[var(--success)]/15 text-[var(--success)] font-medium";
  if (c === "absent") return "bg-destructive/10 text-destructive";
  return "text-muted-foreground";
}
