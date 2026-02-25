import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tag, Search, Download, Users, Filter, RefreshCw, Trash2, Hash,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ContactTag {
  id: string;
  phone: string;
  name: string | null;
  tag: string;
  created_at: string;
  flow_id: string | null;
}

interface FlowOption {
  id: string;
  name: string;
}

export default function ContactTags() {
  const { companyId } = useAuth();
  const { toast } = useToast();

  const [tags, setTags] = useState<ContactTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('all');
  const [filterFlow, setFilterFlow] = useState('all');
  const [flows, setFlows] = useState<FlowOption[]>([]);

  const fetchData = async () => {
    if (!companyId) return;
    setLoading(true);

    const [tagsRes, flowsRes] = await Promise.all([
      supabase.from('contact_tags').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
      supabase.from('automation_flows').select('id, name').eq('company_id', companyId),
    ]);

    setTags(tagsRes.data || []);
    setFlows(flowsRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [companyId]);

  // Unique tags for filter
  const uniqueTags = useMemo(() => {
    const set = new Set(tags.map(t => t.tag));
    return Array.from(set).sort();
  }, [tags]);

  // Filtered list
  const filtered = useMemo(() => {
    return tags.filter(t => {
      if (filterTag !== 'all' && t.tag !== filterTag) return false;
      if (filterFlow !== 'all' && t.flow_id !== filterFlow) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (t.name || '').toLowerCase().includes(q) ||
          t.phone.includes(q) ||
          t.tag.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [tags, filterTag, filterFlow, search]);

  // Stats
  const stats = useMemo(() => {
    const uniqueContacts = new Set(tags.map(t => t.phone)).size;
    const uniqueTagsCount = new Set(tags.map(t => t.tag)).size;
    return { total: tags.length, uniqueContacts, uniqueTags: uniqueTagsCount };
  }, [tags]);

  // Export CSV
  const handleExport = () => {
    if (filtered.length === 0) {
      toast({ title: 'Nenhum dado para exportar', variant: 'destructive' });
      return;
    }

    const header = 'Nome,Telefone,Tag,Data\n';
    const rows = filtered.map(t =>
      `"${(t.name || '').replace(/"/g, '""')}","${t.phone}","${t.tag}","${new Date(t.created_at).toLocaleDateString('pt-BR')}"`
    ).join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contatos-tags-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `${filtered.length} registros exportados!` });
  };

  const handleDelete = async (id: string) => {
    await supabase.from('contact_tags').delete().eq('id', id);
    setTags(prev => prev.filter(t => t.id !== id));
    toast({ title: 'Tag removida' });
  };

  const flowName = (flowId: string | null) => {
    if (!flowId) return '—';
    return flows.find(f => f.id === flowId)?.name || 'Fluxo removido';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Tag className="h-6 w-6 text-primary" />
              Tags de Contatos
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Visualize e exporte contatos segmentados pelas automações
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </Button>
            <Button size="sm" onClick={handleExport} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Exportar CSV
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Total de registros', value: stats.total, icon: Hash, bgClass: 'bg-primary/10', iconClass: 'text-primary' },
            { label: 'Contatos únicos', value: stats.uniqueContacts, icon: Users, bgClass: 'bg-info/10', iconClass: 'text-info' },
            { label: 'Tags distintas', value: stats.uniqueTags, icon: Tag, bgClass: 'bg-amber-500/10', iconClass: 'text-amber-500' },
          ].map(s => (
            <Card key={s.label} className="border-0 shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`h-10 w-10 rounded-xl ${s.bgClass} flex items-center justify-center flex-shrink-0`}>
                  <s.icon className={`h-5 w-5 ${s.iconClass}`} />
                </div>
                <div>
                  <p className="text-xl font-extrabold tracking-tight">{s.value}</p>
                  <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, telefone ou tag..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterTag} onValueChange={setFilterTag}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Filtrar por tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as tags</SelectItem>
                  {uniqueTags.map(tag => (
                    <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {flows.length > 0 && (
                <Select value={filterFlow} onValueChange={setFilterFlow}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Filtrar por fluxo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os fluxos</SelectItem>
                    {flows.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 text-center text-muted-foreground animate-pulse">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <Tag className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {tags.length === 0 ? 'Nenhuma tag registrada ainda. As tags são criadas automaticamente pelas automações.' : 'Nenhum resultado encontrado para os filtros aplicados.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Tag</TableHead>
                      <TableHead>Fluxo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.slice(0, 200).map(t => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium text-sm">{t.name || '—'}</TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">{t.phone}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{t.tag}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{flowName(t.flow_id)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(t.created_at).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => handleDelete(t.id)} className="h-7 w-7">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filtered.length > 200 && (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    Exibindo 200 de {filtered.length} registros. Use os filtros ou exporte para ver todos.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
