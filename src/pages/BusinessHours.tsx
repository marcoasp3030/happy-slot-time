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
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Horários</h1>
          <p className="text-muted-foreground">Configure horários de funcionamento e regras</p>
        </div>

        <Card className="glass-card">
          <CardHeader><CardTitle className="text-lg">Horários de Funcionamento</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {hours.map((h) => (
              <div key={h.id} className="flex items-center gap-4 flex-wrap">
                <div className="w-24 font-medium text-sm">{dayNames[h.day_of_week]}</div>
                <Switch checked={h.is_open} onCheckedChange={(v) => updateHour(h.id, 'is_open', v)} />
                {h.is_open && (
                  <>
                    <Input type="time" value={h.open_time?.slice(0, 5)} onChange={(e) => updateHour(h.id, 'open_time', e.target.value)} className="w-[120px]" />
                    <span className="text-muted-foreground">até</span>
                    <Input type="time" value={h.close_time?.slice(0, 5)} onChange={(e) => updateHour(h.id, 'close_time', e.target.value)} className="w-[120px]" />
                  </>
                )}
                {!h.is_open && <span className="text-sm text-muted-foreground">Fechado</span>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader><CardTitle className="text-lg">Regras de Agendamento</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Intervalo entre horários (min)</Label>
                <Input type="number" value={settings.slot_interval} onChange={(e) => setSettings({ ...settings, slot_interval: parseInt(e.target.value) || 30 })} />
              </div>
              <div>
                <Label>Antecedência mínima (horas)</Label>
                <Input type="number" value={settings.min_advance_hours} onChange={(e) => setSettings({ ...settings, min_advance_hours: parseInt(e.target.value) || 2 })} />
              </div>
              <div>
                <Label>Capacidade por horário</Label>
                <Input type="number" value={settings.max_capacity_per_slot} onChange={(e) => setSettings({ ...settings, max_capacity_per_slot: parseInt(e.target.value) || 1 })} />
              </div>
            </div>
            <Button onClick={saveSettings}>Salvar configurações</Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
