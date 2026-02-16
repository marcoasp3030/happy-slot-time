import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';

export default function Staff() {
  const { companyId } = useAuth();
  const [staff, setStaff] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');

  const fetchStaff = async () => {
    if (!companyId) return;
    const { data } = await supabase.from('staff').select('*').eq('company_id', companyId).order('name');
    setStaff(data || []);
  };

  useEffect(() => { fetchStaff(); }, [companyId]);

  const openNew = () => { setEditing(null); setName(''); setOpen(true); };
  const openEdit = (s: any) => { setEditing(s); setName(s.name); setOpen(true); };

  const handleSave = async () => {
    if (!companyId || !name.trim()) return;
    if (editing) {
      await supabase.from('staff').update({ name: name.trim() }).eq('id', editing.id);
      toast.success('Profissional atualizado');
    } else {
      await supabase.from('staff').insert({ company_id: companyId, name: name.trim() });
      toast.success('Profissional adicionado');
    }
    setOpen(false);
    fetchStaff();
  };

  const handleToggle = async (s: any) => {
    await supabase.from('staff').update({ active: !s.active }).eq('id', s.id);
    fetchStaff();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir?')) return;
    await supabase.from('staff').delete().eq('id', id);
    toast.success('Excluído');
    fetchStaff();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="section-header mb-0">
            <h1 className="section-title">Profissionais</h1>
            <p className="section-subtitle">Gerencie sua equipe</p>
          </div>
          <Button onClick={openNew} className="gradient-primary border-0 font-semibold self-start sm:self-auto">
            <Plus className="h-4 w-4 mr-2" />Novo profissional
          </Button>
        </div>

        {staff.length === 0 ? (
          <Card className="glass-card-static rounded-2xl">
            <CardContent className="py-12 text-center">
              <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">Nenhum profissional cadastrado</p>
              <Button className="mt-4 gradient-primary border-0" onClick={openNew}>Adicionar primeiro</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {staff.map((s) => (
              <Card key={s.id} className={`glass-card rounded-2xl ${!s.active ? 'opacity-50' : ''}`}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm truncate">{s.name}</h3>
                      <p className="text-xs text-muted-foreground">{s.active ? 'Ativo' : 'Inativo'}</p>
                    </div>
                    <Switch checked={s.active} onCheckedChange={() => handleToggle(s)} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(s)} className="text-xs h-8">
                      <Pencil className="h-3 w-3 mr-1" />Editar
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
          <DialogContent className="max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-bold">{editing ? 'Editar profissional' : 'Novo profissional'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Nome *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do profissional" className="h-10" />
              </div>
              <Button onClick={handleSave} className="w-full gradient-primary border-0 font-semibold h-10">
                {editing ? 'Salvar' : 'Adicionar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
