import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, CheckCircle2, Loader2, Unlink, ExternalLink, LogOut, User } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface GoogleCalendarItem {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor: string | null;
}

export default function StaffDashboard() {
  const { user, signOut, staffId, companyId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [staffName, setStaffName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [status, setStatus] = useState<{ connected: boolean; email: string | null; calendarId: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [calendars, setCalendars] = useState<GoogleCalendarItem[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState(false);

  useEffect(() => {
    const loadInfo = async () => {
      if (!staffId || !companyId) return;
      
      const [staffRes, companyRes] = await Promise.all([
        supabase.from('staff').select('name').eq('id', staffId).single(),
        supabase.from('companies').select('name').eq('id', companyId).single(),
      ]);
      setStaffName(staffRes.data?.name || '');
      setCompanyName(companyRes.data?.name || '');
    };
    loadInfo();
  }, [staffId, companyId]);

  const fetchStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar/staff-status', {
        method: 'GET',
      });
      if (error) throw error;
      setStatus(data);
    } catch (err) {
      console.error('Failed to fetch status:', err);
      setStatus({ connected: false, email: null, calendarId: 'primary' });
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendars = async () => {
    setLoadingCalendars(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar/staff-calendars', {
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
    if (staffId) fetchStatus();
  }, [staffId]);

  useEffect(() => {
    if (status?.connected) fetchCalendars();
  }, [status?.connected]);

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
      const { data, error } = await supabase.functions.invoke('google-calendar/staff-authorize', {
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
      const { error } = await supabase.functions.invoke('google-calendar/staff-disconnect', {
        method: 'POST',
      });
      if (error) throw error;
      setStatus({ connected: false, email: null, calendarId: 'primary' });
      setCalendars([]);
      toast({ title: 'Desconectado', description: 'Google Agenda desconectado.' });
    } catch (err) {
      toast({ title: 'Erro', description: 'Não foi possível desconectar.', variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleCalendarChange = async (calendarId: string) => {
    setSavingCalendar(true);
    try {
      const { error } = await supabase.functions.invoke('google-calendar/staff-set-calendar', {
        method: 'POST',
        body: { calendarId },
      });
      if (error) throw error;
      setStatus(prev => prev ? { ...prev, calendarId } : prev);
      toast({ title: 'Salvo', description: 'Agenda selecionada.' });
    } catch (err) {
      toast({ title: 'Erro', description: 'Não foi possível salvar.', variant: 'destructive' });
    } finally {
      setSavingCalendar(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const userInitial = staffName?.charAt(0)?.toUpperCase() || 'P';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/60 bg-background/80 backdrop-blur-xl px-4 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
            <Calendar className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <span className="text-sm font-extrabold tracking-tight">AgendaFácil</span>
            <p className="text-xs text-muted-foreground">{companyName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
              {userInitial}
            </AvatarFallback>
          </Avatar>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground">
            <LogOut className="h-4 w-4 mr-1" />
            Sair
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 lg:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Olá, {staffName}!</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie sua conexão com o Google Agenda
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
                  <CardDescription>Conecte sua agenda para receber agendamentos</CardDescription>
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
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Agenda</label>
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
                  Conecte sua conta Google para receber agendamentos diretamente na sua agenda.
                </p>
                <Button onClick={handleConnect} disabled={connecting}>
                  {connecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                  {connecting ? 'Aguardando autorização...' : 'Conectar Google Agenda'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
