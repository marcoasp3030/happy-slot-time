import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
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

  const fetch = async () => {
    if (!companyId) return;
    const { data } = await supabase.from('staff').select('*').eq('company_id', companyId).order('name');
    setStaff(data || []);
  };

  useEffect(() => { fetch(); }, [companyId]);

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
    fetch();
  };

  const handleToggle = async (s: any) => {
    await supabase.from('staff').update({ active: !s.active }).eq('id', s.id);
    fetch();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir?')) return;
    await supabase.from('staff').delete().eq('id', id);
    toast.success('Excluído');
    fetch();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Profissionais</h1>
            <p className="text-muted-foreground">Gerencie sua equipe</p>
          </div>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo profissional</Button>
        </div>

        {staff.length === 0 ? (
          <Card className="glass-card"><CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Nenhum profissional cadastrado</p>
            <Button className="mt-4" onClick={openNew}>Adicionar primeiro</Button>
          </CardContent></Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {staff.map((s) => (
              <Card key={s.id} className={`glass-card ${!s.active ? 'opacity-50' : ''}`}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{s.name}</h3>
                    </div>
                    <Switch checked={s.active} onCheckedChange={() => handleToggle(s)} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />Editar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(s.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Editar profissional' : 'Novo profissional'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Nome *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do profissional" /></div>
              <Button onClick={handleSave} className="w-full">{editing ? 'Salvar' : 'Adicionar'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
