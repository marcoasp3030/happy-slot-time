import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

type FormLabelMode = 'anamnesis' | 'questionnaire';

interface FormLabels {
  mode: FormLabelMode;
  /** "Anamnese" ou "Questionário de Pré-agendamento" */
  singular: string;
  /** "Ficha de Anamnese" ou "Questionário de Pré-agendamento" */
  fichaLabel: string;
  /** "Tipo de anamnese" ou "Tipo de questionário" */
  typeLabel: string;
  /** Label curto para badges/tags */
  shortLabel: string;
  /** Label para o menu lateral */
  menuLabel: string;
  /** Label para config */
  configLabel: string;
  /** Placeholder para empty states */
  emptyText: string;
  loading: boolean;
}

const ANAMNESIS_LABELS: Omit<FormLabels, 'loading' | 'mode'> = {
  singular: 'Anamnese',
  fichaLabel: 'Ficha de Anamnese',
  typeLabel: 'Tipo de anamnese',
  shortLabel: 'Anamnese',
  menuLabel: 'Anamnese (Config)',
  configLabel: 'Anamnese',
  emptyText: 'Adicione campos para montar o formulário desta anamnese',
};

const QUESTIONNAIRE_LABELS: Omit<FormLabels, 'loading' | 'mode'> = {
  singular: 'Questionário',
  fichaLabel: 'Questionário de Pré-agendamento',
  typeLabel: 'Tipo de questionário',
  shortLabel: 'Questionário',
  menuLabel: 'Questionário (Config)',
  configLabel: 'Questionário',
  emptyText: 'Adicione campos para montar este questionário de pré-agendamento',
};

export function useFormLabel(): FormLabels {
  const { companyId } = useAuth();
  const [mode, setMode] = useState<FormLabelMode>('anamnesis');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    supabase
      .from('company_settings')
      .select('form_label_mode')
      .eq('company_id', companyId)
      .single()
      .then(({ data }) => {
        if (data?.form_label_mode === 'questionnaire') {
          setMode('questionnaire');
        } else {
          setMode('anamnesis');
        }
        setLoading(false);
      });
  }, [companyId]);

  const labels = mode === 'questionnaire' ? QUESTIONNAIRE_LABELS : ANAMNESIS_LABELS;

  return { mode, loading, ...labels };
}

/**
 * Hook para uso em páginas públicas (sem auth), recebe companyId diretamente
 */
export function useFormLabelPublic(companyId: string | null): FormLabels {
  const [mode, setMode] = useState<FormLabelMode>('anamnesis');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    supabase
      .from('company_settings')
      .select('form_label_mode')
      .eq('company_id', companyId)
      .single()
      .then(({ data }) => {
        if (data?.form_label_mode === 'questionnaire') {
          setMode('questionnaire');
        } else {
          setMode('anamnesis');
        }
        setLoading(false);
      });
  }, [companyId]);

  const labels = mode === 'questionnaire' ? QUESTIONNAIRE_LABELS : ANAMNESIS_LABELS;

  return { mode, loading, ...labels };
}
