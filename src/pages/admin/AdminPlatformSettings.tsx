import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Image, Type, Upload, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminPlatformSettings() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data, error } = await supabase
      .from('platform_settings')
      .select('*')
      .limit(1)
      .single();
    if (data) {
      setSettings(data);
      setLogoPreview(data.logo_url);
    }
    setLoading(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Imagem deve ter no máximo 2MB');
      return;
    }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const filePath = `logo.${ext}`;

    // Delete old logo if exists
    await supabase.storage.from('platform-assets').remove([filePath]);

    const { error: uploadError } = await supabase.storage
      .from('platform-assets')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast.error('Erro ao fazer upload: ' + uploadError.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('platform-assets')
      .getPublicUrl(filePath);

    const logoUrl = urlData.publicUrl + '?t=' + Date.now();
    setSettings((s: any) => ({ ...s, logo_url: logoUrl }));
    setLogoPreview(logoUrl);
    setUploading(false);
    toast.success('Logo carregado com sucesso');
  };

  const removeLogo = () => {
    setSettings((s: any) => ({ ...s, logo_url: null }));
    setLogoPreview(null);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const { id, updated_at, updated_by, ...rest } = settings;
    const { error } = await supabase
      .from('platform_settings')
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
    } else {
      toast.success('Configurações da plataforma salvas!');
    }
    setSaving(false);
  };

  const u = (field: string, value: string | null) =>
    setSettings((s: any) => ({ ...s, [field]: value }));

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-muted-foreground">Carregando...</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="section-header">
          <h1 className="text-2xl font-extrabold">Configurações da Plataforma</h1>
          <p className="text-muted-foreground text-sm">Gerencie o logo e os textos da landing page</p>
        </div>

        {/* Logo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Image className="h-5 w-5 text-destructive" />
              Logo da Plataforma
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-6">
              {logoPreview ? (
                <div className="relative group">
                  <div className="h-20 w-20 rounded-xl border-2 border-dashed border-border bg-muted/50 flex items-center justify-center overflow-hidden">
                    <img src={logoPreview} alt="Logo" className="h-16 w-16 object-contain" />
                  </div>
                  <button
                    onClick={removeLogo}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="h-20 w-20 rounded-xl border-2 border-dashed border-border bg-muted/50 flex items-center justify-center">
                  <Image className="h-8 w-8 text-muted-foreground/40" />
                </div>
              )}
              <div className="space-y-2">
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? 'Enviando...' : 'Fazer upload'}
                </Button>
                <p className="text-xs text-muted-foreground">PNG, JPG ou SVG. Máx. 2MB.</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Ou cole a URL do logo</Label>
              <Input
                value={settings?.logo_url || ''}
                onChange={(e) => {
                  u('logo_url', e.target.value || null);
                  setLogoPreview(e.target.value || null);
                }}
                placeholder="https://..."
                className="h-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Hero texts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Type className="h-5 w-5 text-destructive" />
              Textos da Landing Page
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Título principal (linha 1)</Label>
                <Input
                  value={settings?.hero_title || ''}
                  onChange={(e) => u('hero_title', e.target.value)}
                  placeholder="Sua agenda online,"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Título destaque (linha 2)</Label>
                <Input
                  value={settings?.hero_title_highlight || ''}
                  onChange={(e) => u('hero_title_highlight', e.target.value)}
                  placeholder="sempre organizada"
                  className="h-10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Subtítulo do hero</Label>
              <Textarea
                value={settings?.hero_subtitle || ''}
                onChange={(e) => u('hero_subtitle', e.target.value)}
                rows={3}
                placeholder="Plataforma completa de agendamentos..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Título do CTA final</Label>
              <Input
                value={settings?.cta_text || ''}
                onChange={(e) => u('cta_text', e.target.value)}
                placeholder="Pronto para transformar seu negócio?"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Subtítulo do CTA final</Label>
              <Textarea
                value={settings?.cta_subtitle || ''}
                onChange={(e) => u('cta_subtitle', e.target.value)}
                rows={2}
                placeholder="Comece agora..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Texto do rodapé</Label>
              <Input
                value={settings?.footer_text || ''}
                onChange={(e) => u('footer_text', e.target.value)}
                placeholder="© 2025 Slotera. Todos os direitos reservados."
                className="h-10"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={save} disabled={saving} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold">
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </Button>
          <Button variant="outline" asChild>
            <a href="/" target="_blank" rel="noopener noreferrer">
              <Eye className="h-4 w-4 mr-2" />
              Ver landing page
            </a>
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
