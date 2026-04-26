import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getMyEmailAccounts,
  sendEmail,
} from '@/services/emailService';

interface EmailComposeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTo?: string;
  defaultSubject?: string;
  contactId?: string;
}

export function EmailComposeModal({
  open,
  onOpenChange,
  defaultTo = '',
  defaultSubject = '',
  contactId,
}: EmailComposeModalProps) {
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState('');
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState('');

  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: getMyEmailAccounts,
    enabled: open,
  });

  // Auto-select first account
  if (accounts.length > 0 && !accountId) {
    setAccountId(accounts[0].id);
  }

  const sendMutation = useMutation({
    mutationFn: () =>
      sendEmail({
        accountId,
        to,
        subject,
        body,
        contactId,
      }),
    onSuccess: () => {
      toast.success('Email enviado!');
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['email-tracking'] });
      onOpenChange(false);
      setSubject('');
      setBody('');
    },
    onError: (err) => {
      toast.error('Erro ao enviar: ' + (err as Error).message);
    },
  });

  const noAccounts = accounts.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Enviar Email
          </DialogTitle>
        </DialogHeader>

        {noAccounts ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <p className="mb-2">Nenhuma conta de email conectada.</p>
            <p>Vá em <strong>Configurações → Email</strong> para conectar Gmail ou Outlook.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* From */}
            <div>
              <Label className="text-xs">De</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter((a) => a.status === 'active')
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.email_address} ({a.provider})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* To */}
            <div>
              <Label className="text-xs">Para</Label>
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="email@exemplo.com"
                className="mt-1"
              />
            </div>

            {/* Subject */}
            <div>
              <Label className="text-xs">Assunto</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Assunto do email"
                className="mt-1"
              />
            </div>

            {/* Body */}
            <div>
              <Label className="text-xs">Mensagem</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Escreva sua mensagem..."
                className="mt-1 min-h-[160px]"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => sendMutation.mutate()}
                disabled={
                  sendMutation.isPending || !accountId || !to || !subject
                }
              >
                {sendMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
