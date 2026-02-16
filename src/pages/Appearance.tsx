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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExternalLink, Link2, Palette, Type } from 'lucide-react';
import { toast } from 'sonner';

export default function Appearance() {
  const { companyId } = useAuth();
  const [settings, setSettings] = useState<any>({});
  const [slug, setSlug] = useState('');

  useEffect(() => {
    if (!companyId) return;
    const fetch = async () => {
      const [pageRes, companyRes] = await Promise.all([
        supabase.from('public_page_settings').select('*').eq('company_id', companyId).single(),
        supabase.from('companies').select('slug').eq('id', companyId).single(),
      ]);
      if (pageRes.data) setSettings(pageRes.data);
      if (companyRes.data) setSlug(companyRes.data.slug);
    };
    fetch();
  }, [companyId]);

  const save = async () => {
    if (!companyId) return;
    const { id, company_id, created_at, ...rest } = settings;
    await supabase.from('public_page_settings').update(rest).eq('company_id', companyId);
    toast.success('Aparência salva');
  };

  const updateSlug = async () => {
    if (!companyId || !slug.trim()) return;
    const { error } = await supabase.from('companies').update({ slug: slug.trim().toLowerCase().replace(/\s+/g, '-') }).eq('id', companyId);
    if (error) { toast.error('Slug já em uso ou inválido'); return; }
    toast.success('Slug atualizado');
  };

  const u = (field: string, value: any) => setSettings((s: any) => ({ ...s, [field]: value }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="section-header mb-0">
            <h1 className="section-title">Aparência</h1>
            <p className="section-subtitle">Personalize sua página de agendamento</p>
          </div>
          <Button variant="outline" asChild className="self-start sm:self-auto">
            <a href={`/agendar/${slug}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />Ver página
            </a>
          </Button>
        </div>

        {/* Slug */}
        <Card className="glass-card-static rounded-2xl">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="h-4.5 w-4.5 text-primary" />
              Link da Página
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label className="text-sm font-semibold">Slug (URL)</Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">/agendar/</span>
                  <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="flex-1 h-10" />
                </div>
              </div>
              <Button onClick={updateSlug} variant="outline" className="flex-shrink-0">Salvar slug</Button>
            </div>
          </CardContent>
        </Card>

        {/* Colors */}
        <Card className="glass-card-static rounded-2xl">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="text-lg flex items-center gap-2">
              <Palette className="h-4.5 w-4.5 text-primary" />
              Cores e Estilo
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 space-y-4">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Cor primária</Label>
                <div className="flex items-center gap-2">
                  <Input type="color" value={settings.primary_color || '#10b981'} onChange={(e) => u('primary_color', e.target.value)} className="h-10 w-14 p-1 cursor-pointer" />
                  <span className="text-xs text-muted-foreground font-mono">{settings.primary_color || '#10b981'}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Cor secundária</Label>
                <div className="flex items-center gap-2">
                  <Input type="color" value={settings.secondary_color || '#0f172a'} onChange={(e) => u('secondary_color', e.target.value)} className="h-10 w-14 p-1 cursor-pointer" />
                  <span className="text-xs text-muted-foreground font-mono">{settings.secondary_color || '#0f172a'}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Cor de fundo</Label>
                <div className="flex items-center gap-2">
                  <Input type="color" value={settings.background_color || '#ffffff'} onChange={(e) => u('background_color', e.target.value)} className="h-10 w-14 p-1 cursor-pointer" />
                  <span className="text-xs text-muted-foreground font-mono">{settings.background_color || '#ffffff'}</span>
                </div>
              </div>
            </div>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Tipografia</Label>
                <Select value={settings.font_style || 'modern'} onValueChange={(v) => u('font_style', v)}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="modern">Moderna</SelectItem>
                    <SelectItem value="classic">Clássica</SelectItem>
                    <SelectItem value="playful">Descontraída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Estilo dos botões</Label>
                <Select value={settings.button_style || 'rounded'} onValueChange={(v) => u('button_style', v)}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rounded">Arredondado</SelectItem>
                    <SelectItem value="square">Quadrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Texts */}
        <Card className="glass-card-static rounded-2xl">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="text-lg flex items-center gap-2">
              <Type className="h-4.5 w-4.5 text-primary" />
              Textos e Exibição
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Título</Label>
              <Input value={settings.title || ''} onChange={(e) => u('title', e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Subtítulo</Label>
              <Input value={settings.subtitle || ''} onChange={(e) => u('subtitle', e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Mensagem de boas-vindas</Label>
              <Textarea value={settings.welcome_message || ''} onChange={(e) => u('welcome_message', e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Política de cancelamento</Label>
              <Textarea value={settings.cancellation_policy || ''} onChange={(e) => u('cancellation_policy', e.target.value)} rows={2} />
            </div>
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
              <div className="flex items-center gap-2.5">
                <Switch checked={settings.show_address ?? true} onCheckedChange={(v) => u('show_address', v)} />
                <Label className="font-medium text-sm">Exibir endereço</Label>
              </div>
              <div className="flex items-center gap-2.5">
                <Switch checked={settings.show_services_cards ?? true} onCheckedChange={(v) => u('show_services_cards', v)} />
                <Label className="font-medium text-sm">Cards de serviços</Label>
              </div>
            </div>
            <Button onClick={save} className="gradient-primary border-0 font-semibold">Salvar aparência</Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
