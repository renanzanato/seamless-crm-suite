import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  MessageCircle,
  Mail,
  CheckCircle2,
  Zap,
  GitBranch,
  AtSign,
  Info,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from '@/services/notificationsService';
import type { NotificationKind } from '@/services/notificationsService';

const KIND_ICONS: Record<NotificationKind, React.ElementType> = {
  mention: AtSign,
  lead_replied: MessageCircle,
  task_due_soon: CheckCircle2,
  sequence_replied: Mail,
  deal_stage_change: GitBranch,
  signal_hot: Zap,
  system: Info,
};

const KIND_COLORS: Record<NotificationKind, string> = {
  mention: 'text-blue-500',
  lead_replied: 'text-green-500',
  task_due_soon: 'text-amber-500',
  sequence_replied: 'text-purple-500',
  deal_stage_change: 'text-orange-500',
  signal_hot: 'text-red-500',
  system: 'text-muted-foreground',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: unread = 0 } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: getUnreadCount,
    refetchInterval: 30000,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications(20),
    enabled: open,
  });

  const readMutation = useMutation({
    mutationFn: markAsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  const readAllMutation = useMutation({
    mutationFn: markAllAsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  const handleClick = (notifId: string, link: string | null, isRead: boolean) => {
    if (!isRead) readMutation.mutate(notifId);
    if (link) {
      setOpen(false);
      navigate(link);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center"
            >
              {unread > 99 ? '99+' : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Notificações</span>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => readAllMutation.mutate()}
            >
              <Check className="h-3 w-3" /> Marcar todas
            </Button>
          )}
        </div>

        {/* List */}
        <ScrollArea className="max-h-[400px]">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma notificação.
            </div>
          ) : (
            notifications.map((n) => {
              const Icon = KIND_ICONS[n.kind as NotificationKind] ?? Info;
              const colorClass = KIND_COLORS[n.kind as NotificationKind] ?? '';
              const isRead = !!n.read_at;

              return (
                <button
                  key={n.id}
                  onClick={() => handleClick(n.id, n.link, isRead)}
                  className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors border-b border-border/50 ${
                    !isRead ? 'bg-primary/5' : ''
                  }`}
                >
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${colorClass}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-tight ${!isRead ? 'font-semibold' : ''}`}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {n.body}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                    {timeAgo(n.created_at)}
                  </span>
                </button>
              );
            })
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
