import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Building2, Search, ExternalLink, Users, Calendar, Ban, CheckCircle, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';

interface Company {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  created_at: string;
  owner_id: string;
  blocked: boolean;
  blocked_reason: string | null;
}

export default function AdminCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'blocked'>('all');
  const [companyCounts, setCompanyCounts] = useState<Record<string, { services: number; staff: number; appointments: number }>>({});
  const [blockReason, setBlockReason] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Erro ao carregar empresas', variant: 'destructive' });
    } else {
      setCompanies(data || []);
      const counts: Record<string, { services: number; staff: number; appointments: number }> = {};
      for (const company of data || []) {
        const [svc, stf, apt] = await Promise.all([
          supabase.from('services').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
          supabase.from('staff').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
          supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        ]);
        counts[company.id] = {
          services: svc.count || 0,
          staff: stf.count || 0,
          appointments: apt.count || 0,
        };
      }
      setCompanyCounts(counts);
    }
    setLoading(false);
  };

  const toggleBlock = async (company: Company) => {
    const newBlocked = !company.blocked;
    const { error } = await supabase
      .from('companies')
      .update({
        blocked: newBlocked,
        blocked_reason: newBlocked ? blockReason : null,
      })
      .eq('id', company.id);

    if (error) {
      toast({ title: 'Erro ao atualizar empresa', variant: 'destructive' });
    } else {
      toast({ title: newBlocked ? 'Empresa bloqueada' : 'Empresa desbloqueada' });
      setBlockReason('');
      fetchCompanies();
    }
  };

  const deleteCompany = async (id: string) => {
    const { error } = await supabase.from('companies').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir empresa', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Empresa excluída' });
      fetchCompanies();
    }
  };

  const filtered = companies
    .filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.slug.toLowerCase().includes(search.toLowerCase())
    )
    .filter(c => {
      if (filter === 'active') return !c.blocked;
      if (filter === 'blocked') return c.blocked;
      return true;
    });

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="section-header">
          <h1 className="section-title">Empresas</h1>
          <p className="section-subtitle">Gerencie todas as empresas cadastradas na plataforma</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar empresa..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <div className="flex gap-2">
            {(['all', 'active', 'blocked'] as const).map(f => (
              <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)} className="text-xs">
                {f === 'all' ? `Todas (${companies.length})` : f === 'active' ? `Ativas (${companies.filter(c => !c.blocked).length})` : `Bloqueadas (${companies.filter(c => c.blocked).length})`}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((company) => (
              <Card key={company.id} className={`glass-card rounded-2xl overflow-hidden ${company.blocked ? 'border-destructive/30 opacity-75' : ''}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${company.blocked ? 'bg-destructive/10' : 'bg-primary/10'}`}>
                        <Building2 className={`h-5 w-5 ${company.blocked ? 'text-destructive' : 'text-primary'}`} />
                      </div>
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {company.name}
                          {company.blocked && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Bloqueada</Badge>}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">/{company.slug}</p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {company.blocked && company.blocked_reason && (
                    <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/10">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-destructive">{company.blocked_reason}</p>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Calendar className="h-3 w-3" />
                      {companyCounts[company.id]?.appointments || 0} agendamentos
                    </Badge>
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Users className="h-3 w-3" />
                      {companyCounts[company.id]?.staff || 0} profissionais
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/60">
                    <span className="text-xs text-muted-foreground">{formatDate(company.created_at)}</span>
                    <div className="flex items-center gap-1">
                      {company.blocked ? (
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-success hover:text-success" onClick={() => toggleBlock(company)}>
                          <CheckCircle className="h-3 w-3" /> Desbloquear
                        </Button>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive">
                              <Ban className="h-3 w-3" /> Bloquear
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Bloquear {company.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                A empresa não poderá mais acessar a plataforma. Informe o motivo:
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <Textarea
                              placeholder="Motivo do bloqueio (opcional)..."
                              value={blockReason}
                              onChange={(e) => setBlockReason(e.target.value)}
                              className="mt-2"
                            />
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => setBlockReason('')}>Cancelar</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => toggleBlock(company)}>
                                Bloquear empresa
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" asChild>
                        <a href={`/agendar/${company.slug}`} target="_blank" rel="noopener">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhuma empresa encontrada</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
