import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Service {
  id: string;
  name: string;
  duration: number;
  price: number | null;
  description: string | null;
  color: string | null;
  active: boolean;
}

export default function Services() {
  const { companyId } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState({ name: '', duration: '30', price: '', description: '', color: '#10b981' });

  const fetchServices = async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('services')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    setServices((data as Service[]) || []);
  };

  useEffect(() => { fetchServices(); }, [companyId]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', duration: '30', price: '', description: '', color: '#10b981' });
    setOpen(true);
  };

  const openEdit = (s: Service) => {
    setEditing(s);
    setForm({
      name: s.name,
      duration: String(s.duration),
      price: s.price ? String(s.price) : '',
      description: s.description || '',
      color: s.color || '#10b981',
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!companyId || !form.name.trim()) return;

    const payload = {
      company_id: companyId,
      name: form.name.trim(),
      duration: parseInt(form.duration) || 30,
      price: form.price ? parseFloat(form.price) : null,
      description: form.description.trim() || null,
      color: form.color,
    };

    if (editing) {
      const { error } = await supabase.from('services').update(payload).eq('id', editing.id);
      if (error) { toast.error('Erro ao atualizar'); return; }
      toast.success('Serviço atualizado');
    } else {
      const { error } = await supabase.from('services').insert(payload);
      if (error) { toast.error('Erro ao criar'); return; }
      toast.success('Serviço criado');
    }
    setOpen(false);
    fetchServices();
  };

  const handleToggle = async (s: Service) => {
    await supabase.from('services').update({ active: !s.active }).eq('id', s.id);
    fetchServices();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este serviço?')) return;
    await supabase.from('services').delete().eq('id', id);
    toast.success('Serviço excluído');
    fetchServices();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="section-header mb-0">
            <h1 className="section-title">Serviços</h1>
            <p className="section-subtitle">Gerencie os serviços oferecidos</p>
          </div>
          <Button onClick={openNew} className="gradient-primary border-0 font-semibold self-start sm:self-auto">
            <Plus className="h-4 w-4 mr-2" />
            Novo serviço
          </Button>
        </div>

        {services.length === 0 ? (
          <Card className="glass-card-static rounded-2xl">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground font-medium">Nenhum serviço cadastrado</p>
              <Button className="mt-4 gradient-primary border-0" onClick={openNew}>Criar primeiro serviço</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <Card key={s.id} className={`glass-card rounded-2xl transition-all ${!s.active ? 'opacity-50' : ''}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-3.5 w-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color || '#10b981' }} />
                      <h3 className="font-bold text-sm truncate">{s.name}</h3>
                    </div>
                    <Switch checked={s.active} onCheckedChange={() => handleToggle(s)} />
                  </div>
                  <div className="space-y-0.5 mb-3">
                    <p className="text-sm text-muted-foreground">{s.duration} min</p>
                    {s.price && <p className="text-sm font-semibold">R$ {Number(s.price).toFixed(2)}</p>}
                  </div>
                  {s.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{s.description}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(s)} className="text-xs h-8">
                      <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(s.id)} className="text-xs h-8 text-destructive hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-bold">{editing ? 'Editar serviço' : 'Novo serviço'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Nome *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Corte feminino" className="h-10" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Duração (min)</Label>
                  <Input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Preço (R$)</Label>
                  <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Opcional" className="h-10" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Descrição</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Opcional" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Cor</Label>
                <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 w-20 p-1 cursor-pointer" />
              </div>
              <Button onClick={handleSave} className="w-full gradient-primary border-0 font-semibold h-10">
                {editing ? 'Salvar' : 'Criar serviço'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
