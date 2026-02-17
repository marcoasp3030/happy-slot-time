import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Building2, Search, ExternalLink, Users, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Company {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  created_at: string;
  owner_id: string;
}

export default function AdminCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [companyCounts, setCompanyCounts] = useState<Record<string, { services: number; staff: number; appointments: number }>>({});
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
      // Fetch counts for each company
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

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="section-header">
          <h1 className="section-title">Empresas</h1>
          <p className="section-subtitle">Gerencie todas as empresas cadastradas na plataforma</p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((company) => (
              <Card key={company.id} className="glass-card rounded-2xl overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{company.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">/{company.slug}</p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
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
                    <span className="text-xs text-muted-foreground">Criada em {formatDate(company.created_at)}</span>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" asChild>
                      <a href={`/agendar/${company.slug}`} target="_blank" rel="noopener">
                        <ExternalLink className="h-3 w-3" /> Ver página
                      </a>
                    </Button>
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
