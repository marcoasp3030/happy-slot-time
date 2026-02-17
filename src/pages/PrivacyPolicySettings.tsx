import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Shield, Save, RotateCcw, Eye, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

const DEFAULT_POLICY = `Ao utilizar nossos serviços, você concorda com a coleta e o tratamento dos seus dados pessoais (nome, telefone e informações de saúde/estéticas) exclusivamente para fins de agendamento, atendimento e acompanhamento clínico. Seus dados são armazenados com segurança e não são compartilhados com terceiros. Você pode solicitar a exclusão dos seus dados a qualquer momento entrando em contato com o estabelecimento. Em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).`;

export default function PrivacyPolicySettings() {
  const { companyId } = useAuth();
  const [policyText, setPolicyText] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [consentLogs, setConsentLogs] = useState<any[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    supabase.from('company_settings').select('privacy_policy_text').eq('company_id', companyId).single()
      .then(({ data }) => {
        const text = data?.privacy_policy_text || DEFAULT_POLICY;
        setPolicyText(text);
        setOriginalText(text);
      });
  }, [companyId]);

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    const { error } = await supabase.from('company_settings')
      .update({ privacy_policy_text: policyText.trim() })
      .eq('company_id', companyId);
    setSaving(false);
    if (error) { toast.error('Erro ao salvar'); return; }
    setOriginalText(policyText.trim());
    toast.success('Política de privacidade atualizada');
  };

  const fetchLogs = async () => {
    if (!companyId) return;
    const { data } = await supabase.from('consent_logs')
      .select('*')
      .eq('company_id', companyId)
      .order('accepted_at', { ascending: false })
      .limit(100);
    setConsentLogs(data || []);
    setLogsOpen(true);
  };

  const hasChanges = policyText.trim() !== originalText;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="section-header mb-0">
            <h1 className="section-title flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              LGPD & Privacidade
            </h1>
            <p className="section-subtitle">Política de privacidade e registro de consentimentos</p>
          </div>
          <Button variant="outline" onClick={fetchLogs} className="self-start sm:self-auto gap-1.5">
            <FileText className="h-4 w-4" />
            Log de aceites
          </Button>
        </div>

        <Card className="glass-card-static rounded-2xl">
          <CardContent className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="font-semibold text-sm">Texto da política de privacidade</Label>
              <p className="text-xs text-muted-foreground">Este texto será exibido ao cliente antes de confirmar o agendamento ou preencher a anamnese.</p>
              <Textarea
                value={policyText}
                onChange={(e) => setPolicyText(e.target.value)}
                rows={8}
                className="text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} disabled={saving || !hasChanges} className="gradient-primary border-0 font-semibold gap-1.5">
                <Save className="h-4 w-4" />
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="outline" onClick={() => setPolicyText(DEFAULT_POLICY)} className="gap-1.5">
                <RotateCcw className="h-4 w-4" />
                Restaurar padrão
              </Button>
              <Button variant="outline" onClick={() => setPreviewOpen(true)} className="gap-1.5">
                <Eye className="h-4 w-4" />
                Visualizar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Preview dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-bold flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Política de Privacidade
              </DialogTitle>
            </DialogHeader>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {policyText}
            </div>
          </DialogContent>
        </Dialog>

        {/* Consent logs dialog */}
        <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-bold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Log de Consentimentos LGPD
              </DialogTitle>
            </DialogHeader>
            {consentLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum consentimento registrado</p>
            ) : (
              <div className="space-y-2">
                {consentLogs.map(log => (
                  <div key={log.id} className="bg-muted/50 rounded-lg px-3 py-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{log.client_name}</p>
                      <Badge variant="secondary" className="text-[10px]">
                        {log.consent_type === 'booking' ? 'Agendamento' : 'Anamnese'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{log.client_phone}</p>
                    <p className="text-[11px] text-muted-foreground/60">
                      {new Date(log.accepted_at).toLocaleString('pt-BR')} • v{log.policy_version}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
