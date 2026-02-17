import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreditCard, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SubWithCompany {
  id: string;
  company_id: string;
  status: string;
  trial_end: string;
  created_at: string;
  company_name?: string;
}

export default function AdminSubscriptions() {
  const [subs, setSubs] = useState<SubWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const { toast } = useToast();

  useEffect(() => {
    fetchSubs();
  }, []);

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
      setSubs(subscriptions.map(s => ({ ...s, company_name: companyMap.get(s.company_id) || 'N/A' })));
    }
    setLoading(false);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from('subscriptions')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      toast({ title: 'Erro ao atualizar', variant: 'destructive' });
    } else {
      toast({ title: 'Status atualizado!' });
      fetchSubs();
    }
  };

  const filtered = filter === 'all' ? subs : subs.filter(s => s.status === filter);

  const statusColors: Record<string, string> = {
    trial: 'bg-warning/15 text-warning',
    active: 'bg-success/15 text-success',
    canceled: 'bg-destructive/15 text-destructive',
    expired: 'bg-muted text-muted-foreground',
  };

  const statusLabels: Record<string, string> = {
    trial: 'Trial',
    active: 'Ativo',
    canceled: 'Cancelado',
    expired: 'Expirado',
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="section-header">
          <h1 className="section-title">Assinaturas</h1>
          <p className="section-subtitle">Gerencie planos e assinaturas dos lojistas</p>
        </div>

        <div className="flex gap-2">
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
            {filtered.map((sub) => (
              <Card key={sub.id} className="glass-card rounded-2xl">
                <CardContent className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{sub.company_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Criada em {formatDate(sub.created_at)} · Trial até {formatDate(sub.trial_end)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
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
                  </div>
                </CardContent>
              </Card>
            ))}
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
