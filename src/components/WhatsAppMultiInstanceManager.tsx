import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2, Smartphone, Plus, Lock, Crown, AlertTriangle
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import WhatsAppInstanceCard from '@/components/WhatsAppInstanceCard';

interface WhatsAppInstance {
  id: string;
  label: string;
  instance_name: string;
  status: string;
  phone_number: string | null;
  is_primary: boolean;
}

export default function WhatsAppMultiInstanceManager() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [maxInstances, setMaxInstances] = useState(1);
  const [planName, setPlanName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchInstances = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-connect?action=list-instances', {
        method: 'GET',
      });
      if (error) throw error;
      setInstances(data?.instances || []);
      setMaxInstances(data?.maxInstances ?? 1);
      setPlanName(data?.planName ?? null);
    } catch (e: any) {
      console.error('Failed to fetch instances:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  const handleAddNew = async () => {
    if (!newLabel.trim()) {
      toast.error('Informe um nome para identificar este número');
      return;
    }

    setAdding(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-connect?action=connect', {
        method: 'POST',
        body: { label: newLabel.trim() },
      });

      if (error) throw error;
      if (data?.limitReached) {
        toast.error(data.error || 'Limite do plano atingido');
        setShowAddDialog(false);
        return;
      }
      if (!data?.success) throw new Error(data?.error || 'Erro ao criar instância');

      toast.success('Nova instância criada! Conecte via QR Code.');
      setShowAddDialog(false);
      setNewLabel('');
      await fetchInstances();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao adicionar número');
    } finally {
      setAdding(false);
    }
  };

  const canAddMore = instances.length < maxInstances;
  const connectedCount = instances.filter(i => i.status === 'connected').length;

  if (loading) {
    return (
      <Card className="glass-card-static rounded-2xl">
        <CardContent className="px-4 sm:px-6 py-10 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header card */}
      <Card className="glass-card-static rounded-2xl">
        <CardHeader className="px-4 sm:px-6 pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4.5 w-4.5 text-primary" />
              <CardTitle className="text-lg">Conexões WhatsApp</CardTitle>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {planName && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Crown className="h-3 w-3" />
                  {planName}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {instances.length}/{maxInstances} número{maxInstances !== 1 ? 's' : ''}
              </Badge>
              {connectedCount > 0 && (
                <Badge variant="default" className="text-xs">
                  🟢 {connectedCount} conectado{connectedCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4">
          <p className="text-sm text-muted-foreground mb-4">
            Conecte até <strong>{maxInstances}</strong> número{maxInstances !== 1 ? 's' : ''} de WhatsApp conforme seu plano.
            {instances.length === 0 && ' Clique em "Adicionar número" para começar.'}
          </p>

          {canAddMore ? (
            <Button
              onClick={() => {
                setNewLabel(`WhatsApp ${instances.length + 1}`);
                setShowAddDialog(true);
              }}
              className="gradient-primary border-0 font-semibold"
            >
              <Plus className="h-4 w-4 mr-2" />
              {instances.length === 0 ? 'Conectar WhatsApp' : 'Adicionar número'}
            </Button>
          ) : (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 border border-border/40">
              <Lock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Limite atingido</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Seu plano permite {maxInstances} número{maxInstances !== 1 ? 's' : ''} de WhatsApp. Entre em contato para fazer upgrade.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instance cards */}
      {instances.length > 0 && (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {instances.map((inst) => (
            <WhatsAppInstanceCard
              key={inst.id}
              instance={inst}
              onDeleted={fetchInstances}
              onUpdated={fetchInstances}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {instances.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
          <Smartphone className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhum número conectado ainda.</p>
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar novo número</DialogTitle>
            <DialogDescription>
              Dê um nome para identificar este número de WhatsApp. Depois você conectará via QR Code.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="inst-label">Nome / Identificação</Label>
              <Input
                id="inst-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Ex: Atendimento, Vendas, Recepção..."
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddNew(); }}
                autoFocus
              />
            </div>
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/50 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              Uma nova instância será criada e você precisará escanear o QR Code para conectar.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={adding}>
              Cancelar
            </Button>
            <Button onClick={handleAddNew} disabled={adding || !newLabel.trim()} className="gradient-primary border-0">
              {adding ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Criando...</> : 'Criar e conectar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
