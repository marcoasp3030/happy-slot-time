import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Smartphone, Clock, CheckCheck, Loader2, RefreshCw,
  MessageSquare, AlertTriangle, Wifi, WifiOff, Activity,
} from 'lucide-react';

interface InstanceStats {
  id: string;
  label: string;
  instance_name: string;
  status: string;
  phone_number: string | null;
  is_primary: boolean;
  pending: number;       // incoming, not yet answered
  processing: number;    // delivery_status = 'processing' or placeholder
  responded: number;     // outgoing sent/delivered/read
  failed: number;        // delivery_status = 'failed'
  total: number;
  lastActivity: string | null;
  activeConversations: number;
  handoffCount: number;
}

interface Props {
  companyId: string;
}

function statusColor(status: string) {
  if (status === 'connected') return 'text-emerald-500';
  if (status === 'connecting') return 'text-amber-500';
  return 'text-muted-foreground';
}

function StatusDot({ status }: { status: string }) {
  const base = 'h-2.5 w-2.5 rounded-full flex-shrink-0';
  if (status === 'connected') return <span className={`${base} bg-emerald-500 shadow-[0_0_6px_2px_rgba(16,185,129,0.4)]`} />;
  if (status === 'connecting') return <span className={`${base} bg-amber-400 animate-pulse`} />;
  return <span className={`${base} bg-muted-foreground/40`} />;
}

function QueuePill({ label, count, variant }: { label: string; count: number; variant: 'pending' | 'processing' | 'responded' | 'failed' }) {
  const styles = {
    pending: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    processing: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
    responded: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    failed: 'bg-destructive/10 text-destructive border-destructive/20',
  };
  return (
    <div className={`flex flex-col items-center justify-center rounded-lg border px-3 py-2 min-w-[72px] ${styles[variant]}`}>
      <span className="text-xl font-bold leading-tight">{count}</span>
      <span className="text-[10px] font-medium leading-tight mt-0.5 whitespace-nowrap">{label}</span>
    </div>
  );
}

export default function InstanceQueueMonitor({ companyId }: Props) {
  const [stats, setStats] = useState<InstanceStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      // Fetch all instances
      const { data: instances } = await supabase
        .from('whatsapp_instances')
        .select('id, label, instance_name, status, phone_number, is_primary')
        .eq('company_id', companyId)
        .order('is_primary', { ascending: false });

      if (!instances || instances.length === 0) {
        setStats([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Fetch message stats from the last 24h (via conversation join)
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Fetch conversations per instance (all time for active/handoff counts)
      const { data: convs } = await supabase
        .from('whatsapp_conversations')
        .select('id, instance_id, status, handoff_requested, last_message_at')
        .eq('company_id', companyId);

      const allConvs = convs || [];

      // Fetch messages for conversations in last 24h (join via conversation_id)
      const convIds = allConvs.map((c) => c.id);
      let msgs: Array<{ id: string; conversation_id: string; direction: string; delivery_status: string; created_at: string }> = [];
      if (convIds.length > 0) {
        const { data: messages } = await supabase
          .from('whatsapp_messages')
          .select('id, conversation_id, direction, delivery_status, created_at')
          .in('conversation_id', convIds)
          .gte('created_at', since);
        msgs = messages || [];
      }

      // Build a map: conversation_id -> instance_id for fast lookup
      const convToInstance: Record<string, string | null> = {};
      allConvs.forEach((c) => { convToInstance[c.id] = c.instance_id; });

      const built: InstanceStats[] = instances.map((inst) => {
        const instMsgs = msgs.filter((m) => convToInstance[m.conversation_id] === inst.id);
        const instConvs = allConvs.filter((c) => c.instance_id === inst.id);

        // Pending = incoming messages not yet responded (delivery_status other than failed)
        const pending = instMsgs.filter(
          (m) => m.direction === 'incoming' && (m.delivery_status === 'pending' || m.delivery_status === 'received')
        ).length;

        // Processing = placeholder messages or delivery_status = 'processing'
        const processing = instMsgs.filter(
          (m) => m.delivery_status === 'processing' || (m.direction === 'incoming' && m.delivery_status === 'locking')
        ).length;

        // Responded = outgoing messages sent/delivered/read in last 24h
        const responded = instMsgs.filter(
          (m) => m.direction === 'outgoing' && ['sent', 'delivered', 'read'].includes(m.delivery_status)
        ).length;

        // Failed = delivery failed
        const failed = instMsgs.filter((m) => m.delivery_status === 'failed').length;

        const total = instMsgs.length;

        // Last activity = most recent message timestamp
        const sortedMsgs = [...instMsgs].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const lastActivity = sortedMsgs[0]?.created_at || null;

        const activeConversations = instConvs.filter((c) => c.status === 'active').length;
        const handoffCount = instConvs.filter((c) => c.handoff_requested).length;

        return {
          ...inst,
          pending,
          processing,
          responded,
          failed,
          total,
          lastActivity,
          activeConversations,
          handoffCount,
        };
      });

      setStats(built);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId]);

  // Initial load
  useEffect(() => {
    fetchStats(false);
  }, [fetchStats]);

  // Realtime subscription to whatsapp_messages
  useEffect(() => {
    const channel = supabase
      .channel(`queue-monitor-${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_messages', filter: `company_id=eq.${companyId}` },
        () => { fetchStats(true); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_conversations', filter: `company_id=eq.${companyId}` },
        () => { fetchStats(true); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'whatsapp_instances', filter: `company_id=eq.${companyId}` },
        () => { fetchStats(true); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [companyId, fetchStats]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Card key={i} className="glass-card-static rounded-2xl">
            <CardContent className="p-5 space-y-4">
              <Skeleton className="h-5 w-40" />
              <div className="flex gap-3">
                {[1, 2, 3, 4].map((j) => <Skeleton key={j} className="h-16 w-20 rounded-lg" />)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <Card className="glass-card-static rounded-2xl">
        <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
          <Smartphone className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Nenhuma instância configurada ainda.</p>
        </CardContent>
      </Card>
    );
  }

  // Global totals
  const globalPending = stats.reduce((s, i) => s + i.pending, 0);
  const globalProcessing = stats.reduce((s, i) => s + i.processing, 0);
  const globalResponded = stats.reduce((s, i) => s + i.responded, 0);
  const globalFailed = stats.reduce((s, i) => s + i.failed, 0);
  const globalHandoff = stats.reduce((s, i) => s + i.handoffCount, 0);
  const connectedCount = stats.filter((i) => i.status === 'connected').length;

  return (
    <div className="space-y-5">
      {/* Header with last updated + refresh */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Monitoramento em Tempo Real</span>
          {connectedCount > 0 && (
            <Badge variant="default" className="text-xs h-5 gap-1">
              <Wifi className="h-2.5 w-2.5" /> {connectedCount} conectada{connectedCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[11px] text-muted-foreground">
              Atualizado {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => fetchStats(false)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Global summary bar */}
      <Card className="glass-card-static rounded-2xl border-primary/20 bg-primary/5">
        <CardContent className="py-4 px-5">
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Resumo geral — últimas 24h</p>
          <div className="flex flex-wrap gap-3">
            <QueuePill label="Pendentes" count={globalPending} variant="pending" />
            <QueuePill label="Processando" count={globalProcessing} variant="processing" />
            <QueuePill label="Respondidas" count={globalResponded} variant="responded" />
            {globalFailed > 0 && <QueuePill label="Falhas" count={globalFailed} variant="failed" />}
            {globalHandoff > 0 && (
              <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 min-w-[72px]">
                <span className="text-xl font-bold leading-tight text-destructive">{globalHandoff}</span>
                <span className="text-[10px] font-medium leading-tight mt-0.5 text-destructive whitespace-nowrap">Handoffs</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Per-instance cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {stats.map((inst) => (
          <Card key={inst.id} className="glass-card-static rounded-2xl">
            <CardHeader className="px-5 pb-3 pt-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <StatusDot status={inst.status} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <CardTitle className="text-sm font-semibold">
                        {inst.label || inst.instance_name}
                      </CardTitle>
                      {inst.is_primary && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0">Principal</Badge>
                      )}
                    </div>
                    {inst.phone_number && (
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{inst.phone_number}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <Badge
                    variant={inst.status === 'connected' ? 'default' : 'secondary'}
                    className={`text-[10px] h-5 ${inst.status === 'connected' ? '' : 'text-muted-foreground'}`}
                  >
                    {inst.status === 'connected' ? (
                      <><Wifi className="h-2.5 w-2.5 mr-1" />Conectada</>
                    ) : inst.status === 'connecting' ? (
                      <><Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />Conectando</>
                    ) : (
                      <><WifiOff className="h-2.5 w-2.5 mr-1" />Desconectada</>
                    )}
                  </Badge>
                  {inst.activeConversations > 0 && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <MessageSquare className="h-2.5 w-2.5" />
                      {inst.activeConversations} ativa{inst.activeConversations !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="px-5 pb-4 space-y-4">
              {/* Queue pills */}
              <div className="flex flex-wrap gap-2">
                <QueuePill label="Pendentes" count={inst.pending} variant="pending" />
                <QueuePill label="Processando" count={inst.processing} variant="processing" />
                <QueuePill label="Respondidas" count={inst.responded} variant="responded" />
                {inst.failed > 0 && (
                  <QueuePill label="Falhas" count={inst.failed} variant="failed" />
                )}
              </div>

              {/* Alerts */}
              {inst.handoffCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                  <p className="text-xs text-destructive font-medium">
                    {inst.handoffCount} conversa{inst.handoffCount !== 1 ? 's' : ''} aguardando handoff humano
                  </p>
                </div>
              )}

              {inst.status !== 'connected' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/40">
                  <WifiOff className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Instância desconectada — mensagens não serão processadas
                  </p>
                </div>
              )}

              {/* Stats footer */}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span className="flex items-center gap-1">
                  <CheckCheck className="h-3 w-3" />
                  {inst.total} mensagens nas últimas 24h
                </span>
                {inst.lastActivity && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatRelative(inst.lastActivity)}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s atrás`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
