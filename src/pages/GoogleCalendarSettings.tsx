import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Calendar, CheckCircle2, Loader2, Unlink, ExternalLink, Users, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface GoogleCalendar {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor: string | null;
}

interface StaffCalendarStatus {
  staffId: string;
  staffName: string;
  connected: boolean;
  email: string | null;
}

export default function GoogleCalendarSettings() {
  const { session, companyId } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<{ connected: boolean; email: string | null; connectedAt: string | null; calendarId: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [syncMode, setSyncMode] = useState<string>('company');
  const [savingSyncMode, setSavingSyncMode] = useState(false);
  const [staffStatuses, setStaffStatuses] = useState<StaffCalendarStatus[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  const fetchStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar/status', { method: 'GET' });
      if (error) throw error;
      setStatus(data);
    } catch (err) {
      console.error('Failed to fetch status:', err);
      setStatus({ connected: false, email: null, connectedAt: null, calendarId: 'primary' });
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendars = async () => {
    setLoadingCalendars(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar/calendars', { method: 'GET' });
      if (error) throw error;
      setCalendars(data?.calendars || []);
    } catch (err) {
      console.error('Failed to fetch calendars:', err);
    } finally {
      setLoadingCalendars(false);
    }
  };

  const fetchSyncMode = async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('company_settings')
      .select('google_calendar_sync_mode')
      .eq('company_id', companyId)
      .single();
    setSyncMode(data?.google_calendar_sync_mode || 'company');
  };

  const fetchStaffStatuses = async () => {
    if (!companyId) return;
    setLoadingStaff(true);
    try {
      // Get all staff
      const { data: staffList } = await supabase
        .from('staff')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('name');

      if (!staffList) { setStaffStatuses([]); return; }

      // Get staff tokens
      const { data: tokens } = await supabase
        .from('google_calendar_tokens')
        .select('staff_id, connected_email')
        .eq('company_id', companyId)
        .not('staff_id', 'is', null);

      const tokenMap = new Map((tokens || []).map(t => [t.staff_id, t.connected_email]));

      setStaffStatuses(staffList.map(s => ({
        staffId: s.id,
        staffName: s.name,
        connected: tokenMap.has(s.id),
        email: tokenMap.get(s.id) || null,
      })));
    } finally {
      setLoadingStaff(false);
    }
  };

  useEffect(() => {
    if (session) {
      fetchStatus();
      fetchSyncMode();
    }
  }, [session, companyId]);

  useEffect(() => {
    if (status?.connected) fetchCalendars();
  }, [status?.connected]);

  useEffect(() => {
    if (syncMode === 'per_staff') fetchStaffStatuses();
  }, [syncMode, companyId]);

  useEffect(() => {
    const handleFocus = () => {
      if (connecting) {
        fetchStatus().then(() => setConnecting(false));
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [connecting]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar/authorize', { method: 'GET' });
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank', 'width=600,height=700');
    } catch (err) {
      toast({ title: 'Erro', description: 'Não foi possível iniciar a conexão.', variant: 'destructive' });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke('google-calendar/disconnect', { method: 'POST' });
      if (error) throw error;
      setStatus({ connected: false, email: null, connectedAt: null, calendarId: 'primary' });
      setCalendars([]);
      toast({ title: 'Desconectado', description: 'Google Agenda desconectado com sucesso.' });
    } catch (err) {
      toast({ title: 'Erro', description: 'Não foi possível desconectar.', variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleCalendarChange = async (calendarId: string) => {
    setSavingCalendar(true);
    try {
      const { error } = await supabase.functions.invoke('google-calendar/set-calendar', {
        method: 'POST',
        body: { calendarId },
      });
      if (error) throw error;
      setStatus(prev => prev ? { ...prev, calendarId } : prev);
      toast({ title: 'Salvo', description: 'Agenda selecionada com sucesso.' });
    } catch (err) {
      toast({ title: 'Erro', description: 'Não foi possível salvar a agenda.', variant: 'destructive' });
    } finally {
      setSavingCalendar(false);
    }
  };

  const handleSyncModeChange = async (mode: string) => {
    setSavingSyncMode(true);
    try {
      await supabase
        .from('company_settings')
        .update({ google_calendar_sync_mode: mode })
        .eq('company_id', companyId);
      setSyncMode(mode);
      toast({ title: 'Salvo', description: mode === 'per_staff' ? 'Cada profissional usa sua própria agenda.' : 'Todos usam a agenda da empresa.' });
    } catch (err) {
      toast({ title: 'Erro', description: 'Não foi possível salvar.', variant: 'destructive' });
    } finally {
      setSavingSyncMode(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Google Agenda</h1>
          <p className="text-sm text-muted-foreground">
            Conecte sua conta Google para sincronizar agendamentos automaticamente
          </p>
        </div>

        {/* Sync Mode Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Modo de sincronização</CardTitle>
            <CardDescription>Defina como os agendamentos são sincronizados com o Google Agenda</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={syncMode}
              onValueChange={handleSyncModeChange}
              disabled={savingSyncMode}
              className="space-y-3"
            >
              <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/30 transition-colors">
                <RadioGroupItem value="company" id="company" className="mt-0.5" />
                <Label htmlFor="company" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Agenda da empresa</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Todos os agendamentos vão para uma única agenda conectada pela empresa.</p>
                </Label>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/30 transition-colors">
                <RadioGroupItem value="per_staff" id="per_staff" className="mt-0.5" />
                <Label htmlFor="per_staff" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Agenda por profissional</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Cada profissional conecta sua própria conta Google e recebe os agendamentos na sua agenda pessoal.</p>
                </Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Company Calendar Card (shown when mode is company) */}
        {syncMode === 'company' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Google Calendar</CardTitle>
                    <CardDescription>Agenda compartilhada da empresa</CardDescription>
                  </div>
                </div>
                {!loading && (
                  <Badge variant={status?.connected ? 'default' : 'secondary'}>
                    {status?.connected ? 'Conectado' : 'Desconectado'}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : status?.connected ? (
                <>
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/10">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Conta conectada</p>
                      {status.email && <p className="text-sm text-muted-foreground">{status.email}</p>}
                      {status.connectedAt && (
                        <p className="text-xs text-muted-foreground">
                          Conectado em {new Date(status.connectedAt).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Agenda para sincronização</label>
                    {loadingCalendars ? (
                      <div className="flex items-center gap-2 py-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Carregando agendas...</span>
                      </div>
                    ) : (
                      <Select value={status.calendarId || 'primary'} onValueChange={handleCalendarChange} disabled={savingCalendar}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma agenda" />
                        </SelectTrigger>
                        <SelectContent>
                          {calendars.map((cal) => (
                            <SelectItem key={cal.id} value={cal.id}>
                              <div className="flex items-center gap-2">
                                {cal.backgroundColor && (
                                  <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: cal.backgroundColor }} />
                                )}
                                <span>{cal.summary}</span>
                                {cal.primary && <span className="text-xs text-muted-foreground">(principal)</span>}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <Button variant="outline" onClick={handleDisconnect} disabled={disconnecting} className="text-destructive hover:text-destructive">
                    {disconnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Unlink className="h-4 w-4 mr-2" />}
                    Desconectar
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Conecte sua conta Google para sincronizar agendamentos automaticamente.
                  </p>
                  <Button onClick={handleConnect} disabled={connecting}>
                    {connecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                    {connecting ? 'Aguardando autorização...' : 'Conectar Google Agenda'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Per-Staff Status Card (shown when mode is per_staff) */}
        {syncMode === 'per_staff' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status dos profissionais</CardTitle>
              <CardDescription>
                Cada profissional precisa acessar sua conta e conectar seu próprio Google Agenda.
                Envie o link de convite na página de Profissionais.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingStaff ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : staffStatuses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum profissional ativo cadastrado.</p>
              ) : (
                <div className="space-y-3">
                  {staffStatuses.map((s) => (
                    <div key={s.staffId} className="flex items-center justify-between p-3 rounded-lg border border-border">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Users className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{s.staffName}</p>
                          {s.email && <p className="text-xs text-muted-foreground">{s.email}</p>}
                        </div>
                      </div>
                      <Badge variant={s.connected ? 'default' : 'secondary'}>
                        {s.connected ? 'Conectado' : 'Pendente'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
