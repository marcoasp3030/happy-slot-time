import { supabase } from '@/integrations/supabase/client';

export type AuditCategory = 'auth' | 'appointment' | 'service' | 'staff' | 'settings' | 'lgpd' | 'general';

interface AuditLogParams {
  companyId?: string | null;
  action: string;
  category: AuditCategory;
  entityType?: string;
  entityId?: string;
  details?: Record<string, any>;
}

export async function logAudit({
  companyId,
  action,
  category,
  entityType,
  entityId,
  details,
}: AuditLogParams) {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('audit_logs').insert({
      company_id: companyId || undefined,
      user_id: user?.id || undefined,
      user_email: user?.email || undefined,
      action,
      category,
      entity_type: entityType,
      entity_id: entityId,
      details: details || {},
      user_agent: navigator.userAgent,
    });
  } catch (e) {
    console.error('Audit log error:', e);
  }
}
