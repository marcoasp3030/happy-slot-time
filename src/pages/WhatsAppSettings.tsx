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
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Send, Settings, Wifi, Bell, Plus, Trash2, MousePointerClick } from 'lucide-react';
import { toast } from 'sonner';
import WhatsAppConnectionCard from '@/components/WhatsAppConnectionCard';

interface TemplateButton {
  id: string;
  text: string;
}

export default function WhatsAppSettings() {
  const { companyId } = useAuth();
  const [settings, setSettings] = useState({ base_url: '', instance_id: '', token: '', admin_token: '', from_number: '', active: false } as any);
  const [templates, setTemplates] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [testPhone, setTestPhone] = useState('');
  const [editingButtons, setEditingButtons] = useState<Record<string, TemplateButton[]>>({});

  const fetchData = async () => {
    if (!companyId) return;
    const [settingsRes, templatesRes, rulesRes] = await Promise.all([
      supabase.from('whatsapp_settings').select('*').eq('company_id', companyId).single(),
      supabase.from('message_templates').select('*').eq('company_id', companyId),
      supabase.from('notification_rules').select('*').eq('company_id', companyId),
    ]);
    if (settingsRes.data) {
      const s = settingsRes.data as any;
      setSettings({
        base_url: s.base_url || '',
        instance_id: s.instance_id || '',
        token: s.token || '',
        admin_token: s.admin_token || '',
        from_number: s.from_number || '',
        active: s.active ?? false,
      });
    }
    const tpls = templatesRes.data || [];
    setTemplates(tpls);
    // Initialize buttons state
    const btns: Record<string, TemplateButton[]> = {};
    tpls.forEach((t: any) => {
      btns[t.id] = (t.buttons || []).map((b: any, i: number) => ({
        id: b.id || `btn_${i}`,
        text: b.text || '',
      }));
    });
    setEditingButtons(btns);
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
      admin_token: settings.admin_token,
      from_number: settings.from_number,
      active: settings.active,
    }, { onConflict: 'company_id' });
    toast.success('Configurações salvas');
  };

  const updateTemplate = async (id: string, template: string) => {
    await supabase.from('message_templates').update({ template }).eq('id', id);
    toast.success('Template atualizado');
  };

  const toggleSendNotification = async (id: string, value: boolean) => {
    await supabase.from('message_templates').update({ send_notification: value }).eq('id', id);
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, send_notification: value } : t));
    toast.success(value ? 'Notificação ativada' : 'Notificação desativada');
  };

  const addButton = (templateId: string) => {
    setEditingButtons(prev => {
      const current = prev[templateId] || [];
      if (current.length >= 3) {
        toast.error('Máximo de 3 botões por template');
        return prev;
      }
      return {
        ...prev,
        [templateId]: [...current, { id: `btn_${Date.now()}`, text: '' }],
      };
    });
  };

  const removeButton = (templateId: string, index: number) => {
    setEditingButtons(prev => ({
      ...prev,
      [templateId]: (prev[templateId] || []).filter((_, i) => i !== index),
    }));
  };

  const updateButtonText = (templateId: string, index: number, text: string) => {
    setEditingButtons(prev => ({
      ...prev,
      [templateId]: (prev[templateId] || []).map((b, i) => i === index ? { ...b, text } : b),
    }));
  };

  const saveButtons = async (templateId: string) => {
    const buttons = (editingButtons[templateId] || [])
      .filter(b => b.text.trim())
      .map(b => ({ id: b.id, text: b.text } as Record<string, string>));
    await supabase.from('message_templates').update({ buttons: buttons as any }).eq('id', templateId);
    toast.success('Botões salvos');
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
      toast.error(e.message || 'Erro ao enviar mensagem de teste');
    }
  };

  const typeLabels: Record<string, string> = {
    confirmation: 'Confirmação', reminder: 'Lembrete', cancellation: 'Cancelamento',
    reschedule: 'Remarcação', confirmation_request: 'Pedido de confirmação',
  };

  const typeDescriptions: Record<string, string> = {
    confirmation: 'Enviada ao confirmar um agendamento',
    reminder: 'Enviada antes do horário agendado',
    cancellation: 'Enviada ao cancelar um agendamento',
    reschedule: 'Enviada ao remarcar um agendamento',
    confirmation_request: 'Solicita confirmação do cliente',
  };

  const ruleLabels: Record<string, string> = { reminder_1: 'Lembrete 1', reminder_2: 'Lembrete 2' };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="section-header">
          <h1 className="section-title">WhatsApp</h1>
          <p className="section-subtitle">Configure a integração com WhatsApp para envio de notificações automáticas</p>
        </div>

        {/* Connection Card - QR Code flow */}
        <WhatsAppConnectionCard
          hasCredentials={!!(settings.base_url)}
          hasInstanceToken={!!settings.token}
          hasAdminToken={!!settings.admin_token}
          onInstanceCreated={fetchData}
        />

        {/* Credentials - collapsible inside connection area */}
        <Card className="glass-card-static rounded-2xl">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-4.5 w-4.5 text-primary" />
              Credenciais da API
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Insira as credenciais do seu provedor de API WhatsApp para habilitar o envio de mensagens e a conexão via QR Code.
            </p>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">URL Base da API</Label>
                <Input value={settings.base_url} onChange={(e) => setSettings({ ...settings, base_url: e.target.value })} placeholder="https://api.seuservidor.com" className="h-10" />
                <p className="text-xs text-muted-foreground">Endereço do servidor da API WhatsApp</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">ID da Instância</Label>
                <Input value={settings.instance_id} onChange={(e) => setSettings({ ...settings, instance_id: e.target.value })} placeholder="minha-instancia" className="h-10" />
                <p className="text-xs text-muted-foreground">Identificador único da sua instância</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Token da Instância</Label>
                <Input type="password" value={settings.token} onChange={(e) => setSettings({ ...settings, token: e.target.value })} placeholder="Token para envio de mensagens" className="h-10" />
                <p className="text-xs text-muted-foreground">Token de autenticação para enviar mensagens</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Token de Administração</Label>
                <Input type="password" value={settings.admin_token} onChange={(e) => setSettings({ ...settings, admin_token: e.target.value })} placeholder="Token de gerenciamento" className="h-10" />
                <p className="text-xs text-muted-foreground">Usado para criar instâncias e conectar via QR Code</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Número de envio</Label>
                <Input value={settings.from_number} onChange={(e) => setSettings({ ...settings, from_number: e.target.value })} placeholder="5511999999999" className="h-10" />
                <p className="text-xs text-muted-foreground">Número que aparecerá como remetente</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={settings.active} onCheckedChange={(v) => setSettings({ ...settings, active: v })} />
              <Label className="font-medium">Integração ativa</Label>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={saveSettings} className="gradient-primary border-0 font-semibold">Salvar credenciais</Button>
              <div className="flex items-center gap-2 flex-1">
                <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="Nº para teste (ex: 5511999...)" className="flex-1 sm:max-w-[220px] h-10" />
                <Button variant="outline" onClick={testConnection} className="flex-shrink-0">
                  <Send className="h-4 w-4 mr-1.5" />Testar envio
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
          <CardContent className="px-4 sm:px-6 space-y-5">
            <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-xl font-mono leading-relaxed">
              Placeholders: {'{{cliente_nome}}'} {'{{data}}'} {'{{hora}}'} {'{{servico}}'} {'{{empresa_nome}}'}
            </p>
            {templates.map((t) => {
              const buttons = editingButtons[t.id] || [];
              return (
                <div key={t.id} className="space-y-3 p-4 border border-border/60 rounded-xl bg-card/50">
                  {/* Header with toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-bold text-sm">{typeLabels[t.type] || t.type}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{typeDescriptions[t.type] || ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Enviar</span>
                      <Switch
                        checked={t.send_notification ?? true}
                        onCheckedChange={(v) => toggleSendNotification(t.id, v)}
                      />
                    </div>
                  </div>

                  {/* Template text */}
                  <Textarea
                    defaultValue={t.template}
                    onBlur={(e) => updateTemplate(t.id, e.target.value)}
                    rows={3}
                    className="text-sm"
                    disabled={!t.send_notification}
                  />

                  {/* Interactive buttons section */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <MousePointerClick className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground">Botões interativos (opcional, máx. 3)</span>
                    </div>
                    {buttons.map((btn, i) => (
                      <div key={btn.id} className="flex items-center gap-2">
                        <Input
                          value={btn.text}
                          onChange={(e) => updateButtonText(t.id, i, e.target.value)}
                          placeholder={`Texto do botão ${i + 1}`}
                          className="h-8 text-sm flex-1"
                          maxLength={20}
                          disabled={!t.send_notification}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeButton(t.id, i)}
                          disabled={!t.send_notification}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      {buttons.length < 3 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => addButton(t.id)}
                          disabled={!t.send_notification}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Adicionar botão
                        </Button>
                      )}
                      {buttons.length > 0 && (
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => saveButtons(t.id)}
                          disabled={!t.send_notification}
                        >
                          Salvar botões
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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