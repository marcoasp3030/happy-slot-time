import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function Appointments() {
  const { companyId } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  const fetchAppointments = async () => {
    if (!companyId) return;
    let query = supabase
      .from('appointments')
      .select('*, services(name)')
      .eq('company_id', companyId)
      .order('appointment_date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(100);

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (dateFilter) query = query.eq('appointment_date', dateFilter);

    const { data } = await query;
    setAppointments(data || []);
  };

  useEffect(() => { fetchAppointments(); }, [companyId, statusFilter, dateFilter]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
    if (error) { toast.error('Erro ao atualizar'); return; }
    toast.success('Status atualizado');
    fetchAppointments();
  };

  const statusLabel: Record<string, string> = {
    pending: 'Pendente', confirmed: 'Confirmado', canceled: 'Cancelado',
    completed: 'Concluído', rescheduled: 'Remarcado', no_show: 'Não compareceu',
  };

  const statusClass: Record<string, string> = {
    pending: 'status-pending', confirmed: 'status-confirmed', canceled: 'status-canceled',
    completed: 'status-completed', rescheduled: 'status-pending', no_show: 'status-canceled',
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Agendamentos</h1>
          <p className="text-muted-foreground">Gerencie todos os agendamentos</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="confirmed">Confirmado</SelectItem>
              <SelectItem value="canceled">Cancelado</SelectItem>
              <SelectItem value="completed">Concluído</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-[180px]" />
          {dateFilter && <Button variant="outline" size="sm" onClick={() => setDateFilter('')}>Limpar data</Button>}
        </div>

        <Card className="glass-card">
          <CardContent className="p-0">
            {appointments.length === 0 ? (
              <p className="text-muted-foreground text-sm py-12 text-center">Nenhum agendamento encontrado</p>
            ) : (
              <div className="divide-y divide-border">
                {appointments.map((apt) => (
                  <div key={apt.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary font-semibold text-sm">
                          {apt.client_name?.charAt(0)?.toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{apt.client_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {apt.services?.name} · {apt.appointment_date} · {apt.start_time?.slice(0, 5)} - {apt.end_time?.slice(0, 5)}
                        </p>
                        <p className="text-xs text-muted-foreground">{apt.client_phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={statusClass[apt.status] || 'status-pending'}>
                        {statusLabel[apt.status] || apt.status}
                      </span>
                      <Select value={apt.status} onValueChange={(v) => updateStatus(apt.id, v)}>
                        <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="confirmed">Confirmado</SelectItem>
                          <SelectItem value="canceled">Cancelado</SelectItem>
                          <SelectItem value="completed">Concluído</SelectItem>
                          <SelectItem value="no_show">Não compareceu</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
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
