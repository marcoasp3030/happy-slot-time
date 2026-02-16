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
import { ExternalLink } from 'lucide-react';
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Aparência</h1>
            <p className="text-muted-foreground">Personalize sua página de agendamento</p>
          </div>
          <Button variant="outline" asChild>
            <a href={`/agendar/${slug}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />Ver página
            </a>
          </Button>
        </div>

        <Card className="glass-card">
          <CardHeader><CardTitle className="text-lg">Link da Página</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label>Slug (URL)</Label>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-sm text-muted-foreground">/agendar/</span>
                  <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="flex-1" />
                </div>
              </div>
              <Button onClick={updateSlug} variant="outline">Salvar slug</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader><CardTitle className="text-lg">Cores e Estilo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div><Label>Cor primária</Label><Input type="color" value={settings.primary_color || '#10b981'} onChange={(e) => u('primary_color', e.target.value)} className="h-10 w-20" /></div>
              <div><Label>Cor secundária</Label><Input type="color" value={settings.secondary_color || '#0f172a'} onChange={(e) => u('secondary_color', e.target.value)} className="h-10 w-20" /></div>
              <div><Label>Cor de fundo</Label><Input type="color" value={settings.background_color || '#ffffff'} onChange={(e) => u('background_color', e.target.value)} className="h-10 w-20" /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Tipografia</Label>
                <Select value={settings.font_style || 'modern'} onValueChange={(v) => u('font_style', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="modern">Moderna</SelectItem>
                    <SelectItem value="classic">Clássica</SelectItem>
                    <SelectItem value="playful">Descontraída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Estilo dos botões</Label>
                <Select value={settings.button_style || 'rounded'} onValueChange={(v) => u('button_style', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rounded">Arredondado</SelectItem>
                    <SelectItem value="square">Quadrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader><CardTitle className="text-lg">Textos e Exibição</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>Título</Label><Input value={settings.title || ''} onChange={(e) => u('title', e.target.value)} /></div>
            <div><Label>Subtítulo</Label><Input value={settings.subtitle || ''} onChange={(e) => u('subtitle', e.target.value)} /></div>
            <div><Label>Mensagem de boas-vindas</Label><Textarea value={settings.welcome_message || ''} onChange={(e) => u('welcome_message', e.target.value)} rows={2} /></div>
            <div><Label>Política de cancelamento</Label><Textarea value={settings.cancellation_policy || ''} onChange={(e) => u('cancellation_policy', e.target.value)} rows={2} /></div>
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2"><Switch checked={settings.show_address ?? true} onCheckedChange={(v) => u('show_address', v)} /><Label>Exibir endereço</Label></div>
              <div className="flex items-center gap-2"><Switch checked={settings.show_services_cards ?? true} onCheckedChange={(v) => u('show_services_cards', v)} /><Label>Cards de serviços</Label></div>
            </div>
            <Button onClick={save}>Salvar aparência</Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
