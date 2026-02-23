
CREATE UNIQUE INDEX IF NOT EXISTS contact_tags_company_phone_tag_unique ON public.contact_tags (company_id, phone, tag);
