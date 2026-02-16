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
import { MessageSquare, Send, Settings, Wifi, Bell } from 'lucide-react';
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

  const testConnection = async () => {
    if (!testPhone || !companyId) {
      toast.error('Informe um número para teste');
      return;
    }
    try {
      toast.loading('Enviando mensagem de teste...');
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: { company_id: companyId, type: 'test', phone: testPhone.replace(/\D/g, '') },
      });
      toast.dismiss();
      if (error) throw error;
      if (data?.success) toast.success('Mensagem de teste enviada!');
      else toast.error(data?.error || 'Erro ao enviar teste');
    } catch (e: any) {
      toast.dismiss();
      toast.error(e.message || 'Erro ao conectar com UAZAPI');
    }
  };

  const typeLabels: Record<string, string> = {
    confirmation: 'Confirmação', reminder: 'Lembrete', cancellation: 'Cancelamento',
    reschedule: 'Remarcação', confirmation_request: 'Pedido de confirmação',
  };

  const ruleLabels: Record<string, string> = { reminder_1: 'Lembrete 1', reminder_2: 'Lembrete 2' };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="section-header">
          <h1 className="section-title">WhatsApp (UAZAPI)</h1>
          <p className="section-subtitle">Configure a integração com WhatsApp</p>
        </div>

        {/* Credentials */}
        <Card className="glass-card-static rounded-2xl">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wifi className="h-4.5 w-4.5 text-primary" />
              Credenciais UAZAPI
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 space-y-4">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">URL Base</Label>
                <Input value={settings.base_url} onChange={(e) => setSettings({ ...settings, base_url: e.target.value })} placeholder="https://api.uazapi.com" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">ID da Instância</Label>
                <Input value={settings.instance_id} onChange={(e) => setSettings({ ...settings, instance_id: e.target.value })} placeholder="sua-instancia" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Token/API Key</Label>
                <Input type="password" value={settings.token} onChange={(e) => setSettings({ ...settings, token: e.target.value })} placeholder="Seu token" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Número de envio</Label>
                <Input value={settings.from_number} onChange={(e) => setSettings({ ...settings, from_number: e.target.value })} placeholder="5511999999999" className="h-10" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={settings.active} onCheckedChange={(v) => setSettings({ ...settings, active: v })} />
              <Label className="font-medium">Integração ativa</Label>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={saveSettings} className="gradient-primary border-0 font-semibold">Salvar</Button>
              <div className="flex items-center gap-2 flex-1">
                <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="Nº para teste" className="flex-1 sm:max-w-[200px] h-10" />
                <Button variant="outline" onClick={testConnection} className="flex-shrink-0">
                  <Send className="h-4 w-4 mr-1.5" />Testar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Templates */}
        <Card className="glass-card-static rounded-2xl">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-4.5 w-4.5 text-primary" />
              Templates de Mensagem
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 space-y-4">
            <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-xl font-mono leading-relaxed">
              Placeholders: {'{{cliente_nome}}'} {'{{data}}'} {'{{hora}}'} {'{{servico}}'} {'{{empresa_nome}}'}
            </p>
            {templates.map((t) => (
              <div key={t.id} className="space-y-1.5">
                <Label className="font-semibold text-sm">{typeLabels[t.type] || t.type}</Label>
                <Textarea
                  defaultValue={t.template}
                  onBlur={(e) => updateTemplate(t.id, e.target.value)}
                  rows={3}
                  className="text-sm"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Notification rules */}
        <Card className="glass-card-static rounded-2xl">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="h-4.5 w-4.5 text-primary" />
              Regras de Notificação
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 space-y-4">
            {rules.map((r) => (
              <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-2 border-b border-border/40 last:border-0">
                <div className="flex items-center justify-between sm:justify-start gap-3 sm:w-36">
                  <Label className="font-semibold text-sm">{ruleLabels[r.type] || r.type}</Label>
                  <Switch checked={r.active} onCheckedChange={(v) => updateRule(r.id, 'active', v)} />
                </div>
                <div className="flex items-center gap-2">
                  <Input type="number" value={r.minutes_before} onChange={(e) => updateRule(r.id, 'minutes_before', parseInt(e.target.value))} className="w-20 h-9 text-sm" />
                  <span className="text-sm text-muted-foreground">min antes</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
