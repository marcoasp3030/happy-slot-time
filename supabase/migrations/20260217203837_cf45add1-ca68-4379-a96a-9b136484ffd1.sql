ALTER TABLE public.company_settings 
ADD COLUMN form_label_mode text NOT NULL DEFAULT 'anamnesis';
-- Values: 'anamnesis' = "Ficha de Anamnese", 'questionnaire' = "Questionário de Pré-agendamento"

COMMENT ON COLUMN public.company_settings.form_label_mode IS 'Controls the label used for anamnesis forms: anamnesis or questionnaire';