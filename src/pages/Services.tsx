import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, ClipboardList, Layers, ImageIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';
import { Badge } from '@/components/ui/badge';
import { AspectRatio } from '@/components/ui/aspect-ratio';

interface Service {
  id: string;
  name: string;
  duration: number;
  price: number | null;
  description: string | null;
  color: string | null;
  active: boolean;
  requires_anamnesis: boolean;
  requires_sessions: boolean;
  anamnesis_type_id: string | null;
  image_url: string | null;
}

interface AnamnesisType {
  id: string;
  name: string;
}

export default function Services() {
  const { companyId } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [anamnesisTypes, setAnamnesisTypes] = useState<AnamnesisType[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState({
    name: '', duration: '30', price: '', description: '', color: '#10b981',
    requires_anamnesis: false, requires_sessions: false, anamnesis_type_id: '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchServices = async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('services')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    setServices((data as Service[]) || []);
  };

  const fetchAnamnesisTypes = async () => {
    if (!companyId) return;
    const { data } = await supabase.from('anamnesis_types').select('id, name')
      .eq('company_id', companyId).eq('active', true).order('name');
    setAnamnesisTypes((data as AnamnesisType[]) || []);
  };

  useEffect(() => { fetchServices(); fetchAnamnesisTypes(); }, [companyId]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', duration: '30', price: '', description: '', color: '#10b981', requires_anamnesis: false, requires_sessions: false, anamnesis_type_id: '' });
    setImageFile(null);
    setImagePreview(null);
    setRemoveImage(false);
    setOpen(true);
  };

  const openEdit = (s: Service) => {
    setEditing(s);
    setForm({
      name: s.name,
      duration: String(s.duration),
      price: s.price ? String(s.price) : '',
      description: s.description || '',
      color: s.color || '#10b981',
      requires_anamnesis: s.requires_anamnesis,
      requires_sessions: s.requires_sessions,
      anamnesis_type_id: s.anamnesis_type_id || '',
    });
    setImageFile(null);
    setImagePreview(s.image_url || null);
    setRemoveImage(false);
    setOpen(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Máx. 5MB'); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile || !companyId) return null;
    const path = `${companyId}/${Date.now()}-${imageFile.name}`;
    const { error } = await supabase.storage.from('service-images').upload(path, imageFile);
    if (error) { toast.error('Erro no upload da imagem'); return null; }
    const { data } = supabase.storage.from('service-images').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSave = async () => {
    if (!companyId || !form.name.trim()) return;
    setUploading(true);

    let image_url: string | null = editing?.image_url || null;
    if (removeImage) {
      image_url = null;
    } else if (imageFile) {
      const url = await uploadImage();
      if (url) image_url = url;
    }

    const payload = {
      company_id: companyId,
      name: form.name.trim(),
      duration: parseInt(form.duration) || 30,
      price: form.price ? parseFloat(form.price) : null,
      description: form.description.trim() || null,
      color: form.color,
      requires_anamnesis: form.requires_anamnesis,
      requires_sessions: form.requires_sessions,
      anamnesis_type_id: form.requires_anamnesis && form.anamnesis_type_id ? form.anamnesis_type_id : null,
      image_url,
    };

    if (editing) {
      const { error } = await supabase.from('services').update(payload).eq('id', editing.id);
      if (error) { toast.error('Erro ao atualizar'); setUploading(false); return; }
      toast.success('Serviço atualizado');
      logAudit({ companyId, action: 'Serviço atualizado', category: 'service', entityType: 'service', entityId: editing.id, details: { name: form.name } });
    } else {
      const { data: newSvc, error } = await supabase.from('services').insert(payload).select('id').single();
      if (error) { toast.error('Erro ao criar'); setUploading(false); return; }
      toast.success('Serviço criado');
      logAudit({ companyId, action: 'Serviço criado', category: 'service', entityType: 'service', entityId: newSvc?.id, details: { name: form.name, duration: form.duration } });
    }
    setUploading(false);
    setOpen(false);
    fetchServices();
  };

  const handleToggle = async (s: Service) => {
    await supabase.from('services').update({ active: !s.active }).eq('id', s.id);
    logAudit({ companyId, action: s.active ? 'Serviço desativado' : 'Serviço ativado', category: 'service', entityType: 'service', entityId: s.id, details: { name: s.name } });
    fetchServices();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este serviço?')) return;
    const svc = services.find(s => s.id === id);
    await supabase.from('services').delete().eq('id', id);
    toast.success('Serviço excluído');
    logAudit({ companyId, action: 'Serviço excluído', category: 'service', entityType: 'service', entityId: id, details: { name: svc?.name } });
    fetchServices();
  };

  const getTypeName = (typeId: string | null) => {
    if (!typeId) return null;
    return anamnesisTypes.find(t => t.id === typeId)?.name || null;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="section-header mb-0">
            <h1 className="section-title">Serviços</h1>
            <p className="section-subtitle">Gerencie os serviços oferecidos</p>
          </div>
          <Button onClick={openNew} className="gradient-primary border-0 font-semibold self-start sm:self-auto">
            <Plus className="h-4 w-4 mr-2" />
            Novo serviço
          </Button>
        </div>

        {services.length === 0 ? (
          <Card className="glass-card-static rounded-2xl">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground font-medium">Nenhum serviço cadastrado</p>
              <Button className="mt-4 gradient-primary border-0" onClick={openNew}>Criar primeiro serviço</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <Card key={s.id} className={`glass-card rounded-2xl transition-all overflow-hidden ${!s.active ? 'opacity-50' : ''}`}>
                {s.image_url && (
                  <AspectRatio ratio={16 / 9}>
                    <img src={s.image_url} alt={s.name} className="w-full h-full object-cover" />
                  </AspectRatio>
                )}
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-3.5 w-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color || '#10b981' }} />
                      <h3 className="font-bold text-sm truncate">{s.name}</h3>
                    </div>
                    <Switch checked={s.active} onCheckedChange={() => handleToggle(s)} />
                  </div>
                  <div className="space-y-0.5 mb-3">
                    <p className="text-sm text-muted-foreground">{s.duration} min</p>
                    {s.price && <p className="text-sm font-semibold">R$ {Number(s.price).toFixed(2)}</p>}
                  </div>
                  {(s.requires_anamnesis || s.requires_sessions) && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {s.requires_anamnesis && (
                        <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                          <ClipboardList className="h-2.5 w-2.5" />
                          {getTypeName(s.anamnesis_type_id) || 'Anamnese'}
                        </Badge>
                      )}
                      {s.requires_sessions && (
                        <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                          <Layers className="h-2.5 w-2.5" />Sessões
                        </Badge>
                      )}
                    </div>
                  )}
                  {s.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{s.description}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(s)} className="text-xs h-8">
                      <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(s.id)} className="text-xs h-8 text-destructive hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-bold">{editing ? 'Editar serviço' : 'Novo serviço'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Image upload */}
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Imagem do serviço</Label>
                {imagePreview && !removeImage ? (
                  <div className="relative rounded-xl overflow-hidden bg-muted">
                    <AspectRatio ratio={16 / 9}>
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    </AspectRatio>
                    <button
                      onClick={() => { setRemoveImage(true); setImageFile(null); setImagePreview(null); }}
                      className="absolute top-2 right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    <ImageIcon className="h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-xs text-muted-foreground">Clique para adicionar uma imagem</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">Opcional • Máx. 5MB</p>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              </div>

              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Nome *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Corte feminino" className="h-10" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Duração (min)</Label>
                  <Input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Preço (R$)</Label>
                  <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Opcional" className="h-10" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Descrição</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Opcional" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Cor</Label>
                <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 w-20 p-1 cursor-pointer" />
              </div>
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recursos avançados</p>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-semibold text-sm flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5 text-primary" />Anamnese</Label>
                    <p className="text-[11px] text-muted-foreground">Ficha de avaliação do cliente</p>
                  </div>
                  <Switch checked={form.requires_anamnesis} onCheckedChange={(v) => setForm({ ...form, requires_anamnesis: v, anamnesis_type_id: v ? form.anamnesis_type_id : '' })} />
                </div>
                {form.requires_anamnesis && (
                  <div className="space-y-1.5 pl-5 border-l-2 border-primary/20">
                    <Label className="font-semibold text-sm">Tipo de anamnese</Label>
                    {anamnesisTypes.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">Nenhum tipo criado. Crie tipos na página de Anamnese.</p>
                    ) : (
                      <Select value={form.anamnesis_type_id || 'none'} onValueChange={(v) => setForm({ ...form, anamnesis_type_id: v === 'none' ? '' : v })}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum (genérica)</SelectItem>
                          {anamnesisTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-semibold text-sm flex items-center gap-1.5"><Layers className="h-3.5 w-3.5 text-primary" />Controle de Sessões</Label>
                    <p className="text-[11px] text-muted-foreground">Pacotes e histórico de sessões</p>
                  </div>
                  <Switch checked={form.requires_sessions} onCheckedChange={(v) => setForm({ ...form, requires_sessions: v })} />
                </div>
              </div>
              <Button onClick={handleSave} disabled={uploading} className="w-full gradient-primary border-0 font-semibold h-10">
                {uploading ? 'Salvando...' : editing ? 'Salvar' : 'Criar serviço'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
