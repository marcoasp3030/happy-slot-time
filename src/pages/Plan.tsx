import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreditCard, Clock, AlertTriangle, CheckCircle, Sparkles, Shield, Zap } from 'lucide-react';

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

  const statusConfig: Record<string, { label: string; icon: any; color: string; bg: string }> = {
    trial: { label: 'Período de teste', icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
    active: { label: 'Ativo', icon: CheckCircle, color: 'text-success', bg: 'bg-success/10' },
    expired: { label: 'Expirado', icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
    past_due: { label: 'Pagamento pendente', icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
    canceled: { label: 'Cancelado', icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
  };

  const config = statusConfig[sub?.status] || statusConfig.trial;
  const StatusIcon = config.icon;

  const features = [
    { icon: Zap, text: 'Agendamentos ilimitados' },
    { icon: Sparkles, text: 'Página pública personalizada' },
    { icon: Shield, text: 'Notificações WhatsApp' },
    { icon: CreditCard, text: 'Painel completo' },
    { icon: CheckCircle, text: 'Suporte por email' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="section-header">
          <h1 className="section-title">Plano e Cobrança</h1>
          <p className="section-subtitle">Gerencie sua assinatura</p>
        </div>

        <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
          <Card className="glass-card-static rounded-2xl">
            <CardHeader className="px-4 sm:px-6">
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-4.5 w-4.5 text-primary" />
                Seu Plano
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className={`stat-icon-box ${config.bg} rounded-xl`}>
                  <StatusIcon className={`h-5 w-5 ${config.color}`} />
                </div>
                <div>
                  <p className="font-bold">{config.label}</p>
                  {sub?.status === 'trial' && (
                    <p className="text-sm text-muted-foreground">
                      <span className="font-semibold text-foreground">{daysLeft}</span> dias restantes
                    </p>
                  )}
                </div>
              </div>

              {sub?.status === 'trial' && daysLeft > 0 && (
                <div className="bg-muted/50 rounded-xl p-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>Período de teste</span>
                    <span>{daysLeft}/7 dias</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full gradient-primary rounded-full transition-all duration-500"
                      style={{ width: `${((7 - daysLeft) / 7) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {(sub?.status === 'trial' || sub?.status === 'expired') && (
                <Button className="w-full gradient-primary border-0 font-semibold h-11" onClick={() => { /* Future payment */ }}>
                  Assinar agora
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card-static rounded-2xl">
            <CardContent className="p-4 sm:p-6">
              <h3 className="font-bold mb-5">O que está incluso</h3>
              <ul className="space-y-3">
                {features.map((f) => (
                  <li key={f.text} className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0">
                      <f.icon className="h-4 w-4 text-success" />
                    </div>
                    <span className="text-sm font-medium">{f.text}</span>
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
