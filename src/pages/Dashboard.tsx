import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, CheckCircle, XCircle, Clock, TrendingUp, Users } from 'lucide-react';

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
    { label: 'Hoje', value: stats.today, icon: Calendar, bgClass: 'bg-primary/10', iconClass: 'text-primary' },
    { label: 'Esta semana', value: stats.week, icon: TrendingUp, bgClass: 'bg-info/10', iconClass: 'text-info' },
    { label: 'Confirmados', value: stats.confirmed, icon: CheckCircle, bgClass: 'bg-success/10', iconClass: 'text-success' },
    { label: 'Cancelados', value: stats.canceled, icon: XCircle, bgClass: 'bg-destructive/10', iconClass: 'text-destructive' },
  ];

  const statusLabel: Record<string, string> = {
    pending: 'Pendente', confirmed: 'Confirmado', canceled: 'Cancelado',
    completed: 'Concluído', rescheduled: 'Remarcado', no_show: 'Não compareceu',
  };

  const statusClass: Record<string, string> = {
    pending: 'status-pending', confirmed: 'status-confirmed', canceled: 'status-canceled',
    completed: 'status-completed', rescheduled: 'status-pending', no_show: 'status-canceled',
  };

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="section-header">
          <h1 className="section-title">Dashboard</h1>
          <p className="section-subtitle">Visão geral do seu negócio</p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((s, i) => (
            <Card key={s.label} className="glass-card rounded-2xl overflow-hidden" style={{ animationDelay: `${i * 50}ms` }}>
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`stat-icon-box ${s.bgClass} rounded-xl`}>
                  <s.icon className={`h-5 w-5 ${s.iconClass}`} />
                </div>
                <div>
                  <p className="text-3xl font-extrabold tracking-tight">{s.value}</p>
                  <p className="text-sm text-muted-foreground font-medium">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Upcoming */}
        <Card className="glass-card-static rounded-2xl overflow-hidden">
          <CardHeader className="pb-2 px-6 pt-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Clock className="h-4.5 w-4.5 text-primary" />
                Próximos agendamentos
              </CardTitle>
              <span className="text-xs text-muted-foreground font-medium bg-muted px-2.5 py-1 rounded-full">
                {upcoming.length} próximos
              </span>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            {upcoming.length === 0 ? (
              <div className="text-center py-12">
                <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <Calendar className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground font-medium">Nenhum agendamento próximo</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Os agendamentos aparecerão aqui</p>
              </div>
            ) : (
              <div className="space-y-2 mt-2">
                {upcoming.map((apt, i) => (
                  <div
                    key={apt.id}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-muted/40 hover:bg-muted/70 transition-all duration-200 group"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary font-bold text-sm">
                          {apt.client_name?.charAt(0)?.toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{apt.client_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {apt.services?.name} · {formatDate(apt.appointment_date)} · {apt.start_time?.slice(0, 5)}
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
