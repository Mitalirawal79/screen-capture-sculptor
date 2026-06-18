import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getWorkerDetailStats } from "@/lib/stats.functions";
import { deleteWorker } from "@/lib/workers.functions";
import { listPayments, recordPayment } from "@/lib/payments.functions";
import { ArrowLeft, Plus, Trash2, HardHat, Phone } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { EditWorkerButton } from "@/components/edit-worker-dialog";

export const Route = createFileRoute("/_authenticated/workers/$id")({
  component: WorkerPage,
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function WorkerPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const statsFn = useServerFn(getWorkerDetailStats);
  const paymentsFn = useServerFn(listPayments);
  const delFn = useServerFn(deleteWorker);

  const { data: stats } = useQuery({
    queryKey: ["worker-stats", id, year, month],
    queryFn: () => statsFn({ data: { worker_id: id, year, month } }),
  });
  const { data: payments = [] } = useQuery({
    queryKey: ["payments", id],
    queryFn: () => paymentsFn({ data: { worker_id: id } }),
  });

  const del = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workers"] });
      toast.success("Worker deleted");
      navigate({ to: "/workers" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!stats) return null;
  const w = stats.worker;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/workers">
          <ArrowLeft className="size-4" /> Workers
        </Link>
      </Button>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{w.full_name}</h2>
            <p className="text-sm text-muted-foreground">
              {w.worker_type || "Worker"} · {formatCurrency(w.daily_wage)}/day
            </p>
            <div className="flex gap-2 mt-3 text-xs text-muted-foreground flex-wrap items-center">
              {w.mobile && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full text-xs font-semibold px-3 inline-flex items-center gap-1.5"
                  asChild
                >
                  <a href={`tel:${w.mobile}`}>
                    <Phone className="size-3.5 text-primary" />
                    Call Worker
                  </a>
                </Button>
              )}
              {w.status === "inactive" && <Badge variant="secondary">Inactive</Badge>}
            </div>
            {w.address && <p className="text-xs text-muted-foreground mt-2">{w.address}</p>}
          </div>
          <div className="flex gap-1">
            <EditWorkerButton worker={w} />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => confirm("Delete this worker?") && del.mutate()}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        </div>
      </Card>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Assigned projects
        </h3>
        <Card className="divide-y">
          {stats.assignments.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Not assigned to any project.</p>
          )}
          {stats.assignments.map((a: any) => (
            <Link
              key={a.project_id}
              to="/projects/$id"
              params={{ id: a.project_id }}
              className="p-3 flex items-center justify-between hover:bg-accent/40 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <HardHat className="size-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{a.projects?.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    Assigned {new Date(a.assigned_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </Card>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
            Attendance statistics
          </h3>
          <div className="flex gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="h-8 w-24">
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
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Full days" value={String(stats.counts.full)} />
          <Stat label="Half days" value={String(stats.counts.half)} />
          <Stat label="Overtime days" value={String(stats.counts.overtime)} />
          <Stat label="Absent" value={String(stats.counts.absent)} />
          <Stat label="Total attendance" value={String(stats.presentDays)} />
          <Stat label="Daily wage" value={formatCurrency(w.daily_wage)} />
        </div>
      </section>

      {stats.timeline && stats.timeline.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Work timeline
          </h3>
          <Card className="divide-y max-h-96 overflow-auto">
            {stats.timeline.map((t: any, i: number) => (
              <div key={i} className="p-3 flex items-center justify-between text-sm gap-2">
                <div className="min-w-0">
                  <p className="font-medium tabular-nums">{formatLedgerDate(t.date)}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {t.projects?.name ?? "—"}
                    {t.work_area ? ` · ${t.work_area}` : ""}
                  </p>
                </div>
                <Badge
                  variant={t.type === "absent" ? "secondary" : "default"}
                  className="capitalize shrink-0"
                >
                  {t.type}
                </Badge>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section>
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Financial summary
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Month earnings" value={formatCurrency(stats.monthEarnings)} />
          <Stat label="Month paid" value={formatCurrency(stats.monthPaid)} />
          <Stat label="Lifetime earnings" value={formatCurrency(stats.lifetimeEarnings)} />
          <Stat label="Total paid" value={formatCurrency(stats.lifetimePaid)} />
          <div className="col-span-2">
            {stats.lifetimeBalance < 0 ? (
              <Stat
                label="Advance Taken (Balance)"
                value={formatCurrency(Math.abs(stats.lifetimeBalance))}
                highlight
                isAdvance
              />
            ) : (
              <Stat
                label="Pending Balance"
                value={formatCurrency(stats.lifetimeBalance)}
                highlight
              />
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Payment History & Ledger
          </h3>
          <PaymentDialog workerId={id} />
        </div>
        <Card className="divide-y">
          {payments.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No payments recorded.</p>
          )}
          {payments.map((p) => (
            <div key={p.id} className="p-3 flex items-center justify-between text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">
                  {formatLedgerDate(p.paid_on)} — <span>{formatCurrency(p.amount)}</span>
                </p>
                {p.note && <p className="text-xs text-muted-foreground mt-0.5 italic">{p.note}</p>}
              </div>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  isAdvance,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  isAdvance?: boolean;
}) {
  const highlightClass = isAdvance
    ? "bg-amber-600 dark:bg-amber-700 text-white border-amber-600 dark:border-amber-700"
    : "bg-primary text-primary-foreground border-primary";
  const textClass = isAdvance ? "text-amber-50" : "text-primary-foreground/80";
  return (
    <Card className={`p-3 ${highlight ? highlightClass : ""}`}>
      <p className={`text-xs ${highlight ? textClass : "text-muted-foreground"}`}>{label}</p>
      <p className="text-lg font-semibold tabular-nums mt-1">{value}</p>
    </Card>
  );
}

function formatLedgerDate(dateStr: string) {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  } catch {
    return dateStr;
  }
}

function PaymentDialog({ workerId }: { workerId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const fn = useServerFn(recordPayment);
  const m = useMutation({
    mutationFn: (d: any) => fn({ data: d }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments", workerId] });
      qc.invalidateQueries({ queryKey: ["worker-stats", workerId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Payment recorded");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            m.mutate({
              worker_id: workerId,
              amount: Number(f.get("amount")),
              paid_on: f.get("paid_on") || new Date().toISOString().slice(0, 10),
              note: f.get("note") || null,
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" name="amount" type="number" min="1" step="1" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="paid_on">Date</Label>
            <Input
              id="paid_on"
              name="paid_on"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Note</Label>
            <Textarea id="note" name="note" rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending ? "Saving…" : "Record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
