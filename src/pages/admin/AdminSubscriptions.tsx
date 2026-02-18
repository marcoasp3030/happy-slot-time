import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreditCard, Building2, Smartphone, ChevronDown, ChevronUp, Zap, Package, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Plan {
  id: string;
  name: string;
  max_whatsapp_instances: number;
  monthly_token_limit: number;
  price: number;
}

interface SubWithCompany {
  id: string;
  company_id: string;
  status: string;
  trial_end: string;
  created_at: string;
  max_whatsapp_instances: number;
  plan_name: string | null;
  plan_id: string | null;
  company_name?: string;
}

export default function AdminSubscriptions() {
  const [subs, setSubs] = useState<SubWithCompany[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [applyingPlan, setApplyingPlan] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchPlans();
    fetchSubs();
  }, []);

  const fetchPlans = async () => {
    const { data } = await supabase
      .from('plans')
      .select('id, name, max_whatsapp_instances, monthly_token_limit, price')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    setPlans(data || []);
  };

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
        plan_id: (s as any).plan_id ?? null,
      }));
      setSubs(mapped);
    }
    setLoading(false);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('subscriptions').update({ status: newStatus }).eq('id', id);
    if (error) toast({ title: 'Erro ao atualizar', variant: 'destructive' });
    else { toast({ title: 'Status atualizado!' }); fetchSubs(); }
  };

  const applyPlan = async (subId: string, planId: string | null) => {
    setApplyingPlan(subId);
    let updatePayload: Record<string, unknown> = { plan_id: planId, plan_name: null, max_whatsapp_instances: 1 };

    if (planId) {
      const plan = plans.find(p => p.id === planId);
      if (plan) {
        updatePayload = {
          plan_id: planId,
          plan_name: plan.name,
          max_whatsapp_instances: plan.max_whatsapp_instances,
        };
      }
    }

    const { error } = await supabase.from('subscriptions').update(updatePayload).eq('id', subId);
    if (error) {
      toast({ title: 'Erro ao aplicar plano', variant: 'destructive' });
    } else {
      toast({ title: planId ? 'Plano aplicado com sucesso!' : 'Plano removido' });
      fetchSubs();
      setExpandedId(null);
    }
    setApplyingPlan(null);
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

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return `${n}`;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="section-header">
          <h1 className="section-title">Assinaturas</h1>
          <p className="section-subtitle">Vincule e gerencie planos dos lojistas</p>
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
              const currentPlan = plans.find(p => p.id === sub.plan_id);

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
                            {sub.plan_name ? (
                              <Badge className="text-xs py-0 bg-primary/10 text-primary border-0">
                                <Package className="h-2.5 w-2.5 mr-1" />
                                {sub.plan_name}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs py-0 text-muted-foreground">
                                Sem plano
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <p className="text-xs text-muted-foreground">
                              Trial até {formatDate(sub.trial_end)}
                            </p>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Smartphone className="h-3 w-3" />
                              {sub.max_whatsapp_instances} WA
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
                          Trocar Plano
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>

                    {/* Expanded plan picker */}
                    {isExpanded && (
                      <div className="border-t border-border/40 bg-muted/20 px-5 py-4">
                        <p className="text-xs font-semibold text-muted-foreground mb-3">Selecionar plano</p>

                        {plans.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Nenhum plano cadastrado. Crie planos em <span className="font-medium">Admin → Planos</span>.
                          </p>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {plans.map(plan => {
                              const isSelected = sub.plan_id === plan.id;
                              return (
                                <button
                                  key={plan.id}
                                  disabled={applyingPlan === sub.id}
                                  onClick={() => applyPlan(sub.id, plan.id)}
                                  className={`text-left rounded-xl border p-3 transition-all hover:border-primary/60 hover:bg-primary/5 ${
                                    isSelected
                                      ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                                      : 'border-border/60 bg-background'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-sm font-semibold">{plan.name}</span>
                                    {isSelected && (
                                      <Badge className="text-[10px] py-0 bg-primary/20 text-primary border-0">Atual</Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Smartphone className="h-3 w-3" />
                                      {plan.max_whatsapp_instances} WA
                                    </span>
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Zap className="h-3 w-3" />
                                      {formatTokens(plan.monthly_token_limit)} tokens
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {sub.plan_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-3 h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                            onClick={() => applyPlan(sub.id, null)}
                            disabled={applyingPlan === sub.id}
                          >
                            <X className="h-3 w-3" />
                            Remover plano
                          </Button>
                        )}
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
