import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { updateWorker } from "@/lib/workers.functions";

export function EditWorkerButton({
  worker,
  variant = "ghost",
}: {
  worker: any;
  variant?: "ghost" | "outline";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="icon"
        aria-label="Edit worker"
        className="h-8 w-8 rounded-full hover:bg-accent"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Pencil className="size-4" />
      </Button>
      {open && <EditWorkerDialog worker={worker} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function EditWorkerDialog({
  worker,
  open,
  onOpenChange,
}: {
  worker: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(updateWorker);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const m = useMutation({
    mutationFn: (d: any) => fn({ data: d }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workers"] });
      qc.invalidateQueries({ queryKey: ["worker-summary", worker.id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Worker updated");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const full_name = String(f.get("full_name") || "").trim();
    const daily_wage = Number(f.get("daily_wage") || 0);
    const errs: Record<string, string> = {};
    if (!full_name) errs.full_name = "Name is required";
    if (!(daily_wage >= 0)) errs.daily_wage = "Enter a valid amount";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    m.mutate({
      id: worker.id,
      full_name,
      mobile: String(f.get("mobile") || "").trim() || null,
      address: String(f.get("address") || "").trim() || null,
      worker_type: String(f.get("worker_type") || "").trim() || null,
      joining_date: String(f.get("joining_date") || worker.joining_date),
      daily_wage,
      status: (f.get("status") as string) || "active",
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit worker</DialogTitle>
          <DialogDescription>
            Update profile, wage and status. Changes save instantly.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="ew_full_name">Full name</Label>
            <Input id="ew_full_name" name="full_name" required defaultValue={worker.full_name} />
            {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ew_mobile">Mobile</Label>
              <Input id="ew_mobile" name="mobile" type="tel" defaultValue={worker.mobile ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ew_type">Worker type</Label>
              <Input
                id="ew_type"
                name="worker_type"
                placeholder="Mason, Helper…"
                defaultValue={worker.worker_type ?? ""}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ew_wage">Daily wage</Label>
              <Input
                id="ew_wage"
                name="daily_wage"
                type="number"
                min="0"
                step="1"
                required
                defaultValue={worker.daily_wage}
              />
              {errors.daily_wage && <p className="text-xs text-destructive">{errors.daily_wage}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ew_join">Joining date</Label>
              <Input
                id="ew_join"
                name="joining_date"
                type="date"
                defaultValue={worker.joining_date}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ew_addr">Address</Label>
            <Textarea id="ew_addr" name="address" rows={2} defaultValue={worker.address ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select name="status" defaultValue={worker.status}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
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
