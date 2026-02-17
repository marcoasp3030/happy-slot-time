import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { Bot, Settings, MessageSquare, Plus, Trash2, BookOpen, History, Copy, ExternalLink, BarChart3, Clock, PhoneForwarded, Mic, Zap, ShieldCheck } from 'lucide-react';
import AgentCapabilities from '@/components/AgentCapabilities';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { useMemo } from 'react';

export default function WhatsAppAgent() {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [knowledgeItems, setKnowledgeItems] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [agentLogs, setAgentLogs] = useState<any[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [conversationMessages, setConversationMessages] = useState<any[]>([]);

  // Knowledge base form
  const [kbCategory, setKbCategory] = useState('general');
  const [kbTitle, setKbTitle] = useState('');
  const [kbContent, setKbContent] = useState('');

  const webhookUrl = companyId
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-agent-webhook?company_id=${companyId}`
    : '';

  useEffect(() => {
    if (companyId) fetchAll();
  }, [companyId]);

  async function fetchAll() {
    setLoading(true);
    const [settingsRes, kbRes, convsRes, logsRes] = await Promise.all([
      supabase.from('whatsapp_agent_settings').select('*').eq('company_id', companyId!).single(),
      supabase.from('whatsapp_knowledge_base').select('*').eq('company_id', companyId!).order('created_at', { ascending: false }),
      supabase.from('whatsapp_conversations').select('*').eq('company_id', companyId!).order('last_message_at', { ascending: false }).limit(50),
      supabase.from('whatsapp_agent_logs').select('*').eq('company_id', companyId!).order('created_at', { ascending: false }).limit(100),
    ]);

    if (settingsRes.data) {
      setSettings(settingsRes.data);
    } else {
      // Create default settings
      const { data } = await supabase.from('whatsapp_agent_settings').insert({ company_id: companyId! }).select().single();
      setSettings(data);
    }

    setKnowledgeItems(kbRes.data || []);
    setConversations(convsRes.data || []);
    setAgentLogs(logsRes.data || []);
    setLoading(false);
  }

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from('whatsapp_agent_settings')
      .update({
        enabled: settings.enabled,
        greeting_message: settings.greeting_message,
        cancellation_policy_hours: settings.cancellation_policy_hours,
        max_reschedule_suggestions: settings.max_reschedule_suggestions,
        respond_audio_with_audio: settings.respond_audio_with_audio,
        handoff_after_failures: settings.handoff_after_failures,
        elevenlabs_voice_id: settings.elevenlabs_voice_id,
        custom_prompt: settings.custom_prompt,
        timezone: settings.timezone,
        can_share_address: settings.can_share_address,
        can_share_phone: settings.can_share_phone,
        can_share_business_hours: settings.can_share_business_hours,
        can_share_services: settings.can_share_services,
        can_share_professionals: settings.can_share_professionals,
        can_handle_anamnesis: settings.can_handle_anamnesis,
        can_send_files: settings.can_send_files,
        can_send_images: settings.can_send_images,
        can_send_audio: settings.can_send_audio,
        custom_business_info: settings.custom_business_info,
      })
      .eq('id', settings.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Configurações salvas!' });
    }
  }

  async function addKnowledgeItem() {
    if (!kbTitle.trim() || !kbContent.trim()) {
      toast({ title: 'Preencha título e conteúdo', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('whatsapp_knowledge_base').insert({
      company_id: companyId!,
      category: kbCategory,
      title: kbTitle,
      content: kbContent,
    });
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Item adicionado!' });
      setKbTitle('');
      setKbContent('');
      fetchAll();
    }
  }

  async function deleteKnowledgeItem(id: string) {
    await supabase.from('whatsapp_knowledge_base').delete().eq('id', id);
    fetchAll();
  }

  async function loadConversationMessages(conv: any) {
    setSelectedConversation(conv);
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });
    setConversationMessages(data || []);
  }

  async function resolveHandoff(convId: string) {
    await supabase
      .from('whatsapp_conversations')
      .update({ handoff_requested: false, status: 'active' })
      .eq('id', convId);
    toast({ title: 'Handoff resolvido, agente reativado.' });
    fetchAll();
  }

  async function resetAllConversations() {
    if (!companyId) return;
    const confirmed = window.confirm('Tem certeza? Isso apagará TODAS as conversas e mensagens do agente. Esta ação não pode ser desfeita.');
    if (!confirmed) return;

    // Delete messages first (FK dependency), then conversations
    await supabase.from('whatsapp_messages').delete().eq('company_id', companyId);
    await supabase.from('whatsapp_agent_logs').delete().eq('company_id', companyId);
    await supabase.from('whatsapp_conversations').delete().eq('company_id', companyId);
    
    setConversations([]);
    setConversationMessages([]);
    setSelectedConversation(null);
    setAgentLogs([]);
    toast({ title: 'Todas as conversas foram resetadas!' });
    fetchAll();
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-muted-foreground">Carregando...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" />
              Agente IA WhatsApp
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Atendimento automatizado via WhatsApp com inteligência artificial
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={settings?.enabled ? 'default' : 'secondary'}>
              {settings?.enabled ? '🟢 Ativo' : '⚪ Inativo'}
            </Badge>
          </div>
        </div>

        <Tabs defaultValue="settings" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="settings" className="gap-1.5">
              <Settings className="h-3.5 w-3.5" /> Configurações
            </TabsTrigger>
            <TabsTrigger value="capabilities" className="gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Capacidades
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="gap-1.5">
              <BookOpen className="h-3.5 w-3.5" /> Base de Conhecimento
            </TabsTrigger>
            <TabsTrigger value="conversations" className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Conversas
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-1.5">
              <History className="h-3.5 w-3.5" /> Logs
            </TabsTrigger>
            <TabsTrigger value="metrics" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Métricas
            </TabsTrigger>
          </TabsList>

          {/* SETTINGS TAB */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configuração Geral</CardTitle>
                <CardDescription>Ative o agente e configure o comportamento</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">Ativar Agente IA</Label>
                    <p className="text-xs text-muted-foreground">O agente responderá automaticamente às mensagens recebidas</p>
                  </div>
                  <Switch
                    checked={settings?.enabled || false}
                    onCheckedChange={(v) => setSettings({ ...settings, enabled: v })}
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Mensagem de Saudação</Label>
                  <Textarea
                    value={settings?.greeting_message || ''}
                    onChange={(e) => setSettings({ ...settings, greeting_message: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Política de Cancelamento (horas mínimas)</Label>
                    <Input
                      type="number"
                      value={settings?.cancellation_policy_hours || 24}
                      onChange={(e) => setSettings({ ...settings, cancellation_policy_hours: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Máximo de sugestões de horário</Label>
                    <Input
                      type="number"
                      value={settings?.max_reschedule_suggestions || 5}
                      onChange={(e) => setSettings({ ...settings, max_reschedule_suggestions: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tentativas antes de handoff humano</Label>
                    <Input
                      type="number"
                      value={settings?.handoff_after_failures || 2}
                      onChange={(e) => setSettings({ ...settings, handoff_after_failures: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fuso Horário</Label>
                    <select
                      value={settings?.timezone || 'America/Sao_Paulo'}
                      onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="America/Sao_Paulo">Brasília (GMT-3)</option>
                      <option value="America/Manaus">Manaus (GMT-4)</option>
                      <option value="America/Cuiaba">Cuiabá (GMT-4)</option>
                      <option value="America/Belem">Belém (GMT-3)</option>
                      <option value="America/Fortaleza">Fortaleza (GMT-3)</option>
                      <option value="America/Recife">Recife (GMT-3)</option>
                      <option value="America/Bahia">Salvador (GMT-3)</option>
                      <option value="America/Rio_Branco">Rio Branco (GMT-5)</option>
                      <option value="America/Noronha">Fernando de Noronha (GMT-2)</option>
                      <option value="America/Argentina/Buenos_Aires">Buenos Aires (GMT-3)</option>
                      <option value="America/Bogota">Bogotá (GMT-5)</option>
                      <option value="America/Santiago">Santiago (GMT-4)</option>
                      <option value="America/New_York">Nova York (GMT-5)</option>
                      <option value="America/Los_Angeles">Los Angeles (GMT-8)</option>
                      <option value="Europe/Lisbon">Lisboa (GMT+0)</option>
                      <option value="Europe/Madrid">Madri (GMT+1)</option>
                      <option value="Asia/Tokyo">Tóquio (GMT+9)</option>
                    </select>
                    <p className="text-xs text-muted-foreground">Define o horário que o agente usa como referência nas respostas</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-medium">Responder áudio com áudio</Label>
                      <p className="text-xs text-muted-foreground">Quando o cliente enviar áudio, responder também em áudio (requer ElevenLabs)</p>
                    </div>
                    <Switch
                      checked={settings?.respond_audio_with_audio || false}
                      onCheckedChange={(v) => setSettings({ ...settings, respond_audio_with_audio: v })}
                    />
                  </div>

                  {settings?.respond_audio_with_audio && (
                    <div className="space-y-3 pl-4 border-l-2 border-primary/20">
                      <div className="space-y-2">
                        <Label>Voz do Agente (ElevenLabs)</Label>
                        <select
                          value={settings?.elevenlabs_voice_id || 'EXAVITQu4vr4xnSDxMaL'}
                          onChange={(e) => setSettings({ ...settings, elevenlabs_voice_id: e.target.value })}
                          className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <optgroup label="🇧🇷 Recomendadas para Português">
                            <option value="EXAVITQu4vr4xnSDxMaL">Sarah (Feminina - Padrão)</option>
                            <option value="FGY2WhTYpPnrIDTdsKH5">Laura (Feminina - Suave)</option>
                            <option value="XrExE9yKIg1WjnnlVkGX">Matilda (Feminina - Calorosa)</option>
                            <option value="pFZP5JQG7iQjIQuC4Bku">Lily (Feminina - Jovem)</option>
                            <option value="Xb7hH8MSUJpSbSDYk0k2">Alice (Feminina - Confiante)</option>
                            <option value="cgSgspJ2msm6clMCkdW9">Jessica (Feminina - Expressiva)</option>
                          </optgroup>
                          <optgroup label="🎙️ Vozes Masculinas">
                            <option value="CwhRBWXzGAHq8TQ4Fs17">Roger (Masculina - Profissional)</option>
                            <option value="IKne3meq5aSn9XLyUdCD">Charlie (Masculina - Casual)</option>
                            <option value="JBFqnCBsd6RMkjVDRZzb">George (Masculina - Britânica)</option>
                            <option value="N2lVS1w4EtoT3dr4eOWO">Callum (Masculina - Intensa)</option>
                            <option value="TX3LPaxmHKxFdv7VOQHJ">Liam (Masculina - Articulada)</option>
                            <option value="onwK4e9ZLuTAKqWW03F9">Daniel (Masculina - Autoritária)</option>
                            <option value="nPczCjzI2devNBz1zQrb">Brian (Masculina - Narrador)</option>
                            <option value="cjVigY5qzO86Huf0OWal">Eric (Masculina - Amigável)</option>
                            <option value="pqHfZKP75CvOlQylNhV4">Bill (Masculina - Documentário)</option>
                            <option value="iP95p4xoKVk53GoZ742B">Chris (Masculina - Casual)</option>
                            <option value="bIHbv24MWmeRgasZH58o">Will (Masculina - Amigável)</option>
                          </optgroup>
                          <optgroup label="✨ Vozes Especiais">
                            <option value="SAz9YHcvj6GT2YYXdXww">River (Não-binária)</option>
                          </optgroup>
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Todas as vozes suportam português via modelo multilingual.{' '}
                          <a href="https://elevenlabs.io/voice-library" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                            Explorar mais vozes
                          </a>
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="font-medium">Prompt Personalizado do Agente</Label>
                  <p className="text-xs text-muted-foreground">
                    Adicione instruções extras para o agente. Exemplo: tom de voz, regras específicas do seu negócio, informações que ele deve sempre mencionar, etc.
                  </p>
                  <Textarea
                    value={settings?.custom_prompt || ''}
                    onChange={(e) => setSettings({ ...settings, custom_prompt: e.target.value })}
                    rows={5}
                    placeholder="Ex: Sempre ofereça nosso pacote promocional de 5 sessões. Nunca mencione concorrentes. Use um tom mais formal..."
                  />
                </div>

                <div className="bg-muted/60 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">🎙️ Suporte a Áudio</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li><strong>Transcrição:</strong> Áudios recebidos são transcritos automaticamente via OpenAI Whisper</li>
                    <li><strong>Resposta em áudio:</strong> Quando ativo, o agente responde com áudio gerado via ElevenLabs TTS</li>
                    <li>Se a geração de áudio falhar, o agente envia a resposta em texto como fallback</li>
                  </ul>
                </div>

                <Button onClick={saveSettings} disabled={saving} className="w-full md:w-auto">
                  {saving ? 'Salvando...' : 'Salvar Configurações'}
                </Button>
              </CardContent>
            </Card>

            {/* Webhook URL */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">🔗 Webhook UAZAPI</CardTitle>
                <CardDescription>Configurado automaticamente ao conectar o WhatsApp</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
                  <Zap className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Webhook automático</p>
                    <p className="text-xs text-muted-foreground">
                      Quando o WhatsApp é conectado, o webhook é configurado automaticamente na UAZAPI.
                      Não é necessário copiar nenhuma URL manualmente.
                    </p>
                  </div>
                </div>
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground transition-colors">
                    Ver URL do webhook (avançado)
                  </summary>
                  <div className="mt-2 flex gap-2">
                    <Input value={webhookUrl} readOnly className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(webhookUrl);
                        toast({ title: 'URL copiada!' });
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </details>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CAPABILITIES TAB */}
          <TabsContent value="capabilities" className="space-y-4">
            <AgentCapabilities
              settings={settings}
              onSettingsChange={setSettings}
              onSave={saveSettings}
              saving={saving}
            />
          </TabsContent>

          {/* KNOWLEDGE BASE TAB */}
          <TabsContent value="knowledge" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Adicionar Informação</CardTitle>
                <CardDescription>Adicione informações que o agente usará para responder clientes</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <select
                      value={kbCategory}
                      onChange={(e) => setKbCategory(e.target.value)}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="general">Geral</option>
                      <option value="pagamento">Formas de Pagamento</option>
                      <option value="localizacao">Localização</option>
                      <option value="politicas">Políticas</option>
                      <option value="promocoes">Promoções</option>
                      <option value="faq">FAQ</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <Input value={kbTitle} onChange={(e) => setKbTitle(e.target.value)} placeholder="Ex: Formas de pagamento aceitas" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Conteúdo</Label>
                  <Textarea
                    value={kbContent}
                    onChange={(e) => setKbContent(e.target.value)}
                    placeholder="Descreva detalhadamente a informação..."
                    rows={3}
                  />
                </div>
                <Button onClick={addKnowledgeItem} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </CardContent>
            </Card>

            {knowledgeItems.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Itens Cadastrados ({knowledgeItems.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {knowledgeItems.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-muted/40 border">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
                            <span className="font-medium text-sm">{item.title}</span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{item.content}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => deleteKnowledgeItem(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* CONVERSATIONS TAB */}
          <TabsContent value="conversations" className="space-y-4">
            <div className="flex items-center justify-between">
              <div />
              <Button variant="outline" size="sm" onClick={resetAllConversations} className="text-destructive hover:text-destructive gap-1.5">
                <Trash2 className="h-3.5 w-3.5" />
                Resetar Todas as Conversas
              </Button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-1">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Conversas Recentes</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[500px]">
                    {conversations.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-4">Nenhuma conversa ainda</p>
                    ) : (
                      conversations.map((conv) => (
                        <button
                          key={conv.id}
                          onClick={() => loadConversationMessages(conv)}
                          className={`w-full text-left px-4 py-3 border-b hover:bg-muted/40 transition-colors ${
                            selectedConversation?.id === conv.id ? 'bg-muted/60' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium text-sm">{conv.client_name || conv.phone}</span>
                              {conv.client_name && <span className="text-[11px] text-muted-foreground ml-1.5">{conv.phone}</span>}
                            </div>
                            {conv.handoff_requested && <Badge variant="destructive" className="text-[10px]">Humano</Badge>}
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-[11px] text-muted-foreground">
                              {conv.current_intent || conv.status}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(conv.last_message_at).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {selectedConversation ? `Chat: ${selectedConversation.phone}` : 'Selecione uma conversa'}
                    </CardTitle>
                    {selectedConversation?.handoff_requested && (
                      <Button size="sm" variant="outline" onClick={() => resolveHandoff(selectedConversation.id)}>
                        Resolver Handoff
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[460px] px-4">
                    {conversationMessages.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">
                        {selectedConversation ? 'Sem mensagens' : 'Selecione uma conversa para ver as mensagens'}
                      </p>
                    ) : (
                      <div className="space-y-2 py-3">
                        {conversationMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                              msg.direction === 'incoming'
                                ? 'bg-muted/60 mr-auto'
                                : 'bg-primary/10 text-primary ml-auto'
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* LOGS TAB */}
          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Logs do Agente</CardTitle>
                <CardDescription>Ações realizadas pelo agente nos agendamentos</CardDescription>
              </CardHeader>
              <CardContent>
                {agentLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum log registrado</p>
                ) : (
                  <div className="space-y-2">
                    {agentLogs.map((log) => (
                      <div key={log.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 text-sm">
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {log.action}
                        </Badge>
                        <span className="text-muted-foreground text-xs flex-1 truncate">
                          {JSON.stringify(log.details)}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(log.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* METRICS TAB */}
          <TabsContent value="metrics" className="space-y-4">
            <AgentMetrics agentLogs={agentLogs} conversations={conversations} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function AgentMetrics({ agentLogs, conversations }: { agentLogs: any[]; conversations: any[] }) {
  const metrics = useMemo(() => {
    const totalConversations = conversations.length;
    const handoffCount = conversations.filter(c => c.handoff_requested).length;
    const handoffRate = totalConversations > 0 ? ((handoffCount / totalConversations) * 100).toFixed(1) : '0';

    const audioLogs = agentLogs.filter(l => l.action === 'audio_processed');
    const audioCount = audioLogs.length;

    const responseLogs = agentLogs.filter(l => l.action === 'response_sent' && l.details?.response_time_ms);
    const avgResponseTime = responseLogs.length > 0
      ? Math.round(responseLogs.reduce((sum: number, l: any) => sum + (l.details.response_time_ms || 0), 0) / responseLogs.length)
      : 0;

    const actionCounts: Record<string, number> = {};
    agentLogs.forEach(l => {
      actionCounts[l.action] = (actionCounts[l.action] || 0) + 1;
    });

    const actionChartData = Object.entries(actionCounts)
      .map(([action, count]) => ({ action: formatAction(action), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Daily conversations (last 7 days)
    const dailyMap: Record<string, number> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dailyMap[d.toISOString().slice(0, 10)] = 0;
    }
    conversations.forEach(c => {
      const day = c.created_at?.slice(0, 10);
      if (day && day in dailyMap) dailyMap[day]++;
    });
    const dailyChartData = Object.entries(dailyMap).map(([date, count]) => ({
      date: new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      count,
    }));

    return { totalConversations, handoffCount, handoffRate, audioCount, avgResponseTime, actionChartData, dailyChartData, totalActions: agentLogs.length };
  }, [agentLogs, conversations]);

  const chartConfig = {
    count: { label: 'Quantidade', color: 'hsl(var(--primary))' },
  };

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-primary/10 p-2"><MessageSquare className="h-4 w-4 text-primary" /></div>
            <div>
              <p className="text-2xl font-bold">{metrics.totalConversations}</p>
              <p className="text-xs text-muted-foreground">Conversas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-destructive/10 p-2"><PhoneForwarded className="h-4 w-4 text-destructive" /></div>
            <div>
              <p className="text-2xl font-bold">{metrics.handoffRate}%</p>
              <p className="text-xs text-muted-foreground">Taxa Handoff</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-accent p-2"><Mic className="h-4 w-4 text-accent-foreground" /></div>
            <div>
              <p className="text-2xl font-bold">{metrics.audioCount}</p>
              <p className="text-xs text-muted-foreground">Áudios Processados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-info/10 p-2"><Clock className="h-4 w-4 text-info" /></div>
            <div>
              <p className="text-2xl font-bold">{metrics.avgResponseTime > 0 ? `${(metrics.avgResponseTime / 1000).toFixed(1)}s` : '—'}</p>
              <p className="text-xs text-muted-foreground">Tempo Médio</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Conversas por Dia (7 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <BarChart data={metrics.dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis allowDecimals={false} className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ações do Agente ({metrics.totalActions})</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.actionChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma ação registrada</p>
            ) : (
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <BarChart data={metrics.actionChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis type="number" allowDecimals={false} className="text-xs" />
                  <YAxis type="category" dataKey="action" width={120} className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatAction(action: string) {
  const map: Record<string, string> = {
    response_sent: 'Resposta Enviada',
    audio_processed: 'Áudio Processado',
    confirm: 'Confirmação',
    cancel: 'Cancelamento',
    reschedule: 'Reagendamento',
    handoff: 'Handoff',
    greeting: 'Saudação',
  };
  return map[action] || action;
}
