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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import {
  createCallActivity,
  type CallOutcome,
} from "@/services/activitiesService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  createdBy?: string | null;
  /** Chave da query de activities pra invalidar após salvar. */
  invalidateKey?: unknown[];
}

const OUTCOMES: Array<{ value: CallOutcome; label: string }> = [
  { value: "completed",     label: "Conversou" },
  { value: "no_answer",     label: "Não atendeu" },
  { value: "voicemail",     label: "Caixa postal" },
  { value: "busy",          label: "Ocupado" },
  { value: "wrong_number",  label: "Número errado" },
];

export function LogCallModal({
  open,
  onOpenChange,
  contactId,
  companyId,
  dealId,
  createdBy,
  invalidateKey,
}: Props) {
  const qc = useQueryClient();
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [outcome, setOutcome] = useState<CallOutcome>("completed");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createCallActivity({
        contactId,
        companyId,
        dealId,
        direction,
        outcome,
        durationSeconds: duration ? Number(duration) : null,
        body: notes.trim() || null,
        createdBy: createdBy ?? null,
      }),
    onSuccess: () => {
      if (invalidateKey) qc.invalidateQueries({ queryKey: invalidateKey });
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success("Ligação registrada.");
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function reset() {
    setDirection("out");
    setOutcome("completed");
    setDuration("");
    setNotes("");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar ligação</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="call-direction">Direção</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "in" | "out")}>
                <SelectTrigger id="call-direction"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="out">Eu liguei</SelectItem>
                  <SelectItem value="in">Recebi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="call-outcome">Resultado</Label>
              <Select value={outcome} onValueChange={(v) => setOutcome(v as CallOutcome)}>
                <SelectTrigger id="call-outcome"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="call-duration">Duração (segundos)</Label>
            <Input
              id="call-duration"
              type="number"
              min={0}
              placeholder="180"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="call-notes">Anotação</Label>
            <Textarea
              id="call-notes"
              rows={3}
              placeholder="O que foi conversado, próximos passos…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
