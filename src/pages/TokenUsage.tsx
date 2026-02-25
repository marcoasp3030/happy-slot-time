import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Activity, DollarSign, Zap, TrendingUp, AlertTriangle } from "lucide-react";
import { format, subDays, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function TokenUsage() {
  const { companyId } = useAuth();
  const [period, setPeriod] = useState("30d");
  const [usdBrl, setUsdBrl] = useState(5.70);

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

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["my-llm-usage", period, companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("llm_usage_logs" as any)
        .select("*")
        .eq("company_id", companyId)
        .gte("created_at", dateFrom)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId,
  });

  const { data: limits } = useQuery({
    queryKey: ["my-llm-limits", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("llm_usage_limits" as any)
        .select("*")
        .eq("company_id", companyId)
        .single();
      return data as any;
    },
    enabled: !!companyId,
  });

  // Current month usage for limit progress
  const currentMonth = new Date().toISOString().substring(0, 7);
  const monthLogs = logs.filter(l => (l.created_at || "").startsWith(currentMonth));
  const monthTokens = monthLogs.reduce((s: number, l: any) => s + (l.total_tokens || 0), 0);
  const monthLimit = limits?.monthly_token_limit || 1000000;
  const monthPct = Math.min((monthTokens / monthLimit) * 100, 100);

  // Aggregations
  const totalTokens = logs.reduce((s: number, l: any) => s + (l.total_tokens || 0), 0);
  const totalCost = logs.reduce((s: number, l: any) => s + Number(l.total_cost || 0), 0);
  const totalInput = logs.reduce((s: number, l: any) => s + (l.input_tokens || 0), 0);
  const totalOutput = logs.reduce((s: number, l: any) => s + (l.output_tokens || 0), 0);

  // By model
  const byModel: Record<string, { tokens: number; cost: number; count: number }> = {};
  logs.forEach((l: any) => {
    const k = l.model || "unknown";
    if (!byModel[k]) byModel[k] = { tokens: 0, cost: 0, count: 0 };
    byModel[k].tokens += l.total_tokens || 0;
    byModel[k].cost += Number(l.total_cost || 0);
    byModel[k].count++;
  });
  const modelData = Object.entries(byModel).map(([model, v]) => ({ model, ...v })).sort((a, b) => b.tokens - a.tokens);

  // Daily chart
  const byDay: Record<string, { tokens: number; cost: number }> = {};
  logs.forEach((l: any) => {
    const d = (l.created_at || "").substring(0, 10);
    if (!byDay[d]) byDay[d] = { tokens: 0, cost: 0 };
    byDay[d].tokens += l.total_tokens || 0;
    byDay[d].cost += Number(l.total_cost || 0);
  });
  const dailyData = Object.entries(byDay).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));

  const pieData = modelData.map(m => ({ name: m.model, value: m.tokens }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Consumo de Tokens</h1>
            <p className="text-muted-foreground text-sm">Acompanhe o uso de IA do seu agente</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="month">Mês atual</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Monthly limit progress */}
        {limits && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {monthPct >= 80 && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                  <span className="text-sm font-medium">Limite Mensal</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {monthTokens.toLocaleString("pt-BR")} / {monthLimit.toLocaleString("pt-BR")} tokens
                </span>
              </div>
              <Progress value={monthPct} className="h-3" />
              <p className="text-xs text-muted-foreground mt-1">
                {monthPct.toFixed(1)}% utilizado no mês atual
                {monthPct >= 80 && monthPct < 100 && " — ⚠️ Atenção: consumo alto!"}
                {monthPct >= 100 && " — 🚨 Limite atingido!"}
              </p>
            </CardContent>
          </Card>
        )}

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
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-emerald-500" />
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
                <div className="h-10 w-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-sky-500" />
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
                <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-violet-500" />
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
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(d) => { try { return format(new Date(d + "T12:00:00"), "dd/MM", { locale: ptBR }); } catch { return d; } }} />
                    <YAxis />
                    <Tooltip formatter={(v: number) => v.toLocaleString("pt-BR")} labelFormatter={(d) => { try { return format(new Date(d + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR }); } catch { return d; } }} />
                    <Bar dataKey="tokens" fill="hsl(var(--primary))" name="Tokens" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                  {isLoading ? "Carregando..." : "Sem dados no período selecionado"}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Por Modelo</CardTitle></CardHeader>
            <CardContent>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={85} dataKey="value" label={({ name, percent }) => `${(name || "").split("/").pop()} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {pieData.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                    </Pie>
                    <Tooltip formatter={(v: number) => v.toLocaleString("pt-BR") + " tokens"} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground">Sem dados</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* By Model Table */}
        <Card>
          <CardHeader><CardTitle className="text-base">Detalhamento por Modelo</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Requisições</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Custo (US$)</TableHead>
                  <TableHead className="text-right">Custo (R$)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modelData.map(m => (
                  <TableRow key={m.model}>
                    <TableCell className="font-medium">{m.model}</TableCell>
                    <TableCell className="text-right">{m.count.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right">{m.tokens.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right">{m.cost.toFixed(4)}</TableCell>
                    <TableCell className="text-right">{(m.cost * usdBrl).toFixed(4)}</TableCell>
                  </TableRow>
                ))}
                {modelData.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{isLoading ? "Carregando..." : "Nenhum registro encontrado"}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recent logs */}
        <Card>
          <CardHeader><CardTitle className="text-base">Últimas Requisições</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Input</TableHead>
                  <TableHead className="text-right">Output</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.slice(0, 20).map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{(() => { try { return format(new Date(l.created_at), "dd/MM HH:mm", { locale: ptBR }); } catch { return l.created_at; } })()}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{l.model}</Badge></TableCell>
                    <TableCell className="text-right text-xs">{(l.input_tokens || 0).toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right text-xs">{(l.output_tokens || 0).toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{(l.total_tokens || 0).toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right text-xs">US$ {Number(l.total_cost || 0).toFixed(5)}</TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{isLoading ? "Carregando..." : "Nenhum registro encontrado"}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
