import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreditCard, Clock, AlertTriangle, CheckCircle } from 'lucide-react';

export default function Plan() {
  const { companyId } = useAuth();
  const [sub, setSub] = useState<any>(null);

  useEffect(() => {
    if (!companyId) return;
    supabase.from('subscriptions').select('*').eq('company_id', companyId).single()
      .then(({ data }) => setSub(data));
  }, [companyId]);

  const daysLeft = sub?.trial_end
    ? Math.max(0, Math.ceil((new Date(sub.trial_end).getTime() - Date.now()) / 86400000))
    : 0;

  const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
    trial: { label: 'Período de teste', icon: Clock, color: 'text-warning' },
    active: { label: 'Ativo', icon: CheckCircle, color: 'text-success' },
    expired: { label: 'Expirado', icon: AlertTriangle, color: 'text-destructive' },
    past_due: { label: 'Pagamento pendente', icon: AlertTriangle, color: 'text-warning' },
    canceled: { label: 'Cancelado', icon: AlertTriangle, color: 'text-destructive' },
  };

  const config = statusConfig[sub?.status] || statusConfig.trial;
  const StatusIcon = config.icon;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Plano e Cobrança</h1>
          <p className="text-muted-foreground">Gerencie sua assinatura</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="glass-card">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><CreditCard className="h-5 w-5" /> Seu Plano</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <StatusIcon className={`h-6 w-6 ${config.color}`} />
                <div>
                  <p className="font-semibold">{config.label}</p>
                  {sub?.status === 'trial' && (
                    <p className="text-sm text-muted-foreground">{daysLeft} dias restantes</p>
                  )}
                </div>
              </div>
              {(sub?.status === 'trial' || sub?.status === 'expired') && (
                <Button className="w-full" onClick={() => { /* Future payment integration */ }}>
                  Assinar agora
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">O que está incluso</h3>
              <ul className="space-y-2 text-sm">
                {['Agendamentos ilimitados', 'Página pública personalizada', 'Notificações WhatsApp', 'Painel completo', 'Suporte por email'].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-success flex-shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
