import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/lib/auditLog';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  companyId: string | null;
  profileRole: string | null;
  staffId: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  companyId: null,
  profileRole: null,
  staffId: null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);

  const loadProfile = async (userId: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id, role')
      .eq('user_id', userId)
      .single();
    setCompanyId(profile?.company_id ?? null);
    setProfileRole(profile?.role ?? null);

    // If staff role, find their staff record
    if (profile?.role === 'staff') {
      const { data: staffRecord } = await supabase
        .from('staff')
        .select('id')
        .eq('user_id', userId)
        .single();
      setStaffId(staffRecord?.id ?? null);
    } else {
      setStaffId(null);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(async () => {
          await loadProfile(session.user.id);
          setLoading(false);
        }, 0);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(async () => {
            await loadProfile(session.user.id);
            setLoading(false);
          }, 0);
        } else {
          setCompanyId(null);
          setProfileRole(null);
          setStaffId(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    logAudit({ companyId, action: 'Logout realizado', category: 'auth', details: { email: user?.email } });
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, companyId, profileRole, staffId, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
