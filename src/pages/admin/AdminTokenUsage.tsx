import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Activity, DollarSign, Zap, TrendingUp, Search } from "lucide-react";
import { useEffect, useState as useStateHook } from "react";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function AdminTokenUsage() {
  const [period, setPeriod] = useState("30d");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [searchTenant, setSearchTenant] = useState("");
  const [usdBrl, setUsdBrl] = useStateHook<number>(5.70);

  useEffect(() => {
    fetch("https://open.er-api.com/v6/latest/USD")
      .then(r => r.json())
      .then(d => { if (d?.rates?.BRL) setUsdBrl(d.rates.BRL); })
      .catch(() => {});
  }, []);

  const dateFrom = period === "7d" ? subDays(new Date(), 7).toISOString()
    : period === "30d" ? subDays(new Date(), 30).toISOString()
    : period === "90d" ? subDays(new Date(), 90).toISOString()
    : startOfMonth(new Date()).toISOString();

  // Fetch usage logs
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["llm-usage-logs", period, tenantFilter],
    queryFn: async () => {
      let q = supabase.from("llm_usage_logs" as any).select("*").gte("created_at", dateFrom).order("created_at", { ascending: false }).limit(1000);
      if (tenantFilter !== "all") q = q.eq("company_id", tenantFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch companies for filter
  const { data: companies = [] } = useQuery({
    queryKey: ["admin-companies-list"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id, name").order("name");
      return data || [];
    },
  });

  // Fetch pricing
  const { data: pricing = [] } = useQuery({
    queryKey: ["llm-pricing"],
    queryFn: async () => {
      const { data } = await supabase.from("llm_model_pricing" as any).select("*").order("provider");
      return data as any[] || [];
    },
  });

  // Fetch limits
  const { data: limits = [] } = useQuery({
    queryKey: ["llm-limits"],
    queryFn: async () => {
      const { data } = await supabase.from("llm_usage_limits" as any).select("*");
      return data as any[] || [];
    },
  });

  // Aggregations
  const totalTokens = logs.reduce((s, l) => s + (l.total_tokens || 0), 0);
  const totalCost = logs.reduce((s, l) => s + Number(l.total_cost || 0), 0);
  const totalInput = logs.reduce((s, l) => s + (l.input_tokens || 0), 0);
  const totalOutput = logs.reduce((s, l) => s + (l.output_tokens || 0), 0);

  // By model
  const byModel: Record<string, { tokens: number; cost: number; count: number }> = {};
  logs.forEach(l => {
    const k = l.model || "unknown";
    if (!byModel[k]) byModel[k] = { tokens: 0, cost: 0, count: 0 };
    byModel[k].tokens += l.total_tokens || 0;
    byModel[k].cost += Number(l.total_cost || 0);
    byModel[k].count++;
  });
  const modelData = Object.entries(byModel).map(([model, v]) => ({ model, ...v })).sort((a, b) => b.tokens - a.tokens);

  // By company
  const byCompany: Record<string, { tokens: number; cost: number; count: number; name: string }> = {};
  logs.forEach(l => {
    const cid = l.company_id;
    if (!byCompany[cid]) {
      const co = companies.find(c => c.id === cid);
      byCompany[cid] = { tokens: 0, cost: 0, count: 0, name: co?.name || cid.substring(0, 8) };
    }
    byCompany[cid].tokens += l.total_tokens || 0;
    byCompany[cid].cost += Number(l.total_cost || 0);
    byCompany[cid].count++;
  });
  const companyData = Object.entries(byCompany)
    .map(([id, v]) => ({ id, ...v }))
    .filter(c => !searchTenant || c.name.toLowerCase().includes(searchTenant.toLowerCase()))
    .sort((a, b) => b.tokens - a.tokens);

  // Daily chart
  const byDay: Record<string, { tokens: number; cost: number }> = {};
  logs.forEach(l => {
    const d = (l.created_at || "").substring(0, 10);
    if (!byDay[d]) byDay[d] = { tokens: 0, cost: 0 };
    byDay[d].tokens += l.total_tokens || 0;
    byDay[d].cost += Number(l.total_cost || 0);
  });
  const dailyData = Object.entries(byDay).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));

  // Pie data
  const pieData = modelData.map(m => ({ name: m.model, value: m.tokens }));

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Consumo de Tokens LLM</h1>
            <p className="text-muted-foreground text-sm">Monitoramento de uso de IA por tenant e modelo</p>
          </div>
          <div className="flex gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
                <SelectItem value="month">Mês atual</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tenantFilter} onValueChange={setTenantFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Todos os tenants" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tenants</SelectItem>
                {companies.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Tokens</p>
                  <p className="text-2xl font-bold">{totalTokens.toLocaleString("pt-BR")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Custo Total</p>
                  <p className="text-2xl font-bold">US$ {totalCost.toFixed(4)}</p>
                  <p className="text-xs text-muted-foreground">≈ R$ {(totalCost * usdBrl).toFixed(4)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Requisições</p>
                  <p className="text-2xl font-bold">{logs.length.toLocaleString("pt-BR")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Input / Output</p>
                  <p className="text-lg font-bold">{totalInput.toLocaleString("pt-BR")} / {totalOutput.toLocaleString("pt-BR")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Consumo Diário</CardTitle></CardHeader>
            <CardContent>
              {dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(d) => { try { return format(new Date(d + "T12:00:00"), "dd/MM", { locale: ptBR }); } catch { return d; } }} />
                    <YAxis />
                    <Tooltip formatter={(v: number) => v.toLocaleString("pt-BR")} labelFormatter={(d) => { try { return format(new Date(d + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR }); } catch { return d; } }} />
                    <Bar dataKey="tokens" fill="hsl(var(--primary))" name="Tokens" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">Sem dados no período</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Por Modelo</CardTitle></CardHeader>
            <CardContent>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${(name || "").split("/").pop()} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {pieData.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                    </Pie>
                    <Tooltip formatter={(v: number) => v.toLocaleString("pt-BR") + " tokens"} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">Sem dados</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* By Company Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Consumo por Empresa</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar empresa..." value={searchTenant} onChange={e => setSearchTenant(e.target.value)} className="pl-9" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Requisições</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Custo (US$)</TableHead>
                  <TableHead className="text-right">Limite</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companyData.map(c => {
                  const limit = limits.find((l: any) => l.company_id === c.id);
                  const pct = limit ? (c.tokens / (limit.monthly_token_limit || 1)) * 100 : 0;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right">{c.count.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right">{c.tokens.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right">US$ {c.cost.toFixed(4)} <span className="text-muted-foreground text-xs">/ R$ {(c.cost * usdBrl).toFixed(4)}</span></TableCell>
                      <TableCell className="text-right">
                        {limit ? (
                          <Badge variant={pct >= 100 ? "destructive" : pct >= 80 ? "secondary" : "outline"}>
                            {pct.toFixed(0)}%
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">Sem limite</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {companyData.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{isLoading ? "Carregando..." : "Nenhum dado encontrado"}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* By Model Table */}
        <Card>
          <CardHeader><CardTitle className="text-base">Consumo por Modelo</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Requisições</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Custo (US$)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modelData.map(m => (
                  <TableRow key={m.model}>
                    <TableCell className="font-medium">{m.model}</TableCell>
                    <TableCell className="text-right">{m.count.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right">{m.tokens.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right">{m.cost.toFixed(4)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pricing Config */}
        <Card>
          <CardHeader><CardTitle className="text-base">Tabela de Preços por Modelo</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Input /1k tokens</TableHead>
                  <TableHead className="text-right">Output /1k tokens</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricing.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell><Badge variant="outline">{p.provider}</Badge></TableCell>
                    <TableCell className="font-medium">{p.model}</TableCell>
                    <TableCell className="text-right">US$ {Number(p.input_cost_per_1k).toFixed(5)}</TableCell>
                    <TableCell className="text-right">US$ {Number(p.output_cost_per_1k).toFixed(5)}</TableCell>
                    <TableCell><Badge variant={p.active ? "default" : "secondary"}>{p.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
