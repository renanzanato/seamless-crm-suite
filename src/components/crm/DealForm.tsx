import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { createDeal, updateDeal, getContacts, getCompanies, getDealStageOptions, getFunnels, getProfiles, profileLabel } from '@/services/crmService';
import { useAuth } from '@/hooks/useAuth';
import type { Deal } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: Deal | null;
  defaultCompanyId?: string;
}

interface FormState {
  title: string;
  value: string;
  stage_value: string;
  funnel_id: string;
  contact_id: string;
  company_id: string;
  owner_id: string;
  expected_close: string;
}

const EMPTY: FormState = {
  title: '', value: '', stage_value: '', funnel_id: '',
  contact_id: '', company_id: '', owner_id: '', expected_close: '',
};

type StageChoice = { value: string; label: string; id: string | null };

export function DealForm({ open, onOpenChange, deal, defaultCompanyId = '' }: Props) {
  const qc = useQueryClient();
  const { profile, isAdmin } = useAuth();
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data: funnels = [] } = useQuery({
    queryKey: ['funnels'],
    queryFn: getFunnels,
    enabled: open,
  });
  const { data: contacts = [], error: contactsErr, isLoading: contactsLoading } = useQuery({
    queryKey: ['contacts', 'all'],
    queryFn: () => getContacts(),
    enabled: open,
  });
  const { data: companies = [], error: companiesErr, isLoading: companiesLoading } = useQuery({
    queryKey: ['companies', 'all'],
    queryFn: () => getCompanies(),
    enabled: open,
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: getProfiles,
    enabled: open && isAdmin,
  });
  const { data: fetchedStages = [], isLoading: stagesLoading } = useQuery({
    queryKey: ['deal-stage-options', form.funnel_id],
    queryFn: () => getDealStageOptions({ funnelId: form.funnel_id }),
    enabled: open && !!form.funnel_id,
  });

  const stageChoices = useMemo<StageChoice[]>(() => {
    const choices = fetchedStages.map((stage) => ({
      value: stage.id,
      label: stage.name,
      id: stage.id,
    }));
    const canUseCurrentDealStage = !!deal && form.funnel_id === (deal.funnel_id ?? '');

    if (canUseCurrentDealStage && deal?.stage_id && deal.stage_name && !choices.some((stage) => stage.id === deal.stage_id)) {
      choices.unshift({ value: deal.stage_id, label: deal.stage_name, id: deal.stage_id });
    } else if (canUseCurrentDealStage && !deal?.stage_id && deal?.stage_name && !choices.some((stage) => stage.label === deal.stage_name)) {
      choices.unshift({ value: deal.stage_name, label: deal.stage_name, id: null });
    }

    return choices;
  }, [deal, fetchedStages, form.funnel_id]);

  useEffect(() => {
    if (contactsErr) toast.error(`Falha ao carregar contatos: ${(contactsErr as Error).message}`);
    if (companiesErr) toast.error(`Falha ao carregar empresas: ${(companiesErr as Error).message}`);
  }, [contactsErr, companiesErr]);

  useEffect(() => {
    if (deal) {
      setForm({
        title:          deal.title,
        value:          deal.value != null ? String(deal.value) : '',
        stage_value:    deal.stage_id ?? deal.stage_name,
        funnel_id:      deal.funnel_id ?? '',
        contact_id:     deal.contact_id ?? '',
        company_id:     deal.company_id ?? '',
        owner_id:       deal.owner_id,
        expected_close: deal.expected_close ?? '',
      });
    } else {
      setForm({ ...EMPTY, company_id: defaultCompanyId, owner_id: profile?.id ?? '' });
    }
  }, [deal, defaultCompanyId, profile?.id, open]);

  useEffect(() => {
    if (!open || !form.funnel_id || stageChoices.length === 0) return;
    if (stageChoices.some((stage) => stage.value === form.stage_value)) return;
    setForm((prev) => ({ ...prev, stage_value: stageChoices[0].value }));
  }, [form.funnel_id, form.stage_value, open, stageChoices]);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const mutation = useMutation({
    mutationFn: () => {
      const selectedStage = stageChoices.find((stage) => stage.value === form.stage_value);
      const payload = {
        title:          form.title,
        value:          form.value ? parseFloat(form.value) : null,
        stage_id:       selectedStage?.id ?? null,
        stage_name:     selectedStage?.id ? undefined : selectedStage?.label,
        funnel_id:      form.funnel_id || null,
        contact_id:     form.contact_id || null,
        company_id:     form.company_id || null,
        owner_id:       form.owner_id || profile!.id,
        expected_close: form.expected_close || null,
      };
      return deal ? updateDeal(deal.id, payload) : createDeal(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      toast.success(deal ? 'Negócio atualizado.' : 'Negócio criado.');
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Título é obrigatório.');
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{deal ? 'Editar negócio' : 'Novo negócio'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="d-title">Título *</Label>
            <Input id="d-title" value={form.title} onChange={set('title')} required />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="d-value">Valor (R$)</Label>
              <Input id="d-value" type="number" step="0.01" min="0" value={form.value} onChange={set('value')} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-close">Data prevista</Label>
              <Input id="d-close" type="date" value={form.expected_close} onChange={set('expected_close')} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Funil</Label>
              <Select value={form.funnel_id || '__none__'} onValueChange={(v) => setForm((p) => ({ ...p, funnel_id: v === '__none__' ? '' : v, stage_value: '' }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhum —</SelectItem>
                  {funnels.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estágio</Label>
              <Select value={form.stage_value || '__none__'} onValueChange={(v) => setForm((p) => ({ ...p, stage_value: v === '__none__' ? '' : v }))} disabled={!form.funnel_id || stagesLoading || stageChoices.length === 0}>
                <SelectTrigger><SelectValue placeholder={form.funnel_id ? 'Selecione' : 'Escolha o funil'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sem estágio —</SelectItem>
                  {stageChoices.map((stage) => <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                Contato{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  ({contactsLoading ? 'carregando…' : `${contacts.length} disponíveis`})
                </span>
              </Label>
              <Select value={form.contact_id || '__none__'} onValueChange={(v) => setForm((p) => ({ ...p, contact_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhum —</SelectItem>
                  {contacts.length === 0 && !contactsLoading && (
                    <SelectItem value="__empty__" disabled>
                      Nenhum contato cadastrado
                    </SelectItem>
                  )}
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.company?.name ? ` · ${c.company.name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                Empresa{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  ({companiesLoading ? 'carregando…' : `${companies.length} disponíveis`})
                </span>
              </Label>
              <Select value={form.company_id || '__none__'} onValueChange={(v) => setForm((p) => ({ ...p, company_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhuma —</SelectItem>
                  {companies.length === 0 && !companiesLoading && (
                    <SelectItem value="__empty__" disabled>
                      Nenhuma empresa cadastrada
                    </SelectItem>
                  )}
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isAdmin && profiles.length > 0 && (
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={form.owner_id} onValueChange={(v) => setForm((p) => ({ ...p, owner_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{profileLabel(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
