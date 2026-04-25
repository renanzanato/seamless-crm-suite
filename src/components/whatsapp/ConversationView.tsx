import { useMemo, useState } from "react";
import {
  Camera,
  Check,
  CheckCheck,
  Download,
  FileText,
  Film,
  Mic,
  Smile,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────
// ConversationView — renderiza mensagens como bolhas de chat
// estilo WhatsApp. Substitui o layout anterior de "cards de log"
// que misturava badges de ingestão com o conteúdo da mensagem.
// ────────────────────────────────────────────────────────────

export interface ConversationMessage {
  id: string;
  direction: "inbound" | "outbound";
  messageType?: string;
  body: string;
  occurredAt: string | null;
  timeLabel?: string | null;
  // Metadados opcionais pro modo auditoria / tooltip.
  senderName?: string | null;
  author?: string | null;
  audioUrl?: string | null;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  mediaName?: string | null;
  mediaSize?: number | null;
  ingestionStatus?: "saved" | "pending" | "processing" | "failed" | "unknown" | null;
  ingestionError?: string | null;
  transcript?: string | null;
}

interface Props {
  messages: ConversationMessage[];
  outboundLabel?: string;
  inboundLabel?: string;
}

// ── Helpers ────────────────────────────────────────────────

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayKey(value: string | null) {
  const d = parseDate(value);
  if (!d) return "unknown";
  return String(startOfDay(d));
}

const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MONTH_NAMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function dayLabel(key: string): string {
  if (key === "unknown") return "Sem data";
  const d = new Date(Number(key));
  const todayStart = startOfDay(new Date());
  const diffDays = Math.round((todayStart - d.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) return DAY_NAMES[d.getDay()];
  return `${String(d.getDate()).padStart(2, "0")} de ${MONTH_NAMES[d.getMonth()]}. ${d.getFullYear()}`;
}

function timeLabel(value: string | null): string {
  const d = parseDate(value);
  if (!d) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface DayGroup {
  key: string;
  label: string;
  messages: ConversationMessage[];
}

function groupByDay(messages: ConversationMessage[]): DayGroup[] {
  const map = new Map<string, ConversationMessage[]>();
  for (const msg of messages) {
    const key = dayKey(msg.occurredAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(msg);
  }
  return Array.from(map.entries()).map(([key, items]) => ({
    key,
    label: dayLabel(key),
    messages: items,
  }));
}

function isConsecutive(prev: ConversationMessage | undefined, curr: ConversationMessage): boolean {
  if (!prev) return false;
  if (prev.direction !== curr.direction) return false;
  if (prev.author !== curr.author) return false;
  const pd = parseDate(prev.occurredAt);
  const cd = parseDate(curr.occurredAt);
  if (!pd || !cd) return false;
  // Consecutivo se dentro de 2 minutos
  return Math.abs(cd.getTime() - pd.getTime()) < 2 * 60 * 1000;
}

// ── Renderização ───────────────────────────────────────────

function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center justify-center">
      <span className="rounded-md bg-muted/60 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

// ── Media ─────────────────────────────────────────────────

function formatBytes(value: number | null | undefined): string | null {
  if (!value || !Number.isFinite(value)) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function AudioBubble({
  src,
  transcript,
}: {
  src: string | null | undefined;
  transcript: string | null | undefined;
}) {
  if (src) {
    return (
      <div className="min-w-[220px] max-w-[320px] space-y-2 rounded-md bg-black/5 p-2 dark:bg-white/5">
        <audio controls src={src} className="w-full" preload="metadata" />
        {transcript && (
          <p className="line-clamp-3 text-[11px] italic text-muted-foreground">{transcript}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-w-[180px] items-center gap-2 rounded-md bg-black/5 px-2.5 py-1.5 dark:bg-white/5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600/90 text-white">
        <Mic className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1">
        <p className="text-[13px] font-medium">Áudio</p>
        {transcript ? (
          <p className="line-clamp-2 text-[11px] italic text-muted-foreground">{transcript}</p>
        ) : (
          <p className="text-[10px] text-muted-foreground">Sem transcrição disponível</p>
        )}
      </div>
    </div>
  );
}

function StickerBubble({
  src,
  caption,
  onPreviewImage,
}: {
  src: string | null | undefined;
  caption?: string | null;
  onPreviewImage: (src: string, alt: string) => void;
}) {
  if (src) {
    return (
      <button
        type="button"
        onClick={() => onPreviewImage(src, caption || "Figurinha")}
        className="block rounded-md bg-transparent p-0 text-left"
      >
        <img
          src={src}
          alt={caption || "Figurinha"}
          className="max-h-36 max-w-36 rounded-md object-contain"
          loading="lazy"
        />
      </button>
    );
  }

  return (
    <div className="flex min-w-[120px] items-center gap-2 rounded-md bg-black/5 px-2.5 py-1.5 dark:bg-white/5">
      <Smile className="h-6 w-6 text-yellow-500" />
      <span className="text-[13px] font-medium">Figurinha</span>
    </div>
  );
}

function MediaBubble({
  type,
  src,
  mime,
  name,
  size,
  caption,
  onPreviewImage,
}: {
  type: string;
  src: string | null | undefined;
  mime?: string | null;
  name?: string | null;
  size?: number | null;
  caption?: string | null;
  onPreviewImage: (src: string, alt: string) => void;
}) {
  if (src && (type === "image" || mime?.startsWith("image/"))) {
    return (
      <div className="max-w-[320px] overflow-hidden rounded-md bg-black/5 dark:bg-white/5">
        <button
          type="button"
          onClick={() => onPreviewImage(src, caption || name || "Imagem")}
          className="block w-full bg-transparent p-0 text-left"
        >
          <img
            src={src}
            alt={caption || name || "Imagem"}
            className="max-h-80 w-full object-cover"
            loading="lazy"
          />
        </button>
        {caption && (
          <p className="border-t border-black/5 bg-black/5 px-3 py-1.5 text-[12px] dark:border-white/10 dark:bg-white/5">
            {caption}
          </p>
        )}
      </div>
    );
  }

  if (src && (type === "video" || mime?.startsWith("video/"))) {
    return (
      <div className="max-w-[340px] overflow-hidden rounded-md bg-black/5 dark:bg-white/5">
        <video controls src={src} className="max-h-80 w-full bg-black" preload="metadata" />
        {caption && (
          <p className="border-t border-black/5 bg-black/5 px-3 py-1.5 text-[12px] dark:border-white/10 dark:bg-white/5">
            {caption}
          </p>
        )}
      </div>
    );
  }

  if (src && (type === "document" || mime?.startsWith("application/"))) {
    const label = name || caption || "Documento";
    return (
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        download={name || undefined}
        className="flex min-w-[220px] max-w-[320px] items-center gap-3 rounded-md bg-black/5 px-3 py-2 text-inherit no-underline dark:bg-white/5"
      >
        <FileText className="h-6 w-6 shrink-0 text-orange-600 dark:text-orange-300" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{label}</span>
          {(mime || size) && (
            <span className="block truncate text-[10px] text-muted-foreground">
              {[mime, formatBytes(size)].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
        <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
      </a>
    );
  }

  const cfg: Record<string, { icon: typeof Camera; label: string; tint: string }> = {
    image:    { icon: Camera,   label: "Imagem",    tint: "text-violet-600 dark:text-violet-300" },
    video:    { icon: Film,     label: "Vídeo",     tint: "text-blue-600 dark:text-blue-300" },
    document: { icon: FileText, label: "Documento", tint: "text-orange-600 dark:text-orange-300" },
  };
  const entry = cfg[type] ?? { icon: FileText, label: type, tint: "text-muted-foreground" };
  const Icon = entry.icon;

  return (
    <div className="min-w-[200px] overflow-hidden rounded-md bg-black/5 dark:bg-white/5">
      <div className="flex items-center gap-2 px-3 py-2">
        <Icon className={cn("h-5 w-5", entry.tint)} />
        <span className="text-[13px] font-medium">{entry.label}</span>
      </div>
      {caption && (
        <p className="border-t border-black/5 bg-black/5 px-3 py-1.5 text-[12px] dark:border-white/10 dark:bg-white/5">
          {caption}
        </p>
      )}
    </div>
  );
}

function renderBubbleContent(
  message: ConversationMessage,
  onPreviewImage: (src: string, alt: string) => void,
) {
  const type = (message.messageType || "text").toLowerCase();
  const caption = message.body && message.body !== `[${type}]` ? message.body : null;
  const mediaUrl = message.mediaUrl || message.audioUrl;

  if (type === "audio" || type === "ptt" || type === "voice") {
    return <AudioBubble src={mediaUrl} transcript={message.transcript} />;
  }
  if (type === "sticker") {
    return <StickerBubble src={mediaUrl} caption={caption} onPreviewImage={onPreviewImage} />;
  }
  if (type === "image" || type === "video" || type === "document") {
    return (
      <MediaBubble
        type={type}
        src={mediaUrl}
        mime={message.mediaMime}
        name={message.mediaName}
        size={message.mediaSize}
        caption={caption}
        onPreviewImage={onPreviewImage}
      />
    );
  }

  // text
  return (
    <p className="whitespace-pre-wrap break-words text-[14px] leading-snug">{message.body || " "}</p>
  );
}

function MessageBubble({
  message,
  showSender,
  senderLabel,
  onPreviewImage,
}: {
  message: ConversationMessage;
  showSender: boolean;
  senderLabel: string | null;
  onPreviewImage: (src: string, alt: string) => void;
}) {
  const out = message.direction === "outbound";
  const time = timeLabel(message.occurredAt);
  const failed = message.ingestionStatus === "failed";

  return (
    <div className={cn("flex px-3 py-0.5", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "group relative flex max-w-[78%] flex-col rounded-lg px-3 py-1.5 shadow-sm",
          out
            ? "rounded-br-sm border border-emerald-500/30 bg-[#DCF8C6] text-neutral-900 dark:border-emerald-400/30 dark:bg-emerald-700/40 dark:text-emerald-50"
            : "rounded-bl-sm border border-black/10 bg-white text-neutral-900 dark:border-white/10 dark:bg-[#202c33] dark:text-foreground",
          failed && "ring-1 ring-destructive/60",
        )}
      >
        {showSender && senderLabel && (
          <p
            className={cn(
              "mb-0.5 text-xs font-semibold",
              out ? "text-emerald-800 dark:text-emerald-200" : "text-sky-700 dark:text-sky-300",
            )}
          >
            {senderLabel}
          </p>
        )}

        {renderBubbleContent(message, onPreviewImage)}

        <div
          className={cn(
            "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
            out ? "text-emerald-800/70 dark:text-emerald-200/70" : "text-neutral-500 dark:text-neutral-400",
          )}
        >
          {time && <span>{time}</span>}
          {out && (
            <span title={message.ingestionStatus ?? ""}>
              {message.ingestionStatus === "saved" ? (
                <CheckCheck className="h-3 w-3 text-sky-600 dark:text-sky-400" />
              ) : (
                <Check className="h-3 w-3" />
              )}
            </span>
          )}
        </div>

        {failed && message.ingestionError && (
          <p className="mt-1 text-[11px] text-destructive">{message.ingestionError}</p>
        )}
      </div>
    </div>
  );
}

function ImagePreviewModal({
  preview,
  onClose,
}: {
  preview: { src: string; alt: string } | null;
  onClose: () => void;
}) {
  if (!preview) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        aria-label="Fechar"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={preview.src}
        alt={preview.alt}
        className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

export function ConversationView({ messages, outboundLabel = "Você", inboundLabel }: Props) {
  const groups = useMemo(() => groupByDay(messages), [messages]);
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1 py-3">
      {groups.map((group) => (
        <div key={group.key} className="space-y-1">
          <DayDivider label={group.label} />
          {group.messages.map((message, index) => {
            const prev = group.messages[index - 1];
            const consecutive = isConsecutive(prev, message);
            const senderLabel =
              message.direction === "outbound"
                ? outboundLabel
                : message.senderName || inboundLabel || null;
            return (
              <MessageBubble
                key={message.id}
                message={message}
                showSender={!consecutive}
                senderLabel={senderLabel}
                onPreviewImage={(src, alt) => setPreview({ src, alt })}
              />
            );
          })}
        </div>
      ))}
      <ImagePreviewModal preview={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
