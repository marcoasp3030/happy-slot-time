import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, Calendar, CreditCard, TrendingUp, Activity } from 'lucide-react';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalCompanies: 0,
    totalAppointments: 0,
    totalServices: 0,
    totalStaff: 0,
    activeTrials: 0,
    activeSubscriptions: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      const [companies, appointments, services, staff, subscriptions] = await Promise.all([
        supabase.from('companies').select('id', { count: 'exact', head: true }),
        supabase.from('appointments').select('id', { count: 'exact', head: true }),
        supabase.from('services').select('id', { count: 'exact', head: true }),
        supabase.from('staff').select('id', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('status'),
      ]);

      const subs = subscriptions.data || [];
      setStats({
        totalCompanies: companies.count || 0,
        totalAppointments: appointments.count || 0,
        totalServices: services.count || 0,
        totalStaff: staff.count || 0,
        activeTrials: subs.filter(s => s.status === 'trial').length,
        activeSubscriptions: subs.filter(s => s.status === 'active').length,
      });
    };

    fetchStats();
  }, []);

  const cards = [
    { label: 'Empresas', value: stats.totalCompanies, icon: Building2, bgClass: 'bg-primary/10', iconClass: 'text-primary' },
    { label: 'Agendamentos', value: stats.totalAppointments, icon: Calendar, bgClass: 'bg-info/10', iconClass: 'text-info' },
    { label: 'Serviços', value: stats.totalServices, icon: Activity, bgClass: 'bg-success/10', iconClass: 'text-success' },
    { label: 'Profissionais', value: stats.totalStaff, icon: Users, bgClass: 'bg-warning/10', iconClass: 'text-warning' },
    { label: 'Trials Ativos', value: stats.activeTrials, icon: TrendingUp, bgClass: 'bg-accent', iconClass: 'text-accent-foreground' },
    { label: 'Assinaturas Ativas', value: stats.activeSubscriptions, icon: CreditCard, bgClass: 'bg-destructive/10', iconClass: 'text-destructive' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="section-header">
          <h1 className="section-title">Visão Geral da Plataforma</h1>
          <p className="section-subtitle">Métricas gerais do SaaS AgendaFácil</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((s, i) => (
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
      </div>
    </AdminLayout>
  );
}
