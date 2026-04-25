import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CircleCheck,
  Download,
  Mail,
  MessageCircle,
  Phone,
  StickyNote,
  UserPlus,
  Workflow,
  PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { setTaskStatus, type Activity } from "@/services/activitiesService";

// ────────────────────────────────────────────────────────────
// TimelineItems — um componente por kind. Cada um recebe a
// Activity inteira e renderiza o conteúdo específico. O header
// comum (avatar, hora, autor, ícone) fica em ActivityTimeline.
// ────────────────────────────────────────────────────────────

// ── Utils ──────────────────────────────────────────────────

function timeLabel(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function payloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

function payloadBool(payload: Record<string, unknown>, key: string): boolean {
  const value = payload[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

// ── Header compartilhado ───────────────────────────────────

interface ItemShellProps {
  icon: typeof StickyNote;
  iconClass?: string;
  title: string;
  subtitle?: string | null;
  authorName?: string | null;
  occurredAt: string;
  children: React.ReactNode;
  accent?: "default" | "inbound" | "outbound";
}

export function ItemShell({
  icon: Icon,
  iconClass,
  title,
  subtitle,
  authorName,
  occurredAt,
  children,
  accent = "default",
}: ItemShellProps) {
  return (
    <div className="flex gap-3">
      <div className="flex w-8 shrink-0 flex-col items-center">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full border bg-background",
            iconClass,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="mt-1 w-px flex-1 bg-border" />
      </div>
      <div
        className={cn(
          "mb-3 flex-1 rounded-md border bg-card p-3 shadow-sm",
          accent === "inbound" && "border-l-4 border-l-sky-500",
          accent === "outbound" && "border-l-4 border-l-emerald-500",
        )}
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="shrink-0 text-right text-[11px] text-muted-foreground">
            {authorName && <p className="truncate">{authorName}</p>}
            <p>{timeLabel(occurredAt)}</p>
          </div>
        </div>
        <div className="text-sm leading-snug">{children}</div>
      </div>
    </div>
  );
}

// ── Items por kind ─────────────────────────────────────────

export function NoteItem({ activity }: { activity: Activity }) {
  return (
    <ItemShell
      icon={StickyNote}
      iconClass="text-yellow-600 border-yellow-500/30 bg-yellow-500/10"
      title="Nota"
      authorName={activity.author.name}
      occurredAt={activity.occurredAt}
    >
      <p className="whitespace-pre-wrap break-words">{activity.body || "(sem conteúdo)"}</p>
    </ItemShell>
  );
}

export function WhatsAppItem({ activity }: { activity: Activity }) {
  const out = activity.direction === "out";
  const messageType = payloadString(activity.payload, "message_type") || "text";
  const mediaUrl = payloadString(activity.payload, "media_url");
  const mediaMime = payloadString(activity.payload, "media_mime");
  const mediaError = payloadString(activity.payload, "media_download_error");

  return (
    <ItemShell
      icon={MessageCircle}
      iconClass={cn(
        "border-emerald-500/30",
        out ? "text-emerald-700 bg-emerald-500/15" : "text-sky-700 bg-sky-500/10",
      )}
      title={out ? "WhatsApp enviado" : "WhatsApp recebido"}
      subtitle={messageType !== "text" ? `tipo: ${messageType}` : null}
      authorName={activity.author.name}
      occurredAt={activity.occurredAt}
      accent={out ? "outbound" : "inbound"}
    >
      {messageType === "text" && (
        <p className="whitespace-pre-wrap break-words">{activity.body || "(sem texto)"}</p>
      )}

      {messageType === "audio" && (
        <div className="space-y-2">
          {mediaUrl ? (
            <audio controls src={mediaUrl} preload="metadata" className="w-full" />
          ) : (
            <p className="text-xs text-muted-foreground">Áudio (sem URL disponível)</p>
          )}
        </div>
      )}

      {(messageType === "image" || messageType === "sticker") && mediaUrl && (
        <img
          src={mediaUrl}
          alt={messageType}
          loading="lazy"
          className={cn(
            "rounded-md object-contain",
            messageType === "sticker" ? "max-h-32" : "max-h-80",
          )}
        />
      )}

      {messageType === "video" && mediaUrl && (
        <video controls src={mediaUrl} className="max-h-80 w-full rounded-md" preload="metadata" />
      )}

      {messageType === "document" && mediaUrl && (
        <a
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" />
          Baixar {mediaMime || "documento"}
        </a>
      )}

      {!mediaUrl && messageType !== "text" && (
        <p className="text-xs italic text-muted-foreground">
          Media não baixada{mediaError ? ` — ${mediaError}` : ""}
        </p>
      )}

      {activity.body && messageType !== "text" && (
        <p className="mt-2 whitespace-pre-wrap break-words text-sm">{activity.body}</p>
      )}
    </ItemShell>
  );
}

export function EmailItem({ activity }: { activity: Activity }) {
  const out = activity.direction === "out";
  const preview = activity.body ? activity.body.split("\n").slice(0, 2).join("\n") : null;
  return (
    <ItemShell
      icon={Mail}
      iconClass="text-blue-600 border-blue-500/30 bg-blue-500/10"
      title={out ? "E-mail enviado" : "E-mail recebido"}
      subtitle={activity.subject || payloadString(activity.payload, "subject")}
      authorName={activity.author.name}
      occurredAt={activity.occurredAt}
      accent={out ? "outbound" : "inbound"}
    >
      {preview ? (
        <p className="line-clamp-3 whitespace-pre-wrap break-words text-muted-foreground">{preview}</p>
      ) : (
        <p className="text-xs italic text-muted-foreground">(sem preview)</p>
      )}
    </ItemShell>
  );
}

export function CallItem({ activity }: { activity: Activity }) {
  const durationSec = Number(payloadString(activity.payload, "duration_seconds") ?? 0);
  const outcome = payloadString(activity.payload, "outcome");
  const durationLabel =
    durationSec > 0
      ? durationSec < 60
        ? `${durationSec}s`
        : `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
      : null;

  return (
    <ItemShell
      icon={Phone}
      iconClass="text-violet-600 border-violet-500/30 bg-violet-500/10"
      title={activity.direction === "out" ? "Ligação feita" : "Ligação recebida"}
      subtitle={[durationLabel, outcome].filter(Boolean).join(" · ") || null}
      authorName={activity.author.name}
      occurredAt={activity.occurredAt}
      accent={activity.direction === "out" ? "outbound" : "inbound"}
    >
      {activity.body ? (
        <p className="whitespace-pre-wrap break-words">{activity.body}</p>
      ) : (
        <p className="text-xs italic text-muted-foreground">(sem anotação)</p>
      )}
    </ItemShell>
  );
}

export function MeetingItem({ activity }: { activity: Activity }) {
  const location = payloadString(activity.payload, "location");
  const link = payloadString(activity.payload, "link");
  return (
    <ItemShell
      icon={Calendar}
      iconClass="text-orange-600 border-orange-500/30 bg-orange-500/10"
      title={activity.subject || "Reunião"}
      subtitle={location}
      authorName={activity.author.name}
      occurredAt={activity.occurredAt}
    >
      {activity.body && (
        <p className="whitespace-pre-wrap break-words">{activity.body}</p>
      )}
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-xs text-primary underline"
        >
          {link}
        </a>
      )}
    </ItemShell>
  );
}

export function TaskItem({ activity }: { activity: Activity }) {
  const qc = useQueryClient();
  const status = payloadString(activity.payload, "status") || "pending";
  const dueDate = payloadString(activity.payload, "due_date");
  const [done, setDone] = useState(status === "done");
  const label = done ? "Tarefa concluída" : "Tarefa";

  const mutation = useMutation({
    mutationFn: (next: boolean) => setTaskStatus(activity.id, next ? "done" : "pending"),
    onError: (err: Error, next) => {
      // Rollback otimista
      setDone(!next);
      toast.error(err.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activities"] });
    },
  });

  return (
    <ItemShell
      icon={CircleCheck}
      iconClass={cn(
        "border-teal-500/30",
        done ? "text-teal-600 bg-teal-500/20" : "text-muted-foreground bg-muted",
      )}
      title={label}
      subtitle={dueDate ? `Vence: ${dueDate}` : null}
      authorName={activity.author.name}
      occurredAt={activity.occurredAt}
    >
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={done}
          disabled={mutation.isPending}
          onChange={(e) => {
            const next = e.target.checked;
            setDone(next);
            mutation.mutate(next);
          }}
          className="mt-0.5 h-4 w-4 cursor-pointer accent-primary disabled:cursor-wait"
        />
        <span className={cn("break-words", done && "text-muted-foreground line-through")}>
          {activity.subject || activity.body || "(sem título)"}
        </span>
      </label>
    </ItemShell>
  );
}

export function StageChangeItem({ activity }: { activity: Activity }) {
  const from = payloadString(activity.payload, "from_stage") ||
    payloadString(activity.payload, "old") || "—";
  const to = payloadString(activity.payload, "to_stage") ||
    payloadString(activity.payload, "new") || "—";
  return (
    <ItemShell
      icon={ArrowRight}
      iconClass="text-primary border-primary/30 bg-primary/10"
      title="Mudança de stage"
      authorName={activity.author.name}
      occurredAt={activity.occurredAt}
    >
      <p className="flex items-center gap-2 text-sm">
        <span className="rounded bg-muted px-2 py-0.5 text-xs">{from}</span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{to}</span>
      </p>
    </ItemShell>
  );
}

export function PropertyChangeItem({ activity }: { activity: Activity }) {
  const field = payloadString(activity.payload, "field") || "propriedade";
  const oldV = payloadString(activity.payload, "old") ?? "—";
  const newV = payloadString(activity.payload, "new") ?? "—";
  return (
    <ItemShell
      icon={PenLine}
      iconClass="text-muted-foreground border-border bg-muted"
      title="Propriedade alterada"
      subtitle={field}
      authorName={activity.author.name}
      occurredAt={activity.occurredAt}
    >
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="line-through text-muted-foreground">{oldV}</span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{newV}</span>
      </p>
    </ItemShell>
  );
}

export function SequenceStepItem({ activity }: { activity: Activity }) {
  const sequenceName = payloadString(activity.payload, "sequence_name") || "Sequence";
  const stepIndex = payloadString(activity.payload, "step_index");
  const channel = payloadString(activity.payload, "channel");
  const subtitle = [stepIndex ? `Passo ${stepIndex}` : null, channel].filter(Boolean).join(" · ");
  return (
    <ItemShell
      icon={Workflow}
      iconClass="text-indigo-600 border-indigo-500/30 bg-indigo-500/10"
      title={`Sequence: ${sequenceName}`}
      subtitle={subtitle || null}
      authorName={activity.author.name}
      occurredAt={activity.occurredAt}
    >
      {activity.body ? (
        <p className="whitespace-pre-wrap break-words">{activity.body}</p>
      ) : (
        <p className="text-xs italic text-muted-foreground">(passo executado)</p>
      )}
    </ItemShell>
  );
}

export function EnrollmentItem({ activity }: { activity: Activity }) {
  const sequenceName = payloadString(activity.payload, "sequence_name") || "Sequence";
  const unenrolled = payloadBool(activity.payload, "unenrolled");
  return (
    <ItemShell
      icon={UserPlus}
      iconClass="text-pink-600 border-pink-500/30 bg-pink-500/10"
      title={unenrolled ? `Saiu da sequence` : `Entrou na sequence`}
      subtitle={sequenceName}
      authorName={activity.author.name}
      occurredAt={activity.occurredAt}
    >
      {activity.body && (
        <p className="text-xs text-muted-foreground">{activity.body}</p>
      )}
    </ItemShell>
  );
}

export function UnknownItem({ activity }: { activity: Activity }) {
  return (
    <ItemShell
      icon={AlertTriangle}
      iconClass="text-muted-foreground border-border bg-muted"
      title={`Atividade (${activity.kind})`}
      subtitle="tipo não mapeado"
      authorName={activity.author.name}
      occurredAt={activity.occurredAt}
    >
      {activity.body ? (
        <p className="whitespace-pre-wrap break-words text-sm">{activity.body}</p>
      ) : (
        <pre className="text-[11px] text-muted-foreground">{JSON.stringify(activity.payload, null, 2)}</pre>
      )}
    </ItemShell>
  );
}

// ── Dispatch ───────────────────────────────────────────────

export function renderActivity(activity: Activity): JSX.Element {
  switch (activity.kind) {
    case "note":            return <NoteItem activity={activity} />;
    case "whatsapp":        return <WhatsAppItem activity={activity} />;
    case "email":           return <EmailItem activity={activity} />;
    case "call":            return <CallItem activity={activity} />;
    case "meeting":         return <MeetingItem activity={activity} />;
    case "task":            return <TaskItem activity={activity} />;
    case "stage_change":    return <StageChangeItem activity={activity} />;
    case "property_change": return <PropertyChangeItem activity={activity} />;
    case "sequence_step":   return <SequenceStepItem activity={activity} />;
    case "enrollment":      return <EnrollmentItem activity={activity} />;
    default:                return <UnknownItem activity={activity} />;
  }
}
