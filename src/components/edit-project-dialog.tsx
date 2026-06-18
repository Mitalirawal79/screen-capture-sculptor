import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateProject } from "@/lib/projects.functions";

export function EditProjectButton({ project }: { project: any }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Edit project"
        className="h-8 w-8 rounded-full hover:bg-accent"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Pencil className="size-4" />
      </Button>
      {open && <EditProjectDialog project={project} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function EditProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(updateProject);
  const [progress, setProgress] = useState<number>(project.progress_pct ?? 0);
  const [status, setStatus] = useState<string>(project.status ?? "planning");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const m = useMutation({
    mutationFn: (d: any) => fn({ data: d }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", project.id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Project updated");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") || "").trim();
    const contract_value = Number(f.get("contract_value") || 0);
    const errs: Record<string, string> = {};
    if (!name) errs.name = "Project name is required";
    if (!(contract_value >= 0)) errs.contract_value = "Enter a valid amount";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    m.mutate({
      id: project.id,
      name,
      client: String(f.get("client") || "").trim() || null,
      location: String(f.get("location") || "").trim() || null,
      start_date: String(f.get("start_date") || "") || null,
      expected_end: String(f.get("expected_end") || "") || null,
      contract_value,
      status,
      progress_pct: progress,
      notes: String(f.get("notes") || "").trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>Update project details, timeline and progress.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="ep_name">Project name</Label>
            <Input id="ep_name" name="name" required defaultValue={project.name} />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ep_client">Client</Label>
              <Input id="ep_client" name="client" defaultValue={project.client ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep_location">Site location</Label>
              <Input id="ep_location" name="location" defaultValue={project.location ?? ""} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ep_start">Start date</Label>
              <Input
                id="ep_start"
                name="start_date"
                type="date"
                defaultValue={project.start_date ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep_end">Expected end</Label>
              <Input
                id="ep_end"
                name="expected_end"
                type="date"
                defaultValue={project.expected_end ?? ""}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ep_value">Contract value</Label>
              <Input
                id="ep_value"
                name="contract_value"
                type="number"
                min="0"
                step="1"
                defaultValue={project.contract_value ?? 0}
              />
              {errors.contract_value && (
                <p className="text-xs text-destructive">{errors.contract_value}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
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
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Progress</Label>
              <span className="text-sm tabular-nums text-muted-foreground">{progress}%</span>
            </div>
            <Slider
              value={[progress]}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) => setProgress(v[0])}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ep_notes">Notes</Label>
            <Textarea
              id="ep_notes"
              name="notes"
              rows={3}
              placeholder="Internal notes about this project…"
              defaultValue={project.notes ?? ""}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={m.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending && <Loader2 className="size-4 animate-spin" />}
              {m.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
