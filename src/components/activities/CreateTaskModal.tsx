import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { createTaskActivity } from "@/services/activitiesService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  createdBy?: string | null;
  invalidateKey?: unknown[];
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CreateTaskModal({
  open,
  onOpenChange,
  contactId,
  companyId,
  dealId,
  createdBy,
  invalidateKey,
}: Props) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(todayISO());
  const [body, setBody] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createTaskActivity({
        contactId,
        companyId,
        dealId,
        title,
        body: body.trim() || null,
        dueDate: dueDate || null,
        createdBy: createdBy ?? null,
      }),
    onSuccess: () => {
      if (invalidateKey) qc.invalidateQueries({ queryKey: invalidateKey });
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success("Tarefa criada.");
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function reset() {
    setTitle("");
    setDueDate(todayISO());
    setBody("");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.warning("Informe um título pra tarefa.");
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Título</Label>
            <Input
              id="task-title"
              autoFocus
              placeholder="Enviar proposta revisada"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-due">Vence em</Label>
            <Input
              id="task-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-body">Detalhes (opcional)</Label>
            <Textarea
              id="task-body"
              rows={3}
              placeholder="Contexto, links, próximos passos…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar tarefa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
