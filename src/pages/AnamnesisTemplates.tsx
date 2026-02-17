import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, GripVertical, ClipboardList, Pencil } from 'lucide-react';
import { toast } from 'sonner';

interface Template {
  id: string;
  service_id: string | null;
  field_label: string;
  field_type: string;
  field_options: string[] | null;
  sort_order: number;
  required: boolean;
  active: boolean;
}

interface Service {
  id: string;
  name: string;
  requires_anamnesis: boolean;
}

export default function AnamnesisTemplates() {
  const { companyId } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<string>('all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({
    field_label: '',
    field_type: 'text',
    field_options: '',
    required: false,
    service_id: '' as string,
  });

  useEffect(() => {
    if (!companyId) return;
    supabase.from('services').select('id, name, requires_anamnesis')
      .eq('company_id', companyId).eq('requires_anamnesis', true)
      .then(({ data }) => setServices((data as Service[]) || []));
  }, [companyId]);

  const fetchTemplates = async () => {
    if (!companyId) return;
    let query = supabase.from('anamnesis_templates').select('*')
      .eq('company_id', companyId).order('sort_order');
    if (selectedService !== 'all') query = query.eq('service_id', selectedService);
    const { data } = await query;
    setTemplates((data as Template[]) || []);
  };

  useEffect(() => { fetchTemplates(); }, [companyId, selectedService]);

  const openNew = () => {
    setEditing(null);
    setForm({ field_label: '', field_type: 'text', field_options: '', required: false, service_id: selectedService === 'all' ? '' : selectedService });
    setOpen(true);
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    setForm({
      field_label: t.field_label,
      field_type: t.field_type,
      field_options: Array.isArray(t.field_options) ? t.field_options.join(', ') : '',
      required: t.required,
      service_id: t.service_id || '',
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!companyId || !form.field_label.trim()) { toast.error('Preencha o nome do campo'); return; }

    const payload = {
      company_id: companyId,
      service_id: form.service_id || null,
      field_label: form.field_label.trim(),
      field_type: form.field_type,
      field_options: ['select', 'checkbox'].includes(form.field_type) && form.field_options
        ? form.field_options.split(',').map(o => o.trim()).filter(Boolean)
        : null,
      required: form.required,
      sort_order: editing ? editing.sort_order : templates.length,
    };

    if (editing) {
      await supabase.from('anamnesis_templates').update(payload).eq('id', editing.id);
      toast.success('Campo atualizado');
    } else {
      await supabase.from('anamnesis_templates').insert(payload);
      toast.success('Campo criado');
    }
    setOpen(false);
    fetchTemplates();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este campo?')) return;
    await supabase.from('anamnesis_templates').delete().eq('id', id);
    toast.success('Campo excluído');
    fetchTemplates();
  };

  const toggleActive = async (t: Template) => {
    await supabase.from('anamnesis_templates').update({ active: !t.active }).eq('id', t.id);
    fetchTemplates();
  };

  const fieldTypeLabels: Record<string, string> = {
    text: 'Texto curto', textarea: 'Texto longo', select: 'Seleção', checkbox: 'Múltipla escolha', number: 'Número',
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="section-header mb-0">
            <h1 className="section-title flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Anamnese
            </h1>
            <p className="section-subtitle">Configure os campos da ficha de anamnese por serviço</p>
          </div>
          <Button onClick={openNew} className="gradient-primary border-0 font-semibold self-start sm:self-auto">
            <Plus className="h-4 w-4 mr-2" />Novo campo
          </Button>
        </div>

        {services.length === 0 ? (
          <Card className="glass-card-static rounded-2xl">
            <CardContent className="py-12 text-center">
              <ClipboardList className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Nenhum serviço com anamnese ativada</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Ative a anamnese em um serviço na página de Serviços</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Select value={selectedService} onValueChange={setSelectedService}>
              <SelectTrigger className="w-full sm:w-[250px] h-9 text-sm">
                <SelectValue placeholder="Filtrar por serviço" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os serviços</SelectItem>
                {services.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {templates.length === 0 ? (
              <Card className="glass-card-static rounded-2xl">
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground font-medium">Nenhum campo configurado</p>
                  <Button className="mt-4 gradient-primary border-0" onClick={openNew}>Criar primeiro campo</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {templates.map((t, i) => (
                  <Card key={t.id} className={`rounded-xl transition-all ${!t.active ? 'opacity-50' : ''}`}>
                    <CardContent className="p-3.5 flex items-center gap-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 cursor-grab" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm truncate">{t.field_label}</p>
                          {t.required && <Badge variant="destructive" className="text-[9px] h-4 px-1">Obrigatório</Badge>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className="text-[10px] h-4">{fieldTypeLabels[t.field_type] || t.field_type}</Badge>
                          {t.field_options && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              {(t.field_options as string[]).join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                      <Switch checked={t.active} onCheckedChange={() => toggleActive(t)} />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-bold">{editing ? 'Editar campo' : 'Novo campo'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Serviço</Label>
                <Select value={form.service_id || 'none'} onValueChange={(v) => setForm({ ...form, service_id: v === 'none' ? '' : v })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Todos os serviços (global)</SelectItem>
                    {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Nome do campo *</Label>
                <Input value={form.field_label} onChange={(e) => setForm({ ...form, field_label: e.target.value })} placeholder="Ex: Possui alergias?" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Tipo</Label>
                <Select value={form.field_type} onValueChange={(v) => setForm({ ...form, field_type: v })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto curto</SelectItem>
                    <SelectItem value="textarea">Texto longo</SelectItem>
                    <SelectItem value="number">Número</SelectItem>
                    <SelectItem value="select">Seleção única</SelectItem>
                    <SelectItem value="checkbox">Múltipla escolha</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {['select', 'checkbox'].includes(form.field_type) && (
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Opções (separadas por vírgula)</Label>
                  <Input value={form.field_options} onChange={(e) => setForm({ ...form, field_options: e.target.value })} placeholder="Sim, Não, Às vezes" className="h-10" />
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-sm">Campo obrigatório</Label>
                <Switch checked={form.required} onCheckedChange={(v) => setForm({ ...form, required: v })} />
              </div>
              <Button onClick={handleSave} className="w-full gradient-primary border-0 font-semibold h-10">
                {editing ? 'Salvar' : 'Criar campo'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
