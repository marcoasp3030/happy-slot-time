import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Calendar, Filter, Search, Clock, Phone, User, CheckCircle2, Layers,
  XCircle, AlertCircle, MoreHorizontal, ChevronLeft, ChevronRight,
  CalendarDays, Users, RefreshCw, Video, Download
} from 'lucide-react';
import { generateGoogleCalendarLink, generateOutlookCalendarLink, downloadICSFile } from '@/lib/calendarLinks';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';

const statusConfig: Record<string, { label: string; color: string; icon: any; bg: string }> = {
  pending: { label: 'Pendente', color: 'text-amber-600', icon: AlertCircle, bg: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800' },
  confirmed: { label: 'Confirmado', color: 'text-emerald-600', icon: CheckCircle2, bg: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800' },
  canceled: { label: 'Cancelado', color: 'text-red-500', icon: XCircle, bg: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800' },
  completed: { label: 'Concluído', color: 'text-blue-600', icon: CheckCircle2, bg: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800' },
  no_show: { label: 'Não compareceu', color: 'text-gray-500', icon: XCircle, bg: 'bg-gray-50 border-gray-200 dark:bg-gray-950/30 dark:border-gray-800' },
  rescheduled: { label: 'Remarcado', color: 'text-purple-600', icon: RefreshCw, bg: 'bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800' },
};

export default function Appointments() {
  const { companyId } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewTab, setViewTab] = useState('upcoming');

  const fetchAppointments = async () => {
    if (!companyId) return;
    setLoading(true);
    let query = supabase
      .from('appointments')
      .select('*, services(name, color, duration, requires_sessions), staff(name)')
      .eq('company_id', companyId)
      .order('appointment_date', { ascending: viewTab === 'upcoming' })
      .order('start_time', { ascending: true })
      .limit(200);

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (dateFilter) query = query.eq('appointment_date', dateFilter);

    const today = new Date().toISOString().split('T')[0];
    if (viewTab === 'upcoming') {
      query = query.gte('appointment_date', today);
    } else if (viewTab === 'past') {
      query = query.lt('appointment_date', today);
    }

    const { data } = await query;
    setAppointments(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAppointments(); }, [companyId, statusFilter, dateFilter, viewTab]);

  const filteredAppointments = useMemo(() => {
    if (!searchQuery.trim()) return appointments;
    const q = searchQuery.toLowerCase();
    return appointments.filter(a =>
      a.client_name?.toLowerCase().includes(q) ||
      a.client_phone?.includes(q) ||
      a.services?.name?.toLowerCase().includes(q) ||
      a.staff?.name?.toLowerCase().includes(q)
    );
  }, [appointments, searchQuery]);

  // Group by date
  const groupedByDate = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredAppointments.forEach(apt => {
      const date = apt.appointment_date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(apt);
    });
    return groups;
  }, [filteredAppointments]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
    if (error) { toast.error('Erro ao atualizar'); return; }
    toast.success('Status atualizado');

    // Send WhatsApp notification for confirmed/canceled/rescheduled
    if (['confirmed', 'canceled', 'rescheduled'].includes(status)) {
      supabase.functions.invoke('notify-appointment-status', {
        body: { appointment_id: id, new_status: status },
      }).then(({ data, error: notifErr }) => {
        if (notifErr) {
          console.error('WhatsApp notification error:', notifErr);
        } else if (data?.sent) {
          toast.success('Notificação WhatsApp enviada');
        } else if (data?.success && !data?.sent) {
          // Notification disabled or no template - silent
        } else {
          console.warn('WhatsApp notification issue:', data);
        }
      });
    }

    // Audit log for status change
    const apt = appointments.find(a => a.id === id);
    logAudit({
      companyId,
      action: `Agendamento ${statusConfig[status]?.label || status}`,
      category: 'appointment',
      entityType: 'appointment',
      entityId: id,
      details: { client: apt?.client_name, status, service: apt?.services?.name },
    });
    if (status === 'completed') {
      const apt = appointments.find(a => a.id === id);
      if (apt?.service_id && apt.services) {
        // Check if service requires sessions
        const { data: svc } = await supabase.from('services').select('requires_sessions').eq('id', apt.service_id).single();
        if (svc?.requires_sessions) {
          // Find active package for this client + service
          const { data: pkg } = await supabase.from('session_packages')
            .select('id, total_sessions')
            .eq('company_id', companyId!)
            .eq('client_phone', apt.client_phone)
            .eq('service_id', apt.service_id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          let packageId = pkg?.id;

          // If no package exists, create one automatically
          if (!packageId) {
            const { data: newPkg } = await supabase.from('session_packages').insert({
              company_id: companyId!,
              client_name: apt.client_name,
              client_phone: apt.client_phone,
              service_id: apt.service_id,
              notes: 'Pacote criado automaticamente',
            }).select('id').single();
            packageId = newPkg?.id;
            if (packageId) toast.info('Pacote de sessões criado automaticamente');
          }

          if (packageId) {
            // Count existing sessions
            const { count } = await supabase.from('sessions')
              .select('id', { count: 'exact', head: true })
              .eq('package_id', packageId);
            const nextNumber = (count || 0) + 1;

            const { error: sessErr } = await supabase.from('sessions').insert({
              company_id: companyId!,
              package_id: packageId,
              session_number: nextNumber,
              session_date: apt.appointment_date,
              appointment_id: apt.id,
              notes: `Sessão registrada automaticamente do agendamento`,
            });

            if (!sessErr) {
              toast.success(`Sessão ${nextNumber} registrada automaticamente`);
              // Auto-complete package if total reached
              if (pkg?.total_sessions && nextNumber >= pkg.total_sessions) {
                await supabase.from('session_packages').update({ status: 'completed' }).eq('id', packageId);
                toast.info('Pacote de sessões concluído!');
              }
            }
          }
        }
      }
    }

    fetchAppointments();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const isToday = dateStr === today.toISOString().split('T')[0];
    const isTomorrow = dateStr === tomorrow.toISOString().split('T')[0];

    const formatted = date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

    if (isToday) return `Hoje — ${formatted}`;
    if (isTomorrow) return `Amanhã — ${formatted}`;
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };

  // Stats
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayApts = appointments.filter(a => a.appointment_date === today);
    return {
      total: appointments.length,
      today: todayApts.length,
      pending: appointments.filter(a => a.status === 'pending').length,
      confirmed: appointments.filter(a => a.status === 'confirmed').length,
    };
  }, [appointments]);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="section-header mb-0">
            <h1 className="section-title">Agendamentos</h1>
            <p className="section-subtitle">Gerencie todos os agendamentos do seu negócio</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAppointments} className="self-start sm:self-auto">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Atualizar
          </Button>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: stats.total, icon: CalendarDays, color: 'text-primary' },
            { label: 'Hoje', value: stats.today, icon: Calendar, color: 'text-emerald-600' },
            { label: 'Pendentes', value: stats.pending, icon: AlertCircle, color: 'text-amber-600' },
            { label: 'Confirmados', value: stats.confirmed, icon: CheckCircle2, color: 'text-blue-600' },
          ].map(s => (
            <Card key={s.label} className="glass-card-static rounded-xl">
              <CardContent className="p-3.5 flex items-center gap-3">
                <div className={`h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0`}>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-extrabold leading-none">{s.value}</p>
                  <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs + Filters */}
        <div className="flex flex-col gap-3">
          <Tabs value={viewTab} onValueChange={setViewTab}>
            <TabsList className="h-9">
              <TabsTrigger value="upcoming" className="text-xs px-3">Próximos</TabsTrigger>
              <TabsTrigger value="past" className="text-xs px-3">Passados</TabsTrigger>
              <TabsTrigger value="all" className="text-xs px-3">Todos</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar cliente, serviço..."
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[150px] h-9 text-sm">
                <Filter className="h-3 w-3 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="confirmed">Confirmado</SelectItem>
                <SelectItem value="completed">Concluído</SelectItem>
                <SelectItem value="canceled">Cancelado</SelectItem>
                <SelectItem value="rescheduled">Remarcado</SelectItem>
                <SelectItem value="no_show">Não compareceu</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="flex-1 sm:w-[160px] h-9 text-sm"
              />
              {dateFilter && (
                <Button variant="ghost" size="sm" onClick={() => setDateFilter('')} className="h-9 px-2 text-xs">
                  ✕
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Appointments list grouped by date */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-pulse text-muted-foreground text-sm">Carregando agendamentos...</div>
          </div>
        ) : filteredAppointments.length === 0 ? (
          <Card className="glass-card-static rounded-2xl">
            <CardContent className="flex flex-col items-center justify-center py-16 px-4">
              <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <Calendar className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-semibold text-sm">Nenhum agendamento encontrado</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Tente alterar os filtros ou a busca</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedByDate).map(([date, apts]) => (
              <div key={date}>
                {/* Date header */}
                <div className="flex items-center gap-2 mb-2.5">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">{formatDate(date)}</h3>
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-semibold">
                    {apts.length}
                  </Badge>
                </div>

                {/* Cards for this date */}
                <div className="grid gap-2">
                  {apts.map((apt) => {
                    const sc = statusConfig[apt.status] || statusConfig.pending;
                    const StatusIcon = sc.icon;
                    return (
                      <Card key={apt.id} className={`rounded-xl border transition-all hover:shadow-sm ${sc.bg}`}>
                        <CardContent className="p-3.5">
                          <div className="flex items-start gap-3">
                            {/* Time column */}
                            <div className="flex flex-col items-center flex-shrink-0 min-w-[52px]">
                              <span className="text-sm font-extrabold text-foreground">{apt.start_time?.slice(0, 5)}</span>
                              <span className="text-[10px] text-muted-foreground">até</span>
                              <span className="text-xs font-semibold text-muted-foreground">{apt.end_time?.slice(0, 5)}</span>
                            </div>

                            {/* Divider */}
                            <div className="w-px h-12 bg-border/80 flex-shrink-0 self-center" />

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-bold text-sm text-foreground truncate">{apt.client_name}</p>
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                                    {apt.services?.name && (
                                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        <span
                                          className="h-2 w-2 rounded-full flex-shrink-0"
                                          style={{ backgroundColor: apt.services.color || 'hsl(var(--primary))' }}
                                        />
                                        {apt.services.name}
                                        {apt.services.duration && (
                                          <span className="text-muted-foreground/60">· {apt.services.duration}min</span>
                                        )}
                                      </span>
                                    )}
                                    {apt.staff?.name && (
                                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        <User className="h-2.5 w-2.5" />
                                        {apt.staff.name}
                                      </span>
                                    )}
                                    {apt.services?.requires_sessions && (
                                      <span className="text-xs text-primary/80 flex items-center gap-1 font-medium">
                                        <Layers className="h-2.5 w-2.5" />
                                        Sessões
                                      </span>
                                    )}
                                    {apt.meet_link && (
                                      <a
                                        href={apt.meet_link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={apt.meet_link}
                                        className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 font-medium hover:underline"
                                      >
                                        <Video className="h-2.5 w-2.5" />
                                        Meet
                                      </a>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 mt-1">
                                    <Phone className="h-2.5 w-2.5 text-muted-foreground/60" />
                                    <a href={`tel:${apt.client_phone}`} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                                      {apt.client_phone}
                                    </a>
                                  </div>
                                </div>

                                {/* Status + actions */}
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold ${sc.color} bg-background/60`}>
                                    <StatusIcon className="h-3 w-3" />
                                    <span className="hidden sm:inline">{sc.label}</span>
                                  </div>

                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7">
                                        <MoreHorizontal className="h-3.5 w-3.5" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-44">
                                      <DropdownMenuItem onClick={() => updateStatus(apt.id, 'confirmed')} className="text-emerald-600">
                                        <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                                        Confirmar
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => updateStatus(apt.id, 'completed')} className="text-blue-600">
                                        <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                                        Concluir
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onClick={() => updateStatus(apt.id, 'no_show')} className="text-gray-500">
                                        <XCircle className="h-3.5 w-3.5 mr-2" />
                                        Não compareceu
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => updateStatus(apt.id, 'canceled')} className="text-red-500">
                                        <XCircle className="h-3.5 w-3.5 mr-2" />
                                        Cancelar
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem asChild>
                                        <a href={`https://wa.me/${apt.client_phone?.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                                          <Phone className="h-3.5 w-3.5 mr-2" />
                                          WhatsApp
                                        </a>
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem asChild>
                                        <a
                                          href={generateOutlookCalendarLink({
                                            title: `${apt.services?.name || 'Agendamento'} - ${apt.client_name}`,
                                            description: `Cliente: ${apt.client_name}\nTelefone: ${apt.client_phone}`,
                                            startDate: apt.appointment_date,
                                            startTime: apt.start_time?.slice(0, 5),
                                            endTime: apt.end_time?.slice(0, 5),
                                          })}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          <Calendar className="h-3.5 w-3.5 mr-2" />
                                          Adicionar ao Outlook
                                        </a>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => downloadICSFile({
                                          title: `${apt.services?.name || 'Agendamento'} - ${apt.client_name}`,
                                          description: `Cliente: ${apt.client_name}\nTelefone: ${apt.client_phone}`,
                                          startDate: apt.appointment_date,
                                          startTime: apt.start_time?.slice(0, 5),
                                          endTime: apt.end_time?.slice(0, 5),
                                        })}
                                      >
                                        <Download className="h-3.5 w-3.5 mr-2" />
                                        Baixar .ics
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>

                              {apt.notes && (
                                <p className="text-[11px] text-muted-foreground mt-1.5 bg-background/40 rounded px-2 py-1 truncate">
                                  💬 {apt.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
