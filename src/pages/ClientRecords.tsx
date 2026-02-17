import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Search, Users, ClipboardList, Layers, Plus, Camera, Trash2,
  Phone, ChevronRight, FileText, ImageIcon, Calendar, CheckCircle2, XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';

export default function ClientRecords() {
  const { companyId } = useAuth();
  const [tab, setTab] = useState('anamnesis');
  const [searchQuery, setSearchQuery] = useState('');

  // Anamnesis state
  const [responses, setResponses] = useState<any[]>([]);
  const [selectedResponse, setSelectedResponse] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [anamnesisOpen, setAnamnesisOpen] = useState(false);
  const [anamnesisForm, setAnamnesisForm] = useState<any>({ client_name: '', client_phone: '', service_id: '', responses: {}, notes: '' });

  // Sessions state
  const [packages, setPackages] = useState<any[]>([]);
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});
  const [selectedPackage, setSelectedPackage] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [packageOpen, setPackageOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [packageForm, setPackageForm] = useState({ client_name: '', client_phone: '', service_id: '', total_sessions: '', notes: '' });
  const [sessionForm, setSessionForm] = useState({ notes: '', evolution: '', session_date: new Date().toISOString().split('T')[0] });

  // Photos state
  const [photos, setPhotos] = useState<any[]>([]);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Services
  const [services, setServices] = useState<any[]>([]);

  useEffect(() => {
    if (!companyId) return;
    supabase.from('services').select('id, name, requires_anamnesis, requires_sessions')
      .eq('company_id', companyId).then(({ data }) => setServices(data || []));
  }, [companyId]);

  // Fetch anamnesis responses
  const fetchResponses = async () => {
    if (!companyId) return;
    const { data } = await supabase.from('anamnesis_responses').select('*, services(name)')
      .eq('company_id', companyId).order('created_at', { ascending: false });
    setResponses(data || []);
  };

  // Fetch session packages
  const fetchPackages = async () => {
    if (!companyId) return;
    const { data } = await supabase.from('session_packages').select('*, services(name)')
      .eq('company_id', companyId).order('created_at', { ascending: false });
    setPackages(data || []);

    // Fetch session counts for all packages
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

  // Fetch templates for a service
  const fetchTemplatesForService = async (serviceId: string) => {
    if (!companyId) return;
    const { data } = await supabase.from('anamnesis_templates').select('*')
      .eq('company_id', companyId).eq('active', true)
      .or(`service_id.is.null,service_id.eq.${serviceId}`)
      .order('sort_order');
    setTemplates(data || []);
  };

  // Fetch sessions for a package
  const fetchSessions = async (packageId: string) => {
    const { data } = await supabase.from('sessions').select('*')
      .eq('package_id', packageId).order('session_number');
    setSessions(data || []);
  };

  // Fetch photos
  const fetchPhotos = async (opts: { packageId?: string; responseId?: string; sessionId?: string }) => {
    if (!companyId) return;
    let query = supabase.from('client_photos').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
    if (opts.packageId) query = query.eq('package_id', opts.packageId);
    if (opts.responseId) query = query.eq('anamnesis_response_id', opts.responseId);
    if (opts.sessionId) query = query.eq('session_id', opts.sessionId);
    const { data } = await query;
    setPhotos(data || []);
  };

  // -- Anamnesis actions --
  const openNewAnamnesis = () => {
    setAnamnesisForm({ client_name: '', client_phone: '', service_id: '', responses: {}, notes: '' });
    setTemplates([]);
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
    setAnamnesisOpen(false);
    fetchResponses();
  };

  // -- Session actions --
  const openNewPackage = () => {
    setPackageForm({ client_name: '', client_phone: '', service_id: '', total_sessions: '', notes: '' });
    setPackageOpen(true);
  };

  const savePackage = async () => {
    if (!companyId || !packageForm.client_name.trim() || !packageForm.client_phone.trim()) {
      toast.error('Preencha nome e telefone'); return;
    }
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
    setPackageOpen(false);
    fetchPackages();
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
  };

  // -- Photo upload --
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

  // Filter
  const filteredResponses = responses.filter(r =>
    !searchQuery || r.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) || r.client_phone?.includes(searchQuery)
  );
  const filteredPackages = packages.filter(p =>
    !searchQuery || p.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.client_phone?.includes(searchQuery)
  );

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="section-header">
          <h1 className="section-title flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Fichas de Clientes
          </h1>
          <p className="section-subtitle">Anamnese, sessões e fotos dos seus clientes</p>
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar cliente..." className="pl-9 h-9 text-sm" />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-9">
            <TabsTrigger value="anamnesis" className="text-xs px-3 gap-1"><ClipboardList className="h-3 w-3" />Anamnese</TabsTrigger>
            <TabsTrigger value="sessions" className="text-xs px-3 gap-1"><Layers className="h-3 w-3" />Sessões</TabsTrigger>
          </TabsList>

          {/* ANAMNESIS TAB */}
          <TabsContent value="anamnesis" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button onClick={openNewAnamnesis} className="gradient-primary border-0 font-semibold" size="sm">
                <Plus className="h-3.5 w-3.5 mr-1.5" />Nova ficha
              </Button>
            </div>

            {filteredResponses.length === 0 ? (
              <Card className="glass-card-static rounded-2xl">
                <CardContent className="py-12 text-center">
                  <ClipboardList className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium text-sm">Nenhuma ficha de anamnese</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredResponses.map(r => (
                  <Card key={r.id} className="rounded-xl hover:shadow-sm transition-all cursor-pointer" onClick={() => { setSelectedResponse(r); fetchPhotos({ responseId: r.id }); }}>
                    <CardContent className="p-3.5 flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary font-bold text-sm">{r.client_name?.charAt(0)?.toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{r.client_name}</p>
                        <p className="text-xs text-muted-foreground">{r.services?.name || 'Geral'} · {formatDate(r.created_at)}</p>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">{r.filled_by === 'client' ? 'Cliente' : 'Profissional'}</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* SESSIONS TAB */}
          <TabsContent value="sessions" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button onClick={openNewPackage} className="gradient-primary border-0 font-semibold" size="sm">
                <Plus className="h-3.5 w-3.5 mr-1.5" />Novo pacote
              </Button>
            </div>

            {filteredPackages.length === 0 ? (
              <Card className="glass-card-static rounded-2xl">
                <CardContent className="py-12 text-center">
                  <Layers className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium text-sm">Nenhum pacote de sessões</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredPackages.map(pkg => {
                  const completed = sessionCounts[pkg.id] || 0;
                  const total = pkg.total_sessions;
                  const progressPct = total ? Math.min((completed / total) * 100, 100) : null;
                  return (
                    <Card key={pkg.id} className="rounded-xl hover:shadow-sm transition-all cursor-pointer" onClick={() => openPackageDetail(pkg)}>
                      <CardContent className="p-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Layers className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{pkg.client_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {pkg.services?.name || 'Geral'} · {total ? `${completed}/${total} sessões` : `${completed} sessões`}
                            </p>
                          </div>
                          <Badge variant={pkg.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                            {pkg.status === 'active' ? 'Ativo' : pkg.status === 'completed' ? 'Concluído' : 'Cancelado'}
                          </Badge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                        {total && (
                          <div className="mt-2.5 pl-12">
                            <Progress value={progressPct!} className="h-1.5" />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* ANAMNESIS DETAIL DIALOG */}
        <Dialog open={!!selectedResponse} onOpenChange={() => setSelectedResponse(null)}>
          <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-bold flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                Ficha de {selectedResponse?.client_name}
              </DialogTitle>
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

                {/* Photos */}
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

        {/* PACKAGE DETAIL DIALOG */}
        <Dialog open={!!selectedPackage} onOpenChange={() => setSelectedPackage(null)}>
          <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-bold flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                Pacote de {selectedPackage?.client_name}
              </DialogTitle>
            </DialogHeader>
            {selectedPackage && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground text-xs">Telefone</span><p className="font-medium">{selectedPackage.client_phone}</p></div>
                  <div><span className="text-muted-foreground text-xs">Serviço</span><p className="font-medium">{selectedPackage.services?.name || 'Geral'}</p></div>
                  <div><span className="text-muted-foreground text-xs">Total de sessões</span><p className="font-medium">{selectedPackage.total_sessions || 'Ilimitado'}</p></div>
                  <div><span className="text-muted-foreground text-xs">Realizadas</span><p className="font-medium">{sessions.length}</p></div>
                </div>

                {selectedPackage.total_sessions && (
                  <div className="w-full bg-muted rounded-full h-2.5">
                    <div className="bg-primary h-2.5 rounded-full transition-all" style={{ width: `${Math.min(100, (sessions.length / selectedPackage.total_sessions) * 100)}%` }} />
                  </div>
                )}

                {/* Sessions list */}
                <div>
                  <div className="flex items-center justify-between mb-2">
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
                        <div key={s.id} className="bg-muted/50 rounded-lg px-3 py-2.5 flex items-start gap-3">
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
                        </div>
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

        {/* NEW ANAMNESIS DIALOG */}
        <Dialog open={anamnesisOpen} onOpenChange={setAnamnesisOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-bold">Nova Ficha de Anamnese</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Nome do cliente *</Label>
                  <Input value={anamnesisForm.client_name} onChange={(e) => setAnamnesisForm({ ...anamnesisForm, client_name: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Telefone *</Label>
                  <Input value={anamnesisForm.client_phone} onChange={(e) => setAnamnesisForm({ ...anamnesisForm, client_phone: e.target.value })} className="h-10" />
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

              {/* Dynamic fields */}
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
              <Button onClick={saveAnamnesis} className="w-full gradient-primary border-0 font-semibold h-10">Salvar ficha</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* NEW PACKAGE DIALOG */}
        <Dialog open={packageOpen} onOpenChange={setPackageOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-bold">Novo Pacote de Sessões</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Nome do cliente *</Label>
                  <Input value={packageForm.client_name} onChange={(e) => setPackageForm({ ...packageForm, client_name: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Telefone *</Label>
                  <Input value={packageForm.client_phone} onChange={(e) => setPackageForm({ ...packageForm, client_phone: e.target.value })} className="h-10" />
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
              <Button onClick={savePackage} className="w-full gradient-primary border-0 font-semibold h-10">Criar pacote</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* NEW SESSION DIALOG */}
        <Dialog open={sessionOpen} onOpenChange={setSessionOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-bold">Registrar Sessão</DialogTitle>
            </DialogHeader>
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
      </div>
    </DashboardLayout>
  );
}
