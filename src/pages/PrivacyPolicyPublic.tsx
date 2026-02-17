import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Shield, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

export default function PrivacyPolicyPublic() {
  const { slug } = useParams<{ slug: string }>();
  const [company, setCompany] = useState<any>(null);
  const [policyText, setPolicyText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    const fetch = async () => {
      const { data: comp } = await supabase.from('companies').select('id, name, logo_url').eq('slug', slug).single();
      if (!comp) { setLoading(false); return; }
      setCompany(comp);
      const { data: settings } = await supabase.from('company_settings').select('privacy_policy_text').eq('company_id', comp.id).single();
      setPolicyText(settings?.privacy_policy_text || 'Política de privacidade não configurada.');
      setLoading(false);
    };
    fetch();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground text-sm">Carregando...</div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Empresa não encontrada</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-5 py-10">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <a href={`/agendar/${slug}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao agendamento
          </a>

          <div className="flex items-center gap-3">
            {company.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="h-10 w-10 rounded-xl object-cover" />
            ) : (
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold">Política de Privacidade</h1>
              <p className="text-sm text-muted-foreground">{company.name}</p>
            </div>
          </div>

          <div className="bg-card rounded-2xl border p-6 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {policyText}
          </div>

          <p className="text-[11px] text-muted-foreground/40 text-center">
            Em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018)
          </p>
        </motion.div>
      </div>
    </div>
  );
}
