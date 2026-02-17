import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';
import { CalendarOff, Plus, Trash2, Clock } from 'lucide-react';

interface TimeBlock {
  id: string;
  block_date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  staff_id: string | null;
}

interface StaffMember {
  id: string;
  name: string;
}

export default function TimeBlocks() {
  const { companyId } = useAuth();
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [blockDate, setBlockDate] = useState('');
  const [isFullDay, setIsFullDay] = useState(true);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [staffId, setStaffId] = useState('all');

  const fetchData = async () => {
    if (!companyId) return;
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const [blocksRes, staffRes] = await Promise.all([
      supabase.from('time_blocks')
        .select('*')
        .eq('company_id', companyId)
        .gte('block_date', today)
        .order('block_date', { ascending: true }),
      supabase.from('staff')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('active', true),
    ]);
    setBlocks(blocksRes.data || []);
    setStaff(staffRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [companyId]);

  const addBlock = async () => {
    if (!companyId || !blockDate) {
      toast.error('Selecione uma data');
      return;
    }
    if (!isFullDay && (!startTime || !endTime)) {
      toast.error('Preencha horário de início e fim');
      return;
    }

    const { error } = await supabase.from('time_blocks').insert({
      company_id: companyId,
      block_date: blockDate,
      start_time: isFullDay ? null : startTime,
      end_time: isFullDay ? null : endTime,
      reason: reason || null,
      staff_id: staffId === 'all' ? null : staffId,
    });

    if (error) { toast.error('Erro ao adicionar bloqueio'); return; }
    toast.success('Bloqueio adicionado');
    logAudit({
      companyId, action: 'Bloqueio de horário criado', category: 'settings',
      entityType: 'time_block',
      details: { date: blockDate, fullDay: isFullDay, reason, staffId: staffId === 'all' ? null : staffId },
    });

    setBlockDate('');
    setStartTime('');
    setEndTime('');
    setReason('');
    setStaffId('all');
    setIsFullDay(true);
    fetchData();
  };

  const removeBlock = async (block: TimeBlock) => {
    const { error } = await supabase.from('time_blocks').delete().eq('id', block.id);
    if (error) { toast.error('Erro ao remover'); return; }
    toast.success('Bloqueio removido');
    logAudit({
      companyId, action: 'Bloqueio de horário removido', category: 'settings',
      entityType: 'time_block', entityId: block.id,
      details: { date: block.block_date, reason: block.reason },
    });
    fetchData();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getStaffName = (id: string | null) => {
    if (!id) return 'Todos';
    return staff.find(s => s.id === id)?.name || 'Profissional';
  };

  return (
    <Card className="glass-card-static rounded-2xl">
      <CardHeader className="px-4 sm:px-6">
        <CardTitle className="text-lg flex items-center gap-2">
          <CalendarOff className="h-4.5 w-4.5 text-destructive" />
          Bloqueios de Horário
        </CardTitle>
        <p className="text-sm text-muted-foreground">Bloqueie dias ou horários específicos em que não poderá atender</p>
      </CardHeader>
      <CardContent className="px-4 sm:px-6 space-y-5">
        {/* Add block form */}
        <div className="rounded-xl border border-border/60 p-4 space-y-3 bg-muted/30">
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Data</Label>
              <Input type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Profissional</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os profissionais</SelectItem>
                  {staff.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={isFullDay} onCheckedChange={setIsFullDay} />
            <Label className="text-sm font-medium">Dia inteiro</Label>
          </div>

          {!isFullDay && (
            <div className="grid gap-3 grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Início</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Fim</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-10" />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Motivo (opcional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: Feriado, consulta médica..." className="h-10" />
          </div>

          <Button onClick={addBlock} className="gradient-primary border-0 font-semibold">
            <Plus className="h-4 w-4 mr-1.5" />
            Adicionar Bloqueio
          </Button>
        </div>

        {/* Existing blocks */}
        {loading ? (
          <div className="text-center py-6 text-sm text-muted-foreground animate-pulse">Carregando...</div>
        ) : blocks.length === 0 ? (
          <div className="text-center py-8">
            <CalendarOff className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum bloqueio futuro</p>
          </div>
        ) : (
          <div className="space-y-2">
            {blocks.map(block => (
              <div key={block.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/60 bg-background hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                    {block.start_time ? <Clock className="h-4 w-4 text-destructive" /> : <CalendarOff className="h-4 w-4 text-destructive" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{formatDate(block.block_date)}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      <Badge variant="secondary" className="text-[10px] h-5">
                        {block.start_time ? `${block.start_time.slice(0, 5)} - ${block.end_time?.slice(0, 5)}` : 'Dia inteiro'}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] h-5">
                        {getStaffName(block.staff_id)}
                      </Badge>
                      {block.reason && (
                        <span className="text-[11px] text-muted-foreground truncate max-w-[150px]">{block.reason}</span>
                      )}
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => removeBlock(block)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
