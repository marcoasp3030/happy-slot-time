import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { CreditCard, Building2, Smartphone, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SubWithCompany {
  id: string;
  company_id: string;
  status: string;
  trial_end: string;
  created_at: string;
  max_whatsapp_instances: number;
  plan_name: string | null;
  company_name?: string;
}

export default function AdminSubscriptions() {
  const [subs, setSubs] = useState<SubWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, { maxWa: number; planName: string }>>({});
  const { toast } = useToast();

  useEffect(() => { fetchSubs(); }, []);

  const fetchSubs = async () => {
    setLoading(true);
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false });

    if (subscriptions) {
      const companyIds = subscriptions.map(s => s.company_id);
      const { data: companies } = await supabase
        .from('companies')
        .select('id, name')
        .in('id', companyIds);

      const companyMap = new Map((companies || []).map(c => [c.id, c.name]));
      const mapped = subscriptions.map(s => ({
        ...s,
        company_name: companyMap.get(s.company_id) || 'N/A',
        max_whatsapp_instances: (s as any).max_whatsapp_instances ?? 1,
        plan_name: (s as any).plan_name ?? null,
      }));
      setSubs(mapped);

      // Init edit values
      const vals: Record<string, { maxWa: number; planName: string }> = {};
      mapped.forEach(s => {
        vals[s.id] = { maxWa: s.max_whatsapp_instances, planName: s.plan_name || '' };
      });
      setEditValues(vals);
    }
    setLoading(false);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('subscriptions').update({ status: newStatus }).eq('id', id);
    if (error) toast({ title: 'Erro ao atualizar', variant: 'destructive' });
    else { toast({ title: 'Status atualizado!' }); fetchSubs(); }
  };

  const savePlanSettings = async (id: string) => {
    const vals = editValues[id];
    if (!vals) return;
    const { error } = await supabase
      .from('subscriptions')
      .update({
        max_whatsapp_instances: vals.maxWa,
        plan_name: vals.planName || null,
      })
      .eq('id', id);
    if (error) toast({ title: 'Erro ao salvar', variant: 'destructive' });
    else { toast({ title: 'Configurações do plano salvas!' }); fetchSubs(); setExpandedId(null); }
  };

  const filtered = filter === 'all' ? subs : subs.filter(s => s.status === filter);

  const statusColors: Record<string, string> = {
    trial: 'bg-warning/15 text-warning',
    active: 'bg-success/15 text-success',
    canceled: 'bg-destructive/15 text-destructive',
    expired: 'bg-muted text-muted-foreground',
  };

  const statusLabels: Record<string, string> = {
    trial: 'Trial', active: 'Ativo', canceled: 'Cancelado', expired: 'Expirado',
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="section-header">
          <h1 className="section-title">Assinaturas</h1>
          <p className="section-subtitle">Gerencie planos e limites dos lojistas</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {['all', 'trial', 'active', 'canceled', 'expired'].map(s => (
            <Button
              key={s}
              variant={filter === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(s)}
              className="text-xs"
            >
              {s === 'all' ? 'Todos' : statusLabels[s] || s}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((sub) => {
              const isExpanded = expandedId === sub.id;
              const vals = editValues[sub.id] || { maxWa: 1, planName: '' };

              return (
                <Card key={sub.id} className="glass-card rounded-2xl overflow-hidden">
                  <CardContent className="p-0">
                    {/* Main row */}
                    <div className="flex items-center justify-between p-5 gap-4 flex-wrap">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm">{sub.company_name}</p>
                            {sub.plan_name && (
                              <Badge variant="outline" className="text-xs py-0">{sub.plan_name}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <p className="text-xs text-muted-foreground">
                              Trial até {formatDate(sub.trial_end)}
                            </p>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Smartphone className="h-3 w-3" />
                              {sub.max_whatsapp_instances} WhatsApp{sub.max_whatsapp_instances !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`${statusColors[sub.status] || 'bg-muted text-muted-foreground'} border-0 text-xs`}>
                          {statusLabels[sub.status] || sub.status}
                        </Badge>
                        <Select defaultValue={sub.status} onValueChange={(v) => updateStatus(sub.id, v)}>
                          <SelectTrigger className="w-[120px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="trial">Trial</SelectItem>
                            <SelectItem value="active">Ativo</SelectItem>
                            <SelectItem value="canceled">Cancelado</SelectItem>
                            <SelectItem value="expired">Expirado</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs gap-1"
                          onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                        >
                          Plano
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>

                    {/* Expanded plan settings */}
                    {isExpanded && (
                      <div className="border-t border-border/40 bg-muted/20 px-5 py-4">
                        <p className="text-xs font-semibold text-muted-foreground mb-3">Configurações do plano</p>
                        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 items-end">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium">Nome do plano</label>
                            <Input
                              value={vals.planName}
                              onChange={(e) => setEditValues(prev => ({
                                ...prev,
                                [sub.id]: { ...prev[sub.id], planName: e.target.value }
                              }))}
                              placeholder="Ex: Básico, Pro, Enterprise..."
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium flex items-center gap-1">
                              <Smartphone className="h-3 w-3" />
                              Nº de WhatsApps permitidos
                            </label>
                            <Input
                              type="number"
                              min={1}
                              max={20}
                              value={vals.maxWa}
                              onChange={(e) => setEditValues(prev => ({
                                ...prev,
                                [sub.id]: { ...prev[sub.id], maxWa: Math.max(1, parseInt(e.target.value) || 1) }
                              }))}
                              className="h-8 text-sm"
                            />
                          </div>
                          <Button
                            size="sm"
                            className="h-8 gradient-primary border-0"
                            onClick={() => savePlanSettings(sub.id)}
                          >
                            Salvar plano
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-12">
            <CreditCard className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhuma assinatura encontrada</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
