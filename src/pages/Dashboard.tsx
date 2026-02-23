import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, CheckCircle, XCircle, Clock, TrendingUp, ArrowRight, CalendarPlus, Zap, Tag, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function Dashboard() {
  const { companyId, user } = useAuth();
  const [stats, setStats] = useState({ today: 0, week: 0, confirmed: 0, canceled: 0 });
  const [autoStats, setAutoStats] = useState({ totalExecutions: 0, successRate: 0, taggedContacts: 0, activeFlows: 0 });
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [autoLogs7d, setAutoLogs7d] = useState<{ date: string; execuções: number; sucesso: number; falha: number }[]>([]);

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

      // Fetch automation stats
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const [logsRes, tagsRes, flowsRes] = await Promise.all([
        supabase.from('automation_logs').select('id, status, created_at').eq('company_id', companyId),
        supabase.from('contact_tags').select('id').eq('company_id', companyId),
        supabase.from('automation_flows').select('id, active').eq('company_id', companyId),
      ]);

      const allLogs = logsRes.data || [];
      const totalExec = allLogs.length;
      const successCount = allLogs.filter((l) => l.status === 'executed').length;
      const rate = totalExec > 0 ? Math.round((successCount / totalExec) * 100) : 0;

      setAutoStats({
        totalExecutions: totalExec,
        successRate: rate,
        taggedContacts: tagsRes.data?.length || 0,
        activeFlows: (flowsRes.data || []).filter((f) => f.active).length,
      });

      // Build 7-day chart data
      const chartMap: Record<string, { total: number; success: number; fail: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const key = d.toISOString().split('T')[0];
        chartMap[key] = { total: 0, success: 0, fail: 0 };
      }
      for (const log of allLogs) {
        const day = log.created_at?.split('T')[0];
        if (day && chartMap[day] !== undefined) {
          chartMap[day].total++;
          if (log.status === 'executed') chartMap[day].success++;
          else chartMap[day].fail++;
        }
      }
      setAutoLogs7d(
        Object.entries(chartMap).map(([date, v]) => ({
          date: `${date.split('-')[2]}/${date.split('-')[1]}`,
          execuções: v.total,
          sucesso: v.success,
          falha: v.fail,
        }))
      );
    };

    fetchData();
  }, [companyId]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const userName = user?.email?.split('@')[0] || 'Usuário';

  const statCards = [
    { label: 'Hoje', value: stats.today, icon: Calendar, bgClass: 'bg-primary/10', iconClass: 'text-primary', desc: 'agendamentos' },
    { label: 'Esta semana', value: stats.week, icon: TrendingUp, bgClass: 'bg-info/10', iconClass: 'text-info', desc: 'no total' },
    { label: 'Confirmados', value: stats.confirmed, icon: CheckCircle, bgClass: 'bg-success/10', iconClass: 'text-success', desc: 'da semana' },
    { label: 'Cancelados', value: stats.canceled, icon: XCircle, bgClass: 'bg-destructive/10', iconClass: 'text-destructive', desc: 'da semana' },
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
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' });
    return `${weekday}, ${d}/${m}`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Welcome header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {greeting()}, <span className="capitalize">{userName}</span> 👋
            </h1>
            <p className="text-muted-foreground mt-1">Aqui está o resumo do seu negócio</p>
          </div>
          <Link to="/agendamentos">
            <Button className="gap-2 rounded-xl shadow-sm">
              <CalendarPlus className="h-4 w-4" />
              Novo Agendamento
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((s, i) => (
            <Card key={s.label} className="glass-card rounded-2xl overflow-hidden border-0 shadow-sm hover:shadow-md transition-all duration-300" style={{ animationDelay: `${i * 50}ms` }}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={`stat-icon-box ${s.bgClass} rounded-xl`}>
                    <s.icon className={`h-5 w-5 ${s.iconClass}`} />
                  </div>
                </div>
                <p className="text-3xl font-extrabold tracking-tight">{s.value}</p>
                <p className="text-sm text-muted-foreground font-medium mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Automation Stats */}
        <Card className="glass-card-static rounded-2xl overflow-hidden border-0 shadow-sm">
          <CardHeader className="pb-2 px-6 pt-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-amber-500" />
                </div>
                Automações
              </CardTitle>
              <Link to="/automacoes" className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
                Gerenciar <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-3">
              {[
                { label: 'Fluxos ativos', value: autoStats.activeFlows, icon: Zap, bgClass: 'bg-amber-500/10', iconClass: 'text-amber-500' },
                { label: 'Execuções', value: autoStats.totalExecutions, icon: BarChart3, bgClass: 'bg-info/10', iconClass: 'text-info' },
                { label: 'Taxa de sucesso', value: `${autoStats.successRate}%`, icon: CheckCircle, bgClass: 'bg-success/10', iconClass: 'text-success' },
                { label: 'Contatos tagueados', value: autoStats.taggedContacts, icon: Tag, bgClass: 'bg-purple-500/10', iconClass: 'text-purple-500' },
              ].map((s, i) => (
                <div key={s.label} className="flex items-center gap-3 p-4 rounded-xl bg-muted/40">
                  <div className={`h-10 w-10 rounded-xl ${s.bgClass} flex items-center justify-center flex-shrink-0`}>
                    <s.icon className={`h-5 w-5 ${s.iconClass}`} />
                  </div>
                  <div>
                    <p className="text-xl font-extrabold tracking-tight">{s.value}</p>
                    <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Automation Chart - 7 days */}
        <Card className="glass-card-static rounded-2xl overflow-hidden border-0 shadow-sm">
          <CardHeader className="pb-2 px-6 pt-6">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-info/10 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-info" />
              </div>
              Execuções — Últimos 7 dias
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            {autoLogs7d.length > 0 ? (
              <div className="h-[260px] mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={autoLogs7d} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} className="text-muted-foreground" />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="execuções" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="sucesso" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="falha" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma execução registrada nos últimos 7 dias</p>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card-static rounded-2xl overflow-hidden border-0 shadow-sm">
          <CardHeader className="pb-2 px-6 pt-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-primary" />
                </div>
                Próximos agendamentos
              </CardTitle>
              <Link to="/agendamentos" className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
                Ver todos <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            {upcoming.length === 0 ? (
              <div className="text-center py-16">
                <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <Calendar className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="text-foreground font-semibold">Nenhum agendamento próximo</p>
                <p className="text-sm text-muted-foreground mt-1">Os agendamentos aparecerão aqui quando criados</p>
                <Link to="/agendamentos">
                  <Button variant="outline" className="mt-4 rounded-xl gap-2">
                    <CalendarPlus className="h-4 w-4" />
                    Criar agendamento
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2 mt-3">
                {upcoming.map((apt, i) => (
                  <div
                    key={apt.id}
                    className="flex items-center justify-between p-4 rounded-xl bg-muted/40 hover:bg-muted/70 transition-all duration-200 group cursor-pointer"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary-glow/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary font-bold text-sm">
                          {apt.client_name?.charAt(0)?.toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{apt.client_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
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
