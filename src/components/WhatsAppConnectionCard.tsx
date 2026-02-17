import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wifi, WifiOff, QrCode, RefreshCw, Smartphone, CheckCircle2, Plus } from 'lucide-react';

type ConnectionStatus = 'idle' | 'creating' | 'connecting' | 'polling' | 'connected' | 'error' | 'needs-instance';

interface WhatsAppConnectionCardProps {
  hasCredentials: boolean;
  hasInstanceToken: boolean;
  hasAdminToken: boolean;
  onInstanceCreated?: () => void;
}

export default function WhatsAppConnectionCard({ hasCredentials, hasInstanceToken, hasAdminToken, onInstanceCreated }: WhatsAppConnectionCardProps) {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectedPhone, setConnectedPhone] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (hasCredentials && hasInstanceToken) {
      checkStatus();
    } else if (hasCredentials && !hasInstanceToken) {
      setStatus('needs-instance');
    }
    return () => stopPolling();
  }, [hasCredentials, hasInstanceToken]);

  const checkStatus = async () => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke('whatsapp-connect?action=status', {
        method: 'GET',
      });
      if (fnError) throw fnError;

      if (data?.error && data?.needsCreate) {
        setStatus('needs-instance');
        return;
      }

      const instance = data?.data?.instance || data?.data;
      const st = instance?.status || 'disconnected';

      if (st === 'connected' || instance?.connected === true) {
        setStatus('connected');
        setConnectedPhone(instance?.phone || instance?.me?.id || null);
        setQrCode(null);
        setPairCode(null);
      } else {
        setStatus('idle');
      }
    } catch {
      setStatus('idle');
    }
  };

  const createInstance = async () => {
    setStatus('creating');
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('whatsapp-connect?action=create', {
        method: 'POST',
        body: {},
      });

      if (fnError) throw fnError;
      if (!data?.success) throw new Error(data?.error || 'Falha ao criar instância');

      // Notify parent to refresh settings (new token saved)
      onInstanceCreated?.();
      
      // After creation, start connection automatically
      setStatus('idle');
      setTimeout(() => startConnection(), 1000);
    } catch (e: any) {
      setError(e.message || 'Erro ao criar instância');
      setStatus('error');
    }
  };

  const startConnection = async () => {
    setStatus('connecting');
    setError(null);
    setQrCode(null);
    setPairCode(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('whatsapp-connect?action=connect', {
        method: 'POST',
        body: {},
      });

      if (fnError) throw fnError;
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
      const { data, error: fnError } = await supabase.functions.invoke('whatsapp-connect?action=status', {
        method: 'GET',
      });
      if (fnError) throw fnError;

      const instance = data?.data?.instance || data?.data;
      const st = instance?.status || 'disconnected';

      if (st === 'connected' || instance?.connected === true) {
        stopPolling();
        setStatus('connected');
        setQrCode(null);
        setPairCode(null);
        setConnectedPhone(instance?.phone || instance?.me?.id || null);
        return;
      }

      if (instance?.qrcode) {
        setQrCode(instance.qrcode);
      }
      if (instance?.paircode) {
        setPairCode(instance.paircode);
      }
    } catch {
      // Continue polling on transient errors
    }
  };

  const handleDisconnect = async () => {
    try {
      await supabase.functions.invoke('whatsapp-connect?action=disconnect', {
        method: 'POST',
      });
      setStatus('idle');
      setQrCode(null);
      setPairCode(null);
      setConnectedPhone(null);
    } catch {
      setError('Erro ao desconectar');
    }
  };

  if (!hasCredentials) {
    return (
      <Card className="glass-card-static rounded-2xl">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="text-lg flex items-center gap-2">
            <Smartphone className="h-4.5 w-4.5 text-muted-foreground" />
            Conexão WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          <p className="text-sm text-muted-foreground">
            Configure a URL base e o Admin Token da UAZAPI acima antes de conectar o WhatsApp.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card-static rounded-2xl">
      <CardHeader className="px-4 sm:px-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Smartphone className="h-4.5 w-4.5 text-primary" />
            Conexão WhatsApp
          </CardTitle>
          <Badge variant={status === 'connected' ? 'default' : 'secondary'}>
            {status === 'connected' ? '🟢 Conectado' : status === 'needs-instance' ? '🟡 Sem instância' : '⚪ Desconectado'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 sm:px-6 space-y-4">
        {/* Needs instance creation */}
        {status === 'needs-instance' ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Nenhuma instância encontrada. Crie uma instância para conectar seu WhatsApp.
            </p>
            {error && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                {error}
              </div>
            )}
            <Button
              onClick={createInstance}
              disabled={!hasAdminToken}
              className="gradient-primary border-0 font-semibold"
            >
              <Plus className="h-4 w-4 mr-2" />
              Criar Instância
            </Button>
            {!hasAdminToken && (
              <p className="text-xs text-destructive">Configure o Admin Token acima para criar instâncias.</p>
            )}
          </div>
        ) : status === 'creating' ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/40">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Criando instância na UAZAPI...</p>
          </div>
        ) : status === 'connected' ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium">WhatsApp conectado com sucesso!</p>
                {connectedPhone && (
                  <p className="text-sm text-muted-foreground">{connectedPhone}</p>
                )}
              </div>
            </div>
            <Button variant="outline" onClick={handleDisconnect} className="text-destructive hover:text-destructive">
              <WifiOff className="h-4 w-4 mr-2" />
              Desconectar
            </Button>
          </div>
        ) : status === 'polling' ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-4">
              {qrCode ? (
                <div className="p-3 bg-white rounded-xl shadow-md">
                  <img
                    src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                    alt="QR Code WhatsApp"
                    className="w-64 h-64 object-contain"
                  />
                </div>
              ) : (
                <div className="w-64 h-64 flex items-center justify-center bg-muted/30 rounded-xl border-2 border-dashed border-border">
                  <div className="text-center space-y-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                    <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
                  </div>
                </div>
              )}

              {pairCode && (
                <div className="text-center space-y-1">
                  <p className="text-xs text-muted-foreground">Ou use o código de pareamento:</p>
                  <p className="text-2xl font-mono font-bold tracking-widest text-primary">{pairCode}</p>
                  <p className="text-xs text-muted-foreground">Expira em 5 minutos</p>
                </div>
              )}
            </div>

            <div className="bg-muted/60 rounded-xl p-4 text-sm space-y-2">
              <p className="font-semibold text-foreground flex items-center gap-2">
                <QrCode className="h-4 w-4" /> Como conectar:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Abra o <strong>WhatsApp</strong> no seu celular</li>
                <li>Acesse <strong>Dispositivos conectados</strong></li>
                <li>Toque em <strong>Conectar um dispositivo</strong></li>
                <li>Escaneie o QR Code acima {pairCode && 'ou use a opção "Inserir código"'}</li>
              </ol>
              <p className="text-xs text-muted-foreground mt-2">
                ⏱️ O QR Code expira em 2 minutos. Se expirar, clique em "Gerar novo QR Code".
              </p>
            </div>

            <Button variant="outline" onClick={startConnection} className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              Gerar novo QR Code
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                {error}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Conecte seu WhatsApp escaneando um QR Code. Não é necessário nenhuma configuração técnica.
            </p>
            <Button
              onClick={startConnection}
              disabled={status === 'connecting'}
              className="gradient-primary border-0 font-semibold"
            >
              {status === 'connecting' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Iniciando...
                </>
              ) : (
                <>
                  <Wifi className="h-4 w-4 mr-2" />
                  Conectar WhatsApp
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
