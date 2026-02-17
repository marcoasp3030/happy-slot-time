import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Edit, BookOpen, Save, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface PromptTemplate {
  id: string;
  name: string;
  description: string | null;
  prompt_content: string;
  category: string;
  active: boolean;
  created_at: string;
}

export default function AdminPromptTemplates() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PromptTemplate | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [promptContent, setPromptContent] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchTemplates(); }, []);

  async function fetchTemplates() {
    setLoading(true);
    const { data } = await supabase
      .from('prompt_templates')
      .select('*')
      .order('created_at', { ascending: false });
    setTemplates((data as any[]) || []);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setName('');
    setDescription('');
    setActive(true);
    setDialogOpen(true);
    setDialogOpen(true);
  }

  function openEdit(t: PromptTemplate) {
    setEditing(t);
    setName(t.name);
    setDescription(t.description || '');
    setPromptContent(t.prompt_content);
    setActive(t.active);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim() || !promptContent.trim()) {
      toast({ title: 'Preencha nome e conteúdo do prompt', variant: 'destructive' });
      return;
    }
    setSaving(true);
    if (editing) {
      const { error } = await supabase
        .from('prompt_templates')
        .update({ name, description: description || null, prompt_content: promptContent, active } as any)
        .eq('id', editing.id);
      if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      else toast({ title: 'Template atualizado!' });
    } else {
      const { error } = await supabase
        .from('prompt_templates')
        .insert({ name, description: description || null, prompt_content: promptContent, active } as any);
      if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      else toast({ title: 'Template criado!' });
    }
    setSaving(false);
    setDialogOpen(false);
    fetchTemplates();
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este template?')) return;
    await supabase.from('prompt_templates').delete().eq('id', id);
    toast({ title: 'Template excluído' });
    fetchTemplates();
  }

  async function toggleActive(t: PromptTemplate) {
    await supabase.from('prompt_templates').update({ active: !t.active } as any).eq('id', t.id);
    fetchTemplates();
  }


  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-destructive" />
              Biblioteca de Prompts
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Crie templates de prompts que ficarão disponíveis para os lojistas selecionarem
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Template
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-10 text-muted-foreground animate-pulse">Carregando...</div>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Nenhum template cadastrado. Clique em "Novo Template" para começar.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {templates.map((t) => (
              <Card key={t.id} className={!t.active ? 'opacity-60' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-base flex items-center gap-2">
                        {t.name}
                        <Badge variant={t.active ? 'default' : 'secondary'} className="text-[10px]">
                          {t.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </CardTitle>
                      {t.description && (
                        <CardDescription>{t.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => toggleActive(t)} title={t.active ? 'Desativar' : 'Ativar'}>
                        <Switch checked={t.active} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs bg-muted/50 rounded-lg p-3 whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {t.prompt_content}
                  </pre>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar Template' : 'Novo Template de Prompt'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do Template *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Atendente de Salão de Beleza" />
              </div>
              <div className="space-y-2">
                <Label>Descrição (opcional)</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Breve descrição do template" />
              </div>
              <div className="space-y-2">
                <Label>Conteúdo do Prompt *</Label>
                <Textarea
                  value={promptContent}
                  onChange={(e) => setPromptContent(e.target.value)}
                  rows={10}
                  placeholder="Escreva o prompt completo que será usado pelo agente..."
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={active} onCheckedChange={setActive} />
                  <Label>Ativo</Label>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={handleSave} disabled={saving} className="gap-2">
                    <Save className="h-4 w-4" />
                    {saving ? 'Salvando...' : editing ? 'Atualizar' : 'Criar Template'}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
