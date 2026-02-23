import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Send, Upload, Plus, Trash2, Clock, CheckCircle, XCircle,
  FileSpreadsheet, Users, MessageSquare, List, AlertCircle, Play, Ban, Eye, RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ─── Types ───
interface Campaign {
  id: string;
  name: string;
  message_text: string;
  message_type: string;
  buttons: any[];
  list_sections: any[];
  footer_text: string | null;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  delay_seconds: number;
  total_contacts: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  instance_id: string | null;
}

interface ContactRow {
  name: string;
  phone: string;
}

interface ButtonItem {
  text: string;
  id: string;
}

interface ListSection {
  title: string;
  items: { title: string; description?: string; id: string }[];
}

interface Instance {
  id: string;
  label: string | null;
  instance_name: string;
  phone_number: string | null;
  status: string;
}

// ─── Campaign Creator Component ───
function CampaignCreator({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const { user, companyId } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [messageText, setMessageText] = useState('');
  const [messageType, setMessageType] = useState('text');
  const [footerText, setFooterText] = useState('');
  const [buttons, setButtons] = useState<ButtonItem[]>([]);
  const [listSections, setListSections] = useState<ListSection[]>([{ title: 'Opções', items: [] }]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [delaySeconds, setDelaySeconds] = useState(10);
  const [scheduledAt, setScheduledAt] = useState('');
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [saving, setSaving] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');

  useEffect(() => {
    if (companyId && open) {
      supabase.from('whatsapp_instances').select('id, label, instance_name, phone_number, status')
        .eq('company_id', companyId).eq('status', 'connected')
        .then(({ data }) => {
          setInstances(data || []);
          if (data && data.length > 0 && !instanceId) setInstanceId(data[0].id);
        });
    }
  }, [companyId, open]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'csv') {
      const text = await file.text();
      const rows = parseCSV(text);
      setContacts(prev => [...prev, ...rows]);
      toast({ title: `${rows.length} contatos importados do CSV` });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<any>(ws);
      const rows: ContactRow[] = jsonData
        .map((row: any) => ({
          name: String(row.nome || row.name || row.Nome || row.Name || '').trim(),
          phone: normalizePhone(String(row.telefone || row.phone || row.Telefone || row.Phone || row.celular || row.Celular || '')),
        }))
        .filter((r: ContactRow) => r.name && r.phone);
      setContacts(prev => [...prev, ...rows]);
      toast({ title: `${rows.length} contatos importados da planilha` });
    } else {
      toast({ title: 'Formato não suportado. Use CSV ou XLSX.', variant: 'destructive' });
    }

    e.target.value = '';
  }, [toast]);

  const addManualContact = () => {
    if (!manualName.trim() || !manualPhone.trim()) return;
    setContacts(prev => [...prev, { name: manualName.trim(), phone: normalizePhone(manualPhone) }]);
    setManualName('');
    setManualPhone('');
  };

  const removeContact = (idx: number) => {
    setContacts(prev => prev.filter((_, i) => i !== idx));
  };

  const addButton = () => {
    if (buttons.length >= 3) return;
    setButtons(prev => [...prev, { text: '', id: '' }]);
  };

  const updateButton = (idx: number, field: 'text' | 'id', value: string) => {
    setButtons(prev => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
  };

  const removeButton = (idx: number) => {
    setButtons(prev => prev.filter((_, i) => i !== idx));
  };

  const addListItem = (sectionIdx: number) => {
    setListSections(prev => prev.map((s, i) =>
      i === sectionIdx ? { ...s, items: [...s.items, { title: '', id: '', description: '' }] } : s
    ));
  };

  const updateListItem = (sectionIdx: number, itemIdx: number, field: string, value: string) => {
    setListSections(prev => prev.map((s, si) =>
      si === sectionIdx
        ? { ...s, items: s.items.map((item, ii) => ii === itemIdx ? { ...item, [field]: value } : item) }
        : s
    ));
  };

  const removeListItem = (sectionIdx: number, itemIdx: number) => {
    setListSections(prev => prev.map((s, si) =>
      si === sectionIdx ? { ...s, items: s.items.filter((_, ii) => ii !== itemIdx) } : s
    ));
  };

  const handleCreate = async () => {
    if (!name.trim()) { toast({ title: 'Dê um nome à campanha', variant: 'destructive' }); return; }
    if (!messageText.trim()) { toast({ title: 'Escreva a mensagem', variant: 'destructive' }); return; }
    if (contacts.length === 0) { toast({ title: 'Importe pelo menos 1 contato', variant: 'destructive' }); return; }
    if (!companyId || !user) return;

    setSaving(true);

    // Create campaign
    const { data: campaign, error } = await supabase
      .from('mass_campaigns')
      .insert({
        company_id: companyId,
        instance_id: instanceId,
        name: name.trim(),
        message_text: messageText,
        message_type: messageType,
        buttons: messageType === 'button' ? buttons.filter(b => b.text.trim()) : [],
        list_sections: messageType === 'list' ? listSections : [],
        footer_text: footerText.trim() || null,
        delay_seconds: delaySeconds,
        total_contacts: contacts.length,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        status: scheduledAt ? 'scheduled' : 'draft',
        created_by: user.id,
      } as any)
      .select()
      .single();

    if (error || !campaign) {
      toast({ title: 'Erro ao criar campanha', variant: 'destructive' });
      setSaving(false);
      return;
    }

    // Insert contacts in batches
    const batchSize = 100;
    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize).map(c => ({
        campaign_id: campaign.id,
        name: c.name,
        phone: c.phone,
      }));
      await supabase.from('mass_campaign_contacts').insert(batch);
    }

    toast({ title: `Campanha "${name}" criada com ${contacts.length} contatos!` });

    // If not scheduled, start immediately
    if (!scheduledAt) {
      await supabase.functions.invoke('mass-send-whatsapp', {
        body: { action: 'start-campaign', campaign_id: campaign.id },
      });
      toast({ title: 'Disparo iniciado!' });
    }

    // Reset form
    setName('');
    setMessageText('');
    setMessageType('text');
    setFooterText('');
    setButtons([]);
    setListSections([{ title: 'Opções', items: [] }]);
    setContacts([]);
    setScheduledAt('');
    setSaving(false);
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" /> Nova Campanha
          </DialogTitle>
          <DialogDescription>Configure a mensagem, importe contatos e agende o disparo.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="message" className="mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="message">Mensagem</TabsTrigger>
            <TabsTrigger value="contacts">Contatos ({contacts.length})</TabsTrigger>
            <TabsTrigger value="settings">Configurações</TabsTrigger>
          </TabsList>

          {/* ── Mensagem ── */}
          <TabsContent value="message" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Nome da campanha</Label>
              <Input placeholder="Ex: Promoção Dezembro" value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Tipo de mensagem</Label>
              <Select value={messageType} onValueChange={setMessageType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto simples</SelectItem>
                  <SelectItem value="button">Com botões (até 3)</SelectItem>
                  <SelectItem value="list">Menu de lista</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mensagem <span className="text-xs text-muted-foreground">(use {'{{nome}}'} para personalizar)</span></Label>
              <Textarea
                placeholder="Olá {{nome}}! Temos uma novidade para você..."
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Texto do rodapé <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <Input placeholder="Ex: Responda para saber mais" value={footerText} onChange={e => setFooterText(e.target.value)} />
            </div>

            {/* Buttons config */}
            {messageType === 'button' && (
              <div className="space-y-3 border rounded-xl p-4 bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Botões interativos</Label>
                  <Button size="sm" variant="outline" onClick={addButton} disabled={buttons.length >= 3} className="gap-1">
                    <Plus className="h-3 w-3" /> Adicionar
                  </Button>
                </div>
                {buttons.map((btn, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input placeholder="Texto do botão" value={btn.text} onChange={e => updateButton(idx, 'text', e.target.value)} className="flex-1" />
                    <Input placeholder="ID (opcional)" value={btn.id} onChange={e => updateButton(idx, 'id', e.target.value)} className="w-32" />
                    <Button size="icon" variant="ghost" onClick={() => removeButton(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                ))}
                {buttons.length === 0 && <p className="text-xs text-muted-foreground">Adicione até 3 botões de resposta rápida</p>}
              </div>
            )}

            {/* List config */}
            {messageType === 'list' && (
              <div className="space-y-3 border rounded-xl p-4 bg-muted/30">
                <Label className="text-sm font-semibold">Itens do menu</Label>
                {listSections.map((section, si) => (
                  <div key={si} className="space-y-2">
                    <Input
                      placeholder="Título da seção"
                      value={section.title}
                      onChange={e => setListSections(prev => prev.map((s, i) => i === si ? { ...s, title: e.target.value } : s))}
                      className="font-medium"
                    />
                    {section.items.map((item, ii) => (
                      <div key={ii} className="flex items-center gap-2 pl-4">
                        <Input placeholder="Título" value={item.title} onChange={e => updateListItem(si, ii, 'title', e.target.value)} className="flex-1" />
                        <Input placeholder="Descrição" value={item.description || ''} onChange={e => updateListItem(si, ii, 'description', e.target.value)} className="flex-1" />
                        <Button size="icon" variant="ghost" onClick={() => removeListItem(si, ii)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={() => addListItem(si)} className="ml-4 gap-1">
                      <Plus className="h-3 w-3" /> Item
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Contatos ── */}
          <TabsContent value="contacts" className="space-y-4 mt-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex-1">
                <div className="flex items-center gap-2 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors text-center justify-center">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Importar CSV ou Excel</span>
                </div>
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>

            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <FileSpreadsheet className="h-3 w-3" />
              A planilha deve conter colunas: <strong>nome</strong> e <strong>telefone</strong> (ou name/phone)
            </div>

            {/* Manual add */}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Nome</Label>
                <Input placeholder="João Silva" value={manualName} onChange={e => setManualName(e.target.value)} />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Telefone</Label>
                <Input placeholder="5511999999999" value={manualPhone} onChange={e => setManualPhone(e.target.value)} />
              </div>
              <Button onClick={addManualContact} size="sm" className="gap-1"><Plus className="h-3 w-3" /> Adicionar</Button>
            </div>

            {/* Contact list */}
            {contacts.length > 0 && (
              <div className="border rounded-xl overflow-hidden max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((c, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell className="text-sm">{c.name}</TableCell>
                        <TableCell className="text-sm font-mono">{c.phone}</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => removeContact(idx)} className="h-7 w-7">
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {contacts.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum contato adicionado</p>
              </div>
            )}
          </TabsContent>

          {/* ── Configurações ── */}
          <TabsContent value="settings" className="space-y-4 mt-4">
            {instances.length > 0 && (
              <div className="space-y-2">
                <Label>Instância WhatsApp</Label>
                <Select value={instanceId || ''} onValueChange={setInstanceId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {instances.map(inst => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.label || inst.instance_name} {inst.phone_number ? `(${inst.phone_number})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Intervalo entre mensagens (segundos)</Label>
              <Input type="number" min={5} max={120} value={delaySeconds} onChange={e => setDelaySeconds(Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">Recomendado: 10-30s para evitar bloqueios</p>
            </div>

            <div className="space-y-2">
              <Label>Agendamento <span className="text-xs text-muted-foreground">(deixe vazio para enviar agora)</span></Label>
              <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={saving} className="gap-2">
            {saving ? <Clock className="h-4 w-4 animate-spin" /> : scheduledAt ? <Clock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {saving ? 'Criando...' : scheduledAt ? 'Agendar' : 'Criar e Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ───
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function parseCSV(text: string): ContactRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase().split(/[,;\t]/);
  const nameIdx = header.findIndex(h => ['nome', 'name'].includes(h.trim()));
  const phoneIdx = header.findIndex(h => ['telefone', 'phone', 'celular', 'whatsapp'].includes(h.trim()));

  if (nameIdx === -1 || phoneIdx === -1) return [];

  return lines.slice(1)
    .map(line => {
      const cols = line.split(/[,;\t]/);
      return {
        name: (cols[nameIdx] || '').trim().replace(/^["']|["']$/g, ''),
        phone: normalizePhone(cols[phoneIdx] || ''),
      };
    })
    .filter(r => r.name && r.phone);
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Rascunho', color: 'secondary', icon: MessageSquare },
  scheduled: { label: 'Agendada', color: 'outline', icon: Clock },
  processing: { label: 'Enviando', color: 'default', icon: Play },
  completed: { label: 'Concluída', color: 'default', icon: CheckCircle },
  cancelled: { label: 'Cancelada', color: 'destructive', icon: Ban },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const statusContactConfig: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendente', color: 'secondary' },
  sent: { label: 'Enviado', color: 'default' },
  failed: { label: 'Falhou', color: 'destructive' },
};

// ─── Campaign Details Dialog ───
function CampaignDetailsDialog({
  campaignId,
  open,
  onOpenChange,
}: {
  campaignId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'sent' | 'failed' | 'pending'>('all');

  const fetchContacts = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    let query = supabase
      .from('mass_campaign_contacts')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true });

    if (filter !== 'all') {
      query = query.eq('status', filter);
    }

    const { data } = await query.limit(500);
    setContacts(data || []);
    setLoading(false);
  }, [campaignId, filter]);

  useEffect(() => {
    if (open && campaignId) fetchContacts();
  }, [open, campaignId, fetchContacts]);

  const totalSent = contacts.filter(c => c.status === 'sent').length;
  const totalFailed = contacts.filter(c => c.status === 'failed').length;
  const totalPending = contacts.filter(c => c.status === 'pending').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" /> Detalhes da Campanha
          </DialogTitle>
          <DialogDescription>Status individual de cada contato</DialogDescription>
        </DialogHeader>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mt-2">
          <div className="rounded-xl border p-3 text-center cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setFilter('sent')}>
            <CheckCircle className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-lg font-bold">{filter === 'all' ? totalSent : filter === 'sent' ? contacts.length : '–'}</p>
            <p className="text-[10px] text-muted-foreground">Enviados</p>
          </div>
          <div className="rounded-xl border p-3 text-center cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setFilter('failed')}>
            <XCircle className="h-4 w-4 text-destructive mx-auto mb-1" />
            <p className="text-lg font-bold">{filter === 'all' ? totalFailed : filter === 'failed' ? contacts.length : '–'}</p>
            <p className="text-[10px] text-muted-foreground">Falhas</p>
          </div>
          <div className="rounded-xl border p-3 text-center cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setFilter('pending')}>
            <Clock className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-lg font-bold">{filter === 'all' ? totalPending : filter === 'pending' ? contacts.length : '–'}</p>
            <p className="text-[10px] text-muted-foreground">Pendentes</p>
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-2 mt-2">
          {(['all', 'failed', 'sent', 'pending'] as const).map(f => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
              className="text-xs"
            >
              {f === 'all' ? 'Todos' : f === 'failed' ? '❌ Falhas' : f === 'sent' ? '✅ Enviados' : '⏳ Pendentes'}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={fetchContacts} className="ml-auto gap-1 text-xs">
            <RefreshCw className="h-3 w-3" /> Atualizar
          </Button>
        </div>

        {/* Contacts table */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Nenhum contato encontrado</div>
        ) : (
          <div className="border rounded-xl overflow-hidden max-h-[400px] overflow-y-auto mt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map(c => {
                  const sc = statusContactConfig[c.status] || statusContactConfig.pending;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm">{c.name}</TableCell>
                      <TableCell className="text-sm font-mono">{c.phone}</TableCell>
                      <TableCell>
                        <Badge variant={sc.color as any} className="text-[10px]">{sc.label}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {c.error_message ? (
                          <span className="text-xs text-destructive line-clamp-2" title={c.error_message}>
                            {c.error_message}
                          </span>
                        ) : c.sent_at ? (
                          <span className="text-[10px] text-muted-foreground">{formatDate(c.sent_at)}</span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───
export default function MassMessages() {
  const { companyId } = useAuth();
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailsCampaignId, setDetailsCampaignId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from('mass_campaigns')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    setCampaigns((data as any) || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Polling for processing campaigns
  useEffect(() => {
    const hasProcessing = campaigns.some(c => c.status === 'processing' || c.status === 'scheduled');
    if (!hasProcessing) return;
    const interval = setInterval(fetchCampaigns, 5000);
    return () => clearInterval(interval);
  }, [campaigns, fetchCampaigns]);

  const cancelCampaign = async (id: string) => {
    await supabase.from('mass_campaigns').update({ status: 'cancelled' } as any).eq('id', id);
    toast({ title: 'Campanha cancelada' });
    fetchCampaigns();
  };

  const startCampaign = async (id: string) => {
    await supabase.functions.invoke('mass-send-whatsapp', {
      body: { action: 'start-campaign', campaign_id: id },
    });
    toast({ title: 'Disparo iniciado!' });
    fetchCampaigns();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="section-header">
            <h1 className="section-title">Mensagens em Massa</h1>
            <p className="section-subtitle">Crie campanhas de disparo com mensagens interativas</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Campanha
          </Button>
        </div>

        <CampaignCreator open={createOpen} onOpenChange={setCreateOpen} onCreated={fetchCampaigns} />
        <CampaignDetailsDialog campaignId={detailsCampaignId} open={detailsOpen} onOpenChange={setDetailsOpen} />

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12">
            <Send className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhuma campanha criada</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Clique em "Nova Campanha" para começar</p>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map(campaign => {
              const config = statusConfig[campaign.status] || statusConfig.draft;
              const Icon = config.icon;
              const progress = campaign.total_contacts > 0
                ? Math.round(((campaign.sent_count + campaign.failed_count) / campaign.total_contacts) * 100)
                : 0;

              return (
                <Card key={campaign.id} className="glass-card rounded-2xl">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 min-w-0 flex-1">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm">{campaign.name}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{campaign.message_text}</p>

                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            <Badge variant={config.color as any} className="text-[10px] gap-1">
                              {config.label}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Users className="h-2.5 w-2.5" /> {campaign.total_contacts} contatos
                            </span>
                            {campaign.message_type !== 'text' && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <List className="h-2.5 w-2.5" /> {campaign.message_type === 'button' ? 'Botões' : 'Menu lista'}
                              </span>
                            )}
                            {campaign.scheduled_at && campaign.status === 'scheduled' && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" /> {formatDate(campaign.scheduled_at)}
                              </span>
                            )}
                          </div>

                          {(campaign.status === 'processing' || campaign.status === 'completed') && (
                            <div className="mt-3 space-y-1">
                              <Progress value={progress} className="h-2" />
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <CheckCircle className="h-2.5 w-2.5 text-primary" /> {campaign.sent_count} enviados
                                </span>
                                {campaign.failed_count > 0 && (
                                  <span className="flex items-center gap-1">
                                    <XCircle className="h-2.5 w-2.5 text-destructive" /> {campaign.failed_count} falhas
                                  </span>
                                )}
                                <span>{progress}%</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button size="sm" variant="outline" onClick={() => { setDetailsCampaignId(campaign.id); setDetailsOpen(true); }} className="gap-1 text-xs">
                          <Eye className="h-3 w-3" /> Detalhes
                        </Button>
                        {campaign.status === 'draft' && (
                          <Button size="sm" onClick={() => startCampaign(campaign.id)} className="gap-1 text-xs">
                            <Play className="h-3 w-3" /> Iniciar
                          </Button>
                        )}
                        {(campaign.status === 'processing' || campaign.status === 'scheduled') && (
                          <Button size="sm" variant="destructive" onClick={() => cancelCampaign(campaign.id)} className="gap-1 text-xs">
                            <Ban className="h-3 w-3" /> Cancelar
                          </Button>
                        )}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(campaign.created_at)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
