import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { useFormLabel } from '@/hooks/useFormLabel';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, GripVertical, ClipboardList, Pencil, FileText, ArrowLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface AnamnesisType {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
}

interface Template {
  id: string;
  anamnesis_type_id: string | null;
  service_id: string | null;
  field_label: string;
  field_type: string;
  field_options: string[] | null;
  sort_order: number;
  required: boolean;
  active: boolean;
}

// Sortable field card component
function SortableFieldCard({ template, index, fieldTypeLabels, onToggleActive, onEdit, onDelete }: {
  template: Template; index: number; fieldTypeLabels: Record<string, string>;
  onToggleActive: (t: Template) => void; onEdit: (t: Template) => void; onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: template.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined, opacity: isDragging ? 0.5 : undefined };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={`rounded-xl transition-all ${!template.active ? 'opacity-50' : ''}`}>
        <CardContent className="p-3.5 flex items-center gap-3">
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none p-1 -ml-1 text-muted-foreground hover:text-foreground transition-colors">
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-primary">{index + 1}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm truncate">{template.field_label}</p>
              {template.required && <Badge variant="destructive" className="text-[9px] h-4 px-1">Obrigatório</Badge>}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="secondary" className="text-[10px] h-4">{fieldTypeLabels[template.field_type] || template.field_type}</Badge>
              {template.field_options && (
                <span className="text-[10px] text-muted-foreground truncate">
                  {(template.field_options as string[]).join(', ')}
                </span>
              )}
            </div>
          </div>
          <Switch checked={template.active} onCheckedChange={() => onToggleActive(template)} />
          <button onClick={() => onEdit(template)} className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent transition-colors">
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </button>
          <button onClick={() => onDelete(template.id)} className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-destructive/10 transition-colors">
            <Trash2 className="h-3 w-3 text-destructive" />
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AnamnesisTemplates() {
  const { companyId } = useAuth();
  const formLabels = useFormLabel();

  // Types state
  const [types, setTypes] = useState<AnamnesisType[]>([]);
  const [selectedType, setSelectedType] = useState<AnamnesisType | null>(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [editingType, setEditingType] = useState<AnamnesisType | null>(null);
  const [typeForm, setTypeForm] = useState({ name: '', description: '' });
  const [deleteTypeTarget, setDeleteTypeTarget] = useState<AnamnesisType | null>(null);

  // Fields state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [editingField, setEditingField] = useState<Template | null>(null);
  const [fieldForm, setFieldForm] = useState({
    field_label: '', field_type: 'text', field_options: '', required: false,
  });

  const fieldTypeLabels: Record<string, string> = {
    text: 'Texto curto', textarea: 'Texto longo', select: 'Seleção', checkbox: 'Múltipla escolha', number: 'Número',
  };

  // Fetch types
  const fetchTypes = async () => {
    if (!companyId) return;
    const { data } = await supabase.from('anamnesis_types').select('*')
      .eq('company_id', companyId).order('created_at');
    setTypes((data as AnamnesisType[]) || []);
  };

  // Fetch fields for selected type
  const fetchFields = async (typeId: string) => {
    if (!companyId) return;
    const { data } = await supabase.from('anamnesis_templates').select('*')
      .eq('company_id', companyId).eq('anamnesis_type_id', typeId).order('sort_order');
    setTemplates((data as Template[]) || []);
  };

  useEffect(() => { fetchTypes(); }, [companyId]);

  // Type actions
  const openNewType = () => {
    setEditingType(null);
    setTypeForm({ name: '', description: '' });
    setTypeOpen(true);
  };

  const openEditType = (t: AnamnesisType) => {
    setEditingType(t);
    setTypeForm({ name: t.name, description: t.description || '' });
    setTypeOpen(true);
  };

  const saveType = async () => {
    if (!companyId || !typeForm.name.trim()) { toast.error('Preencha o nome'); return; }
    if (editingType) {
      const { error } = await supabase.from('anamnesis_types').update({
        name: typeForm.name.trim(),
        description: typeForm.description.trim() || null,
      }).eq('id', editingType.id);
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Tipo atualizado');
      // Update selectedType if it's the one being edited
      if (selectedType?.id === editingType.id) {
        setSelectedType({ ...selectedType, name: typeForm.name.trim(), description: typeForm.description.trim() || null });
      }
    } else {
      const { error } = await supabase.from('anamnesis_types').insert({
        company_id: companyId,
        name: typeForm.name.trim(),
        description: typeForm.description.trim() || null,
      });
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success(`${formLabels.typeLabel} criado`);
    }
    setTypeOpen(false);
    fetchTypes();
  };

  const deleteType = async () => {
    if (!deleteTypeTarget) return;
    // Fields will cascade delete
    const { error } = await supabase.from('anamnesis_types').delete().eq('id', deleteTypeTarget.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(`${formLabels.typeLabel} excluído`);
    if (selectedType?.id === deleteTypeTarget.id) setSelectedType(null);
    setDeleteTypeTarget(null);
    fetchTypes();
  };

  const toggleTypeActive = async (t: AnamnesisType) => {
    await supabase.from('anamnesis_types').update({ active: !t.active }).eq('id', t.id);
    fetchTypes();
  };

  const selectType = (t: AnamnesisType) => {
    setSelectedType(t);
    fetchFields(t.id);
  };

  // Field actions
  const openNewField = () => {
    setEditingField(null);
    setFieldForm({ field_label: '', field_type: 'text', field_options: '', required: false });
    setFieldOpen(true);
  };

  const openEditField = (f: Template) => {
    setEditingField(f);
    setFieldForm({
      field_label: f.field_label,
      field_type: f.field_type,
      field_options: Array.isArray(f.field_options) ? f.field_options.join(', ') : '',
      required: f.required,
    });
    setFieldOpen(true);
  };

  const saveField = async () => {
    if (!companyId || !selectedType || !fieldForm.field_label.trim()) {
      toast.error('Preencha o nome do campo'); return;
    }
    const payload = {
      company_id: companyId,
      anamnesis_type_id: selectedType.id,
      field_label: fieldForm.field_label.trim(),
      field_type: fieldForm.field_type,
      field_options: ['select', 'checkbox'].includes(fieldForm.field_type) && fieldForm.field_options
        ? fieldForm.field_options.split(',').map(o => o.trim()).filter(Boolean)
        : null,
      required: fieldForm.required,
      sort_order: editingField ? editingField.sort_order : templates.length,
    };

    if (editingField) {
      await supabase.from('anamnesis_templates').update(payload).eq('id', editingField.id);
      toast.success('Campo atualizado');
    } else {
      await supabase.from('anamnesis_templates').insert(payload);
      toast.success('Campo criado');
    }
    setFieldOpen(false);
    fetchFields(selectedType.id);
  };

  const deleteField = async (id: string) => {
    await supabase.from('anamnesis_templates').delete().eq('id', id);
    toast.success('Campo excluído');
    if (selectedType) fetchFields(selectedType.id);
  };

  const toggleFieldActive = async (f: Template) => {
    await supabase.from('anamnesis_templates').update({ active: !f.active }).eq('id', f.id);
    if (selectedType) fetchFields(selectedType.id);
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

  // Drag and drop
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !selectedType) return;
    const oldIndex = templates.findIndex(t => t.id === active.id);
    const newIndex = templates.findIndex(t => t.id === over.id);
    const reordered = arrayMove(templates, oldIndex, newIndex);
    setTemplates(reordered);
    // Persist new sort_order
    const updates = reordered.map((t, i) =>
      supabase.from('anamnesis_templates').update({ sort_order: i }).eq('id', t.id)
    );
    await Promise.all(updates);
  };

  // ====== TYPE DETAIL VIEW ======
  if (selectedType) {
    return (
      <DashboardLayout>
        <div className="space-y-5">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setSelectedType(null)}>
            <ArrowLeft className="h-3.5 w-3.5" />Voltar para tipos
          </Button>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {selectedType.name}
              </h1>
              {selectedType.description && (
                <p className="text-sm text-muted-foreground mt-0.5">{selectedType.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => openEditType(selectedType)}>
                <Pencil className="h-3 w-3" />Editar tipo
              </Button>
              <Button onClick={openNewField} className="gradient-primary border-0 font-semibold h-8 text-xs">
                <Plus className="h-3 w-3 mr-1" />Novo campo
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="rounded-xl"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total campos</p>
              <p className="text-lg font-bold">{templates.length}</p>
            </CardContent></Card>
            <Card className="rounded-xl"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Ativos</p>
              <p className="text-lg font-bold text-primary">{templates.filter(t => t.active).length}</p>
            </CardContent></Card>
            <Card className="rounded-xl"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Obrigatórios</p>
              <p className="text-lg font-bold">{templates.filter(t => t.required).length}</p>
            </CardContent></Card>
          </div>

          {/* Fields list */}
          {templates.length === 0 ? (
            <Card className="glass-card-static rounded-2xl">
              <CardContent className="py-12 text-center">
                <ClipboardList className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium text-sm">Nenhum campo configurado</p>
                <p className="text-xs text-muted-foreground/70 mt-1">{formLabels.emptyText}</p>
                <Button className="mt-4 gradient-primary border-0 text-sm" onClick={openNewField}>
                  <Plus className="h-4 w-4 mr-1" />Criar primeiro campo
                </Button>
              </CardContent>
            </Card>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={templates.map(t => t.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {templates.map((t, i) => (
                    <SortableFieldCard
                      key={t.id}
                      template={t}
                      index={i}
                      fieldTypeLabels={fieldTypeLabels}
                      onToggleActive={toggleFieldActive}
                      onEdit={openEditField}
                      onDelete={deleteField}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* FIELD DIALOG */}
        <Dialog open={fieldOpen} onOpenChange={setFieldOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-bold">{editingField ? 'Editar campo' : 'Novo campo'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Nome do campo *</Label>
                <Input value={fieldForm.field_label} onChange={(e) => setFieldForm({ ...fieldForm, field_label: e.target.value })} placeholder="Ex: Possui alergias?" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Tipo</Label>
                <Select value={fieldForm.field_type} onValueChange={(v) => setFieldForm({ ...fieldForm, field_type: v })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto curto</SelectItem>
                    <SelectItem value="textarea">Texto longo</SelectItem>
                    <SelectItem value="number">Número</SelectItem>
                    <SelectItem value="select">Seleção única</SelectItem>
                    <SelectItem value="checkbox">Múltipla escolha</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {['select', 'checkbox'].includes(fieldForm.field_type) && (
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Opções (separadas por vírgula)</Label>
                  <Input value={fieldForm.field_options} onChange={(e) => setFieldForm({ ...fieldForm, field_options: e.target.value })} placeholder="Sim, Não, Às vezes" className="h-10" />
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-sm">Campo obrigatório</Label>
                <Switch checked={fieldForm.required} onCheckedChange={(v) => setFieldForm({ ...fieldForm, required: v })} />
              </div>
              <Button onClick={saveField} className="w-full gradient-primary border-0 font-semibold h-10">
                {editingField ? 'Salvar' : 'Criar campo'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* TYPE EDIT DIALOG (reused) */}
        <Dialog open={typeOpen} onOpenChange={setTypeOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-md">
            <DialogHeader>
               <DialogTitle className="font-bold">{editingType ? `Editar ${formLabels.typeLabel}` : `Novo ${formLabels.typeLabel}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Nome *</Label>
                <Input value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} placeholder="Ex: Avaliação Facial" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">Descrição</Label>
                <Textarea value={typeForm.description} onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })} placeholder={`Descreva o propósito deste ${formLabels.singular.toLowerCase()}`} rows={2} />
              </div>
              <Button onClick={saveType} className="w-full gradient-primary border-0 font-semibold h-10">
                {editingType ? 'Salvar' : 'Criar tipo'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    );
  }

  // ====== TYPES LIST (main view) ======
  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="section-header mb-0">
            <h1 className="section-title flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
               {formLabels.configLabel}
             </h1>
             <p className="section-subtitle">Crie e gerencie diferentes tipos de {formLabels.singular.toLowerCase()}</p>
          </div>
          <Button onClick={openNewType} className="gradient-primary border-0 font-semibold self-start sm:self-auto">
            <Plus className="h-4 w-4 mr-2" />Novo tipo
          </Button>
        </div>

        {types.length === 0 ? (
          <Card className="glass-card-static rounded-2xl">
            <CardContent className="py-12 text-center">
              <ClipboardList className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Nenhum {formLabels.typeLabel.toLowerCase()} criado</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Crie tipos como "Avaliação Facial", "Avaliação Corporal", etc.</p>
              <Button className="mt-4 gradient-primary border-0" onClick={openNewType}>
                <Plus className="h-4 w-4 mr-1" />Criar primeiro tipo
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {types.map(t => (
              <Card key={t.id} className={`glass-card rounded-2xl transition-all cursor-pointer hover:shadow-md ${!t.active ? 'opacity-50' : ''}`} onClick={() => selectType(t)}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm truncate">{t.name}</h3>
                        <p className="text-[11px] text-muted-foreground">{formatDate(t.created_at)}</p>
                      </div>
                    </div>
                    <Switch checked={t.active} onCheckedChange={(e) => { e; toggleTypeActive(t); }} onClick={(e) => e.stopPropagation()} />
                  </div>
                  {t.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{t.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openEditType(t); }} className="text-xs h-7 px-2">
                        <Pencil className="h-3 w-3 mr-1" />Editar
                      </Button>
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setDeleteTypeTarget(t); }} className="text-xs h-7 px-2 text-destructive hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* NEW/EDIT TYPE DIALOG */}
      <Dialog open={typeOpen} onOpenChange={setTypeOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-bold">{editingType ? `Editar ${formLabels.typeLabel}` : `Novo ${formLabels.typeLabel}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="font-semibold text-sm">Nome *</Label>
              <Input value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} placeholder="Ex: Avaliação Facial" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold text-sm">Descrição</Label>
              <Textarea value={typeForm.description} onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })} placeholder={`Descreva o propósito deste ${formLabels.singular.toLowerCase()}`} rows={2} />
            </div>
            <Button onClick={saveType} className="w-full gradient-primary border-0 font-semibold h-10">
              {editingType ? 'Salvar' : 'Criar tipo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION */}
      <AlertDialog open={!!deleteTypeTarget} onOpenChange={() => setDeleteTypeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {formLabels.typeLabel.toLowerCase()}</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deleteTypeTarget?.name}"? Todos os campos associados também serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteType} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
