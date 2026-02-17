import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  ScrollText, Search, Filter, RefreshCw, CalendarDays,
  LogIn, Calendar, Settings, Shield, User, Layers, Building2
} from 'lucide-react';

const categoryConfig: Record<string, { label: string; icon: any; color: string }> = {
  auth: { label: 'Autenticação', icon: LogIn, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30' },
  appointment: { label: 'Agendamento', icon: Calendar, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
  service: { label: 'Serviço', icon: Layers, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30' },
  staff: { label: 'Profissional', icon: User, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
  settings: { label: 'Configuração', icon: Settings, color: 'text-gray-600 bg-gray-50 dark:bg-gray-950/30' },
  lgpd: { label: 'LGPD', icon: Shield, color: 'text-red-600 bg-red-50 dark:bg-red-950/30' },
  general: { label: 'Geral', icon: ScrollText, color: 'text-muted-foreground bg-muted' },
};

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  const fetchData = async () => {
    setLoading(true);
    const [companiesRes] = await Promise.all([
      supabase.from('companies').select('id, name').order('name'),
    ]);
    setCompanies(companiesRes.data || []);

    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (categoryFilter !== 'all') query = query.eq('category', categoryFilter);
    if (companyFilter !== 'all') query = query.eq('company_id', companyFilter);
    if (dateFilter) query = query.gte('created_at', dateFilter + 'T00:00:00').lte('created_at', dateFilter + 'T23:59:59');

    const { data } = await query;
    setLogs(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [categoryFilter, companyFilter, dateFilter]);

  const companyMap = Object.fromEntries(companies.map(c => [c.id, c.name]));

  const filteredLogs = searchQuery.trim()
    ? logs.filter(l =>
        l.action?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        companyMap[l.company_id]?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        JSON.stringify(l.details)?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : logs;

  const grouped: Record<string, any[]> = {};
  filteredLogs.forEach(log => {
    const date = log.created_at.split('T')[0];
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(log);
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    const today = new Date().toISOString().split('T')[0];
    if (dateStr === today) return 'Hoje';
    return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  };

  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-destructive" />
              Logs & Auditoria Global
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Visão completa de todas as atividades da plataforma</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} className="self-start sm:self-auto gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: filteredLogs.length, icon: ScrollText, color: 'text-destructive' },
            { label: 'Logins', value: filteredLogs.filter(l => l.category === 'auth').length, icon: LogIn, color: 'text-blue-600' },
            { label: 'Agendamentos', value: filteredLogs.filter(l => l.category === 'appointment').length, icon: Calendar, color: 'text-emerald-600' },
            { label: 'Empresas', value: new Set(filteredLogs.map(l => l.company_id).filter(Boolean)).size, icon: Building2, color: 'text-purple-600' },
          ].map(s => (
            <Card key={s.label} className="rounded-xl">
              <CardContent className="p-3.5 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-extrabold leading-none">{s.value}</p>
                  <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar ação, e-mail, empresa..." className="pl-9 h-9 text-sm" />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[170px] h-9 text-sm">
              <Filter className="h-3 w-3 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              <SelectItem value="auth">Autenticação</SelectItem>
              <SelectItem value="appointment">Agendamento</SelectItem>
              <SelectItem value="service">Serviço</SelectItem>
              <SelectItem value="staff">Profissional</SelectItem>
              <SelectItem value="settings">Configuração</SelectItem>
              <SelectItem value="lgpd">LGPD</SelectItem>
            </SelectContent>
          </Select>
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-full sm:w-[200px] h-9 text-sm">
              <Building2 className="h-3 w-3 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas empresas</SelectItem>
              {companies.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="flex-1 sm:w-[160px] h-9 text-sm" />
            {dateFilter && <Button variant="ghost" size="sm" onClick={() => setDateFilter('')} className="h-9 px-2 text-xs">✕</Button>}
          </div>
        </div>

        {/* Logs */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-pulse text-muted-foreground text-sm">Carregando logs...</div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <Card className="rounded-2xl">
            <CardContent className="flex flex-col items-center justify-center py-16 px-4">
              <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <ScrollText className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-semibold text-sm">Nenhum log encontrado</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([date, items]) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-2.5">
                  <CalendarDays className="h-3.5 w-3.5 text-destructive" />
                  <h3 className="text-sm font-bold text-foreground">{formatDate(date)}</h3>
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-semibold">{items.length}</Badge>
                </div>
                <div className="grid gap-1.5">
                  {items.map(log => {
                    const cat = categoryConfig[log.category] || categoryConfig.general;
                    const CatIcon = cat.icon;
                    const company = companyMap[log.company_id];
                    return (
                      <div key={log.id} className="flex items-start gap-3 bg-card rounded-xl border px-3.5 py-2.5 hover:shadow-sm transition-shadow">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cat.color}`}>
                          <CatIcon className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">{log.action}</p>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                {company && (
                                  <span className="text-[11px] text-primary font-medium flex items-center gap-1">
                                    <Building2 className="h-2.5 w-2.5" />
                                    {company}
                                  </span>
                                )}
                                {log.user_email && (
                                  <span className="text-[11px] text-muted-foreground">{log.user_email}</span>
                                )}
                                {log.entity_type && (
                                  <span className="text-[11px] text-muted-foreground/60">
                                    {log.entity_type}{log.entity_id ? ` #${log.entity_id.slice(0, 8)}` : ''}
                                  </span>
                                )}
                              </div>
                              {log.details && Object.keys(log.details).length > 0 && (
                                <p className="text-[10px] text-muted-foreground/50 mt-1 truncate">
                                  {Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end flex-shrink-0">
                              <span className="text-[11px] text-muted-foreground font-medium">{formatTime(log.created_at)}</span>
                              <Badge variant="outline" className="text-[9px] h-4 mt-0.5 px-1">{cat.label}</Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
