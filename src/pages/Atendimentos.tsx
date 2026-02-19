import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Search,
  Phone,
  User,
  Building2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  RefreshCw,
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  XCircle,
  ChevronDown,
  Eye,
  Pencil,
  X,
} from 'lucide-react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PROBLEM_TYPES = [
  'Reclamação de Produto',
  'Reclamação da Loja',
  'Reclamação de Atendimento',
  'Problema de Entrega',
  'Solicitação de Reembolso',
  'Dúvida sobre Serviço',
  'Problema Técnico',
  'Outros',
];

const STATUS_CONFIG = {
  aberto: {
    label: 'Aberto',
    color: 'bg-warning/10 text-warning border-warning/30',
    icon: AlertCircle,
  },
  em_andamento: {
    label: 'Em Andamento',
    color: 'bg-primary/10 text-primary border-primary/30',
    icon: Clock,
  },
  resolvido: {
    label: 'Resolvido',
    color: 'bg-success/10 text-success border-success/30',
    icon: CheckCircle2,
  },
  encerrado: {
    label: 'Encerrado',
    color: 'bg-muted text-muted-foreground border-border',
    icon: XCircle,
  },
};

const PRIORITY_CONFIG = {
  baixa: { label: 'Baixa', color: 'bg-muted text-muted-foreground' },
  normal: { label: 'Normal', color: 'bg-primary/10 text-primary' },
  alta: { label: 'Alta', color: 'bg-warning/10 text-warning' },
  urgente: { label: 'Urgente', color: 'bg-destructive/10 text-destructive' },
};

type Atendimento = {
  id: string;
  company_id: string;
  phone: string;
  client_name: string | null;
  condominium_name: string | null;
  problem_type: string;
  description: string | null;
  status: string;
  priority: string;
  resolved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type FormData = {
  phone: string;
  client_name: string;
  condominium_name: string;
  problem_type: string;
  description: string;
  priority: string;
  notes: string;
};

const EMPTY_FORM: FormData = {
  phone: '',
  client_name: '',
  condominium_name: '',
  problem_type: '',
  description: '',
  priority: 'normal',
  notes: '',
};

function formatDate(dateStr: string) {
  const date = parseISO(dateStr);
  if (isToday(date)) return `Hoje, ${format(date, 'HH:mm')}`;
  if (isYesterday(date)) return `Ontem, ${format(date, 'HH:mm')}`;
  return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export default function Atendimentos() {
  const { companyId } = useAuth();
  const { toast } = useToast();

  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [priorityFilter, setPriorityFilter] = useState('todos');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Atendimento | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchAtendimentos = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('atendimentos' as any)
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
    } else {
      setAtendimentos((data as unknown as Atendimento[]) || []);
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    fetchAtendimentos();
  }, [fetchAtendimentos]);

  // Realtime
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel('atendimentos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimentos', filter: `company_id=eq.${companyId}` }, () => {
        fetchAtendimentos();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, fetchAtendimentos]);

  const filtered = atendimentos.filter((a) => {
    const matchSearch =
      !search ||
      a.phone.includes(search) ||
      a.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      a.condominium_name?.toLowerCase().includes(search.toLowerCase()) ||
      a.problem_type.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'todos' || a.status === statusFilter;
    const matchPriority = priorityFilter === 'todos' || a.priority === priorityFilter;
    return matchSearch && matchStatus && matchPriority;
  });

  // Stats
  const stats = {
    total: atendimentos.length,
    abertos: atendimentos.filter((a) => a.status === 'aberto').length,
    emAndamento: atendimentos.filter((a) => a.status === 'em_andamento').length,
    resolvidos: atendimentos.filter((a) => a.status === 'resolvido').length,
    urgentes: atendimentos.filter((a) => a.priority === 'urgente').length,
    hoje: atendimentos.filter((a) => isToday(parseISO(a.created_at))).length,
  };

  function openNew() {
    setFormData(EMPTY_FORM);
    setEditMode(false);
    setSelected(null);
    setDialogOpen(true);
  }

  function openEdit(a: Atendimento) {
    setFormData({
      phone: a.phone,
      client_name: a.client_name || '',
      condominium_name: a.condominium_name || '',
      problem_type: a.problem_type,
      description: a.description || '',
      priority: a.priority,
      notes: a.notes || '',
    });
    setSelected(a);
    setEditMode(true);
    setDialogOpen(true);
  }

  function openView(a: Atendimento) {
    setSelected(a);
    setViewDialogOpen(true);
  }

  async function handleSave() {
    if (!formData.phone.trim()) {
      toast({ title: 'Telefone obrigatório', description: 'Informe o número de contato.', variant: 'destructive' });
      return;
    }
    if (!formData.problem_type) {
      toast({ title: 'Tipo de problema obrigatório', description: 'Selecione o tipo de problema.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editMode && selected) {
        const { error } = await supabase
          .from('atendimentos' as any)
          .update({
            phone: formData.phone.trim(),
            client_name: formData.client_name.trim() || null,
            condominium_name: formData.condominium_name.trim() || null,
            problem_type: formData.problem_type,
            description: formData.description.trim() || null,
            priority: formData.priority,
            notes: formData.notes.trim() || null,
          } as any)
          .eq('id', selected.id);
        if (error) throw error;
        toast({ title: 'Atendimento atualizado com sucesso!' });
      } else {
        const { error } = await supabase
          .from('atendimentos' as any)
          .insert({
            company_id: companyId,
            phone: formData.phone.trim(),
            client_name: formData.client_name.trim() || null,
            condominium_name: formData.condominium_name.trim() || null,
            problem_type: formData.problem_type,
            description: formData.description.trim() || null,
            priority: formData.priority,
            notes: formData.notes.trim() || null,
          } as any);
        if (error) {
          if (error.code === '23505') {
            toast({
              title: 'Registro duplicado',
              description: 'Este cliente já possui um atendimento registrado hoje. Abra o registro existente para adicionar atualizações.',
              variant: 'destructive',
            });
            setSaving(false);
            return;
          }
          throw error;
        }
        toast({ title: 'Atendimento registrado com sucesso!' });
      }
      setDialogOpen(false);
      fetchAtendimentos();
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const extra: any = {};
    if (status === 'resolvido') extra.resolved_at = new Date().toISOString();
    const { error } = await supabase
      .from('atendimentos' as any)
      .update({ status, ...extra } as any)
      .eq('id', id);
    if (error) {
      toast({ title: 'Erro ao atualizar status', variant: 'destructive' });
    } else {
      toast({ title: 'Status atualizado!' });
      fetchAtendimentos();
      if (viewDialogOpen && selected?.id === id) {
        setSelected((prev) => prev ? { ...prev, status, ...extra } : prev);
      }
    }
  }

  const StatusBadge = ({ status }: { status: string }) => {
    const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.aberto;
    const Icon = cfg.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}>
        <Icon className="h-3 w-3" />
        {cfg.label}
      </span>
    );
  };

  const PriorityBadge = ({ priority }: { priority: string }) => {
    const cfg = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.normal;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>
        {cfg.label}
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Atendimentos</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Registro e acompanhamento de ocorrências e reclamações
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchAtendimentos} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Atendimento
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total', value: stats.total, icon: MessageSquare, color: 'text-foreground', bg: 'bg-muted/50' },
            { label: 'Hoje', value: stats.hoje, icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/5' },
            { label: 'Abertos', value: stats.abertos, icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Em Andamento', value: stats.emAndamento, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Resolvidos', value: stats.resolvidos, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Urgentes', value: stats.urgentes, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
          ].map((s) => (
            <Card key={s.label} className={`border-0 shadow-sm ${s.bg}`}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-background/60`}>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <div>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[11px] text-muted-foreground font-medium">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por telefone, cliente, condomínio ou problema..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px] gap-1">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="aberto">Aberto</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="resolvido">Resolvido</SelectItem>
                    <SelectItem value="encerrado">Encerrado</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Prioridade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="baixa">Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="shadow-sm overflow-hidden">
          <CardHeader className="border-b px-6 py-4">
            <CardTitle className="text-base font-semibold flex items-center justify-between">
              <span>Ocorrências Registradas</span>
              <span className="text-sm font-normal text-muted-foreground">{filtered.length} registro(s)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span>Carregando...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <MessageSquare className="h-10 w-10 opacity-20" />
                <div className="text-center">
                  <p className="font-medium">Nenhum atendimento encontrado</p>
                  <p className="text-sm">
                    {search || statusFilter !== 'todos' || priorityFilter !== 'todos'
                      ? 'Tente ajustar os filtros.'
                      : 'Clique em "Novo Atendimento" para registrar a primeira ocorrência.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="font-semibold">Contato</TableHead>
                      <TableHead className="font-semibold">Condomínio</TableHead>
                      <TableHead className="font-semibold">Tipo do Problema</TableHead>
                      <TableHead className="font-semibold">Prioridade</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold">Registrado em</TableHead>
                      <TableHead className="font-semibold text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((a) => (
                      <TableRow key={a.id} className="group hover:bg-muted/20 transition-colors">
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium text-sm">{a.phone}</span>
                            </div>
                            {a.client_name && (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <User className="h-3 w-3 flex-shrink-0" />
                                <span className="text-xs">{a.client_name}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {a.condominium_name ? (
                            <div className="flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-sm">{a.condominium_name}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{a.problem_type}</span>
                        </TableCell>
                        <TableCell>
                          <PriorityBadge priority={a.priority} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={a.status} />
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(a.created_at)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openView(a)}
                              title="Ver detalhes"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openEdit(a)}
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* New/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              {editMode ? 'Editar Atendimento' : 'Registrar Novo Atendimento'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-sm font-medium">
                  Número de Contato <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Ex: (11) 99999-9999"
                    value={formData.phone}
                    onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Nome do Cliente</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Se informado"
                    value={formData.client_name}
                    onChange={(e) => setFormData((f) => ({ ...f, client_name: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Condomínio / Local</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Nome do condomínio"
                    value={formData.condominium_name}
                    onChange={(e) => setFormData((f) => ({ ...f, condominium_name: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label className="text-sm font-medium">
                  Tipo do Problema <span className="text-destructive">*</span>
                </Label>
                <Select value={formData.problem_type} onValueChange={(v) => setFormData((f) => ({ ...f, problem_type: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PROBLEM_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label className="text-sm font-medium">Prioridade</Label>
                <Select value={formData.priority} onValueChange={(v) => setFormData((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">🟢 Baixa</SelectItem>
                    <SelectItem value="normal">🔵 Normal</SelectItem>
                    <SelectItem value="alta">🟠 Alta</SelectItem>
                    <SelectItem value="urgente">🔴 Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Descrição do Problema</Label>
              <Textarea
                placeholder="Descreva o problema relatado pelo cliente..."
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Observações Internas</Label>
              <Textarea
                placeholder="Anotações internas, próximos passos..."
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {editMode ? 'Salvar Alterações' : 'Registrar Ocorrência'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Detalhes do Atendimento
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              {/* Status & Priority row */}
              <div className="flex items-center gap-3 flex-wrap">
                <StatusBadge status={selected.status} />
                <PriorityBadge priority={selected.priority} />
                <span className="text-xs text-muted-foreground ml-auto">{formatDate(selected.created_at)}</span>
              </div>

              {/* Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/40 rounded-xl p-3 space-y-0.5">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">Telefone</p>
                  <p className="font-medium text-sm">{selected.phone}</p>
                </div>
                <div className="bg-muted/40 rounded-xl p-3 space-y-0.5">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">Cliente</p>
                  <p className="font-medium text-sm">{selected.client_name || '—'}</p>
                </div>
                <div className="bg-muted/40 rounded-xl p-3 space-y-0.5">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">Condomínio</p>
                  <p className="font-medium text-sm">{selected.condominium_name || '—'}</p>
                </div>
                <div className="bg-muted/40 rounded-xl p-3 space-y-0.5">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">Tipo</p>
                  <p className="font-medium text-sm">{selected.problem_type}</p>
                </div>
              </div>

              {selected.description && (
                <div className="bg-muted/40 rounded-xl p-3 space-y-1">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">Descrição</p>
                  <p className="text-sm">{selected.description}</p>
                </div>
              )}

              {selected.notes && (
                <div className="bg-warning/5 border border-warning/20 rounded-xl p-3 space-y-1">
                  <p className="text-[11px] text-warning uppercase tracking-wide font-semibold">Obs. Internas</p>
                  <p className="text-sm text-foreground">{selected.notes}</p>
                </div>
              )}

              {selected.resolved_at && (
                <p className="text-xs text-primary font-medium">
                  ✓ Resolvido em {formatDate(selected.resolved_at)}
                </p>
              )}

              {/* Status actions */}
              {selected.status !== 'encerrado' && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-2 font-medium">Alterar status:</p>
                  <div className="flex gap-2 flex-wrap">
                    {selected.status !== 'em_andamento' && (
                      <Button size="sm" variant="outline" className="text-primary border-primary/30 hover:bg-primary/5 gap-1.5" onClick={() => updateStatus(selected.id, 'em_andamento')}>
                        <Clock className="h-3.5 w-3.5" /> Em Andamento
                      </Button>
                    )}
                    {selected.status !== 'resolvido' && (
                      <Button size="sm" variant="outline" className="text-primary border-primary/30 hover:bg-primary/5 gap-1.5" onClick={() => updateStatus(selected.id, 'resolvido')}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Resolvido
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="text-muted-foreground gap-1.5" onClick={() => updateStatus(selected.id, 'encerrado')}>
                      <XCircle className="h-3.5 w-3.5" /> Encerrar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Fechar</Button>
            {selected && (
              <Button onClick={() => { setViewDialogOpen(false); openEdit(selected); }} className="gap-2">
                <Pencil className="h-4 w-4" /> Editar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
