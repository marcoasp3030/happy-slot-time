import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';
import { AlertTriangle, Ban, Loader2, CalendarCheck, ArrowRight } from 'lucide-react';

interface RescheduledDetail {
  client: string;
  oldDate: string;
  oldTime: string;
  newDate: string;
  newTime: string;
}

export default function MassCancelDialog() {
  const { companyId } = useAuth();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [reschedule, setReschedule] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [result, setResult] = useState<{
    canceled: number;
    rescheduled: number;
    rescheduled_details: RescheduledDetail[];
    whatsapp_sent: number;
    google_deleted: number;
    total_affected: number;
  } | null>(null);

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    setPreviewCount(null);
    setResult(null);
    if (newDate && companyId) {
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
  };

  const formatDateBR = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  const handleMassCancel = async () => {
    if (!companyId || !date) {
      toast.error('Selecione uma data');
      return;
    }

    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('mass-cancel-appointments', {
        body: {
          company_id: companyId,
          date,
          reason: reason || undefined,
          send_whatsapp: sendWhatsApp,
          reschedule,
        },
      });

      if (error) throw error;

      const r = res as any;
      if (r?.success) {
        if (r.rescheduled > 0) {
          toast.success(`${r.rescheduled} agendamento(s) remarcado(s) automaticamente`);
        }
        if (r.canceled > 0) {
          toast.warning(`${r.canceled} agendamento(s) cancelado(s) (sem horário alternativo)`);
        }
        if (r.whatsapp_sent > 0) {
          toast.info(`${r.whatsapp_sent} notificação(ões) enviada(s) via WhatsApp`);
        }
        if (r.google_deleted > 0) {
          toast.info(`${r.google_deleted} evento(s) removido(s) do Google Agenda`);
        }

        logAudit({
          companyId,
          action: reschedule ? 'Remarcação em massa' : 'Cancelamento em massa',
          category: 'appointment',
          entityType: 'appointment',
          details: {
            date,
            reason,
            canceled: r.canceled,
            rescheduled: r.rescheduled,
            whatsapp_sent: r.whatsapp_sent,
            google_deleted: r.google_deleted,
          },
        });

        // Show results if there were rescheduled appointments
        if (r.rescheduled > 0 && r.rescheduled_details?.length > 0) {
          setResult(r);
        } else {
          setOpen(false);
          resetForm();
        }
      } else {
        toast.error(r?.error || 'Erro ao processar');
      }
    } catch (e: any) {
      toast.error('Erro ao processar');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setDate('');
    setReason('');
    setPreviewCount(null);
    setResult(null);
    setReschedule(false);
  };

  const handleClose = () => {
    setOpen(false);
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className="font-semibold">
          <Ban className="h-3.5 w-3.5 mr-1.5" />
          Cancelar Agendamentos do Dia
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        {/* Result view */}
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-primary">
                <CalendarCheck className="h-5 w-5" />
                Resultado da Remarcação
              </DialogTitle>
              <DialogDescription>
                {result.rescheduled} remarcado(s), {result.canceled} cancelado(s) de {result.total_affected} total
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {result.rescheduled_details.map((detail, i) => (
                <div key={i} className="rounded-xl border border-border/60 p-3 bg-muted/30">
                  <p className="text-sm font-semibold text-foreground">{detail.client}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="text-[10px] h-5 line-through opacity-60">
                      {formatDateBR(detail.oldDate)} {detail.oldTime}
                    </Badge>
                    <ArrowRight className="h-3 w-3 text-primary" />
                    <Badge className="text-[10px] h-5 bg-primary/10 text-primary border-primary/20">
                      {formatDateBR(detail.newDate)} {detail.newTime}
                    </Badge>
                  </div>
                </div>
              ))}

              {result.canceled > 0 && (
                <div className="rounded-lg p-3 bg-destructive/10 text-sm text-destructive font-medium">
                  ⚠️ {result.canceled} agendamento(s) não puderam ser remarcados (sem horário disponível nos próximos 30 dias)
                </div>
              )}

              {result.whatsapp_sent > 0 && (
                <p className="text-xs text-muted-foreground">
                  ✅ {result.whatsapp_sent} notificação(ões) enviada(s) via WhatsApp
                </p>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleClose} className="font-semibold">
                Fechar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Cancelar / Remarcar Agendamentos
              </DialogTitle>
              <DialogDescription>
                Cancele ou remarque automaticamente todos os agendamentos de um dia. Os clientes serão notificados.
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
                    ? `⚠️ ${previewCount} agendamento(s) pendente(s)/confirmado(s) serão afetados`
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

              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-primary/30 p-3 bg-primary/5">
                  <div>
                    <p className="text-sm font-semibold">Remarcar automaticamente</p>
                    <p className="text-xs text-muted-foreground">Buscar próximo horário disponível para cada cliente</p>
                  </div>
                  <Switch checked={reschedule} onCheckedChange={setReschedule} />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div>
                    <p className="text-sm font-semibold">Notificar via WhatsApp</p>
                    <p className="text-xs text-muted-foreground">
                      {reschedule
                        ? 'Enviar aviso com novo horário para cada cliente'
                        : 'Enviar aviso de cancelamento para cada cliente'}
                    </p>
                  </div>
                  <Switch checked={sendWhatsApp} onCheckedChange={setSendWhatsApp} />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                Voltar
              </Button>
              <Button
                variant={reschedule ? 'default' : 'destructive'}
                onClick={handleMassCancel}
                disabled={loading || !date || previewCount === 0}
                className="font-semibold"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Processando...
                  </>
                ) : reschedule ? (
                  <>
                    <CalendarCheck className="h-4 w-4 mr-1.5" />
                    Remarcar Agendamentos
                  </>
                ) : (
                  <>
                    <Ban className="h-4 w-4 mr-1.5" />
                    Confirmar Cancelamento
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
