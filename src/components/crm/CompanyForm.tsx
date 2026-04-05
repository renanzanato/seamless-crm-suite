import { useState, useEffect } from 'react';
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
import { createCompany, updateCompany, getProfiles } from '@/services/crmService';
import { useAuth } from '@/hooks/useAuth';
import type { Company } from '@/types';
import { COMPANY_SEGMENTS } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: Company | null;
}

interface FormState {
  name: string;
  cnpj: string;
  city: string;
  segment: string;
  website: string;
  owner_id: string;
}

const EMPTY: FormState = { name: '', cnpj: '', city: '', segment: '', website: '', owner_id: '' };

export function CompanyForm({ open, onOpenChange, company }: Props) {
  const qc = useQueryClient();
  const { profile, isAdmin } = useAuth();
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: getProfiles,
    enabled: isAdmin,
  });

  useEffect(() => {
    if (company) {
      setForm({
        name:     company.name,
        cnpj:     company.cnpj ?? '',
        city:     company.city ?? '',
        segment:  company.segment ?? '',
        website:  company.website ?? '',
        owner_id: company.owner_id,
      });
    } else {
      setForm({ ...EMPTY, owner_id: profile?.id ?? '' });
    }
  }, [company, profile?.id, open]);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name:     form.name,
        cnpj:     form.cnpj || null,
        city:     form.city || null,
        segment:  form.segment || null,
        website:  form.website || null,
        owner_id: form.owner_id || profile!.id,
      };
      return company
        ? updateCompany(company.id, payload)
        : createCompany(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      toast.success(company ? 'Empresa atualizada.' : 'Empresa criada.');
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Razão social é obrigatória.');
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{company ? 'Editar empresa' : 'Nova empresa'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Razão Social *</Label>
            <Input id="c-name" value={form.name} onChange={set('name')} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-cnpj">CNPJ</Label>
              <Input id="c-cnpj" value={form.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0001-00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-city">Cidade</Label>
              <Input id="c-city" value={form.city} onChange={set('city')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Segmento</Label>
              <Select
                value={form.segment}
                onValueChange={(v) => setForm((p) => ({ ...p, segment: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {COMPANY_SEGMENTS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-website">Website</Label>
              <Input id="c-website" value={form.website} onChange={set('website')} placeholder="https://" />
            </div>
          </div>

          {isAdmin && profiles.length > 0 && (
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select
                value={form.owner_id}
                onValueChange={(v) => setForm((p) => ({ ...p, owner_id: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name ?? p.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
