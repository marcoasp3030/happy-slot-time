import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { MapPin, Phone, Clock, Scissors, Users, FileText, Image, Mic, Upload, Trash2, Info, ShieldCheck, UserCheck, Mail, Building2, Globe, MapPinned, Briefcase, CreditCard, QrCode, Link, Sparkles, Loader2, UsersRound, ScanLine } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AgentCapabilitiesProps {
  settings: any;
  onSettingsChange: (settings: any) => void;
  onSave: () => void;
  saving: boolean;
}

export default function AgentCapabilities({ settings, onSettingsChange, onSave, saving }: AgentCapabilitiesProps) {
  const { companyId } = useAuth();
  const [files, setFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (companyId) fetchFiles();
  }, [companyId]);

  async function fetchFiles() {
    if (!companyId) return;
    const { data } = await supabase
      .from('whatsapp_agent_files')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    setFiles(data || []);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo de 10MB', variant: 'destructive' });
      return;
    }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${companyId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('agent-files')
      .upload(path, file);

    if (uploadError) {
      toast({ title: 'Erro no upload', description: uploadError.message, variant: 'destructive' });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('agent-files').getPublicUrl(path);

    let fileType = 'document';
    if (file.type.startsWith('image/')) fileType = 'image';
    else if (file.type.startsWith('audio/')) fileType = 'audio';

    await supabase.from('whatsapp_agent_files').insert({
      company_id: companyId,
      file_name: file.name,
      file_url: urlData.publicUrl,
      file_type: fileType,
    });

    toast({ title: 'Arquivo enviado!' });
    setUploading(false);
    fetchFiles();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function deleteFile(id: string, fileUrl: string) {
    // Extract path from URL
    const urlParts = fileUrl.split('/agent-files/');
    if (urlParts[1]) {
      await supabase.storage.from('agent-files').remove([urlParts[1]]);
    }
    await supabase.from('whatsapp_agent_files').delete().eq('id', id);
    toast({ title: 'Arquivo removido' });
    fetchFiles();
  }

  async function updateFileDescription(id: string, description: string) {
    await supabase.from('whatsapp_agent_files').update({ description }).eq('id', id);
  }

  async function generateWithAI() {
    setGeneratingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-business-info');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.text) {
        onSettingsChange({ ...settings, custom_business_info: data.text });
        toast({ title: 'Texto gerado com IA!', description: 'Revise e ajuste conforme necessário.' });
      }
    } catch (err: any) {
      toast({ title: 'Erro ao gerar', description: err.message || 'Tente novamente', variant: 'destructive' });
    } finally {
      setGeneratingAI(false);
    }
  }

  const u = (field: string, value: any) => onSettingsChange({ ...settings, [field]: value });

  const fileTypeIcon = (type: string) => {
    if (type === 'image') return <Image className="h-4 w-4 text-blue-500" />;
    if (type === 'audio') return <Mic className="h-4 w-4 text-purple-500" />;
    return <FileText className="h-4 w-4 text-orange-500" />;
  };

  const fileTypeBadge = (type: string) => {
    const labels: Record<string, string> = { image: 'Imagem', audio: 'Áudio', document: 'Documento' };
    return labels[type] || type;
  };

  return (
    <div className="space-y-4">
      {/* Information Sharing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4.5 w-4.5 text-primary" />
            Informações do Estabelecimento
          </CardTitle>
          <CardDescription>Defina quais informações o agente pode compartilhar com os clientes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label className="font-medium text-sm">Endereço</Label>
                  <p className="text-xs text-muted-foreground">O agente pode informar o endereço do estabelecimento</p>
                </div>
              </div>
              <Switch checked={settings?.can_share_address ?? true} onCheckedChange={(v) => u('can_share_address', v)} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label className="font-medium text-sm">Telefone</Label>
                  <p className="text-xs text-muted-foreground">O agente pode informar o número de contato</p>
                </div>
              </div>
              <Switch checked={settings?.can_share_phone ?? true} onCheckedChange={(v) => u('can_share_phone', v)} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label className="font-medium text-sm">Horário de Funcionamento</Label>
                  <p className="text-xs text-muted-foreground">O agente pode informar os horários de atendimento</p>
                </div>
              </div>
              <Switch checked={settings?.can_share_business_hours ?? true} onCheckedChange={(v) => u('can_share_business_hours', v)} />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium text-sm">Informações adicionais do estabelecimento</Label>
                <p className="text-xs text-muted-foreground">Texto livre com informações extras que o agente pode usar (ex: estacionamento, formas de pagamento, etc.)</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={generateWithAI}
                disabled={generatingAI}
                className="flex-shrink-0 gap-1.5"
              >
                {generatingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {generatingAI ? 'Gerando...' : 'Gerar com IA'}
              </Button>
            </div>
            <Textarea
              value={settings?.custom_business_info || ''}
              onChange={(e) => u('custom_business_info', e.target.value)}
              rows={3}
              placeholder="Ex: Aceitamos PIX, cartão de crédito e débito. Estacionamento gratuito no local. Wi-Fi disponível."
            />
          </div>
        </CardContent>
      </Card>

      {/* Group Messages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UsersRound className="h-4.5 w-4.5 text-primary" />
            Grupos do WhatsApp
          </CardTitle>
          <CardDescription>Configure o comportamento do agente em grupos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
            <div className="flex items-center gap-3">
              <UsersRound className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="font-medium text-sm">Ignorar mensagens de grupos</Label>
                <p className="text-xs text-muted-foreground">O agente não responderá mensagens enviadas em grupos do WhatsApp</p>
              </div>
            </div>
            <Switch checked={settings?.ignore_groups ?? true} onCheckedChange={(v) => u('ignore_groups', v)} />
          </div>
        </CardContent>
      </Card>

      {/* Feature Capabilities */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4.5 w-4.5 text-primary" />
            Funcionalidades do Agente
          </CardTitle>
          <CardDescription>Controle quais funcionalidades do sistema o agente pode acessar e oferecer</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
            <div className="flex items-center gap-3">
              <Scissors className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="font-medium text-sm">Serviços</Label>
                <p className="text-xs text-muted-foreground">O agente pode listar e detalhar os serviços disponíveis</p>
              </div>
            </div>
            <Switch checked={settings?.can_share_services ?? true} onCheckedChange={(v) => u('can_share_services', v)} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="font-medium text-sm">Profissionais</Label>
                <p className="text-xs text-muted-foreground">O agente pode informar sobre os profissionais disponíveis</p>
              </div>
            </div>
            <Switch checked={settings?.can_share_professionals ?? true} onCheckedChange={(v) => u('can_share_professionals', v)} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="font-medium text-sm">Anamnese</Label>
                <p className="text-xs text-muted-foreground">O agente pode conduzir o preenchimento de fichas de anamnese</p>
              </div>
            </div>
            <Switch checked={settings?.can_handle_anamnesis ?? false} onCheckedChange={(v) => u('can_handle_anamnesis', v)} />
          </div>
        </CardContent>
      </Card>

      {/* Data Collection from Client */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserCheck className="h-4.5 w-4.5 text-primary" />
            Coleta de Dados do Cliente
          </CardTitle>
          <CardDescription>Defina quais informações o agente deve solicitar ao cliente durante a conversa</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="font-medium text-sm">Nome</Label>
                <p className="text-xs text-muted-foreground">Solicitar o nome completo do cliente</p>
              </div>
            </div>
            <Switch checked={settings?.collect_client_name ?? true} onCheckedChange={(v) => u('collect_client_name', v)} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="font-medium text-sm">Telefone</Label>
                <p className="text-xs text-muted-foreground">Solicitar número de telefone (além do WhatsApp)</p>
              </div>
            </div>
            <Switch checked={settings?.collect_client_phone ?? true} onCheckedChange={(v) => u('collect_client_phone', v)} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="font-medium text-sm">E-mail</Label>
                <p className="text-xs text-muted-foreground">Solicitar endereço de e-mail</p>
              </div>
            </div>
            <Switch checked={settings?.collect_client_email ?? false} onCheckedChange={(v) => u('collect_client_email', v)} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
            <div className="flex items-center gap-3">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="font-medium text-sm">Nome da Empresa</Label>
                <p className="text-xs text-muted-foreground">Solicitar o nome da empresa do cliente</p>
              </div>
            </div>
            <Switch checked={settings?.collect_company_name ?? false} onCheckedChange={(v) => u('collect_company_name', v)} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
            <div className="flex items-center gap-3">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="font-medium text-sm">Segmento</Label>
                <p className="text-xs text-muted-foreground">Solicitar o segmento de atuação do cliente</p>
              </div>
            </div>
            <Switch checked={settings?.collect_segment ?? false} onCheckedChange={(v) => u('collect_segment', v)} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
            <div className="flex items-center gap-3">
              <MapPinned className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="font-medium text-sm">Região</Label>
                <p className="text-xs text-muted-foreground">Solicitar a região ou cidade do cliente</p>
              </div>
            </div>
            <Switch checked={settings?.collect_region ?? false} onCheckedChange={(v) => u('collect_region', v)} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
            <div className="flex items-center gap-3">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="font-medium text-sm">Área de Atuação</Label>
                <p className="text-xs text-muted-foreground">Solicitar qual a área de atuação profissional do cliente</p>
              </div>
            </div>
            <Switch checked={settings?.collect_area ?? false} onCheckedChange={(v) => u('collect_area', v)} />
          </div>
        </CardContent>
      </Card>

      {/* Payment Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4.5 w-4.5 text-primary" />
            Pagamento
          </CardTitle>
          <CardDescription>Configure se o agente pode enviar links de pagamento e dados PIX aos clientes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
            <div className="flex items-center gap-3">
              <Link className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="font-medium text-sm">Link de Pagamento</Label>
                <p className="text-xs text-muted-foreground">O agente pode enviar um link para pagamento online</p>
              </div>
            </div>
            <Switch checked={settings?.can_send_payment_link ?? false} onCheckedChange={(v) => u('can_send_payment_link', v)} />
          </div>

          {settings?.can_send_payment_link && (
            <div className="space-y-2 pl-7">
              <Label className="font-medium text-sm">URL do link de pagamento</Label>
              <Input
                value={settings?.payment_link_url || ''}
                onChange={(e) => u('payment_link_url', e.target.value)}
                placeholder="https://pay.exemplo.com/pagamento"
              />
            </div>
          )}

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
            <div className="flex items-center gap-3">
              <QrCode className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="font-medium text-sm">PIX</Label>
                <p className="text-xs text-muted-foreground">O agente pode enviar a chave PIX para pagamento</p>
              </div>
            </div>
            <Switch checked={settings?.can_send_pix ?? false} onCheckedChange={(v) => u('can_send_pix', v)} />
          </div>

          {settings?.can_send_pix && (
            <div className="space-y-3 pl-7">
              <div className="space-y-2">
                <Label className="font-medium text-sm">Chave PIX</Label>
                <Input
                  value={settings?.pix_key || ''}
                  onChange={(e) => u('pix_key', e.target.value)}
                  placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-medium text-sm">Nome do titular</Label>
                <Input
                  value={settings?.pix_name || ''}
                  onChange={(e) => u('pix_name', e.target.value)}
                  placeholder="Nome que aparece ao pagar"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-medium text-sm">Instruções de pagamento</Label>
                <Textarea
                  value={settings?.pix_instructions || ''}
                  onChange={(e) => u('pix_instructions', e.target.value)}
                  rows={2}
                  placeholder="Ex: Envie o comprovante após o pagamento para confirmar seu agendamento."
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <div className="flex items-center gap-3">
                  <QrCode className="h-4 w-4 text-yellow-600" />
                  <div>
                    <Label className="font-medium text-sm">Enviar chave PIX sempre como texto</Label>
                    <p className="text-xs text-muted-foreground">
                      Recomendado: mesmo quando o agente responder por áudio, a chave PIX será enviada em uma mensagem de texto separada para evitar erros de leitura
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings?.pix_send_as_text ?? true}
                  onCheckedChange={(v) => u('pix_send_as_text', v)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* File Sending Capabilities */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4.5 w-4.5 text-primary" />
            Envio de Arquivos
          </CardTitle>
          <CardDescription>Configure se o agente pode enviar arquivos e faça upload dos materiais</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-orange-500" />
                <div>
                  <Label className="font-medium text-sm">Documentos (PDF)</Label>
                  <p className="text-xs text-muted-foreground">O agente pode enviar PDFs como catálogos, tabelas de preço, etc.</p>
                </div>
              </div>
              <Switch checked={settings?.can_send_files ?? false} onCheckedChange={(v) => u('can_send_files', v)} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
              <div className="flex items-center gap-3">
                <Image className="h-4 w-4 text-blue-500" />
                <div>
                  <Label className="font-medium text-sm">Imagens e Fotos</Label>
                  <p className="text-xs text-muted-foreground">O agente pode enviar fotos do espaço, trabalhos realizados, etc.</p>
                </div>
              </div>
              <Switch checked={settings?.can_send_images ?? false} onCheckedChange={(v) => u('can_send_images', v)} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
              <div className="flex items-center gap-3">
                <Mic className="h-4 w-4 text-purple-500" />
                <div>
                  <Label className="font-medium text-sm">Áudios</Label>
                  <p className="text-xs text-muted-foreground">O agente pode enviar áudios pré-gravados</p>
                </div>
              </div>
              <Switch checked={settings?.can_send_audio ?? false} onCheckedChange={(v) => u('can_send_audio', v)} />
            </div>
          </div>

          {(settings?.can_send_files || settings?.can_send_images || settings?.can_send_audio) && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-medium text-sm">Arquivos Carregados</Label>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.mp3,.ogg,.wav,.m4a"
                      onChange={handleFileUpload}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      {uploading ? 'Enviando...' : 'Upload'}
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Formatos aceitos: PDF, PNG, JPG, WEBP, MP3, OGG, WAV, M4A — Máx. 10MB
                </p>

                {files.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg">
                    Nenhum arquivo carregado ainda
                  </div>
                ) : (
                  <div className="space-y-2">
                    {files.map((f) => (
                      <div key={f.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                        <div className="mt-0.5">{fileTypeIcon(f.file_type)}</div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{f.file_name}</span>
                            <Badge variant="outline" className="text-[10px] flex-shrink-0">
                              {fileTypeBadge(f.file_type)}
                            </Badge>
                          </div>
                          <Input
                            placeholder="Descrição para o agente (ex: Tabela de preços atualizada)"
                            defaultValue={f.description || ''}
                            onBlur={(e) => updateFileDescription(f.id, e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive flex-shrink-0"
                          onClick={() => deleteFile(f.id, f.file_url)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Media Reading */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ScanLine className="h-4.5 w-4.5 text-primary" />
            Leitura de Imagens e PDFs
          </CardTitle>
          <CardDescription>
            Permite que o agente analise imagens e documentos PDF enviados pelos clientes e responda com base no conteúdo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
            <div className="flex items-center gap-3">
              <ScanLine className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="font-medium text-sm">Ativar leitura de mídia</Label>
                <p className="text-xs text-muted-foreground">O agente irá analisar imagens (JPG, PNG, WEBP) e documentos PDF enviados pelos clientes</p>
              </div>
            </div>
            <Switch checked={settings?.can_read_media ?? false} onCheckedChange={(v) => u('can_read_media', v)} />
          </div>

          {settings?.can_read_media && (
            <div className="space-y-3 pl-7">
              <div className="space-y-2">
                <Label className="font-medium text-sm">Modelo de visão</Label>
                <p className="text-xs text-muted-foreground">Escolha o modelo de IA que irá analisar as imagens e PDFs. Modelos mais avançados têm maior precisão.</p>
                <Select
                  value={settings?.media_vision_model || 'google/gemini-2.5-flash'}
                  onValueChange={(v) => u('media_vision_model', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google/gemini-2.5-flash">
                      Gemini 2.5 Flash — Rápido e eficiente (recomendado)
                    </SelectItem>
                    <SelectItem value="google/gemini-2.5-pro">
                      Gemini 2.5 Pro — Maior precisão em documentos complexos
                    </SelectItem>
                    <SelectItem value="openai/gpt-5-mini">
                      GPT-5 Mini — Alternativa OpenAI balanceada
                    </SelectItem>
                    <SelectItem value="openai/gpt-5">
                      GPT-5 — Maior precisão OpenAI
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Como funciona:</p>
                <p>• <strong>Imagens:</strong> O cliente envia uma foto (ex: exame, referência de serviço) e o agente descreve e responde sobre o conteúdo.</p>
                <p>• <strong>PDFs:</strong> O cliente envia um documento (ex: laudo, orçamento) e o agente extrai e interpreta as informações.</p>
                <p>• A análise é feita automaticamente e o agente responde no contexto da conversa.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={onSave} disabled={saving} className="w-full md:w-auto">
        {saving ? 'Salvando...' : 'Salvar Capacidades'}
      </Button>
    </div>
  );
}
