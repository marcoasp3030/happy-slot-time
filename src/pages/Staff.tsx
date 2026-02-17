import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, User, Link2, Copy, CheckCircle2, Calendar, Loader2, ShieldCheck, Unlink } from 'lucide-react';
import { toast } from 'sonner';

export default function Staff() {
  const { companyId } = useAuth();
  const [staff, setStaff] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [connectingStaffId, setConnectingStaffId] = useState<string | null>(null);
  const [disconnectingStaffId, setDisconnectingStaffId] = useState<string | null>(null);
  const [staffCalendarStatus, setStaffCalendarStatus] = useState<Record<string, string | null>>({});

  const fetchStaff = async () => {
    if (!companyId) return;
    const { data } = await supabase.from('staff').select('*').eq('company_id', companyId).order('name');
    setStaff(data || []);
  };

  const fetchCalendarStatuses = async () => {
    if (!companyId) return;
    const { data: tokens } = await supabase
      .from('google_calendar_tokens')
      .select('staff_id, connected_email')
      .eq('company_id', companyId)
      .not('staff_id', 'is', null);

    const map: Record<string, string | null> = {};
    (tokens || []).forEach(t => {
      if (t.staff_id) map[t.staff_id] = t.connected_email;
    });
    setStaffCalendarStatus(map);
  };

  useEffect(() => {
    fetchStaff();
    fetchCalendarStatuses();
  }, [companyId]);

  const openNew = () => { setEditing(null); setName(''); setOpen(true); };
  const openEdit = (s: any) => { setEditing(s); setName(s.name); setOpen(true); };

  const generateToken = () => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  };

  const handleSave = async () => {
    if (!companyId || !name.trim()) return;
    if (editing) {
      await supabase.from('staff').update({ name: name.trim() }).eq('id', editing.id);
      toast.success('Profissional atualizado');
    } else {
      await supabase.from('staff').insert({
        company_id: companyId,
        name: name.trim(),
        invite_token: generateToken(),
      });
      toast.success('Profissional adicionado');
    }
    setOpen(false);
    fetchStaff();
  };

  const handleToggle = async (s: any) => {
    await supabase.from('staff').update({ active: !s.active }).eq('id', s.id);
    fetchStaff();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir?')) return;
    await supabase.from('staff').delete().eq('id', id);
    toast.success('Excluído');
    fetchStaff();
  };

  const handleGenerateInvite = async (s: any) => {
    const token = generateToken();
    await supabase.from('staff').update({ invite_token: token, invite_status: 'pending' }).eq('id', s.id);
    toast.success('Link de convite gerado!');
    fetchStaff();
  };

  const copyInviteLink = (s: any) => {
    if (!s.invite_token) return;
    const url = `${window.location.origin}/convite/${s.invite_token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(s.id);
    toast.success('Link copiado!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleValidateInvite = async (s: any) => {
    await supabase.from('staff').update({ invite_status: 'accepted' }).eq('id', s.id);
    toast.success('Convite validado com sucesso!');
    fetchStaff();
  };

  const handleConnectCalendar = async (staffId: string) => {
    setConnectingStaffId(staffId);
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar/owner-authorize-staff', {
        method: 'POST',
        body: { staffId },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank', 'width=600,height=700');
        // Listen for focus to refresh status
        const onFocus = () => {
          fetchCalendarStatuses();
          setConnectingStaffId(null);
          window.removeEventListener('focus', onFocus);
        };
        window.addEventListener('focus', onFocus);
      }
    } catch (err) {
      toast.error('Erro ao conectar Google Agenda');
      setConnectingStaffId(null);
    }
  };

  const handleDisconnectCalendar = async (staffId: string) => {
    if (!confirm('Desconectar a agenda Google deste profissional?')) return;
    setDisconnectingStaffId(staffId);
    try {
      const { error } = await supabase.functions.invoke('google-calendar/owner-disconnect-staff', {
        method: 'POST',
        body: { staffId },
      });
      if (error) throw error;
      toast.success('Agenda desconectada!');
      fetchCalendarStatuses();
    } catch (err) {
      toast.error('Erro ao desconectar agenda');
    } finally {
      setDisconnectingStaffId(null);
    }
  };

  const getInviteStatusBadge = (s: any) => {
    if (s.invite_status === 'accepted') {
      return <Badge variant="default" className="text-xs">Conectado</Badge>;
    }
    if (s.invite_token) {
      return <Badge variant="secondary" className="text-xs">Convite pendente</Badge>;
    }
    return null;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="section-header mb-0">
            <h1 className="section-title">Profissionais</h1>
            <p className="section-subtitle">Gerencie sua equipe</p>
          </div>
          <Button onClick={openNew} className="gradient-primary border-0 font-semibold self-start sm:self-auto">
            <Plus className="h-4 w-4 mr-2" />Novo profissional
          </Button>
        </div>

        {staff.length === 0 ? (
          <Card className="glass-card-static rounded-2xl">
            <CardContent className="py-12 text-center">
              <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">Nenhum profissional cadastrado</p>
              <Button className="mt-4 gradient-primary border-0" onClick={openNew}>Adicionar primeiro</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {staff.map((s) => (
              <Card key={s.id} className={`glass-card rounded-2xl ${!s.active ? 'opacity-50' : ''}`}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm truncate">{s.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-xs text-muted-foreground">{s.active ? 'Ativo' : 'Inativo'}</p>
                        {getInviteStatusBadge(s)}
                        {staffCalendarStatus[s.id] && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Calendar className="h-3 w-3" />
                            Agenda
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Switch checked={s.active} onCheckedChange={() => handleToggle(s)} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(s)} className="text-xs h-8">
                      <Pencil className="h-3 w-3 mr-1" />Editar
                    </Button>
                    {s.invite_status !== 'accepted' && (
                      s.invite_token ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => copyInviteLink(s)} className="text-xs h-8">
                            {copiedId === s.id ? (
                              <><CheckCircle2 className="h-3 w-3 mr-1 text-primary" />Copiado</>
                            ) : (
                              <><Copy className="h-3 w-3 mr-1" />Copiar link</>
                            )}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleValidateInvite(s)} className="text-xs h-8 text-primary hover:text-primary">
                            <ShieldCheck className="h-3 w-3 mr-1" />Validar
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => handleGenerateInvite(s)} className="text-xs h-8">
                          <Link2 className="h-3 w-3 mr-1" />Gerar convite
                        </Button>
                      )
                    )}
                    {!staffCalendarStatus[s.id] ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleConnectCalendar(s.id)}
                        disabled={connectingStaffId === s.id}
                        className="text-xs h-8"
                      >
                        {connectingStaffId === s.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Calendar className="h-3 w-3 mr-1" />
                        )}
                        Conectar Agenda
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDisconnectCalendar(s.id)}
                        disabled={disconnectingStaffId === s.id}
                        className="text-xs h-8 text-destructive hover:text-destructive"
                      >
                        {disconnectingStaffId === s.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Unlink className="h-3 w-3 mr-1" />
                        )}
                        Desconectar Agenda
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => handleDelete(s.id)} className="text-xs h-8 text-destructive hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-bold">{editing ? 'Editar profissional' : 'Novo profissional'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Nome *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do profissional" className="h-10" />
              </div>
              <Button onClick={handleSave} className="w-full gradient-primary border-0 font-semibold h-10">
                {editing ? 'Salvar' : 'Adicionar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
