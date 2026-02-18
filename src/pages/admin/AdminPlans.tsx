import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Package, Plus, Pencil, Trash2, Smartphone, Zap, DollarSign, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  max_whatsapp_instances: number;
  monthly_token_limit: number;
  is_active: boolean;
  sort_order: number;
  features: string[];
  created_at: string;
}

const emptyPlan = {
  name: '',
  description: '',
  price: 0,
  max_whatsapp_instances: 1,
  monthly_token_limit: 1000000,
  is_active: true,
  sort_order: 0,
  features: [] as string[],
};

export default function AdminPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyPlan);
  const [featuresText, setFeaturesText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => { fetchPlans(); }, []);

  const fetchPlans = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('plans')
      .select('*')
      .order('sort_order', { ascending: true });
    setPlans((data || []).map(p => ({ ...p, features: Array.isArray(p.features) ? p.features as string[] : [] })));
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyPlan);
    setFeaturesText('');
    setDialogOpen(true);
  };

  const openEdit = (plan: Plan) => {
    setEditing(plan);
    setForm({
      name: plan.name,
      description: plan.description || '',
      price: plan.price,
      max_whatsapp_instances: plan.max_whatsapp_instances,
      monthly_token_limit: plan.monthly_token_limit,
      is_active: plan.is_active,
      sort_order: plan.sort_order,
      features: plan.features,
    });
    setFeaturesText(plan.features.join('\n'));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Nome do plano é obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const features = featuresText
      .split('\n')
      .map(f => f.trim())
      .filter(Boolean);

    const payload = {
      name: form.name.trim(),
      description: form.description || null,
      price: Number(form.price),
      max_whatsapp_instances: Number(form.max_whatsapp_instances),
      monthly_token_limit: Number(form.monthly_token_limit),
      is_active: form.is_active,
      sort_order: Number(form.sort_order),
      features,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from('plans').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('plans').insert(payload));
    }

    if (error) {
      toast({ title: 'Erro ao salvar plano', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: editing ? 'Plano atualizado!' : 'Plano criado!' });
      setDialogOpen(false);
      fetchPlans();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('plans').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: 'Verifique se não há lojistas usando este plano.', variant: 'destructive' });
    } else {
      toast({ title: 'Plano excluído' });
      fetchPlans();
    }
    setDeleteId(null);
  };

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tokens`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K tokens`;
    return `${n} tokens`;
  };

  const formatPrice = (p: number) =>
    p === 0 ? 'Gratuito' : `R$ ${p.toFixed(2).replace('.', ',')}`;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="section-header">
            <h1 className="section-title">Planos</h1>
            <p className="section-subtitle">Crie e gerencie os planos da plataforma</p>
          </div>
          <Button onClick={openCreate} className="gradient-primary border-0 gap-2">
            <Plus className="h-4 w-4" />
            Novo Plano
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map(plan => (
              <Card key={plan.id} className={`glass-card rounded-2xl relative overflow-hidden ${!plan.is_active ? 'opacity-60' : ''}`}>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Package className="h-4 w-4 text-primary" />
                        </div>
                        <h3 className="font-bold text-base">{plan.name}</h3>
                      </div>
                      {plan.description && (
                        <p className="text-xs text-muted-foreground mt-1 ml-10">{plan.description}</p>
                      )}
                    </div>
                    {!plan.is_active && (
                      <Badge variant="outline" className="text-xs text-muted-foreground border-muted-foreground/30 flex-shrink-0">
                        Inativo
                      </Badge>
                    )}
                  </div>

                  <div className="text-2xl font-extrabold text-primary">
                    {formatPrice(plan.price)}
                    {plan.price > 0 && <span className="text-xs font-normal text-muted-foreground ml-1">/mês</span>}
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/40 rounded-lg px-2 py-1">
                      <Smartphone className="h-3 w-3" />
                      {plan.max_whatsapp_instances} WhatsApp{plan.max_whatsapp_instances !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/40 rounded-lg px-2 py-1">
                      <Zap className="h-3 w-3" />
                      {formatTokens(plan.monthly_token_limit)}
                    </span>
                  </div>

                  {plan.features.length > 0 && (
                    <ul className="space-y-1">
                      {plan.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex gap-2 pt-2 border-t border-border/40">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 h-8 text-xs gap-1"
                      onClick={() => openEdit(plan)}
                    >
                      <Pencil className="h-3 w-3" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteId(plan.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && plans.length === 0 && (
          <div className="text-center py-16">
            <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">Nenhum plano cadastrado</p>
            <Button onClick={openCreate} className="gradient-primary border-0 gap-2">
              <Plus className="h-4 w-4" />
              Criar primeiro plano
            </Button>
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar plano' : 'Novo plano'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Nome do plano *</label>
                <Input
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Pro, Enterprise..."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Preço (R$)
                </label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.price}
                  onChange={e => setForm(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Descrição</label>
              <Input
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Descrição curta do plano"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1">
                  <Smartphone className="h-3 w-3" />
                  Nº de WhatsApps
                </label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={form.max_whatsapp_instances}
                  onChange={e => setForm(p => ({ ...p, max_whatsapp_instances: parseInt(e.target.value) || 1 }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  Limite mensal de tokens
                </label>
                <Input
                  type="number"
                  min={0}
                  step={100000}
                  value={form.monthly_token_limit}
                  onChange={e => setForm(p => ({ ...p, monthly_token_limit: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Ordem de exibição</label>
                <Input
                  type="number"
                  min={0}
                  value={form.sort_order}
                  onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Status</label>
                <div className="flex items-center gap-2 h-10">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))}
                  />
                  <span className="text-sm">{form.is_active ? 'Ativo' : 'Inativo'}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">
                Recursos inclusos <span className="text-muted-foreground">(um por linha)</span>
              </label>
              <Textarea
                value={featuresText}
                onChange={e => setFeaturesText(e.target.value)}
                placeholder={"3 números WhatsApp\nAgendamentos ilimitados\nAgente de IA avançado"}
                rows={5}
                className="text-sm resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gradient-primary border-0">
              {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar plano'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir plano?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta ação não pode ser desfeita. Lojistas vinculados a este plano perderão a referência.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
