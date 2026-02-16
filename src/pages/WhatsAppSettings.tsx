import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { MessageSquare, Send, Settings } from 'lucide-react';
import { toast } from 'sonner';

export default function WhatsAppSettings() {
  const { companyId } = useAuth();
  const [settings, setSettings] = useState({ base_url: '', instance_id: '', token: '', from_number: '', active: false });
  const [templates, setTemplates] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [testPhone, setTestPhone] = useState('');

  const fetchData = async () => {
    if (!companyId) return;
    const [settingsRes, templatesRes, rulesRes] = await Promise.all([
      supabase.from('whatsapp_settings').select('*').eq('company_id', companyId).single(),
      supabase.from('message_templates').select('*').eq('company_id', companyId),
      supabase.from('notification_rules').select('*').eq('company_id', companyId),
    ]);
    if (settingsRes.data) setSettings(settingsRes.data as any);
    setTemplates(templatesRes.data || []);
    setRules(rulesRes.data || []);
  };

  useEffect(() => { fetchData(); }, [companyId]);

  const saveSettings = async () => {
    if (!companyId) return;
    await supabase.from('whatsapp_settings').upsert({
      company_id: companyId,
      base_url: settings.base_url,
      instance_id: settings.instance_id,
      token: settings.token,
      from_number: settings.from_number,
      active: settings.active,
    }, { onConflict: 'company_id' });
    toast.success('Configurações salvas');
  };

  const updateTemplate = async (id: string, template: string) => {
    await supabase.from('message_templates').update({ template }).eq('id', id);
    toast.success('Template atualizado');
  };

  const updateRule = async (id: string, field: string, value: any) => {
    await supabase.from('notification_rules').update({ [field]: value }).eq('id', id);
    fetchData();
  };

  const testConnection = () => {
    toast.info('Teste de conexão será implementado com a edge function UAZAPI');
  };

  const typeLabels: Record<string, string> = {
    confirmation: 'Confirmação', reminder: 'Lembrete', cancellation: 'Cancelamento',
    reschedule: 'Remarcação', confirmation_request: 'Pedido de confirmação',
  };

  const ruleLabels: Record<string, string> = { reminder_1: 'Lembrete 1', reminder_2: 'Lembrete 2' };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">WhatsApp (UAZAPI)</h1>
          <p className="text-muted-foreground">Configure a integração com WhatsApp</p>
        </div>

        <Card className="glass-card">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Settings className="h-5 w-5" /> Credenciais UAZAPI</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>URL Base</Label><Input value={settings.base_url} onChange={(e) => setSettings({ ...settings, base_url: e.target.value })} placeholder="https://api.uazapi.com" /></div>
              <div><Label>ID da Instância</Label><Input value={settings.instance_id} onChange={(e) => setSettings({ ...settings, instance_id: e.target.value })} placeholder="sua-instancia" /></div>
              <div><Label>Token/API Key</Label><Input type="password" value={settings.token} onChange={(e) => setSettings({ ...settings, token: e.target.value })} placeholder="Seu token" /></div>
              <div><Label>Número de envio</Label><Input value={settings.from_number} onChange={(e) => setSettings({ ...settings, from_number: e.target.value })} placeholder="5511999999999" /></div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={settings.active} onCheckedChange={(v) => setSettings({ ...settings, active: v })} />
              <Label>Integração ativa</Label>
            </div>
            <div className="flex gap-3">
              <Button onClick={saveSettings}>Salvar</Button>
              <div className="flex items-center gap-2">
                <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="Nº para teste" className="w-[180px]" />
                <Button variant="outline" onClick={testConnection}><Send className="h-4 w-4 mr-1" />Testar</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Templates de Mensagem</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Placeholders: {'{{cliente_nome}}'} {'{{data}}'} {'{{hora}}'} {'{{servico}}'} {'{{empresa_nome}}'}
            </p>
            {templates.map((t) => (
              <div key={t.id} className="space-y-1">
                <Label>{typeLabels[t.type] || t.type}</Label>
                <Textarea
                  defaultValue={t.template}
                  onBlur={(e) => updateTemplate(t.id, e.target.value)}
                  rows={2}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader><CardTitle className="text-lg">Regras de Notificação</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center gap-4">
                <Label className="w-24">{ruleLabels[r.type] || r.type}</Label>
                <Switch checked={r.active} onCheckedChange={(v) => updateRule(r.id, 'active', v)} />
                <Input type="number" value={r.minutes_before} onChange={(e) => updateRule(r.id, 'minutes_before', parseInt(e.target.value))} className="w-24" />
                <span className="text-sm text-muted-foreground">min antes</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
