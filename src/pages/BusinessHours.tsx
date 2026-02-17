import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';
import { Clock, Settings } from 'lucide-react';
import TimeBlocks from '@/components/TimeBlocks';
import MassCancelDialog from '@/components/MassCancelDialog';

const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function BusinessHours() {
  const { companyId } = useAuth();
  const [hours, setHours] = useState<any[]>([]);
  const [settings, setSettings] = useState({ slot_interval: 30, min_advance_hours: 2, max_capacity_per_slot: 1 });

  const fetchData = async () => {
    if (!companyId) return;
    const [hoursRes, settingsRes] = await Promise.all([
      supabase.from('business_hours').select('*').eq('company_id', companyId).order('day_of_week'),
      supabase.from('company_settings').select('*').eq('company_id', companyId).single(),
    ]);
    setHours(hoursRes.data || []);
    if (settingsRes.data) setSettings(settingsRes.data as any);
  };

  useEffect(() => { fetchData(); }, [companyId]);

  const updateHour = async (id: string, field: string, value: any) => {
    await supabase.from('business_hours').update({ [field]: value }).eq('id', id);
    const h = hours.find(x => x.id === id);
    logAudit({ companyId, action: 'Horário alterado', category: 'settings', entityType: 'business_hours', entityId: id, details: { day: dayNames[h?.day_of_week], field, value } });
    fetchData();
  };

  const saveSettings = async () => {
    if (!companyId) return;
    await supabase.from('company_settings').upsert({
      company_id: companyId,
      slot_interval: settings.slot_interval,
      min_advance_hours: settings.min_advance_hours,
      max_capacity_per_slot: settings.max_capacity_per_slot,
    }, { onConflict: 'company_id' });
    toast.success('Configurações salvas');
    logAudit({ companyId, action: 'Regras de agendamento atualizadas', category: 'settings', entityType: 'company_settings', details: { slot_interval: settings.slot_interval, min_advance_hours: settings.min_advance_hours, max_capacity: settings.max_capacity_per_slot } });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="section-header mb-0">
            <h1 className="section-title">Horários</h1>
            <p className="section-subtitle">Configure horários de funcionamento, bloqueios e regras</p>
          </div>
          <MassCancelDialog />
        </div>

        <Card className="glass-card-static rounded-2xl">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-4.5 w-4.5 text-primary" />
              Horários de Funcionamento
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 space-y-3">
            {hours.map((h) => (
              <div key={h.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-2 border-b border-border/40 last:border-0">
                <div className="flex items-center justify-between sm:justify-start gap-3 sm:w-40">
                  <span className="font-medium text-sm">{dayNames[h.day_of_week]}</span>
                  <Switch checked={h.is_open} onCheckedChange={(v) => updateHour(h.id, 'is_open', v)} />
                </div>
                {h.is_open ? (
                  <div className="flex items-center gap-2 pl-0 sm:pl-0">
                    <Input type="time" value={h.open_time?.slice(0, 5)} onChange={(e) => updateHour(h.id, 'open_time', e.target.value)} className="w-[110px] h-9 text-sm" />
                    <span className="text-muted-foreground text-sm">até</span>
                    <Input type="time" value={h.close_time?.slice(0, 5)} onChange={(e) => updateHour(h.id, 'close_time', e.target.value)} className="w-[110px] h-9 text-sm" />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground italic">Fechado</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <TimeBlocks />

        <Card className="glass-card-static rounded-2xl">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-4.5 w-4.5 text-primary" />
              Regras de Agendamento
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 space-y-4">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Intervalo entre horários (min)</Label>
                <Input type="number" value={settings.slot_interval} onChange={(e) => setSettings({ ...settings, slot_interval: parseInt(e.target.value) || 30 })} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Antecedência mínima (horas)</Label>
                <Input type="number" value={settings.min_advance_hours} onChange={(e) => setSettings({ ...settings, min_advance_hours: parseInt(e.target.value) || 2 })} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Capacidade por horário</Label>
                <Input type="number" value={settings.max_capacity_per_slot} onChange={(e) => setSettings({ ...settings, max_capacity_per_slot: parseInt(e.target.value) || 1 })} className="h-10" />
              </div>
            </div>
            <Button onClick={saveSettings} className="gradient-primary border-0 font-semibold">Salvar configurações</Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
