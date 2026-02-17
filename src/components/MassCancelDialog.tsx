import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';
import { AlertTriangle, Ban, Loader2 } from 'lucide-react';

export default function MassCancelDialog() {
  const { companyId } = useAuth();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [loading, setLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const checkAppointments = async () => {
    if (!companyId || !date) return;
    setPreviewLoading(true);
    const { count } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('appointment_date', date)
      .in('status', ['pending', 'confirmed']);
    setPreviewCount(count || 0);
    setPreviewLoading(false);
  };

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    setPreviewCount(null);
    if (newDate) {
      // Delay to let state settle
      setTimeout(() => {
        if (companyId && newDate) {
          setPreviewLoading(true);
          supabase
            .from('appointments')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('appointment_date', newDate)
            .in('status', ['pending', 'confirmed'])
            .then(({ count }) => {
              setPreviewCount(count || 0);
              setPreviewLoading(false);
            });
        }
      }, 100);
    }
  };

  const handleMassCancel = async () => {
    if (!companyId || !date) {
      toast.error('Selecione uma data');
      return;
    }

    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('mass-cancel-appointments', {
        body: {
          company_id: companyId,
          date,
          reason: reason || undefined,
          send_whatsapp: sendWhatsApp,
        },
      });

      if (error) throw error;

      const r = result as any;
      if (r?.success) {
        toast.success(`${r.canceled} agendamento(s) cancelado(s)`);
        if (r.whatsapp_sent > 0) {
          toast.info(`${r.whatsapp_sent} notificação(ões) enviada(s) via WhatsApp`);
        }
        if (r.google_deleted > 0) {
          toast.info(`${r.google_deleted} evento(s) removido(s) do Google Agenda`);
        }

        logAudit({
          companyId, action: 'Cancelamento em massa', category: 'appointment',
          entityType: 'appointment',
          details: { date, reason, canceled: r.canceled, whatsapp_sent: r.whatsapp_sent, google_deleted: r.google_deleted },
        });

        setOpen(false);
        setDate('');
        setReason('');
        setPreviewCount(null);
      } else {
        toast.error(r?.error || 'Erro ao cancelar');
      }
    } catch (e: any) {
      toast.error('Erro ao processar cancelamento em massa');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className="font-semibold">
          <Ban className="h-3.5 w-3.5 mr-1.5" />
          Cancelar Agendamentos do Dia
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Cancelar Todos os Agendamentos
          </DialogTitle>
          <DialogDescription>
            Cancele todos os agendamentos de um dia. Os clientes serão notificados via WhatsApp e os eventos removidos do Google Agenda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Data</Label>
            <Input type="date" value={date} onChange={(e) => handleDateChange(e.target.value)} className="h-10" />
          </div>

          {previewLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Verificando agendamentos...
            </div>
          )}

          {previewCount !== null && !previewLoading && (
            <div className={`rounded-lg p-3 text-sm font-medium ${previewCount > 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
              {previewCount > 0
                ? `⚠️ ${previewCount} agendamento(s) pendente(s)/confirmado(s) serão cancelados`
                : '✅ Nenhum agendamento ativo nesta data'}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Motivo (opcional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Imprevisto pessoal, manutenção do espaço..."
              rows={2}
              className="text-sm"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
            <div>
              <p className="text-sm font-semibold">Notificar via WhatsApp</p>
              <p className="text-xs text-muted-foreground">Enviar aviso de cancelamento para cada cliente</p>
            </div>
            <Switch checked={sendWhatsApp} onCheckedChange={setSendWhatsApp} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            onClick={handleMassCancel}
            disabled={loading || !date || previewCount === 0}
            className="font-semibold"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Cancelando...
              </>
            ) : (
              <>
                <Ban className="h-4 w-4 mr-1.5" />
                Confirmar Cancelamento
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
