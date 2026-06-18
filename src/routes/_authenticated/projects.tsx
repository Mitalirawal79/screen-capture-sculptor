import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import { createProject } from "@/lib/projects.functions";
import { listProjectsWithStats } from "@/lib/stats.functions";
import { Plus, ChevronRight, Users, Banknote } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { EditProjectButton } from "@/components/edit-project-dialog";

export const Route = createFileRoute("/_authenticated/projects")({
  component: ProjectsPage,
});

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
};

function ProjectsPage() {
  const fn = useServerFn(listProjectsWithStats);
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", "stats"],
    queryFn: () => fn(),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddProjectDialog />
      </div>
      <Card className="divide-y">
        {projects.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground text-center">No projects yet.</p>
        )}
        {projects.map((p: any) => (
          <div key={p.id} className="relative group">
            <Link
              to="/projects/$id"
              params={{ id: p.id }}
              className="block p-4 pr-14 hover:bg-accent/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{p.name}</p>
                    <Badge variant={p.status === "active" ? "default" : "secondary"}>
                      {STATUS_LABEL[p.status]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.client ? `${p.client} · ` : ""}
                    {p.location || "—"}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={p.progress_pct} className="h-1.5 flex-1" />
                    <span className="text-xs text-muted-foreground tabular-nums w-9 text-right">
                      {p.progress_pct}%
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground tabular-nums">
                    <span className="inline-flex items-center gap-1 bg-accent/80 px-2 py-0.5 rounded font-medium text-foreground/80">
                      <Users className="size-3 text-muted-foreground" />
                      {p.assignedCount} Workers
                    </span>
                    <span className="inline-flex items-center gap-1 bg-accent/80 px-2 py-0.5 rounded font-medium text-foreground/80">
                      <Banknote className="size-3 text-muted-foreground" />
                      {formatCurrency(p.monthCost)} Labour Cost
                    </span>
                    {p.presentToday > 0 && (
                      <span className="inline-flex items-center gap-1 bg-green-50 dark:bg-green-950/30 text-[var(--success)] px-2 py-0.5 rounded font-semibold">
                        {p.presentToday} Present Today
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground mt-1" />
              </div>
            </Link>
            <div className="absolute right-3 top-3">
              <EditProjectButton project={p} />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function AddProjectDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const fn = useServerFn(createProject);
  const m = useMutation({
    mutationFn: (d: any) => fn({ data: d }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Project created");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="tap-target">
          <Plus className="size-4" /> Add project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            m.mutate({
              name: f.get("name"),
              client: f.get("client") || null,
              location: f.get("location") || null,
              start_date: f.get("start_date") || null,
              expected_end: f.get("expected_end") || null,
              contract_value: Number(f.get("contract_value") || 0),
              status: f.get("status") || "planning",
              progress_pct: 0,
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="client">Client</Label>
              <Input id="client" name="client" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location">Site</Label>
              <Input id="location" name="location" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start_date">Start</Label>
              <Input id="start_date" name="start_date" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expected_end">Expected end</Label>
              <Input id="expected_end" name="expected_end" type="date" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contract_value">Contract value</Label>
              <Input
                id="contract_value"
                name="contract_value"
                type="number"
                min="0"
                defaultValue="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select name="status" defaultValue="planning">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending ? "Saving…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
