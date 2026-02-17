import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, Send, Clock, CheckCircle, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface Notification {
  id: string;
  title: string;
  message: string;
  target: string;
  sent_at: string;
  recipient_count: number;
}

export default function AdminNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', message: '', target: 'all' });
  const { toast } = useToast();

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('admin_notifications')
      .select('*')
      .order('sent_at', { ascending: false });
    setNotifications(data || []);
    setLoading(false);
  };

  const sendNotification = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      toast({ title: 'Preencha título e mensagem', variant: 'destructive' });
      return;
    }
    if (!user) return;

    setSending(true);

    // Get target companies
    let query = supabase.from('companies').select('id');
    if (form.target === 'active') {
      query = query.eq('blocked', false);
    } else if (form.target === 'blocked') {
      query = query.eq('blocked', true);
    }

    const { data: companies } = await query;
    const companyIds = (companies || []).map(c => c.id);

    // Create notification
    const { data: notification, error } = await supabase
      .from('admin_notifications')
      .insert({
        title: form.title,
        message: form.message,
        target: form.target,
        sent_by: user.id,
        recipient_count: companyIds.length,
      })
      .select()
      .single();

    if (error || !notification) {
      toast({ title: 'Erro ao enviar notificação', variant: 'destructive' });
      setSending(false);
      return;
    }

    // Create company notifications
    if (companyIds.length > 0) {
      const inserts = companyIds.map(cid => ({
        company_id: cid,
        notification_id: notification.id,
      }));

      await supabase.from('company_notifications').insert(inserts);
    }

    toast({ title: `Notificação enviada para ${companyIds.length} empresa(s)!` });
    setForm({ title: '', message: '', target: 'all' });
    setOpen(false);
    setSending(false);
    fetchNotifications();
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const targetLabels: Record<string, string> = {
    all: 'Todas as empresas',
    active: 'Empresas ativas',
    blocked: 'Empresas bloqueadas',
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="section-header">
            <h1 className="section-title">Notificações</h1>
            <p className="section-subtitle">Envie notificações em massa para os lojistas</p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Send className="h-4 w-4" />
                Nova Notificação
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Enviar Notificação</DialogTitle>
                <DialogDescription>A notificação será enviada para as empresas selecionadas.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Destinatários</Label>
                  <Select value={form.target} onValueChange={(v) => setForm(f => ({ ...f, target: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as empresas</SelectItem>
                      <SelectItem value="active">Apenas empresas ativas</SelectItem>
                      <SelectItem value="blocked">Apenas empresas bloqueadas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input
                    placeholder="Ex: Atualização importante..."
                    value={form.title}
                    onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mensagem</Label>
                  <Textarea
                    placeholder="Escreva a mensagem da notificação..."
                    value={form.message}
                    onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
                    rows={4}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={sendNotification} disabled={sending} className="gap-2">
                  {sending ? <Clock className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {sending ? 'Enviando...' : 'Enviar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhuma notificação enviada ainda</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Clique em "Nova Notificação" para começar</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <Card key={n.id} className="glass-card rounded-2xl">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bell className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm">{n.title}</p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.message}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Users className="h-2.5 w-2.5" />
                            {n.recipient_count} destinatários
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{targetLabels[n.target] || n.target}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <CheckCircle className="h-3.5 w-3.5 text-success" />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(n.sent_at)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
