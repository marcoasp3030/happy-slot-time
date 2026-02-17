import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, CheckCircle2, Loader2, Unlink, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface GoogleCalendar {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor: string | null;
}

export default function GoogleCalendarSettings() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<{ connected: boolean; email: string | null; connectedAt: string | null; calendarId: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState(false);

  const fetchStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar/status', {
        method: 'GET',
      });
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
      const { data, error } = await supabase.functions.invoke('google-calendar/calendars', {
        method: 'GET',
      });
      if (error) throw error;
      setCalendars(data?.calendars || []);
    } catch (err) {
      console.error('Failed to fetch calendars:', err);
    } finally {
      setLoadingCalendars(false);
    }
  };

  useEffect(() => {
    if (session) fetchStatus();
  }, [session]);

  // Fetch calendars when connected
  useEffect(() => {
    if (status?.connected) {
      fetchCalendars();
    }
  }, [status?.connected]);

  // Poll for connection after returning from OAuth
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
      const { data, error } = await supabase.functions.invoke('google-calendar/authorize', {
        method: 'GET',
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank', 'width=600,height=700');
      }
    } catch (err) {
      console.error('Failed to start auth:', err);
      toast({ title: 'Erro', description: 'Não foi possível iniciar a conexão.', variant: 'destructive' });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke('google-calendar/disconnect', {
        method: 'POST',
      });
      if (error) throw error;
      setStatus({ connected: false, email: null, connectedAt: null, calendarId: 'primary' });
      setCalendars([]);
      toast({ title: 'Desconectado', description: 'Google Agenda desconectado com sucesso.' });
    } catch (err) {
      console.error('Failed to disconnect:', err);
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
      console.error('Failed to set calendar:', err);
      toast({ title: 'Erro', description: 'Não foi possível salvar a agenda.', variant: 'destructive' });
    } finally {
      setSavingCalendar(false);
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

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Google Calendar</CardTitle>
                  <CardDescription>Sincronize seus agendamentos com o Google Agenda</CardDescription>
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
                    {status.email && (
                      <p className="text-sm text-muted-foreground">{status.email}</p>
                    )}
                    {status.connectedAt && (
                      <p className="text-xs text-muted-foreground">
                        Conectado em {new Date(status.connectedAt).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Calendar selector */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Agenda para sincronização</label>
                  <p className="text-xs text-muted-foreground">
                    Escolha em qual agenda do Google os agendamentos serão criados
                  </p>
                  {loadingCalendars ? (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Carregando agendas...</span>
                    </div>
                  ) : (
                    <Select
                      value={status.calendarId || 'primary'}
                      onValueChange={handleCalendarChange}
                      disabled={savingCalendar}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma agenda" />
                      </SelectTrigger>
                      <SelectContent>
                        {calendars.map((cal) => (
                          <SelectItem key={cal.id} value={cal.id}>
                            <div className="flex items-center gap-2">
                              {cal.backgroundColor && (
                                <div
                                  className="h-3 w-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: cal.backgroundColor }}
                                />
                              )}
                              <span>{cal.summary}</span>
                              {cal.primary && (
                                <span className="text-xs text-muted-foreground">(principal)</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">O que será sincronizado:</p>
                  <ul className="space-y-1.5">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      Novos agendamentos criados automaticamente no Google Agenda
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      Agendamentos cancelados removidos do Google Agenda
                    </li>
                  </ul>
                </div>

                <Button
                  variant="outline"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="text-destructive hover:text-destructive"
                >
                  {disconnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Unlink className="h-4 w-4 mr-2" />
                  )}
                  Desconectar
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Ao conectar sua conta Google, seus agendamentos serão sincronizados automaticamente
                    com seu Google Agenda. Novos agendamentos criarão eventos e cancelamentos os removerão.
                  </p>
                </div>

                <Button onClick={handleConnect} disabled={connecting}>
                  {connecting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                  )}
                  {connecting ? 'Aguardando autorização...' : 'Conectar Google Agenda'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
