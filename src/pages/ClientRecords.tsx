import { useEffect, useState, useRef, useMemo } from 'react';
import { formatPhone } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Search, Users, ClipboardList, Layers, Plus, Camera, Trash2,
  Phone, ChevronRight, ChevronLeft, ImageIcon, ArrowLeft, Pencil, UserPlus
} from 'lucide-react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';

interface ClientGroup {
  key: string;
  client_name: string;
  client_phone: string;
  anamnesisCount: number;
  packagesCount: number;
  totalSessions: number;
  completedSessions: number;
}

export default function ClientRecords() {
  const { companyId } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  // Selected client
  const [selectedClient, setSelectedClient] = useState<ClientGroup | null>(null);

  // Anamnesis state
  const [responses, setResponses] = useState<any[]>([]);
  const [selectedResponse, setSelectedResponse] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [anamnesisOpen, setAnamnesisOpen] = useState(false);
  const [anamnesisForm, setAnamnesisForm] = useState<any>({ client_name: '', client_phone: '', service_id: '', responses: {}, notes: '' });
  const [editingAnamnesis, setEditingAnamnesis] = useState<any>(null);

  // Sessions state
  const [packages, setPackages] = useState<any[]>([]);
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});
  const [selectedPackage, setSelectedPackage] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [packageOpen, setPackageOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [packageForm, setPackageForm] = useState({ client_name: '', client_phone: '', service_id: '', total_sessions: '', notes: '' });
  const [sessionForm, setSessionForm] = useState({ notes: '', evolution: '', session_date: new Date().toISOString().split('T')[0] });
  const [editingPackage, setEditingPackage] = useState<any>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'anamnesis' | 'package'; id: string; name: string } | null>(null);

  // New client state
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientForm, setNewClientForm] = useState({ client_name: '', client_phone: '' });

  // Photos state
  const [photos, setPhotos] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Services
  const [services, setServices] = useState<any[]>([]);

  useEffect(() => {
    if (!companyId) return;
    supabase.from('services').select('id, name, requires_anamnesis, requires_sessions, anamnesis_type_id')
      .eq('company_id', companyId).then(({ data }) => setServices(data || []));
  }, [companyId]);

  const fetchResponses = async () => {
    if (!companyId) return;
    const { data } = await supabase.from('anamnesis_responses').select('*, services(name)')
      .eq('company_id', companyId).order('created_at', { ascending: false });
    setResponses(data || []);
  };

  const fetchPackages = async () => {
    if (!companyId) return;
    const { data } = await supabase.from('session_packages').select('*, services(name)')
      .eq('company_id', companyId).order('created_at', { ascending: false });
    setPackages(data || []);
    if (data && data.length > 0) {
      const ids = data.map((p: any) => p.id);
      const { data: sessData } = await supabase.from('sessions').select('package_id')
        .in('package_id', ids);
      const counts: Record<string, number> = {};
      sessData?.forEach((s: any) => {
        counts[s.package_id] = (counts[s.package_id] || 0) + 1;
      });
      setSessionCounts(counts);
    }
  };

  useEffect(() => { fetchResponses(); fetchPackages(); }, [companyId]);

  // Build unified client list
  const clients = useMemo<ClientGroup[]>(() => {
    const map = new Map<string, ClientGroup>();
    responses.forEach(r => {
      const key = `${r.client_phone}`;
      if (!map.has(key)) {
        map.set(key, { key, client_name: r.client_name, client_phone: r.client_phone, anamnesisCount: 0, packagesCount: 0, totalSessions: 0, completedSessions: 0 });
      }
      map.get(key)!.anamnesisCount++;
    });
    packages.forEach(p => {
      const key = `${p.client_phone}`;
      if (!map.has(key)) {
        map.set(key, { key, client_name: p.client_name, client_phone: p.client_phone, anamnesisCount: 0, packagesCount: 0, totalSessions: 0, completedSessions: 0 });
      }
      const g = map.get(key)!;
      g.packagesCount++;
      g.totalSessions += p.total_sessions || 0;
      g.completedSessions += sessionCounts[p.id] || 0;
    });
    return Array.from(map.values()).sort((a, b) => a.client_name.localeCompare(b.client_name));
  }, [responses, packages, sessionCounts]);

  const filteredClients = clients.filter(c =>
    !searchQuery || c.client_name.toLowerCase().includes(searchQuery.toLowerCase()) || c.client_phone.includes(searchQuery)
  );

  // Data for selected client
  const clientResponses = useMemo(() =>
    selectedClient ? responses.filter(r => r.client_phone === selectedClient.client_phone) : [],
    [selectedClient, responses]
  );
  const clientPackages = useMemo(() =>
    selectedClient ? packages.filter(p => p.client_phone === selectedClient.client_phone) : [],
    [selectedClient, packages]
  );

  const fetchTemplatesForService = async (serviceId: string) => {
    if (!companyId) return;
    // Find the service to get its anamnesis_type_id
    const service = services.find(s => s.id === serviceId);
    const typeId = service?.anamnesis_type_id;
    if (typeId) {
      const { data } = await supabase.from('anamnesis_templates').select('*')
        .eq('company_id', companyId).eq('active', true)
        .eq('anamnesis_type_id', typeId)
        .order('sort_order');
      setTemplates(data || []);
    } else {
      // Fallback: load templates linked to service_id or global
      const { data } = await supabase.from('anamnesis_templates').select('*')
        .eq('company_id', companyId).eq('active', true)
        .or(`service_id.is.null,service_id.eq.${serviceId}`)
        .order('sort_order');
      setTemplates(data || []);
    }
  };

  const fetchSessions = async (packageId: string) => {
    const { data } = await supabase.from('sessions').select('*')
      .eq('package_id', packageId).order('session_number');
    setSessions(data || []);
  };

  const fetchPhotos = async (opts: { packageId?: string; responseId?: string; sessionId?: string }) => {
    if (!companyId) return;
    let query = supabase.from('client_photos').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
    if (opts.packageId) query = query.eq('package_id', opts.packageId);
    if (opts.responseId) query = query.eq('anamnesis_response_id', opts.responseId);
    if (opts.sessionId) query = query.eq('session_id', opts.sessionId);
    const { data } = await query;
    setPhotos(data || []);
  };

  // Anamnesis actions
  const openNewAnamnesis = () => {
    setEditingAnamnesis(null);
    setAnamnesisForm({
      client_name: selectedClient?.client_name || '',
      client_phone: selectedClient?.client_phone || '',
      service_id: '', responses: {}, notes: ''
    });
    setTemplates([]);
    setAnamnesisOpen(true);
  };

  const openEditAnamnesis = async (r: any) => {
    setEditingAnamnesis(r);
    setAnamnesisForm({
      client_name: r.client_name,
      client_phone: r.client_phone,
      service_id: r.service_id || '',
      responses: r.responses || {},
      notes: r.notes || '',
    });
    if (r.service_id) {
      await fetchTemplatesForService(r.service_id);
    } else {
      setTemplates([]);
    }
    setAnamnesisOpen(true);
  };

  const handleAnamnesisServiceChange = (serviceId: string) => {
    setAnamnesisForm((f: any) => ({ ...f, service_id: serviceId, responses: {} }));
    fetchTemplatesForService(serviceId);
  };

  const saveAnamnesis = async () => {
    if (!companyId || !anamnesisForm.client_name.trim() || !anamnesisForm.client_phone.trim()) {
      toast.error('Preencha nome e telefone'); return;
    }
    if (editingAnamnesis) {
      const { error } = await supabase.from('anamnesis_responses').update({
        client_name: anamnesisForm.client_name.trim(),
        client_phone: anamnesisForm.client_phone.trim(),
        service_id: anamnesisForm.service_id || null,
        responses: anamnesisForm.responses,
        notes: anamnesisForm.notes || null,
      }).eq('id', editingAnamnesis.id);
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Anamnese atualizada');
    } else {
      const { error } = await supabase.from('anamnesis_responses').insert({
        company_id: companyId,
        client_name: anamnesisForm.client_name.trim(),
        client_phone: anamnesisForm.client_phone.trim(),
        service_id: anamnesisForm.service_id || null,
        responses: anamnesisForm.responses,
        notes: anamnesisForm.notes || null,
        filled_by: 'professional',
      });
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Anamnese salva');
    }
    setAnamnesisOpen(false);
    setEditingAnamnesis(null);
    setSelectedResponse(null);
    fetchResponses();
  };

  const deleteAnamnesis = async (id: string) => {
    // Delete related photos first
    await supabase.from('client_photos').delete().eq('anamnesis_response_id', id);
    const { error } = await supabase.from('anamnesis_responses').delete().eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Ficha de anamnese excluída');
    setSelectedResponse(null);
    fetchResponses();
  };

  // Package actions
  const openNewPackage = () => {
    setEditingPackage(null);
    setPackageForm({
      client_name: selectedClient?.client_name || '',
      client_phone: selectedClient?.client_phone || '',
      service_id: '', total_sessions: '', notes: ''
    });
    setPackageOpen(true);
  };

  const openEditPackage = (pkg: any) => {
    setEditingPackage(pkg);
    setPackageForm({
      client_name: pkg.client_name,
      client_phone: pkg.client_phone,
      service_id: pkg.service_id || '',
      total_sessions: pkg.total_sessions ? String(pkg.total_sessions) : '',
      notes: pkg.notes || '',
    });
    setPackageOpen(true);
  };

  const savePackage = async () => {
    if (!companyId || !packageForm.client_name.trim() || !packageForm.client_phone.trim()) {
      toast.error('Preencha nome e telefone'); return;
    }
    if (editingPackage) {
      const { error } = await supabase.from('session_packages').update({
        client_name: packageForm.client_name.trim(),
        client_phone: packageForm.client_phone.trim(),
        service_id: packageForm.service_id || null,
        total_sessions: packageForm.total_sessions ? parseInt(packageForm.total_sessions) : null,
        notes: packageForm.notes || null,
      }).eq('id', editingPackage.id);
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Pacote atualizado');
    } else {
      const { error } = await supabase.from('session_packages').insert({
        company_id: companyId,
        client_name: packageForm.client_name.trim(),
        client_phone: packageForm.client_phone.trim(),
        service_id: packageForm.service_id || null,
        total_sessions: packageForm.total_sessions ? parseInt(packageForm.total_sessions) : null,
        notes: packageForm.notes || null,
      });
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Pacote criado');
    }
    setPackageOpen(false);
    setEditingPackage(null);
    fetchPackages();
  };

  const deletePackage = async (id: string) => {
    // Delete related sessions and photos first
    await supabase.from('client_photos').delete().eq('package_id', id);
    await supabase.from('sessions').delete().eq('package_id', id);
    const { error } = await supabase.from('session_packages').delete().eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Pacote excluído');
    setSelectedPackage(null);
    fetchPackages();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'anamnesis') {
      await deleteAnamnesis(deleteTarget.id);
    } else {
      await deletePackage(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  const saveNewClient = async () => {
    if (!companyId || !newClientForm.client_name.trim() || !newClientForm.client_phone.trim()) {
      toast.error('Preencha nome e telefone'); return;
    }
    // Check if client already exists
    const exists = clients.some(c => c.client_phone === newClientForm.client_phone.trim());
    if (exists) {
      toast.error('Já existe um cliente com este telefone'); return;
    }
    // Create a minimal anamnesis record so the client appears in the list
    const { error } = await supabase.from('anamnesis_responses').insert({
      company_id: companyId,
      client_name: newClientForm.client_name.trim(),
      client_phone: newClientForm.client_phone.trim(),
      responses: {},
      filled_by: 'professional',
      notes: 'Cadastro inicial do cliente',
    });
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Cliente cadastrado com sucesso');
    setNewClientOpen(false);
    setNewClientForm({ client_name: '', client_phone: '' });
    fetchResponses();
  };

  const openPackageDetail = (pkg: any) => {
    setSelectedPackage(pkg);
    fetchSessions(pkg.id);
    fetchPhotos({ packageId: pkg.id });
  };

  const openNewSession = () => {
    setSessionForm({ notes: '', evolution: '', session_date: new Date().toISOString().split('T')[0] });
    setSessionOpen(true);
  };

  const saveSession = async () => {
    if (!companyId || !selectedPackage) return;
    const nextNumber = sessions.length + 1;
    const { error } = await supabase.from('sessions').insert({
      company_id: companyId,
      package_id: selectedPackage.id,
      session_number: nextNumber,
      session_date: sessionForm.session_date,
      notes: sessionForm.notes || null,
      evolution: sessionForm.evolution || null,
    });
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(`Sessão ${nextNumber} registrada`);
    setSessionOpen(false);
    fetchSessions(selectedPackage.id);
    fetchPackages();
  };

  // Photo upload
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, context: { packageId?: string; sessionId?: string; responseId?: string }) => {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Máx. 5MB'); return; }
    setUploading(true);
    const path = `${companyId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from('client-photos').upload(path, file);
    if (upErr) { toast.error('Erro no upload'); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from('client-photos').getPublicUrl(path);
    await supabase.from('client_photos').insert({
      company_id: companyId,
      photo_url: urlData.publicUrl,
      package_id: context.packageId || null,
      session_id: context.sessionId || null,
      anamnesis_response_id: context.responseId || null,
    });
    setUploading(false);
    toast.success('Foto anexada');
    if (context.packageId) fetchPhotos({ packageId: context.packageId });
    if (context.responseId) fetchPhotos({ responseId: context.responseId });
  };

  const deletePhoto = async (id: string) => {
    await supabase.from('client_photos').delete().eq('id', id);
    toast.success('Foto removida');
    if (selectedPackage) fetchPhotos({ packageId: selectedPackage.id });
    if (selectedResponse) fetchPhotos({ responseId: selectedResponse.id });
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

  // ====== RENDER ======

  // Package detail view
  if (selectedPackage) {
    return (
      <DashboardLayout>
        <div className="space-y-5">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => { setSelectedPackage(null); }}>
            <ArrowLeft className="h-3.5 w-3.5" />Voltar para ficha
          </Button>

          <div className="section-header mb-0">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="section-title flex items-center gap-2 text-lg">
                  <Layers className="h-5 w-5 text-primary" />
                  Pacote de {selectedPackage.client_name}
                </h1>
                <p className="section-subtitle">{selectedPackage.services?.name || 'Geral'}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => openEditPackage(selectedPackage)}>
                  <Pencil className="h-3 w-3" />Editar
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ type: 'package', id: selectedPackage.id, name: selectedPackage.client_name })}>
                  <Trash2 className="h-3 w-3" />Excluir
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="rounded-xl"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total</p>
              <p className="text-lg font-bold">{selectedPackage.total_sessions || '∞'}</p>
            </CardContent></Card>
            <Card className="rounded-xl"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Realizadas</p>
              <p className="text-lg font-bold text-primary">{sessions.length}</p>
            </CardContent></Card>
            <Card className="rounded-xl"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Restantes</p>
              <p className="text-lg font-bold">{selectedPackage.total_sessions ? Math.max(0, selectedPackage.total_sessions - sessions.length) : '∞'}</p>
            </CardContent></Card>
            <Card className="rounded-xl"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Status</p>
              <Badge variant={selectedPackage.status === 'active' ? 'default' : 'secondary'} className="text-[10px] mt-1">
                {selectedPackage.status === 'active' ? 'Ativo' : selectedPackage.status === 'completed' ? 'Concluído' : 'Cancelado'}
              </Badge>
            </CardContent></Card>
          </div>

          {selectedPackage.total_sessions && (
            <Progress value={Math.min(100, (sessions.length / selectedPackage.total_sessions) * 100)} className="h-2" />
          )}

          {/* Sessions list */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Sessões</p>
              <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={openNewSession}>
                <Plus className="h-3 w-3 mr-1" />Registrar sessão
              </Button>
            </div>
            {sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma sessão registrada</p>
            ) : (
              <div className="space-y-2">
                {sessions.map(s => (
                  <Card key={s.id} className="rounded-xl">
                    <CardContent className="p-3 flex items-start gap-3">
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-primary">{s.session_number}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">Sessão {s.session_number}</p>
                          <span className="text-[10px] text-muted-foreground">{formatDate(s.session_date)}</span>
                        </div>
                        {s.evolution && <p className="text-xs text-muted-foreground mt-0.5">📝 {s.evolution}</p>}
                        {s.notes && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{s.notes}</p>}
                      </div>
                      <Badge variant={s.status === 'completed' ? 'default' : 'secondary'} className="text-[9px] flex-shrink-0">
                        {s.status === 'completed' ? 'Realizada' : s.status === 'missed' ? 'Faltou' : 'Cancelada'}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Photos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1"><ImageIcon className="h-3 w-3" />Fotos</p>
              <div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, { packageId: selectedPackage.id })} />
                <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <Camera className="h-3 w-3 mr-1" />{uploading ? 'Enviando...' : 'Anexar foto'}
                </Button>
              </div>
            </div>
            {photos.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {photos.map(p => (
                  <div key={p.id} className="relative group rounded-lg overflow-hidden aspect-square bg-muted">
                    <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => deletePhoto(p.id)} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">Nenhuma foto anexada</p>}
          </div>

          {/* New session dialog */}
          <Dialog open={sessionOpen} onOpenChange={setSessionOpen}>
            <DialogContent className="max-w-[95vw] sm:max-w-md">
              <DialogHeader><DialogTitle className="font-bold">Registrar Sessão</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Data da sessão</Label>
                  <Input type="date" value={sessionForm.session_date} onChange={(e) => setSessionForm({ ...sessionForm, session_date: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Evolução / Progresso</Label>
                  <Textarea value={sessionForm.evolution} onChange={(e) => setSessionForm({ ...sessionForm, evolution: e.target.value })} rows={3} placeholder="Descreva o progresso do tratamento..." />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Observações</Label>
                  <Textarea value={sessionForm.notes} onChange={(e) => setSessionForm({ ...sessionForm, notes: e.target.value })} rows={2} />
                </div>
                <Button onClick={saveSession} className="w-full gradient-primary border-0 font-semibold h-10">Salvar sessão</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Package edit dialog */}
          <Dialog open={packageOpen} onOpenChange={setPackageOpen}>
            <DialogContent className="max-w-[95vw] sm:max-w-md">
              <DialogHeader><DialogTitle className="font-bold">{editingPackage ? 'Editar Pacote' : 'Novo Pacote de Sessões'}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="font-semibold text-sm">Nome *</Label>
                    <Input value={packageForm.client_name} onChange={(e) => setPackageForm({ ...packageForm, client_name: e.target.value })} className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-semibold text-sm">Telefone *</Label>
                    <Input value={packageForm.client_phone} onChange={(e) => setPackageForm({ ...packageForm, client_phone: formatPhone(e.target.value) })} placeholder="(00) 00000-0000" className="h-10" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Serviço</Label>
                  <Select value={packageForm.service_id || 'none'} onValueChange={(v) => setPackageForm({ ...packageForm, service_id: v === 'none' ? '' : v })}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Geral</SelectItem>
                      {services.filter(s => s.requires_sessions).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Quantidade de sessões</Label>
                  <Input type="number" value={packageForm.total_sessions} onChange={(e) => setPackageForm({ ...packageForm, total_sessions: e.target.value })} placeholder="Deixe vazio para ilimitado" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Observações</Label>
                  <Textarea value={packageForm.notes} onChange={(e) => setPackageForm({ ...packageForm, notes: e.target.value })} rows={2} />
                </div>
                <Button onClick={savePackage} className="w-full gradient-primary border-0 font-semibold h-10">{editingPackage ? 'Salvar alterações' : 'Criar pacote'}</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Delete confirmation */}
          <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteTarget?.type === 'anamnesis'
                    ? 'Tem certeza que deseja excluir esta ficha de anamnese? Todas as fotos associadas também serão removidas. Esta ação não pode ser desfeita.'
                    : 'Tem certeza que deseja excluir este pacote? Todas as sessões e fotos associadas também serão removidas. Esta ação não pode ser desfeita.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DashboardLayout>
    );
  }

  // Client detail view
  if (selectedClient) {
    return (
      <DashboardLayout>
        <div className="space-y-5">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setSelectedClient(null)}>
            <ArrowLeft className="h-3.5 w-3.5" />Voltar para clientes
          </Button>

          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="text-primary font-bold text-lg">{selectedClient.client_name.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <h1 className="text-lg font-bold">{selectedClient.client_name}</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{selectedClient.client_phone}</p>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="rounded-xl"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Anamneses</p>
              <p className="text-lg font-bold">{selectedClient.anamnesisCount}</p>
            </CardContent></Card>
            <Card className="rounded-xl"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Pacotes</p>
              <p className="text-lg font-bold">{selectedClient.packagesCount}</p>
            </CardContent></Card>
            <Card className="rounded-xl"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Sessões</p>
              <p className="text-lg font-bold text-primary">
                {selectedClient.totalSessions ? `${selectedClient.completedSessions}/${selectedClient.totalSessions}` : selectedClient.completedSessions}
              </p>
            </CardContent></Card>
          </div>

          {selectedClient.totalSessions > 0 && (
            <Progress value={Math.min(100, (selectedClient.completedSessions / selectedClient.totalSessions) * 100)} className="h-2" />
          )}

          {/* Anamnesis section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold flex items-center gap-1.5"><ClipboardList className="h-4 w-4 text-primary" />Anamneses</h2>
              <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={openNewAnamnesis}>
                <Plus className="h-3 w-3 mr-1" />Nova ficha
              </Button>
            </div>
            {clientResponses.length === 0 ? (
              <p className="text-xs text-muted-foreground mb-4">Nenhuma ficha de anamnese</p>
            ) : (
              <div className="space-y-2 mb-4">
                {clientResponses.map(r => (
                  <Card key={r.id} className="rounded-xl hover:shadow-sm transition-all">
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 cursor-pointer" onClick={() => { setSelectedResponse(r); fetchPhotos({ responseId: r.id }); }}>
                        <ClipboardList className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setSelectedResponse(r); fetchPhotos({ responseId: r.id }); }}>
                        <p className="font-semibold text-sm truncate">{r.services?.name || 'Geral'}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">{r.filled_by === 'client' ? 'Cliente' : 'Profissional'}</Badge>
                      <button onClick={(e) => { e.stopPropagation(); openEditAnamnesis(r); }} className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent transition-colors" title="Editar">
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: 'anamnesis', id: r.id, name: r.client_name }); }} className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-destructive/10 transition-colors" title="Excluir">
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground cursor-pointer" onClick={() => { setSelectedResponse(r); fetchPhotos({ responseId: r.id }); }} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Session packages section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold flex items-center gap-1.5"><Layers className="h-4 w-4 text-primary" />Pacotes de Sessões</h2>
              <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={openNewPackage}>
                <Plus className="h-3 w-3 mr-1" />Novo pacote
              </Button>
            </div>
            {clientPackages.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum pacote de sessões</p>
            ) : (
              <div className="space-y-2">
                {clientPackages.map(pkg => {
                  const completed = sessionCounts[pkg.id] || 0;
                  const total = pkg.total_sessions;
                  const progressPct = total ? Math.min((completed / total) * 100, 100) : null;
                  return (
                    <Card key={pkg.id} className="rounded-xl hover:shadow-sm transition-all">
                      <CardContent className="p-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 cursor-pointer" onClick={() => openPackageDetail(pkg)}>
                            <Layers className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openPackageDetail(pkg)}>
                            <p className="font-semibold text-sm truncate">{pkg.services?.name || 'Geral'}</p>
                            <p className="text-xs text-muted-foreground">
                              {total ? `${completed}/${total} sessões` : `${completed} sessões`}
                            </p>
                          </div>
                          <Badge variant={pkg.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                            {pkg.status === 'active' ? 'Ativo' : pkg.status === 'completed' ? 'Concluído' : 'Cancelado'}
                          </Badge>
                          <button onClick={(e) => { e.stopPropagation(); openEditPackage(pkg); }} className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent transition-colors" title="Editar">
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: 'package', id: pkg.id, name: pkg.client_name }); }} className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-destructive/10 transition-colors" title="Excluir">
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </button>
                          <ChevronRight className="h-4 w-4 text-muted-foreground cursor-pointer" onClick={() => openPackageDetail(pkg)} />
                        </div>
                        {total && (
                          <div className="mt-2 pl-11">
                            <Progress value={progressPct!} className="h-1.5" />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ANAMNESIS DETAIL DIALOG */}
        <Dialog open={!!selectedResponse} onOpenChange={() => setSelectedResponse(null)}>
          <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between pr-8">
                <DialogTitle className="font-bold flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  Ficha de {selectedResponse?.client_name}
                </DialogTitle>
                <div className="flex items-center gap-1">
                  <button onClick={() => { setSelectedResponse(null); openEditAnamnesis(selectedResponse); }} className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent transition-colors" title="Editar">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => { setDeleteTarget({ type: 'anamnesis', id: selectedResponse.id, name: selectedResponse.client_name }); }} className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-destructive/10 transition-colors" title="Excluir">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            </DialogHeader>
            {selectedResponse && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground text-xs">Telefone</span><p className="font-medium">{selectedResponse.client_phone}</p></div>
                  <div><span className="text-muted-foreground text-xs">Serviço</span><p className="font-medium">{selectedResponse.services?.name || 'Geral'}</p></div>
                  <div><span className="text-muted-foreground text-xs">Preenchido por</span><p className="font-medium">{selectedResponse.filled_by === 'client' ? 'Cliente' : 'Profissional'}</p></div>
                  <div><span className="text-muted-foreground text-xs">Data</span><p className="font-medium">{formatDate(selectedResponse.created_at)}</p></div>
                </div>
                {selectedResponse.responses && Object.keys(selectedResponse.responses).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Respostas</p>
                    {Object.entries(selectedResponse.responses).map(([key, value]) => (
                      <div key={key} className="bg-muted/50 rounded-lg px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">{key}</p>
                        <p className="text-sm font-medium">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                )}
                {selectedResponse.notes && (
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">Observações</p>
                    <p className="text-sm">{selectedResponse.notes}</p>
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1"><ImageIcon className="h-3 w-3" />Fotos</p>
                    <div>
                      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, { responseId: selectedResponse.id })} />
                      <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => fileRef.current?.click()} disabled={uploading}>
                        <Camera className="h-3 w-3 mr-1" />{uploading ? 'Enviando...' : 'Anexar foto'}
                      </Button>
                    </div>
                  </div>
                  {photos.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {photos.map(p => (
                        <div key={p.id} className="relative group rounded-lg overflow-hidden aspect-square bg-muted">
                          <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                          <button onClick={() => deletePhoto(p.id)} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-xs text-muted-foreground">Nenhuma foto anexada</p>}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* NEW/EDIT ANAMNESIS DIALOG */}
        <Dialog open={anamnesisOpen} onOpenChange={setAnamnesisOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-bold">{editingAnamnesis ? 'Editar Ficha de Anamnese' : 'Nova Ficha de Anamnese'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Nome *</Label>
                  <Input value={anamnesisForm.client_name} onChange={(e) => setAnamnesisForm({ ...anamnesisForm, client_name: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Telefone *</Label>
                  <Input value={anamnesisForm.client_phone} onChange={(e) => setAnamnesisForm({ ...anamnesisForm, client_phone: formatPhone(e.target.value) })} placeholder="(00) 00000-0000" className="h-10" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Serviço</Label>
                <Select value={anamnesisForm.service_id || 'none'} onValueChange={(v) => handleAnamnesisServiceChange(v === 'none' ? '' : v)}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Geral</SelectItem>
                    {services.filter(s => s.requires_anamnesis).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {templates.length > 0 && (
                <div className="border-t pt-3 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Campos da anamnese</p>
                  {templates.map(t => (
                    <div key={t.id} className="space-y-1.5">
                      <Label className="font-semibold text-sm">
                        {t.field_label} {t.required && <span className="text-destructive">*</span>}
                      </Label>
                      {t.field_type === 'textarea' ? (
                        <Textarea
                          value={anamnesisForm.responses[t.field_label] || ''}
                          onChange={(e) => setAnamnesisForm({ ...anamnesisForm, responses: { ...anamnesisForm.responses, [t.field_label]: e.target.value } })}
                          rows={2}
                        />
                      ) : t.field_type === 'select' ? (
                        <Select
                          value={anamnesisForm.responses[t.field_label] || ''}
                          onValueChange={(v) => setAnamnesisForm({ ...anamnesisForm, responses: { ...anamnesisForm.responses, [t.field_label]: v } })}
                        >
                          <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {(t.field_options || []).map((opt: string) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={t.field_type === 'number' ? 'number' : 'text'}
                          value={anamnesisForm.responses[t.field_label] || ''}
                          onChange={(e) => setAnamnesisForm({ ...anamnesisForm, responses: { ...anamnesisForm.responses, [t.field_label]: e.target.value } })}
                          className="h-10"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Observações</Label>
                <Textarea value={anamnesisForm.notes} onChange={(e) => setAnamnesisForm({ ...anamnesisForm, notes: e.target.value })} rows={2} />
              </div>
              <Button onClick={saveAnamnesis} className="w-full gradient-primary border-0 font-semibold h-10">{editingAnamnesis ? 'Salvar alterações' : 'Salvar ficha'}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* NEW/EDIT PACKAGE DIALOG */}
        <Dialog open={packageOpen} onOpenChange={setPackageOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-md">
            <DialogHeader><DialogTitle className="font-bold">{editingPackage ? 'Editar Pacote' : 'Novo Pacote de Sessões'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Nome *</Label>
                  <Input value={packageForm.client_name} onChange={(e) => setPackageForm({ ...packageForm, client_name: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Telefone *</Label>
                  <Input value={packageForm.client_phone} onChange={(e) => setPackageForm({ ...packageForm, client_phone: formatPhone(e.target.value) })} placeholder="(00) 00000-0000" className="h-10" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Serviço</Label>
                <Select value={packageForm.service_id || 'none'} onValueChange={(v) => setPackageForm({ ...packageForm, service_id: v === 'none' ? '' : v })}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Geral</SelectItem>
                    {services.filter(s => s.requires_sessions).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Quantidade de sessões</Label>
                <Input type="number" value={packageForm.total_sessions} onChange={(e) => setPackageForm({ ...packageForm, total_sessions: e.target.value })} placeholder="Deixe vazio para ilimitado" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Observações</Label>
                <Textarea value={packageForm.notes} onChange={(e) => setPackageForm({ ...packageForm, notes: e.target.value })} rows={2} />
              </div>
              <Button onClick={savePackage} className="w-full gradient-primary border-0 font-semibold h-10">{editingPackage ? 'Salvar alterações' : 'Criar pacote'}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* DELETE CONFIRMATION */}
        <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget?.type === 'anamnesis'
                  ? 'Tem certeza que deseja excluir esta ficha de anamnese? Todas as fotos associadas também serão removidas. Esta ação não pode ser desfeita.'
                  : 'Tem certeza que deseja excluir este pacote? Todas as sessões e fotos associadas também serão removidas. Esta ação não pode ser desfeita.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardLayout>
    );
  }

  // ====== CLIENT LIST (main view) ======
  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="section-header">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="section-title flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Fichas de Clientes
              </h1>
              <p className="section-subtitle">Prontuário unificado: anamnese, sessões e fotos</p>
            </div>
            <Button size="sm" className="gradient-primary border-0 font-semibold gap-1.5" onClick={() => { setNewClientForm({ client_name: '', client_phone: '' }); setNewClientOpen(true); }}>
              <UserPlus className="h-4 w-4" />Novo cliente
            </Button>
          </div>
        </div>

        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar cliente..." className="pl-9 h-9 text-sm" />
        </div>

        {filteredClients.length === 0 ? (
          <Card className="glass-card-static rounded-2xl">
            <CardContent className="py-12 text-center">
              <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium text-sm">Nenhum cliente encontrado</p>
              <p className="text-xs text-muted-foreground mt-1">Fichas aparecerão aqui quando anamneses ou pacotes forem criados</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredClients.map(c => (
              <Card key={c.key} className="rounded-xl hover:shadow-sm transition-all cursor-pointer" onClick={() => setSelectedClient(c)}>
                <CardContent className="p-3.5 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-bold text-sm">{c.client_name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{c.client_name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{c.client_phone}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {c.anamnesisCount > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                        <ClipboardList className="h-2.5 w-2.5" />{c.anamnesisCount}
                      </Badge>
                    )}
                    {c.packagesCount > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                        <Layers className="h-2.5 w-2.5" />
                        {c.totalSessions ? `${c.completedSessions}/${c.totalSessions}` : c.completedSessions}
                      </Badge>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* NEW CLIENT DIALOG */}
      <Dialog open={newClientOpen} onOpenChange={setNewClientOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm">
          <DialogHeader><DialogTitle className="font-bold">Novo Cliente</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="font-semibold text-sm">Nome *</Label>
              <Input value={newClientForm.client_name} onChange={(e) => setNewClientForm({ ...newClientForm, client_name: e.target.value })} placeholder="Nome do cliente" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold text-sm">Telefone *</Label>
              <Input value={newClientForm.client_phone} onChange={(e) => setNewClientForm({ ...newClientForm, client_phone: formatPhone(e.target.value) })} placeholder="(00) 00000-0000" className="h-10" />
            </div>
            <Button onClick={saveNewClient} className="w-full gradient-primary border-0 font-semibold h-10">Cadastrar cliente</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
