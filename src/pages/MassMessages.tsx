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
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Send, Upload, Plus, Trash2, Clock, CheckCircle, XCircle,
  FileSpreadsheet, Users, MessageSquare, List, AlertCircle, Play, Ban, Eye, RefreshCw, Download, Zap,
  Pencil, Copy, Tag, Search, FolderOpen, MoreHorizontal, X,
  Image, Mic, File, Loader2,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  editCampaign,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
  editCampaign?: Campaign | null;
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

  // Anti-ban settings
  const [delayMin, setDelayMin] = useState(8);
  const [delayMax, setDelayMax] = useState(25);
  const [dailyLimit, setDailyLimit] = useState(300);
  const [businessHoursOnly, setBusinessHoursOnly] = useState(true);
  const [rotateInstances, setRotateInstances] = useState(false);
  const [automationFlowId, setAutomationFlowId] = useState<string | null>(null);
  const [automationFlows, setAutomationFlows] = useState<{ id: string; name: string }[]>([]);

  // Media - multiple files
  const [mediaFiles, setMediaFiles] = useState<{ url: string; type: string; name: string }[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Segment selection
  const [savedLists, setSavedLists] = useState<{ id: string; name: string; count: number }[]>([]);
  const [savedTags, setSavedTags] = useState<string[]>([]);
  const [selectedListIds, setSelectedListIds] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [loadingSegments, setLoadingSegments] = useState(false);

  // Populate form when editing
  useEffect(() => {
    if (editCampaign && open) {
      setName(editCampaign.name);
      setMessageText(editCampaign.message_text);
      setMessageType(editCampaign.message_type || 'text');
      setFooterText(editCampaign.footer_text || '');
      setButtons(Array.isArray(editCampaign.buttons) ? editCampaign.buttons : []);
      setListSections(Array.isArray(editCampaign.list_sections) && editCampaign.list_sections.length > 0
        ? editCampaign.list_sections : [{ title: 'Opções', items: [] }]);
      if (editCampaign.instance_id) setInstanceId(editCampaign.instance_id);
    }
  }, [editCampaign, open]);

  // Reset form when closing without edit
  useEffect(() => {
    if (!open && !editCampaign) {
      setName('');
      setMessageText('');
      setMessageType('text');
      setFooterText('');
      setButtons([]);
      setListSections([{ title: 'Opções', items: [] }]);
      setContacts([]);
      setScheduledAt('');
      setAutomationFlowId(null);
      setMediaFiles([]);
      setShowPreview(false);
      setSelectedListIds(new Set());
      setSelectedTags(new Set());
    }
  }, [open, editCampaign]);

  // Fetch instances, automation flows, and saved segments
  useEffect(() => {
    if (companyId && open) {
      supabase.from('whatsapp_instances').select('id, label, instance_name, phone_number, status')
        .eq('company_id', companyId).eq('status', 'connected')
        .then(({ data }) => {
          setInstances(data || []);
          if (data && data.length > 0 && !instanceId) setInstanceId(data[0].id);
        });
      supabase.from('automation_flows').select('id, name')
        .eq('company_id', companyId).eq('active', true)
        .then(({ data }) => {
          setAutomationFlows(data || []);
        });
      // Fetch saved contact lists and tags for segment selection
      supabase.from('mass_contact_lists').select('id, name').eq('company_id', companyId).order('name')
        .then(({ data }) => {
          if (data) {
            // Get counts
            supabase.from('mass_contacts').select('list_id').eq('company_id', companyId)
              .then(({ data: allContacts }) => {
                const counts: Record<string, number> = {};
                (allContacts || []).forEach((c: any) => { if (c.list_id) counts[c.list_id] = (counts[c.list_id] || 0) + 1; });
                setSavedLists(data.map(l => ({ id: l.id, name: l.name, count: counts[l.id] || 0 })));
              });
          }
        });
      supabase.from('mass_contacts').select('tags').eq('company_id', companyId)
        .then(({ data }) => {
          const tags = new Set<string>();
          (data || []).forEach((c: any) => c.tags?.forEach((t: string) => tags.add(t)));
          setSavedTags(Array.from(tags).sort());
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

  // Load contacts from saved segments
  const loadFromSegments = async () => {
    if (selectedListIds.size === 0 && selectedTags.size === 0) {
      toast({ title: 'Selecione ao menos uma lista ou tag', variant: 'destructive' });
      return;
    }
    setLoadingSegments(true);
    let query = supabase.from('mass_contacts').select('name, phone').eq('company_id', companyId!);

    if (selectedListIds.size > 0 && selectedTags.size > 0) {
      // Both filters: list OR tag match
      const { data } = await query;
      const filtered = (data || []).filter((c: any) => {
        const matchList = c.list_id && selectedListIds.has(c.list_id);
        const matchTag = c.tags?.some((t: string) => selectedTags.has(t));
        return matchList || matchTag;
      });
      // Need to re-query with list_id filter since we can't do OR with contains
      const { data: byList } = await supabase.from('mass_contacts').select('name, phone, list_id, tags')
        .eq('company_id', companyId!).in('list_id', Array.from(selectedListIds));
      const { data: allContacts } = await supabase.from('mass_contacts').select('name, phone, tags')
        .eq('company_id', companyId!);
      const byTag = (allContacts || []).filter((c: any) => c.tags?.some((t: string) => selectedTags.has(t)));
      const combined = new Map<string, ContactRow>();
      [...(byList || []), ...byTag].forEach((c: any) => combined.set(c.phone, { name: c.name, phone: c.phone }));
      const rows = Array.from(combined.values());
      setContacts(prev => [...prev, ...rows]);
      toast({ title: `${rows.length} contatos carregados dos segmentos` });
    } else if (selectedListIds.size > 0) {
      const { data } = await supabase.from('mass_contacts').select('name, phone')
        .eq('company_id', companyId!).in('list_id', Array.from(selectedListIds));
      const rows = (data || []).map((c: any) => ({ name: c.name, phone: c.phone }));
      setContacts(prev => [...prev, ...rows]);
      toast({ title: `${rows.length} contatos carregados das listas` });
    } else {
      const { data } = await supabase.from('mass_contacts').select('name, phone, tags').eq('company_id', companyId!);
      const filtered = (data || []).filter((c: any) => c.tags?.some((t: string) => selectedTags.has(t)));
      const rows = filtered.map((c: any) => ({ name: c.name, phone: c.phone }));
      setContacts(prev => [...prev, ...rows]);
      toast({ title: `${rows.length} contatos carregados por tags` });
    }
    setLoadingSegments(false);
  };

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

  const isEditing = !!editCampaign;

  const handleCreate = async () => {
    if (!name.trim()) { toast({ title: 'Dê um nome à campanha', variant: 'destructive' }); return; }
    if (!messageText.trim() && mediaFiles.length === 0) { toast({ title: 'Escreva uma mensagem ou anexe pelo menos uma mídia', variant: 'destructive' }); return; }
    if (!isEditing && contacts.length === 0) { toast({ title: 'Importe pelo menos 1 contato', variant: 'destructive' }); return; }
    if (!companyId || !user) return;

    setSaving(true);

    if (isEditing) {
      // Update existing campaign
      const { error } = await supabase
        .from('mass_campaigns')
        .update({
          name: name.trim(),
          message_text: messageText,
          message_type: messageType,
          buttons: messageType === 'button' ? buttons.filter(b => b.text.trim()) : [],
          list_sections: messageType === 'list' ? listSections : [],
          footer_text: footerText.trim() || null,
          instance_id: instanceId,
          delay_min: delayMin,
          delay_max: delayMax,
          daily_limit: dailyLimit,
          business_hours_only: businessHoursOnly,
          rotate_instances: rotateInstances,
          media_url: mediaFiles.length > 0 ? mediaFiles[0].url : null,
          media_type: mediaFiles.length > 0 ? mediaFiles[0].type : null,
          media_files: mediaFiles.length > 0 ? mediaFiles : [],
        } as any)
        .eq('id', editCampaign!.id);

      if (error) {
        toast({ title: 'Erro ao atualizar campanha', variant: 'destructive' });
        setSaving(false);
        return;
      }

      // Add new contacts if any were imported
      if (contacts.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < contacts.length; i += batchSize) {
          const batch = contacts.slice(i, i + batchSize).map(c => ({
            campaign_id: editCampaign!.id,
            name: c.name,
            phone: c.phone,
          }));
          await supabase.from('mass_campaign_contacts').insert(batch);
        }
        // Update total
        await supabase.from('mass_campaigns')
          .update({ total_contacts: editCampaign!.total_contacts + contacts.length } as any)
          .eq('id', editCampaign!.id);
      }

      if (automationFlowId) {
        await supabase.from('automation_flows')
          .update({ campaign_id: editCampaign!.id })
          .eq('id', automationFlowId);
      }

      toast({ title: `Campanha "${name}" atualizada!` });
    } else {
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
          delay_min: delayMin,
          delay_max: delayMax,
          daily_limit: dailyLimit,
          business_hours_only: businessHoursOnly,
          rotate_instances: rotateInstances,
          total_contacts: contacts.length,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          status: scheduledAt ? 'scheduled' : 'draft',
          created_by: user.id,
          media_url: mediaFiles.length > 0 ? mediaFiles[0].url : null,
          media_type: mediaFiles.length > 0 ? mediaFiles[0].type : null,
          media_files: mediaFiles.length > 0 ? mediaFiles : [],
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

      // Link automation flow to campaign
      if (automationFlowId) {
        await supabase.from('automation_flows')
          .update({ campaign_id: campaign.id })
          .eq('id', automationFlowId);
      }

      // If not scheduled, start immediately
      if (!scheduledAt) {
        await supabase.functions.invoke('mass-send-whatsapp', {
          body: { action: 'start-campaign', campaign_id: campaign.id },
        });
        toast({ title: 'Disparo iniciado!' });
      }
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
    setAutomationFlowId(null);
    setMediaFiles([]);
    setShowPreview(false);
    setSelectedListIds(new Set());
    setSelectedTags(new Set());
    setSaving(false);
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? <Pencil className="h-5 w-5 text-primary" /> : <Send className="h-5 w-5 text-primary" />}
            {isEditing ? 'Editar Campanha' : 'Nova Campanha'}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? 'Edite a mensagem e configurações da campanha.' : 'Configure a mensagem, importe contatos e agende o disparo.'}
          </DialogDescription>
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

            {/* ── Media Attachment (Upload) ── */}
            <div className="space-y-3 border rounded-xl p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Image className="h-4 w-4 text-primary" /> Anexos de mídia <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                </Label>
                {mediaFiles.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setMediaFiles([])} className="gap-1 text-xs h-7">
                    <X className="h-3 w-3" /> Remover todos
                  </Button>
                )}
              </div>

              <label className="block">
                <div className={`flex items-center gap-2 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors text-center justify-center ${uploadingMedia ? 'opacity-50 pointer-events-none' : ''}`}>
                  {uploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
                  <span className="text-sm text-muted-foreground">
                    {uploadingMedia ? 'Enviando...' : 'Clique para enviar imagens, áudios ou arquivos'}
                  </span>
                </div>
                <input
                  type="file"
                  multiple
                  accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                  className="hidden"
                  disabled={uploadingMedia}
                  onChange={async (e) => {
                    const files = e.target.files;
                    if (!files || files.length === 0) return;
                    setUploadingMedia(true);
                    const newFiles: { url: string; type: string; name: string }[] = [];
                    for (const file of Array.from(files)) {
                      // Determine type
                      let fileType = 'document';
                      if (file.type.startsWith('image/')) fileType = 'image';
                      else if (file.type.startsWith('audio/')) fileType = 'audio';

                      const ext = file.name.split('.').pop() || 'bin';
                      const path = `${companyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
                      const { error: upErr } = await supabase.storage.from('campaign-media').upload(path, file);
                      if (upErr) {
                        toast({ title: `Erro ao enviar ${file.name}`, description: upErr.message, variant: 'destructive' });
                        continue;
                      }
                      const { data: urlData } = supabase.storage.from('campaign-media').getPublicUrl(path);
                      newFiles.push({ url: urlData.publicUrl, type: fileType, name: file.name });
                    }
                    setMediaFiles(prev => [...prev, ...newFiles]);
                    if (newFiles.length > 0) toast({ title: `${newFiles.length} arquivo(s) enviado(s)` });
                    setUploadingMedia(false);
                    e.target.value = '';
                  }}
                />
              </label>

              <p className="text-[10px] text-muted-foreground">
                Imagens (JPG, PNG, WEBP) • Áudios (MP3, OGG, WAV) • Documentos (PDF, DOC, XLS, etc.) — Envie vários arquivos de uma vez
              </p>

              {/* File list */}
              {mediaFiles.length > 0 && (
                <div className="space-y-1.5">
                  {mediaFiles.map((mf, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-background rounded-lg px-3 py-2 text-xs">
                      {mf.type === 'image' && <Image className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                      {mf.type === 'audio' && <Mic className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                      {mf.type === 'document' && <File className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
                      <span className="truncate flex-1">{mf.name}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{mf.type === 'image' ? 'Imagem' : mf.type === 'audio' ? 'Áudio' : 'Arquivo'}</Badge>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setMediaFiles(prev => prev.filter((_, i) => i !== idx))}>
                        <X className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Contatos ── */}
          <TabsContent value="contacts" className="space-y-4 mt-4">
            {/* Segment picker */}
            {(savedLists.length > 0 || savedTags.length > 0) && (
              <div className="border rounded-xl p-4 bg-primary/5 space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-primary" /> Carregar contatos salvos
                </Label>
                {savedLists.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Listas</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {savedLists.map(list => (
                        <Badge
                          key={list.id}
                          variant={selectedListIds.has(list.id) ? 'default' : 'outline'}
                          className="cursor-pointer text-xs hover:bg-primary/20 transition-colors"
                          onClick={() => {
                            setSelectedListIds(prev => {
                              const next = new Set(prev);
                              if (next.has(list.id)) next.delete(list.id); else next.add(list.id);
                              return next;
                            });
                          }}
                        >
                          <FolderOpen className="h-3 w-3 mr-1" />
                          {list.name} ({list.count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {savedTags.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Tags</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {savedTags.map(tag => (
                        <Badge
                          key={tag}
                          variant={selectedTags.has(tag) ? 'default' : 'outline'}
                          className="cursor-pointer text-xs hover:bg-primary/20 transition-colors"
                          onClick={() => {
                            setSelectedTags(prev => {
                              const next = new Set(prev);
                              if (next.has(tag)) next.delete(tag); else next.add(tag);
                              return next;
                            });
                          }}
                        >
                          <Tag className="h-3 w-3 mr-1" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <Button
                  size="sm"
                  onClick={loadFromSegments}
                  disabled={loadingSegments || (selectedListIds.size === 0 && selectedTags.size === 0)}
                  className="gap-1.5 text-xs"
                >
                  {loadingSegments ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  Carregar contatos selecionados
                </Button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex-1">
                <div className="flex items-center gap-2 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors text-center justify-center">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Importar CSV ou Excel</span>
                </div>
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <FileSpreadsheet className="h-3 w-3" />
                A planilha deve conter colunas: <strong>nome</strong> e <strong>telefone</strong> (ou name/phone)
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    const header = 'nome,telefone\n';
                    const examples = 'João Silva,5511999999999\nMaria Souza,5521988888888\nCarlos Lima,5531977777777\n';
                    const blob = new Blob([header + examples], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'modelo-contatos.csv';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-3 w-3" />
                  Modelo CSV
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={async () => {
                    const XLSX = await import('xlsx');
                    const data = [
                      { nome: 'João Silva', telefone: '5511999999999' },
                      { nome: 'Maria Souza', telefone: '5521988888888' },
                      { nome: 'Carlos Lima', telefone: '5531977777777' },
                    ];
                    const ws = XLSX.utils.json_to_sheet(data);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Contatos');
                    XLSX.writeFile(wb, 'modelo-contatos.xlsx');
                  }}
                >
                  <Download className="h-3 w-3" />
                  Modelo Excel
                </Button>
              </div>
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
              <Label>Agendamento <span className="text-xs text-muted-foreground">(deixe vazio para enviar agora)</span></Label>
              <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
            </div>

            {/* ── Anti-ban Settings ── */}
            <div className="border rounded-xl p-4 bg-amber-500/5 space-y-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <Label className="text-sm font-semibold text-amber-700 dark:text-amber-400">Proteção Anti-Bloqueio</Label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Delay mínimo (seg)</Label>
                  <Input type="number" min={3} max={120} value={delayMin} onChange={e => setDelayMin(Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Delay máximo (seg)</Label>
                  <Input type="number" min={5} max={300} value={delayMax} onChange={e => setDelayMax(Number(e.target.value))} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Intervalo aleatório entre cada mensagem para simular comportamento humano</p>

              <div className="space-y-1">
                <Label className="text-xs">Limite diário por número</Label>
                <Input type="number" min={50} max={1000} value={dailyLimit} onChange={e => setDailyLimit(Number(e.target.value))} />
                <p className="text-xs text-muted-foreground">Ao atingir o limite, a campanha pausa e continua no dia seguinte</p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">Apenas em horário comercial</Label>
                  <p className="text-xs text-muted-foreground">Envia somente entre 8h-20h, seg-sex</p>
                </div>
                <input
                  type="checkbox"
                  checked={businessHoursOnly}
                  onChange={e => setBusinessHoursOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-muted-foreground accent-primary"
                />
              </div>

              {instances.length > 1 && (
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-medium">Rotação de instâncias</Label>
                    <p className="text-xs text-muted-foreground">Alterna entre {instances.length} números para diluir volume</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={rotateInstances}
                    onChange={e => setRotateInstances(e.target.checked)}
                    className="h-4 w-4 rounded border-muted-foreground accent-primary"
                  />
                </div>
              )}
            </div>

            {/* Automation Flow */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-primary" />
                Vincular automação <span className="text-xs text-muted-foreground">(opcional)</span>
              </Label>
              {automationFlows.length > 0 ? (
                <>
                  <Select value={automationFlowId || 'none'} onValueChange={(v) => setAutomationFlowId(v === 'none' ? null : v)}>
                    <SelectTrigger><SelectValue placeholder="Sem automação" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem automação</SelectItem>
                      {automationFlows.map(f => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Ao vincular, as respostas dos contatos desta campanha serão processadas pelo fluxo selecionado.
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Nenhuma automação ativa encontrada. Crie e ative uma automação na página de Automações para vincular aqui.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* ── Preview / Confirmation ── */}
        {showPreview && (
          <div className="border rounded-xl p-4 bg-muted/30 space-y-3 mt-2">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="h-4 w-4 text-primary" />
              <Label className="text-sm font-semibold">Pré-visualização da mensagem</Label>
            </div>

            {/* WhatsApp-style preview bubble */}
            <div className="bg-[#dcf8c6] dark:bg-emerald-900/40 rounded-xl rounded-tr-none p-3 max-w-[85%] ml-auto shadow-sm space-y-2">
              {mediaFiles.length > 0 && (
                <div className="space-y-1.5">
                  {mediaFiles.map((mf, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      {mf.type === 'image' ? (
                        <img src={mf.url} alt={mf.name} className="rounded-lg max-h-32 max-w-full object-cover" />
                      ) : (
                        <div className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2 py-1.5">
                          {mf.type === 'audio' ? <Mic className="h-3.5 w-3.5 text-primary" /> : <File className="h-3.5 w-3.5 text-primary" />}
                          <span className="truncate max-w-[180px]">{mf.name}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {messageText.trim() && (
                <p className="text-sm whitespace-pre-wrap break-words">
                  {messageText.replace(/\{\{nome\}\}/gi, 'João Silva')}
                </p>
              )}
              {footerText.trim() && (
                <p className="text-[10px] text-muted-foreground mt-1">{footerText}</p>
              )}
              {messageType === 'button' && buttons.filter(b => b.text.trim()).length > 0 && (
                <div className="flex flex-col gap-1 mt-2 border-t pt-2">
                  {buttons.filter(b => b.text.trim()).map((b, i) => (
                    <div key={i} className="text-center text-xs font-medium text-primary bg-background/60 rounded-md py-1.5">{b.text}</div>
                  ))}
                </div>
              )}
              {messageType === 'list' && listSections.some(s => s.items.length > 0) && (
                <div className="text-center text-xs font-medium text-primary bg-background/60 rounded-md py-1.5 mt-2 flex items-center justify-center gap-1">
                  <List className="h-3 w-3" /> Ver opções
                </div>
              )}
            </div>

            {/* Campaign summary */}
            <div className="grid grid-cols-2 gap-2 text-xs mt-3">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span><strong>{isEditing ? (editCampaign!.total_contacts + contacts.length) : contacts.length}</strong> contatos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{messageType === 'text' ? 'Texto' : messageType === 'button' ? 'Com botões' : 'Menu lista'}</span>
              </div>
              {mediaFiles.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Image className="h-3.5 w-3.5 text-muted-foreground" />
                  <span><strong>{mediaFiles.length}</strong> anexo(s)</span>
                </div>
              )}
              {scheduledAt && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Agendado: {new Date(scheduledAt).toLocaleString('pt-BR')}</span>
                </div>
              )}
              {instanceId && instances.find(i => i.id === instanceId) && (
                <div className="flex items-center gap-1.5 col-span-2">
                  <Send className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Via: {instances.find(i => i.id === instanceId)?.label || instances.find(i => i.id === instanceId)?.instance_name}</span>
                </div>
              )}
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {scheduledAt
                  ? 'A campanha será agendada e enviada no horário definido. Confirma?'
                  : isEditing
                    ? 'As alterações serão salvas. Confirma?'
                    : 'A campanha será criada e o disparo iniciará imediatamente. Confirma?'}
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => { if (showPreview) setShowPreview(false); else onOpenChange(false); }}>
            {showPreview ? 'Voltar' : 'Cancelar'}
          </Button>
          {showPreview ? (
            <Button onClick={handleCreate} disabled={saving} className="gap-2">
              {saving ? <Clock className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {saving ? (isEditing ? 'Salvando...' : 'Criando...') : 'Confirmar e ' + (isEditing ? 'Salvar' : scheduledAt ? 'Agendar' : 'Enviar')}
            </Button>
          ) : (
            <Button
              onClick={() => {
                // Validate before showing preview
                if (!name.trim()) { toast({ title: 'Dê um nome à campanha', variant: 'destructive' }); return; }
                if (!messageText.trim() && mediaFiles.length === 0) { toast({ title: 'Escreva uma mensagem ou anexe pelo menos uma mídia', variant: 'destructive' }); return; }
                if (!isEditing && contacts.length === 0) { toast({ title: 'Importe pelo menos 1 contato', variant: 'destructive' }); return; }
                setShowPreview(true);
              }}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              Pré-visualizar e Confirmar
            </Button>
          )}
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

// ─── Contact List Manager Component ───
interface MassContact {
  id: string;
  name: string;
  phone: string;
  tags: string[];
  notes: string | null;
  list_id: string | null;
  created_at: string;
}

interface ContactList {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  contact_count?: number;
}

function ContactsManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<MassContact[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [listFilter, setListFilter] = useState<string>('all');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDesc, setNewListDesc] = useState('');
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addTags, setAddTags] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [addListId, setAddListId] = useState<string>('none');
  const [editContact, setEditContact] = useState<MassContact | null>(null);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [newTag, setNewTag] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [contactsRes, listsRes] = await Promise.all([
      supabase.from('mass_contacts').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(500),
      supabase.from('mass_contact_lists').select('*').eq('company_id', companyId).order('name'),
    ]);
    const c = (contactsRes.data || []) as MassContact[];
    setContacts(c);
    const listsWithCount = (listsRes.data || []).map(l => ({
      ...l,
      contact_count: c.filter(ct => ct.list_id === l.id).length,
    }));
    setLists(listsWithCount as ContactList[]);
    const tags = new Set<string>();
    c.forEach(ct => ct.tags?.forEach(t => tags.add(t)));
    setAllTags(Array.from(tags).sort());
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filteredContacts = contacts.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
    const matchTag = !tagFilter || c.tags?.includes(tagFilter);
    const matchList = listFilter === 'all' || (listFilter === 'none' ? !c.list_id : c.list_id === listFilter);
    return matchSearch && matchTag && matchList;
  });

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    await supabase.from('mass_contact_lists').insert({ company_id: companyId, name: newListName.trim(), description: newListDesc.trim() || null } as any);
    toast({ title: `Lista "${newListName}" criada!` });
    setNewListName(''); setNewListDesc(''); setNewListOpen(false);
    fetchAll();
  };

  const handleDeleteList = async (id: string) => {
    await supabase.from('mass_contact_lists').delete().eq('id', id);
    toast({ title: 'Lista excluída' });
    if (listFilter === id) setListFilter('all');
    fetchAll();
  };

  const handleSaveContact = async () => {
    if (!addName.trim() || !addPhone.trim()) { toast({ title: 'Nome e telefone são obrigatórios', variant: 'destructive' }); return; }
    const tags = addTags.split(',').map(t => t.trim()).filter(Boolean);
    const listId = addListId === 'none' ? null : addListId;
    if (editContact) {
      await supabase.from('mass_contacts').update({ name: addName.trim(), phone: normalizePhone(addPhone), tags, notes: addNotes.trim() || null, list_id: listId } as any).eq('id', editContact.id);
      toast({ title: 'Contato atualizado!' });
    } else {
      await supabase.from('mass_contacts').insert({ company_id: companyId, name: addName.trim(), phone: normalizePhone(addPhone), tags, notes: addNotes.trim() || null, list_id: listId } as any);
      toast({ title: 'Contato adicionado!' });
    }
    setAddName(''); setAddPhone(''); setAddTags(''); setAddNotes(''); setAddListId('none');
    setEditContact(null); setAddContactOpen(false);
    fetchAll();
  };

  const handleEditContact = (c: MassContact) => {
    setEditContact(c); setAddName(c.name); setAddPhone(c.phone); setAddTags(c.tags?.join(', ') || '');
    setAddNotes(c.notes || ''); setAddListId(c.list_id || 'none'); setAddContactOpen(true);
  };

  const handleDeleteContact = async (id: string) => {
    await supabase.from('mass_contacts').delete().eq('id', id);
    toast({ title: 'Contato excluído' }); fetchAll();
  };

  const handleBulkDelete = async () => {
    if (selectedContacts.size === 0) return;
    const ids = Array.from(selectedContacts);
    await supabase.from('mass_contacts').delete().in('id', ids);
    toast({ title: `${ids.length} contatos excluídos` });
    setSelectedContacts(new Set()); fetchAll();
  };

  const handleBulkAddTag = async () => {
    if (selectedContacts.size === 0 || !newTag.trim()) return;
    for (const id of selectedContacts) {
      const contact = contacts.find(c => c.id === id);
      if (contact) {
        const updatedTags = [...new Set([...(contact.tags || []), newTag.trim()])];
        await supabase.from('mass_contacts').update({ tags: updatedTags } as any).eq('id', id);
      }
    }
    toast({ title: `Tag "${newTag}" adicionada a ${selectedContacts.size} contatos` });
    setNewTag(''); setTagDialogOpen(false); setSelectedContacts(new Set()); fetchAll();
  };

  const handleBulkMoveToList = async (listId: string | null) => {
    if (selectedContacts.size === 0) return;
    const ids = Array.from(selectedContacts);
    for (const id of ids) {
      await supabase.from('mass_contacts').update({ list_id: listId } as any).eq('id', id);
    }
    toast({ title: `${ids.length} contatos movidos` });
    setSelectedContacts(new Set()); fetchAll();
  };

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    let rows: { name: string; phone: string; tags?: string }[] = [];

    if (ext === 'csv') {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return;
      const header = lines[0].toLowerCase().split(/[,;\t]/);
      const nameIdx = header.findIndex(h => ['nome', 'name'].includes(h.trim()));
      const phoneIdx = header.findIndex(h => ['telefone', 'phone', 'celular', 'whatsapp'].includes(h.trim()));
      const tagsIdx = header.findIndex(h => ['tags', 'tag', 'segmento'].includes(h.trim()));
      if (nameIdx === -1 || phoneIdx === -1) { toast({ title: 'Colunas nome/telefone não encontradas', variant: 'destructive' }); return; }
      rows = lines.slice(1).map(line => {
        const cols = line.split(/[,;\t]/);
        return { name: (cols[nameIdx] || '').trim().replace(/^["']|["']$/g, ''), phone: normalizePhone(cols[phoneIdx] || ''), tags: tagsIdx !== -1 ? (cols[tagsIdx] || '').trim() : '' };
      }).filter(r => r.name && r.phone);
    } else if (ext === 'xlsx' || ext === 'xls') {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<any>(ws);
      rows = jsonData.map((row: any) => ({
        name: String(row.nome || row.name || row.Nome || row.Name || '').trim(),
        phone: normalizePhone(String(row.telefone || row.phone || row.Telefone || row.Phone || row.celular || row.Celular || '')),
        tags: String(row.tags || row.tag || row.Tags || row.segmento || '').trim(),
      })).filter((r: any) => r.name && r.phone);
    }

    if (rows.length === 0) { toast({ title: 'Nenhum contato válido encontrado', variant: 'destructive' }); return; }

    const batchSize = 100;
    const lId = listFilter !== 'all' && listFilter !== 'none' ? listFilter : null;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize).map(r => ({
        company_id: companyId, name: r.name, phone: r.phone,
        tags: r.tags ? r.tags.split(/[,;]/).map(t => t.trim()).filter(Boolean) : [],
        list_id: lId,
      }));
      await supabase.from('mass_contacts').insert(batch as any);
    }
    toast({ title: `${rows.length} contatos importados!` });
    e.target.value = ''; fetchAll();
  }, [companyId, listFilter, toast, fetchAll]);

  const handleExportCSV = () => {
    const header = 'nome,telefone,tags,notas\n';
    const csv = filteredContacts.map(c => `"${c.name}","${c.phone}","${c.tags?.join('; ') || ''}","${c.notes || ''}"`).join('\n');
    const blob = new Blob([header + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'contatos-massa.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelect = (id: string) => {
    setSelectedContacts(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const toggleAll = () => {
    if (selectedContacts.size === filteredContacts.length) setSelectedContacts(new Set());
    else setSelectedContacts(new Set(filteredContacts.map(c => c.id)));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Lists panel */}
        <div className="lg:w-64 flex-shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><FolderOpen className="h-4 w-4 text-primary" /> Listas</h3>
            <Button size="sm" variant="ghost" onClick={() => setNewListOpen(true)} className="h-7 w-7 p-0"><Plus className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="space-y-1">
            <Button size="sm" variant={listFilter === 'all' ? 'default' : 'ghost'} onClick={() => setListFilter('all')} className="w-full justify-between text-xs h-8">
              Todos os contatos <Badge variant="secondary" className="text-[10px] h-4">{contacts.length}</Badge>
            </Button>
            <Button size="sm" variant={listFilter === 'none' ? 'default' : 'ghost'} onClick={() => setListFilter('none')} className="w-full justify-between text-xs h-8">
              Sem lista <Badge variant="secondary" className="text-[10px] h-4">{contacts.filter(c => !c.list_id).length}</Badge>
            </Button>
            {lists.map(list => (
              <div key={list.id} className="flex items-center gap-1">
                <Button size="sm" variant={listFilter === list.id ? 'default' : 'ghost'} onClick={() => setListFilter(list.id)} className="flex-1 justify-between text-xs h-8 overflow-hidden">
                  <span className="truncate">{list.name}</span>
                  <Badge variant="secondary" className="text-[10px] h-4">{list.contact_count || 0}</Badge>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 flex-shrink-0"><MoreHorizontal className="h-3 w-3" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleDeleteList(list.id)} className="text-destructive text-xs gap-2"><Trash2 className="h-3 w-3" /> Excluir lista</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>

          <Dialog open={newListOpen} onOpenChange={setNewListOpen}>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader><DialogTitle>Nova Lista</DialogTitle><DialogDescription>Crie uma lista para organizar seus contatos.</DialogDescription></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1"><Label className="text-xs">Nome</Label><Input placeholder="Ex: Clientes VIP" value={newListName} onChange={e => setNewListName(e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Descrição (opcional)</Label><Input placeholder="Ex: Clientes premium" value={newListDesc} onChange={e => setNewListDesc(e.target.value)} /></div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setNewListOpen(false)}>Cancelar</Button><Button onClick={handleCreateList}>Criar Lista</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Contacts panel */}
        <div className="flex-1 space-y-3">
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou telefone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
            </div>
            {allTags.length > 0 && (
              <Select value={tagFilter || 'all'} onValueChange={v => setTagFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[160px] h-9 text-xs"><Tag className="h-3 w-3 mr-1" /><SelectValue placeholder="Filtrar tag" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as tags</SelectItem>
                  {allTags.map(tag => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" variant="outline" onClick={() => { setEditContact(null); setAddName(''); setAddPhone(''); setAddTags(''); setAddNotes(''); setAddListId(listFilter !== 'all' && listFilter !== 'none' ? listFilter : 'none'); setAddContactOpen(true); }} className="gap-1.5 text-xs h-9">
              <Plus className="h-3 w-3" /> Contato
            </Button>
            <label>
              <div className="inline-flex items-center gap-1.5 px-3 h-9 border rounded-md cursor-pointer hover:bg-muted/50 transition-colors text-xs font-medium">
                <Upload className="h-3 w-3" /> Importar
              </div>
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImportFile} />
            </label>
            <Button size="sm" variant="outline" onClick={handleExportCSV} className="gap-1.5 text-xs h-9"><Download className="h-3 w-3" /> Exportar</Button>
          </div>

          {/* Bulk actions */}
          {selectedContacts.size > 0 && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
              <span className="text-xs font-medium">{selectedContacts.size} selecionado(s)</span>
              <Button size="sm" variant="outline" onClick={() => setTagDialogOpen(true)} className="gap-1 text-xs h-7"><Tag className="h-3 w-3" /> Adicionar tag</Button>
              {lists.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button size="sm" variant="outline" className="gap-1 text-xs h-7"><FolderOpen className="h-3 w-3" /> Mover para lista</Button></DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => handleBulkMoveToList(null)} className="text-xs">Sem lista</DropdownMenuItem>
                    {lists.map(l => <DropdownMenuItem key={l.id} onClick={() => handleBulkMoveToList(l.id)} className="text-xs">{l.name}</DropdownMenuItem>)}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button size="sm" variant="destructive" onClick={handleBulkDelete} className="gap-1 text-xs h-7 ml-auto"><Trash2 className="h-3 w-3" /> Excluir</Button>
            </div>
          )}

          {/* Tag dialog */}
          <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
            <DialogContent className="sm:max-w-[350px]">
              <DialogHeader><DialogTitle>Adicionar Tag</DialogTitle><DialogDescription>Adicione uma tag aos {selectedContacts.size} contatos selecionados.</DialogDescription></DialogHeader>
              <Input placeholder="Nome da tag" value={newTag} onChange={e => setNewTag(e.target.value)} />
              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {allTags.map(t => <Badge key={t} variant="outline" className="cursor-pointer text-[10px] hover:bg-primary/10" onClick={() => setNewTag(t)}>{t}</Badge>)}
                </div>
              )}
              <DialogFooter><Button variant="outline" onClick={() => setTagDialogOpen(false)}>Cancelar</Button><Button onClick={handleBulkAddTag} disabled={!newTag.trim()}>Aplicar Tag</Button></DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Add/Edit contact dialog */}
          <Dialog open={addContactOpen} onOpenChange={v => { setAddContactOpen(v); if (!v) setEditContact(null); }}>
            <DialogContent className="sm:max-w-[450px]">
              <DialogHeader><DialogTitle>{editContact ? 'Editar Contato' : 'Novo Contato'}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Nome *</Label><Input placeholder="João Silva" value={addName} onChange={e => setAddName(e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">Telefone *</Label><Input placeholder="5511999999999" value={addPhone} onChange={e => setAddPhone(e.target.value)} /></div>
                </div>
                <div className="space-y-1"><Label className="text-xs">Tags <span className="text-muted-foreground">(separadas por vírgula)</span></Label><Input placeholder="cliente, vip, promoção" value={addTags} onChange={e => setAddTags(e.target.value)} /></div>
                <div className="space-y-1">
                  <Label className="text-xs">Lista</Label>
                  <Select value={addListId} onValueChange={setAddListId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Sem lista</SelectItem>{lists.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label className="text-xs">Notas (opcional)</Label><Textarea placeholder="Observações..." value={addNotes} onChange={e => setAddNotes(e.target.value)} rows={2} /></div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => { setAddContactOpen(false); setEditContact(null); }}>Cancelar</Button><Button onClick={handleSaveContact}>{editContact ? 'Salvar' : 'Adicionar'}</Button></DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Contacts table */}
          {loading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Carregando...</div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum contato encontrado</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Adicione contatos ou importe uma planilha</p>
            </div>
          ) : (
            <div className="border rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"><input type="checkbox" checked={selectedContacts.size === filteredContacts.length && filteredContacts.length > 0} onChange={toggleAll} className="h-3.5 w-3.5 rounded accent-primary" /></TableHead>
                    <TableHead className="text-xs">Nome</TableHead>
                    <TableHead className="text-xs">Telefone</TableHead>
                    <TableHead className="text-xs">Tags</TableHead>
                    <TableHead className="text-xs">Lista</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContacts.map(c => {
                    const list = lists.find(l => l.id === c.list_id);
                    return (
                      <TableRow key={c.id}>
                        <TableCell><input type="checkbox" checked={selectedContacts.has(c.id)} onChange={() => toggleSelect(c.id)} className="h-3.5 w-3.5 rounded accent-primary" /></TableCell>
                        <TableCell className="text-sm font-medium">{c.name}</TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">{c.phone}</TableCell>
                        <TableCell><div className="flex flex-wrap gap-1">{c.tags?.map(t => <Badge key={t} variant="secondary" className="text-[10px] h-5">{t}</Badge>)}</div></TableCell>
                        <TableCell>{list ? <Badge variant="outline" className="text-[10px]">{list.name}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className="h-7 w-7 p-0"><MoreHorizontal className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditContact(c)} className="text-xs gap-2"><Pencil className="h-3 w-3" /> Editar</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDeleteContact(c.id)} className="text-xs gap-2 text-destructive"><Trash2 className="h-3 w-3" /> Excluir</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="text-xs text-muted-foreground flex items-center gap-3">
            <span>{filteredContacts.length} contato(s)</span>
            {allTags.length > 0 && <span>{allTags.length} tag(s)</span>}
            {lists.length > 0 && <span>{lists.length} lista(s)</span>}
          </div>
        </div>
      </div>
    </div>
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
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [mainTab, setMainTab] = useState<string>('campaigns');

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

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  useEffect(() => {
    const hasProcessing = campaigns.some(c => c.status === 'processing' || c.status === 'scheduled');
    if (!hasProcessing) return;
    const interval = setInterval(fetchCampaigns, 5000);
    return () => clearInterval(interval);
  }, [campaigns, fetchCampaigns]);

  const cancelCampaign = async (id: string) => {
    await supabase.from('mass_campaigns').update({ status: 'cancelled' } as any).eq('id', id);
    toast({ title: 'Campanha cancelada' }); fetchCampaigns();
  };

  const startCampaign = async (id: string) => {
    await supabase.functions.invoke('mass-send-whatsapp', { body: { action: 'start-campaign', campaign_id: id } });
    toast({ title: 'Disparo iniciado!' }); fetchCampaigns();
  };

  const resendCampaign = async (campaign: Campaign) => {
    const { data: newCampaign, error } = await supabase.from('mass_campaigns').insert({
      company_id: companyId, instance_id: campaign.instance_id, name: `${campaign.name} (reenvio)`,
      message_text: campaign.message_text, message_type: campaign.message_type, buttons: campaign.buttons,
      list_sections: campaign.list_sections, footer_text: campaign.footer_text, delay_seconds: campaign.delay_seconds,
      total_contacts: 0, status: 'draft', created_by: (await supabase.auth.getUser()).data.user?.id,
    } as any).select().single();
    if (error || !newCampaign) { toast({ title: 'Erro ao duplicar', variant: 'destructive' }); return; }
    const { data: contactsToCopy } = await supabase.from('mass_campaign_contacts').select('name, phone').eq('campaign_id', campaign.id).in('status', ['failed', 'pending']);
    if (contactsToCopy && contactsToCopy.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < contactsToCopy.length; i += batchSize) {
        const batch = contactsToCopy.slice(i, i + batchSize).map(c => ({ campaign_id: newCampaign.id, name: c.name, phone: c.phone }));
        await supabase.from('mass_campaign_contacts').insert(batch);
      }
      await supabase.from('mass_campaigns').update({ total_contacts: contactsToCopy.length } as any).eq('id', newCampaign.id);
    }
    toast({ title: `Campanha duplicada com ${contactsToCopy?.length || 0} contatos!` }); fetchCampaigns();
  };

  const handleEditCampaign = (campaign: Campaign) => { setEditCampaign(campaign); setCreateOpen(true); };
  const handleCloseCreator = (v: boolean) => { setCreateOpen(v); if (!v) setEditCampaign(null); };

  const filteredCampaigns = statusFilter === 'all' ? campaigns : campaigns.filter(c => c.status === statusFilter);
  const statusCounts = {
    all: campaigns.length, draft: campaigns.filter(c => c.status === 'draft').length,
    processing: campaigns.filter(c => c.status === 'processing').length, completed: campaigns.filter(c => c.status === 'completed').length,
    cancelled: campaigns.filter(c => c.status === 'cancelled').length, scheduled: campaigns.filter(c => c.status === 'scheduled').length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="section-header">
            <h1 className="section-title">Mensagens em Massa</h1>
            <p className="section-subtitle">Campanhas de disparo e gestão de contatos</p>
          </div>
          {mainTab === 'campaigns' && (
            <Button onClick={() => { setEditCampaign(null); setCreateOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Nova Campanha
            </Button>
          )}
        </div>

        <CampaignCreator open={createOpen} onOpenChange={handleCloseCreator} onCreated={fetchCampaigns} editCampaign={editCampaign} />
        <CampaignDetailsDialog campaignId={detailsCampaignId} open={detailsOpen} onOpenChange={setDetailsOpen} />

        <Tabs value={mainTab} onValueChange={setMainTab}>
          <TabsList className="grid w-full max-w-[400px] grid-cols-2">
            <TabsTrigger value="campaigns" className="gap-1.5"><Send className="h-3.5 w-3.5" /> Campanhas</TabsTrigger>
            <TabsTrigger value="contacts" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Contatos</TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="mt-4 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { key: 'all', label: 'Todas' }, { key: 'draft', label: 'Rascunhos' },
                { key: 'scheduled', label: 'Agendadas' }, { key: 'processing', label: 'Enviando' },
                { key: 'completed', label: 'Concluídas' }, { key: 'cancelled', label: 'Canceladas' },
              ].map(tab => (
                <Button key={tab.key} size="sm" variant={statusFilter === tab.key ? 'default' : 'outline'} onClick={() => setStatusFilter(tab.key)} className="text-xs gap-1.5">
                  {tab.label}
                  {statusCounts[tab.key as keyof typeof statusCounts] > 0 && (
                    <Badge variant="secondary" className="text-[10px] h-4 min-w-[16px] px-1">{statusCounts[tab.key as keyof typeof statusCounts]}</Badge>
                  )}
                </Button>
              ))}
            </div>

            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Carregando...</div>
            ) : filteredCampaigns.length === 0 ? (
              <div className="text-center py-12">
                <Send className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">{statusFilter === 'all' ? 'Nenhuma campanha criada' : 'Nenhuma campanha neste filtro'}</p>
                <p className="text-xs text-muted-foreground/70 mt-1">{statusFilter === 'all' ? 'Clique em "Nova Campanha" para começar' : 'Tente outro filtro'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCampaigns.map(campaign => {
                  const config = statusConfig[campaign.status] || statusConfig.draft;
                  const Icon = config.icon;
                  const progress = campaign.total_contacts > 0 ? Math.round(((campaign.sent_count + campaign.failed_count) / campaign.total_contacts) * 100) : 0;
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
                                <Badge variant={config.color as any} className="text-[10px] gap-1">{config.label}</Badge>
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Users className="h-2.5 w-2.5" /> {campaign.total_contacts} contatos</span>
                                {campaign.message_type !== 'text' && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><List className="h-2.5 w-2.5" /> {campaign.message_type === 'button' ? 'Botões' : 'Menu lista'}</span>}
                                {campaign.scheduled_at && campaign.status === 'scheduled' && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {formatDate(campaign.scheduled_at)}</span>}
                              </div>
                              {(campaign.status === 'processing' || campaign.status === 'completed') && (
                                <div className="mt-3 space-y-1">
                                  <Progress value={progress} className="h-2" />
                                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                    <span className="flex items-center gap-1"><CheckCircle className="h-2.5 w-2.5 text-primary" /> {campaign.sent_count} enviados</span>
                                    {campaign.failed_count > 0 && <span className="flex items-center gap-1"><XCircle className="h-2.5 w-2.5 text-destructive" /> {campaign.failed_count} falhas</span>}
                                    <span>{progress}%</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button size="sm" variant="outline" onClick={() => { setDetailsCampaignId(campaign.id); setDetailsOpen(true); }} className="gap-1 text-xs"><Eye className="h-3 w-3" /> Detalhes</Button>
                            {campaign.status !== 'processing' && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button size="sm" variant="outline" className="gap-1 text-xs"><Pencil className="h-3 w-3" /> Ações</Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {(campaign.status === 'draft' || campaign.status === 'scheduled') && <DropdownMenuItem onClick={() => handleEditCampaign(campaign)} className="gap-2 text-xs"><Pencil className="h-3 w-3" /> Editar</DropdownMenuItem>}
                                  {(campaign.status === 'completed' || campaign.status === 'cancelled') && <DropdownMenuItem onClick={() => handleEditCampaign(campaign)} className="gap-2 text-xs"><Pencil className="h-3 w-3" /> Editar e recriar</DropdownMenuItem>}
                                  <DropdownMenuItem onClick={() => resendCampaign(campaign)} className="gap-2 text-xs"><Copy className="h-3 w-3" /> Reenviar</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            {campaign.status === 'draft' && <Button size="sm" onClick={() => startCampaign(campaign.id)} className="gap-1 text-xs"><Play className="h-3 w-3" /> Iniciar</Button>}
                            {(campaign.status === 'processing' || campaign.status === 'scheduled') && <Button size="sm" variant="destructive" onClick={() => cancelCampaign(campaign.id)} className="gap-1 text-xs"><Ban className="h-3 w-3" /> Cancelar</Button>}
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(campaign.created_at)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="contacts" className="mt-4">
            {companyId && <ContactsManager companyId={companyId} />}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
