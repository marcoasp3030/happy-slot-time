import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Loader2, Wifi, WifiOff, QrCode, RefreshCw, Smartphone,
  CheckCircle2, Pencil, Trash2, X, Check
} from 'lucide-react';
import { toast } from 'sonner';
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

type ConnectionStatus = 'idle' | 'checking' | 'connecting' | 'polling' | 'connected' | 'error';

interface WhatsAppInstance {
  id: string;
  label: string;
  instance_name: string;
  status: string;
  phone_number: string | null;
  is_primary: boolean;
}

interface WhatsAppInstanceCardProps {
  instance: WhatsAppInstance;
  onDeleted: () => void;
  onUpdated: () => void;
}

export default function WhatsAppInstanceCard({ instance, onDeleted, onUpdated }: WhatsAppInstanceCardProps) {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectedPhone, setConnectedPhone] = useState<string | null>(instance.phone_number);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState(instance.label);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Always check real status from API on mount, regardless of DB value
    checkStatus();
    return () => stopPolling();
  }, []);

  const checkStatus = async () => {
    setStatus('checking');
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        `whatsapp-connect?action=status&instanceId=${instance.id}`, { method: 'GET' }
      );
      if (fnError || data?.needsCreate || data?.error) {
        setStatus('idle');
        return;
      }
      const inst = data?.data?.instance || data?.data;
      const st = inst?.status || 'disconnected';
      if (st === 'connected' || inst?.connected === true) {
        setStatus('connected');
        setConnectedPhone(inst?.phone || inst?.me?.id || connectedPhone);
        setQrCode(null);
        setPairCode(null);
      } else {
        setStatus('idle');
      }
    } catch {
      setStatus('idle');
    }
  };

  const startConnection = async (retryCount = 0) => {
    setStatus('connecting');
    setError(null);
    setQrCode(null);
    setPairCode(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        `whatsapp-connect?action=connect&instanceId=${instance.id}`,
        { method: 'POST', body: {} }
      );
      if (fnError) throw fnError;

      // If token was invalid, the backend recovers it — auto-retry once
      if (data?.needsRetry && retryCount < 1) {
        console.log('[WhatsApp] Token inválido, tentando novamente...');
        await new Promise(r => setTimeout(r, 1500));
        return startConnection(retryCount + 1);
      }

      if (!data?.success) throw new Error(data?.error || 'Falha ao iniciar conexão');

      setStatus('polling');
      startTimeRef.current = Date.now();
      startPolling();
    } catch (e: any) {
      setError(e.message || 'Erro ao conectar');
      setStatus('error');
    }
  };

  const startPolling = () => {
    stopPolling();
    pollStatus();
    pollingRef.current = setInterval(pollStatus, 3000);
  };

  const pollStatus = async () => {
    if (Date.now() - startTimeRef.current > 150000) {
      stopPolling();
      setStatus('error');
      setError('QR Code expirado. Clique para gerar um novo.');
      setQrCode(null);
      return;
    }

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        `whatsapp-connect?action=status&instanceId=${instance.id}`, { method: 'GET' }
      );
      if (fnError) throw fnError;

      const inst = data?.data?.instance || data?.data;
      const st = inst?.status || 'disconnected';

      if (st === 'connected' || inst?.connected === true) {
        stopPolling();
        setStatus('connected');
        setQrCode(null);
        setPairCode(null);
        setConnectedPhone(inst?.phone || inst?.me?.id || null);
        onUpdated();
        return;
      }

      if (inst?.qrcode) setQrCode(inst.qrcode);
      if (inst?.paircode) setPairCode(inst.paircode);
    } catch {
      // Continue polling on transient errors
    }
  };

  const handleDisconnect = async () => {
    try {
      await supabase.functions.invoke(
        `whatsapp-connect?action=disconnect&instanceId=${instance.id}`, { method: 'POST' }
      );
      setStatus('idle');
      setQrCode(null);
      setPairCode(null);
      setConnectedPhone(null);
      onUpdated();
    } catch {
      setError('Erro ao desconectar');
    }
  };

  const handleDelete = async () => {
    try {
      toast.loading('Removendo instância...');
      await supabase.functions.invoke(
        `whatsapp-connect?action=delete-instance&instanceId=${instance.id}`, { method: 'POST' }
      );
      toast.dismiss();
      toast.success('Instância removida');
      onDeleted();
    } catch {
      toast.dismiss();
      toast.error('Erro ao remover instância');
    }
  };

  const saveLabel = async () => {
    if (!labelValue.trim()) return;
    await supabase.functions.invoke(
      `whatsapp-connect?action=update-label&instanceId=${instance.id}`,
      { method: 'POST', body: { label: labelValue.trim() } }
    );
    setEditingLabel(false);
    onUpdated();
    toast.success('Nome atualizado');
  };

  const statusBadge = status === 'connected'
    ? <Badge variant="outline" className="text-xs gap-1 border-primary/40 text-primary bg-primary/10">🟢 Conectado</Badge>
    : status === 'polling'
    ? <Badge variant="secondary" className="text-xs">🔄 Conectando...</Badge>
    : status === 'checking'
    ? <Badge variant="secondary" className="text-xs gap-1"><Loader2 className="h-3 w-3 animate-spin" />Verificando</Badge>
    : <Badge variant="secondary" className="text-xs text-muted-foreground">⚪ Desconectado</Badge>;

  return (
    <Card className="glass-card-static rounded-2xl">
      <CardHeader className="px-4 sm:px-5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Smartphone className="h-4 w-4 text-primary flex-shrink-0" />
            {editingLabel ? (
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <Input
                  value={labelValue}
                  onChange={(e) => setLabelValue(e.target.value)}
                  className="h-7 text-sm py-0"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') saveLabel(); if (e.key === 'Escape') setEditingLabel(false); }}
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveLabel}><Check className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingLabel(false)}><X className="h-3.5 w-3.5" /></Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold text-sm truncate">{labelValue || instance.label}</span>
                {instance.is_primary && (
                  <span className="text-xs text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md flex-shrink-0">Principal</span>
                )}
                <Button size="icon" variant="ghost" className="h-6 w-6 flex-shrink-0" onClick={() => setEditingLabel(true)}>
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {statusBadge}
            {!instance.is_primary && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover instância?</AlertDialogTitle>
                    <AlertDialogDescription>
                      A instância <strong>{labelValue}</strong> será desconectada e removida permanentemente. Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Remover
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 sm:px-5 space-y-3">
        {status === 'checking' ? (
          <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm">Verificando conexão...</span>
          </div>
        ) : status === 'connected' ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">WhatsApp conectado!</p>
                {connectedPhone && (
                  <p className="text-xs text-muted-foreground">{connectedPhone}</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={async () => {
                toast.loading('Verificando...');
                await checkStatus();
                await supabase.functions.invoke(`whatsapp-connect?action=set-webhook&instanceId=${instance.id}`, { method: 'POST', body: {} });
                toast.dismiss();
                toast.success('Status verificado e webhook reconfigurado!');
              }}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Verificar
              </Button>
              <Button variant="outline" size="sm" onClick={handleDisconnect} className="text-destructive hover:text-destructive">
                <WifiOff className="h-3.5 w-3.5 mr-1.5" />
                Desconectar
              </Button>
            </div>
          </div>
        ) : status === 'polling' ? (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-4">
              {qrCode ? (
                <div className="p-2 bg-white rounded-xl shadow-md">
                  <img
                    src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                    alt="QR Code WhatsApp"
                    className="w-56 h-56 object-contain"
                  />
                </div>
              ) : (
                <div className="w-56 h-56 flex items-center justify-center bg-muted/30 rounded-xl border-2 border-dashed border-border">
                  <div className="text-center space-y-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                    <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
                  </div>
                </div>
              )}

              {pairCode && (
                <div className="text-center space-y-1">
                  <p className="text-xs text-muted-foreground">Código de pareamento:</p>
                  <p className="text-2xl font-mono font-bold tracking-widest text-primary">{pairCode}</p>
                </div>
              )}
            </div>

            <div className="bg-muted/60 rounded-xl p-3 text-sm space-y-1.5">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <QrCode className="h-4 w-4" /> Como conectar:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
                <li>Abra o <strong>WhatsApp</strong> no celular</li>
                <li>Acesse <strong>Dispositivos conectados</strong></li>
                <li>Toque em <strong>Conectar um dispositivo</strong></li>
                <li>Escaneie o QR Code acima</li>
              </ol>
            </div>

            <Button variant="outline" size="sm" onClick={() => startConnection()} className="w-full">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Gerar novo QR Code
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {error && (
              <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                {error}
              </div>
            )}
            <Button
              onClick={() => startConnection()}
              disabled={status === 'connecting'}
              className="gradient-primary border-0 font-semibold w-full"
              size="sm"
            >
              {status === 'connecting' ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Conectando...</>
              ) : (
                <><Wifi className="h-4 w-4 mr-2" />Conectar WhatsApp</>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
