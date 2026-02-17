import { useState, useEffect, useCallback } from 'react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';
import { AlertTriangle, Ban, Loader2, CalendarCheck, ArrowRight, CalendarDays } from 'lucide-react';

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
  const [showAllSlots, setShowAllSlots] = useState(false);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [reschedule, setReschedule] = useState(false);
  const [rescheduleMode, setRescheduleMode] = useState<'auto' | 'manual'>('auto');
  const [targetDate, setTargetDate] = useState('');
  const [targetSlots, setTargetSlots] = useState<{ total: number; free: number; occupied: number; isOpen: boolean; freeSlots: string[] } | null>(null);
  const [targetSlotsLoading, setTargetSlotsLoading] = useState(false);
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

  const fetchTargetDateSlots = useCallback(async (tDate: string) => {
    if (!companyId || !tDate) {
      setTargetSlots(null);
      return;
    }
    setTargetSlotsLoading(true);
    try {
      const targetDay = new Date(tDate + 'T12:00:00').getDay();
      const [bhRes, settingsRes, aptsRes, blocksRes] = await Promise.all([
        supabase.from('business_hours').select('*').eq('company_id', companyId).eq('day_of_week', targetDay).single(),
        supabase.from('company_settings').select('slot_interval, max_capacity_per_slot').eq('company_id', companyId).single(),
        supabase.from('appointments').select('start_time, end_time').eq('company_id', companyId).eq('appointment_date', tDate).neq('status', 'canceled'),
        supabase.from('time_blocks').select('*').eq('company_id', companyId).eq('block_date', tDate),
      ]);
      const bh = bhRes.data;
      if (!bh || !bh.is_open) {
        setTargetSlots({ total: 0, free: 0, occupied: 0, isOpen: false, freeSlots: [] });
        return;
      }
      const interval = settingsRes.data?.slot_interval || 30;
      const maxCapacity = settingsRes.data?.max_capacity_per_slot || 1;
      const existingApts = aptsRes.data || [];
      const timeBlocks = blocksRes.data || [];
      const fullDayBlock = timeBlocks.find((b: any) => !b.start_time && !b.end_time && !b.staff_id);
      if (fullDayBlock) {
        setTargetSlots({ total: 0, free: 0, occupied: 0, isOpen: false, freeSlots: [] });
        return;
      }
      const dateBlocks = timeBlocks.filter((b: any) => b.start_time && b.end_time && !b.staff_id);
      const [openH, openM] = bh.open_time.split(':').map(Number);
      const [closeH, closeM] = bh.close_time.split(':').map(Number);
      let current = openH * 60 + openM;
      const end = closeH * 60 + closeM;
      let total = 0;
      let free = 0;
      const freeSlotsList: string[] = [];
      while (current + interval <= end) {
        const hh = String(Math.floor(current / 60)).padStart(2, '0');
        const mm = String(current % 60).padStart(2, '0');
        const slotStart = `${hh}:${mm}`;
        const endMin = current + interval;
        const endHH = String(Math.floor(endMin / 60)).padStart(2, '0');
        const endMM = String(endMin % 60).padStart(2, '0');
        const slotEnd = `${endHH}:${endMM}`;
        const isBlocked = dateBlocks.some((b: any) => {
          const bs = b.start_time.slice(0, 5);
          const be = b.end_time.slice(0, 5);
          return slotStart < be && slotEnd > bs;
        });
        if (!isBlocked) {
          total++;
          const conflicts = existingApts.filter((a: any) => {
            const aStart = a.start_time.slice(0, 5);
            const aEnd = a.end_time.slice(0, 5);
            return slotStart < aEnd && slotEnd > aStart;
          });
          if (conflicts.length < maxCapacity) {
            free++;
            freeSlotsList.push(slotStart);
          }
        }
        current += interval;
      }
      setTargetSlots({ total, free, occupied: total - free, isOpen: true, freeSlots: freeSlotsList });
    } catch (e) {
      console.error('Error fetching target slots:', e);
      setTargetSlots(null);
    } finally {
      setTargetSlotsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setShowAllSlots(false);
    if (rescheduleMode === 'manual' && targetDate && targetDate > date) {
      fetchTargetDateSlots(targetDate);
    } else {
      setTargetSlots(null);
    }
  }, [targetDate, date, rescheduleMode, fetchTargetDateSlots]);

  const handleMassCancel = async () => {
    if (!companyId || !date) {
      toast.error('Selecione uma data');
      return;
    }

    if (reschedule && rescheduleMode === 'manual' && !targetDate) {
      toast.error('Selecione a data de destino para remarcação');
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
          target_date: reschedule && rescheduleMode === 'manual' ? targetDate : undefined,
        },
      });

      if (error) throw error;

      const r = res as any;
      if (r?.success) {
        if (r.rescheduled > 0) {
          toast.success(`${r.rescheduled} agendamento(s) remarcado(s)`);
        }
        if (r.canceled > 0) {
          toast.warning(`${r.canceled} agendamento(s) cancelado(s) (sem horário disponível)`);
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
            target_date: rescheduleMode === 'manual' ? targetDate : 'auto',
            canceled: r.canceled,
            rescheduled: r.rescheduled,
            whatsapp_sent: r.whatsapp_sent,
            google_deleted: r.google_deleted,
          },
        });

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
    setTargetDate('');
    setTargetSlots(null);
    setPreviewCount(null);
    setResult(null);
    setReschedule(false);
    setRescheduleMode('auto');
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
                  ⚠️ {result.canceled} agendamento(s) não puderam ser remarcados (sem horário disponível)
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
                Cancele ou remarque todos os agendamentos de um dia. Os clientes serão notificados.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Data a cancelar</Label>
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

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-primary/30 p-3 bg-primary/5">
                  <div>
                    <p className="text-sm font-semibold">Remarcar agendamentos</p>
                    <p className="text-xs text-muted-foreground">Mover os clientes para outro horário disponível</p>
                  </div>
                  <Switch checked={reschedule} onCheckedChange={setReschedule} />
                </div>

                {reschedule && (
                  <div className="rounded-lg border border-border/60 p-3 space-y-3">
                    <Label className="text-sm font-semibold flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-primary" />
                      Modo de remarcação
                    </Label>
                    <RadioGroup
                      value={rescheduleMode}
                      onValueChange={(v) => setRescheduleMode(v as 'auto' | 'manual')}
                      className="space-y-2"
                    >
                      <div className="flex items-start gap-2.5">
                        <RadioGroupItem value="auto" id="mode-auto" className="mt-0.5" />
                        <label htmlFor="mode-auto" className="cursor-pointer">
                          <p className="text-sm font-medium">Automático</p>
                          <p className="text-xs text-muted-foreground">Buscar o próximo horário disponível (até 30 dias)</p>
                        </label>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <RadioGroupItem value="manual" id="mode-manual" className="mt-0.5" />
                        <label htmlFor="mode-manual" className="cursor-pointer">
                          <p className="text-sm font-medium">Data específica</p>
                          <p className="text-xs text-muted-foreground">Escolher uma data fixa para remarcar todos</p>
                        </label>
                      </div>
                    </RadioGroup>

                    {rescheduleMode === 'manual' && (
                      <div className="space-y-1.5 pt-1">
                        <Label className="text-xs font-semibold text-muted-foreground">Data de destino</Label>
                        <Input
                          type="date"
                          value={targetDate}
                          onChange={(e) => setTargetDate(e.target.value)}
                          min={date || undefined}
                          className="h-9 text-sm"
                        />
                        {targetDate && targetDate <= date && (
                          <p className="text-xs text-destructive font-medium">
                            A data de destino deve ser posterior à data cancelada
                          </p>
                        )}

                        {targetSlotsLoading && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Verificando disponibilidade...
                          </div>
                        )}

                        {targetSlots && !targetSlotsLoading && (
                          <div className={`rounded-lg p-2.5 text-xs font-medium mt-1 ${
                            !targetSlots.isOpen
                              ? 'bg-destructive/10 text-destructive'
                              : targetSlots.free === 0
                                ? 'bg-destructive/10 text-destructive'
                                : targetSlots.free < (previewCount || 0)
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                                  : 'bg-primary/10 text-primary'
                          }`}>
                            {!targetSlots.isOpen ? (
                              '🚫 Este dia está fechado ou bloqueado'
                            ) : targetSlots.free === 0 ? (
                              '🚫 Nenhum horário livre nesta data'
                            ) : (
                              <div className="space-y-1">
                                <p>
                                  📊 {targetSlots.free} horário(s) livre(s) de {targetSlots.total} total
                                  {targetSlots.occupied > 0 && ` · ${targetSlots.occupied} ocupado(s)`}
                                </p>
                                {previewCount !== null && targetSlots.free < previewCount && (
                                  <p className="text-amber-600 dark:text-amber-400">
                                    ⚠️ Apenas {targetSlots.free} de {previewCount} agendamentos poderão ser remarcados
                                  </p>
                                )}
                                {previewCount !== null && targetSlots.free >= previewCount && (
                                  <p>✅ Capacidade suficiente para remarcar todos os {previewCount} agendamentos</p>
                                )}
                                {targetSlots.freeSlots.length > 0 && (
                                  <div className="space-y-1 pt-1">
                                    <div className="flex flex-wrap gap-1">
                                      {(showAllSlots ? targetSlots.freeSlots : targetSlots.freeSlots.slice(0, 12)).map((slot) => (
                                        <span
                                          key={slot}
                                          className="inline-block px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold"
                                        >
                                          {slot}
                                        </span>
                                      ))}
                                    </div>
                                    {targetSlots.freeSlots.length > 12 && (
                                      <button
                                        type="button"
                                        onClick={() => setShowAllSlots(!showAllSlots)}
                                        className="text-[10px] font-semibold text-primary hover:underline"
                                      >
                                        {showAllSlots ? 'Ver menos' : `+ ${targetSlots.freeSlots.length - 12} horários`}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

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
                disabled={loading || !date || previewCount === 0 || (reschedule && rescheduleMode === 'manual' && (!targetDate || targetDate <= date))}
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
