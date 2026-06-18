import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getDashboardOverview } from "@/lib/stats.functions";
import { getRecentActivity } from "@/lib/dashboard.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  UserCheck,
  HardHat,
  Banknote,
  CalendarCheck2,
  Plus,
  FileSpreadsheet,
  TrendingUp,
  Activity,
  Trophy,
  AlertTriangle,
  UserPlus,
} from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function Dashboard() {
  const dash = useServerFn(getDashboardOverview);
  const act = useServerFn(getRecentActivity);
  const { data: k } = useQuery({ queryKey: ["dashboard"], queryFn: () => dash() });
  const { data: activity } = useQuery({ queryKey: ["activity"], queryFn: () => act() });

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Overview</h2>
        <div className="grid grid-cols-2 gap-3">
          <Kpi icon={HardHat} label="Active projects" value={formatNumber(k?.activeProjects)} />
          <Kpi icon={Users} label="Total workers" value={formatNumber(k?.totalWorkers)} />
          <Kpi
            icon={UserCheck}
            label="Present today"
            value={formatNumber(k?.presentToday)}
            tone="success"
          />
          <Kpi
            icon={Banknote}
            label="Month labour cost"
            value={formatCurrency(k?.monthLabourCost)}
          />
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Site status</h2>
        <Card className="divide-y">
          {(k?.sites ?? []).length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center">No active projects yet.</p>
          )}
          {(k?.sites ?? []).map((s) => (
            <Link
              key={s.id}
              to="/projects/$id"
              params={{ id: s.id }}
              className="block p-4 hover:bg-accent/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.location || "—"}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-primary">
                  {formatCurrency(s.monthCost)}
                </span>
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground tabular-nums">
                <span>
                  <span className="text-foreground font-medium">{s.assigned}</span> assigned
                </span>
                <span>
                  <span className="text-foreground font-medium">{s.presentToday}</span> present
                  today
                </span>
              </div>
            </Link>
          ))}
        </Card>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <QuickAction to="/attendance" icon={CalendarCheck2} label="Mark attendance" />
          <QuickAction to="/projects" icon={Plus} label="Add project" />
          <QuickAction to="/workers" icon={UserPlus} label="Add worker" />
          <QuickAction to="/reports" icon={FileSpreadsheet} label="Reports" />
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Insights</h2>
        <div className="grid grid-cols-2 gap-3">
          <Insight
            icon={TrendingUp}
            label="Top labour cost"
            primary={k?.insights?.topProject?.name ?? "—"}
            secondary={k?.insights?.topProject ? formatCurrency(k.insights.topProject.value) : ""}
          />
          <Insight
            icon={Activity}
            label="Most active site"
            primary={k?.insights?.mostActiveProject?.name ?? "—"}
            secondary={
              k?.insights?.mostActiveProject ? `${k.insights.mostActiveProject.days} entries` : ""
            }
          />
          <Insight
            icon={Trophy}
            label="Top earner"
            primary={k?.insights?.topWorker?.name ?? "—"}
            secondary={k?.insights?.topWorker ? formatCurrency(k.insights.topWorker.value) : ""}
            tone="success"
          />
          <Insight
            icon={AlertTriangle}
            label="Lowest attendance"
            primary={k?.insights?.lowestWorker?.name ?? "—"}
            secondary={k?.insights?.lowestWorker ? `${k.insights.lowestWorker.days} days` : ""}
            tone="warning"
          />
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Recent activity
        </h2>
        <Card className="divide-y">
          {(activity ?? []).length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No activity yet.</p>
          )}
          {(activity ?? []).map((a) => (
            <div key={a.id} className="p-3 text-sm flex items-start gap-3">
              <span
                className={`mt-1.5 size-2 rounded-full shrink-0 ${
                  a.kind === "attendance"
                    ? "bg-primary"
                    : a.kind === "worker"
                      ? "bg-[oklch(var(--success))]"
                      : "bg-[oklch(var(--warning))]"
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className="truncate">{a.text}</p>
                <p className="text-xs text-muted-foreground">{new Date(a.at).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: any;
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass = {
    default: "text-primary",
    success: "text-[var(--success)]",
    warning: "text-[var(--warning)]",
  }[tone];
  return (
    <Card className="p-4 glass">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`size-4 ${toneClass}`} />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
    </Card>
  );
}

function Insight({
  icon: Icon,
  label,
  primary,
  secondary,
  tone = "default",
}: {
  icon: any;
  label: string;
  primary: string;
  secondary: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass = {
    default: "text-primary",
    success: "text-[var(--success)]",
    warning: "text-[var(--warning)]",
  }[tone];
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        <Icon className={`size-3.5 ${toneClass}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-sm font-medium mt-1.5 truncate">{primary}</p>
      <p className="text-xs text-muted-foreground tabular-nums">{secondary}</p>
    </Card>
  );
}

function QuickAction({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Button asChild variant="outline" className="h-auto py-3 flex-col gap-1.5 tap-target">
      <Link to={to}>
        <Icon className="size-5" />
        <span className="text-xs">{label}</span>
      </Link>
    </Button>
  );
}
