import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, CheckCircle, XCircle, Clock } from 'lucide-react';

export default function Dashboard() {
  const { companyId } = useAuth();
  const [stats, setStats] = useState({ today: 0, week: 0, confirmed: 0, canceled: 0 });
  const [upcoming, setUpcoming] = useState<any[]>([]);

  useEffect(() => {
    if (!companyId) return;

    const today = new Date().toISOString().split('T')[0];
    const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    const fetchData = async () => {
      const [todayRes, weekRes, upcomingRes] = await Promise.all([
        supabase.from('appointments').select('id, status').eq('company_id', companyId).eq('appointment_date', today),
        supabase.from('appointments').select('id, status').eq('company_id', companyId).gte('appointment_date', today).lte('appointment_date', weekEnd),
        supabase.from('appointments').select('*, services(name)').eq('company_id', companyId).gte('appointment_date', today).order('appointment_date').order('start_time').limit(10),
      ]);

      const todayData = todayRes.data || [];
      const weekData = weekRes.data || [];

      setStats({
        today: todayData.length,
        week: weekData.length,
        confirmed: weekData.filter((a) => a.status === 'confirmed').length,
        canceled: weekData.filter((a) => a.status === 'canceled').length,
      });
      setUpcoming(upcomingRes.data || []);
    };

    fetchData();
  }, [companyId]);

  const statCards = [
    { label: 'Hoje', value: stats.today, icon: Calendar, color: 'text-primary' },
    { label: 'Semana', value: stats.week, icon: Clock, color: 'text-info' },
    { label: 'Confirmados', value: stats.confirmed, icon: CheckCircle, color: 'text-success' },
    { label: 'Cancelados', value: stats.canceled, icon: XCircle, color: 'text-destructive' },
  ];

  const statusLabel: Record<string, string> = {
    pending: 'Pendente',
    confirmed: 'Confirmado',
    canceled: 'Cancelado',
    completed: 'Concluído',
    rescheduled: 'Remarcado',
    no_show: 'Não compareceu',
  };

  const statusClass: Record<string, string> = {
    pending: 'status-pending',
    confirmed: 'status-confirmed',
    canceled: 'status-canceled',
    completed: 'status-completed',
    rescheduled: 'status-pending',
    no_show: 'status-canceled',
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral do seu negócio</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((s) => (
            <Card key={s.label} className="glass-card">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`rounded-xl p-3 bg-muted ${s.color}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">Próximos agendamentos</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">
                Nenhum agendamento próximo
              </p>
            ) : (
              <div className="space-y-3">
                {upcoming.map((apt) => (
                  <div
                    key={apt.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary font-semibold text-sm">
                          {apt.client_name?.charAt(0)?.toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{apt.client_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {apt.services?.name} · {apt.appointment_date} · {apt.start_time?.slice(0, 5)}
                        </p>
                      </div>
                    </div>
                    <span className={statusClass[apt.status] || 'status-pending'}>
                      {statusLabel[apt.status] || apt.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
