import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

function getEnv(name: string): string {
  const val = Deno.env.get(name);
  if (!val) throw new Error(`${name} is not configured`);
  return val;
}

function getSupabaseAdmin() {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

function getSupabaseWithAuth(authHeader: string) {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
  });
}

async function getUserProfile(authHeader: string): Promise<{ userId: string; companyId: string; role: string; staffId: string | null }> {
  const supabase = getSupabaseWithAuth(authHeader);
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error } = await supabase.auth.getClaims(token);
  if (error || !claims?.claims) throw new Error("Unauthorized");

  const userId = claims.claims.sub as string;
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("user_id", userId)
    .single();

  if (!profile?.company_id) throw new Error("No company found");

  // If staff, get staff_id
  let staffId: string | null = null;
  if (profile.role === "staff") {
    const admin = getSupabaseAdmin();
    const { data: staffRecord } = await admin
      .from("staff")
      .select("id")
      .eq("user_id", userId)
      .single();
    staffId = staffRecord?.id || null;
  }

  return { userId, companyId: profile.company_id, role: profile.role, staffId };
}

async function getCompanyId(authHeader: string): Promise<string> {
  const profile = await getUserProfile(authHeader);
  return profile.companyId;
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getEnv("GOOGLE_CLIENT_ID"),
      client_secret: getEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data;
}

async function getValidToken(companyId: string, staffId: string | null = null): Promise<{ accessToken: string; calendarId: string }> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("google_calendar_tokens")
    .select("*")
    .eq("company_id", companyId);

  if (staffId) {
    query = query.eq("staff_id", staffId);
  } else {
    query = query.is("staff_id", null);
  }

  const { data: tokenRow } = await query.single();
  if (!tokenRow) throw new Error("Google Calendar not connected");

  const expiresAt = new Date(tokenRow.token_expires_at);
  if (expiresAt > new Date(Date.now() + 60_000)) {
    return { accessToken: tokenRow.access_token, calendarId: tokenRow.calendar_id || "primary" };
  }

  const refreshed = await refreshAccessToken(tokenRow.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await supabase
    .from("google_calendar_tokens")
    .update({ access_token: refreshed.access_token, token_expires_at: newExpiresAt })
    .eq("id", tokenRow.id);

  return { accessToken: refreshed.access_token, calendarId: tokenRow.calendar_id || "primary" };
}

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts[pathParts.length - 1];

    // ========== COMPANY ENDPOINTS ==========

    // === AUTHORIZE: redirect user to Google OAuth ===
    if (action === "authorize" && req.method === "GET") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

      const companyId = await getCompanyId(authHeader);
      const redirectUri = `${getEnv("SUPABASE_URL")}/functions/v1/google-calendar/callback`;
      const state = JSON.stringify({ companyId, staffId: null });

      const params = new URLSearchParams({
        client_id: getEnv("GOOGLE_CLIENT_ID"),
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email",
        access_type: "offline",
        prompt: "consent",
        state,
      });

      return jsonRes({ url: `${GOOGLE_AUTH_URL}?${params}` });
    }

    // === CALLBACK: handle Google OAuth callback (company + staff) ===
    if (action === "callback" && req.method === "GET") {
      const code = url.searchParams.get("code");
      const stateParam = url.searchParams.get("state");
      const errorParam = url.searchParams.get("error");

      if (errorParam) {
        return new Response(redirectHtml("Autorização negada.", false), { headers: { "Content-Type": "text/html" } });
      }

      if (!code || !stateParam) {
        return new Response(redirectHtml("Parâmetros inválidos.", false), { headers: { "Content-Type": "text/html" } });
      }

      let companyId: string;
      let staffId: string | null = null;
      try {
        const parsed = JSON.parse(stateParam);
        companyId = parsed.companyId;
        staffId = parsed.staffId || null;
      } catch {
        // Legacy: state is just companyId
        companyId = stateParam;
      }

      const redirectUri = `${getEnv("SUPABASE_URL")}/functions/v1/google-calendar/callback`;

      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: getEnv("GOOGLE_CLIENT_ID"),
          client_secret: getEnv("GOOGLE_CLIENT_SECRET"),
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      });

      const tokens = await tokenRes.json();
      if (!tokenRes.ok) {
        console.error("Token exchange failed:", tokens);
        return new Response(redirectHtml("Erro ao trocar código por token.", false), { headers: { "Content-Type": "text/html" } });
      }

      let email = "";
      try {
        const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const userInfo = await userInfoRes.json();
        email = userInfo.email || "";
      } catch (_) { /* ignore */ }

      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      const supabase = getSupabaseAdmin();

      // Upsert: use company_id + staff_id as the conflict key
      // First try to find existing
      let query = supabase
        .from("google_calendar_tokens")
        .select("id")
        .eq("company_id", companyId);

      if (staffId) {
        query = query.eq("staff_id", staffId);
      } else {
        query = query.is("staff_id", null);
      }

      const { data: existing } = await query.single();

      if (existing) {
        await supabase
          .from("google_calendar_tokens")
          .update({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            token_expires_at: expiresAt,
            connected_email: email,
          })
          .eq("id", existing.id);
      } else {
        const insertData: any = {
          company_id: companyId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: expiresAt,
          connected_email: email,
        };
        if (staffId) insertData.staff_id = staffId;

        const { error: insertErr } = await supabase
          .from("google_calendar_tokens")
          .insert(insertData);

        if (insertErr) {
          console.error("Insert error:", insertErr);
          return new Response(redirectHtml("Erro ao salvar tokens.", false), { headers: { "Content-Type": "text/html" } });
        }
      }

      return new Response(redirectHtml("Google Agenda conectado com sucesso!", true), { headers: { "Content-Type": "text/html" } });
    }

    // === STATUS: check company connection status ===
    if (action === "status" && req.method === "GET") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

      const companyId = await getCompanyId(authHeader);
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("google_calendar_tokens")
        .select("connected_email, created_at, calendar_id")
        .eq("company_id", companyId)
        .is("staff_id", null)
        .single();

      return jsonRes({
        connected: !!data,
        email: data?.connected_email || null,
        connectedAt: data?.created_at || null,
        calendarId: data?.calendar_id || "primary",
      });
    }

    // === DISCONNECT: remove company tokens ===
    if (action === "disconnect" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

      const companyId = await getCompanyId(authHeader);
      const supabase = getSupabaseAdmin();
      await supabase
        .from("google_calendar_tokens")
        .delete()
        .eq("company_id", companyId)
        .is("staff_id", null);

      return jsonRes({ success: true });
    }

    // === LIST CALENDARS (company) ===
    if (action === "calendars" && req.method === "GET") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

      const companyId = await getCompanyId(authHeader);
      const { accessToken } = await getValidToken(companyId, null);

      const calRes = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const calData = await calRes.json();
      if (!calRes.ok) throw new Error(`Google Calendar API error: ${calRes.status}`);

      const calendars = (calData.items || []).map((c: any) => ({
        id: c.id,
        summary: c.summary,
        primary: c.primary || false,
        backgroundColor: c.backgroundColor || null,
      }));

      return jsonRes({ calendars });
    }

    // === SET CALENDAR (company) ===
    if (action === "set-calendar" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

      const companyId = await getCompanyId(authHeader);
      const { calendarId } = await req.json();
      if (!calendarId) return jsonRes({ error: "calendarId required" }, 400);

      const supabase = getSupabaseAdmin();
      await supabase
        .from("google_calendar_tokens")
        .update({ calendar_id: calendarId })
        .eq("company_id", companyId)
        .is("staff_id", null);

      return jsonRes({ success: true });
    }

    // ========== STAFF ENDPOINTS ==========

    // === STAFF AUTHORIZE ===
    if (action === "staff-authorize" && req.method === "GET") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

      const profile = await getUserProfile(authHeader);
      if (!profile.staffId) return jsonRes({ error: "Not a staff member" }, 403);

      const redirectUri = `${getEnv("SUPABASE_URL")}/functions/v1/google-calendar/callback`;
      const state = JSON.stringify({ companyId: profile.companyId, staffId: profile.staffId });

      const params = new URLSearchParams({
        client_id: getEnv("GOOGLE_CLIENT_ID"),
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email",
        access_type: "offline",
        prompt: "consent",
        state,
      });

      return jsonRes({ url: `${GOOGLE_AUTH_URL}?${params}` });
    }

    // === STAFF STATUS ===
    if (action === "staff-status" && req.method === "GET") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

      const profile = await getUserProfile(authHeader);
      if (!profile.staffId) return jsonRes({ error: "Not a staff member" }, 403);

      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("google_calendar_tokens")
        .select("connected_email, calendar_id")
        .eq("company_id", profile.companyId)
        .eq("staff_id", profile.staffId)
        .single();

      return jsonRes({
        connected: !!data,
        email: data?.connected_email || null,
        calendarId: data?.calendar_id || "primary",
      });
    }

    // === STAFF DISCONNECT ===
    if (action === "staff-disconnect" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

      const profile = await getUserProfile(authHeader);
      if (!profile.staffId) return jsonRes({ error: "Not a staff member" }, 403);

      const supabase = getSupabaseAdmin();
      await supabase
        .from("google_calendar_tokens")
        .delete()
        .eq("company_id", profile.companyId)
        .eq("staff_id", profile.staffId);

      return jsonRes({ success: true });
    }

    // === STAFF CALENDARS ===
    if (action === "staff-calendars" && req.method === "GET") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

      const profile = await getUserProfile(authHeader);
      if (!profile.staffId) return jsonRes({ error: "Not a staff member" }, 403);

      const { accessToken } = await getValidToken(profile.companyId, profile.staffId);

      const calRes = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const calData = await calRes.json();
      if (!calRes.ok) throw new Error(`Google Calendar API error: ${calRes.status}`);

      const calendars = (calData.items || []).map((c: any) => ({
        id: c.id,
        summary: c.summary,
        primary: c.primary || false,
        backgroundColor: c.backgroundColor || null,
      }));

      return jsonRes({ calendars });
    }

    // === STAFF SET CALENDAR ===
    if (action === "staff-set-calendar" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

      const profile = await getUserProfile(authHeader);
      if (!profile.staffId) return jsonRes({ error: "Not a staff member" }, 403);

      const { calendarId } = await req.json();
      if (!calendarId) return jsonRes({ error: "calendarId required" }, 400);

      const supabase = getSupabaseAdmin();
      await supabase
        .from("google_calendar_tokens")
        .update({ calendar_id: calendarId })
        .eq("company_id", profile.companyId)
        .eq("staff_id", profile.staffId);

      return jsonRes({ success: true });
    }

    // === OWNER AUTHORIZE FOR STAFF (owner connects Google on behalf of staff) ===
    if (action === "owner-authorize-staff" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

      const profile = await getUserProfile(authHeader);
      if (profile.role === "staff") return jsonRes({ error: "Forbidden" }, 403);

      const { staffId } = await req.json();
      if (!staffId) return jsonRes({ error: "staffId required" }, 400);

      const redirectUri = `${getEnv("SUPABASE_URL")}/functions/v1/google-calendar/callback`;
      const state = JSON.stringify({ companyId: profile.companyId, staffId });

      const params = new URLSearchParams({
        client_id: getEnv("GOOGLE_CLIENT_ID"),
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email",
        access_type: "offline",
        prompt: "consent",
        state,
      });

      return jsonRes({ url: `${GOOGLE_AUTH_URL}?${params}` });
    }

    // === OWNER LIST STAFF CALENDARS ===
    if (action === "owner-staff-calendars" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

      const profile = await getUserProfile(authHeader);
      if (profile.role === "staff") return jsonRes({ error: "Forbidden" }, 403);

      const { staffId } = await req.json();
      if (!staffId) return jsonRes({ error: "staffId required" }, 400);

      const { accessToken } = await getValidToken(profile.companyId, staffId);

      const calRes = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const calData = await calRes.json();
      if (!calRes.ok) throw new Error(`Google Calendar API error: ${calRes.status}`);

      const calendars = (calData.items || []).map((c: any) => ({
        id: c.id,
        summary: c.summary,
        primary: c.primary || false,
        backgroundColor: c.backgroundColor || null,
      }));

      return jsonRes({ calendars });
    }

    // === OWNER SET STAFF CALENDAR ===
    if (action === "owner-staff-set-calendar" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

      const profile = await getUserProfile(authHeader);
      if (profile.role === "staff") return jsonRes({ error: "Forbidden" }, 403);

      const { staffId, calendarId } = await req.json();
      if (!staffId || !calendarId) return jsonRes({ error: "staffId and calendarId required" }, 400);

      const supabase = getSupabaseAdmin();
      await supabase
        .from("google_calendar_tokens")
        .update({ calendar_id: calendarId })
        .eq("company_id", profile.companyId)
        .eq("staff_id", staffId);

      return jsonRes({ success: true });
    }

    // === OWNER DISCONNECT STAFF CALENDAR ===
    if (action === "owner-disconnect-staff" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

      const profile = await getUserProfile(authHeader);
      if (profile.role === "staff") return jsonRes({ error: "Forbidden" }, 403);

      const { staffId } = await req.json();
      if (!staffId) return jsonRes({ error: "staffId required" }, 400);

      const supabase = getSupabaseAdmin();
      await supabase
        .from("google_calendar_tokens")
        .delete()
        .eq("company_id", profile.companyId)
        .eq("staff_id", staffId);

      return jsonRes({ success: true });
    }

    // ========== SYNC ENDPOINTS (internal) ==========

    // === SYNC APPOINTMENT (called by DB trigger) ===
    if (action === "sync-appointment" && req.method === "POST") {
      const body = await req.json();
      const { appointmentId, companyId } = body;

      if (!appointmentId || !companyId) return jsonRes({ error: "appointmentId and companyId required" }, 400);

      const supabase = getSupabaseAdmin();

      // Check sync mode and meet link setting
      const { data: settings } = await supabase
        .from("company_settings")
        .select("google_calendar_sync_mode, generate_meet_link")
        .eq("company_id", companyId)
        .single();

      const syncMode = settings?.google_calendar_sync_mode || "company";

      // Fetch appointment with service name
      const { data: appointment } = await supabase
        .from("appointments")
        .select("*, services(name)")
        .eq("id", appointmentId)
        .single();

      if (!appointment) return jsonRes({ error: "Appointment not found" }, 404);
      if (appointment.google_calendar_event_id) return jsonRes({ skipped: true, reason: "Already synced" });

      let targetStaffId: string | null = null;

      if (syncMode === "per_staff") {
        // Use staff's own calendar
        targetStaffId = appointment.staff_id;
        if (!targetStaffId) return jsonRes({ skipped: true, reason: "No staff assigned" });
      }

      // Check if token exists
      let tokenQuery = supabase
        .from("google_calendar_tokens")
        .select("id, calendar_id")
        .eq("company_id", companyId);

      if (targetStaffId) {
        tokenQuery = tokenQuery.eq("staff_id", targetStaffId);
      } else {
        tokenQuery = tokenQuery.is("staff_id", null);
      }

      const { data: tokenRow } = await tokenQuery.single();

      if (!tokenRow) {
        return jsonRes({ skipped: true, reason: syncMode === "per_staff" ? "Staff not connected" : "Google Calendar not connected" });
      }

      const { accessToken, calendarId } = await getValidToken(companyId, targetStaffId);
      const serviceName = (appointment as any).services?.name || "Agendamento";
      const summary = `${serviceName} - ${appointment.client_name}`;
      const description = `Cliente: ${appointment.client_name}\nTelefone: ${appointment.client_phone}${appointment.notes ? `\nObs: ${appointment.notes}` : ""}`;

      const startDateTime = `${appointment.appointment_date}T${appointment.start_time}`;
      const endDateTime = `${appointment.appointment_date}T${appointment.end_time}`;
      const encodedCalId = encodeURIComponent(calendarId);
      const generateMeetLink = settings?.generate_meet_link || false;

      const eventBody: any = {
        summary,
        description,
        start: { dateTime: startDateTime, timeZone: "America/Sao_Paulo" },
        end: { dateTime: endDateTime, timeZone: "America/Sao_Paulo" },
        colorId: "2",
      };

      if (generateMeetLink) {
        eventBody.conferenceData = {
          createRequest: {
            requestId: `meet-${appointmentId}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        };
      }

      const conferenceParam = generateMeetLink ? "?conferenceDataVersion=1" : "";
      const eventRes = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodedCalId}/events${conferenceParam}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      });

      const event = await eventRes.json();
      if (!eventRes.ok) {
        console.error("Failed to create event:", event);
        throw new Error(`Google Calendar API error: ${eventRes.status}`);
      }

      // Extract Meet link if available
      const meetLink = event.hangoutLink || null;

      await supabase
        .from("appointments")
        .update({
          google_calendar_event_id: event.id,
          ...(meetLink ? { meet_link: meetLink } : {}),
        })
        .eq("id", appointmentId);

      return jsonRes({ eventId: event.id, meetLink });
    }

    // === DELETE EVENT INTERNAL (called by DB trigger on cancel) ===
    if (action === "delete-event-internal" && req.method === "POST") {
      const body = await req.json();
      const { eventId, companyId } = body;

      if (!eventId || !companyId) return jsonRes({ error: "eventId and companyId required" }, 400);

      const supabase = getSupabaseAdmin();

      // Try to find the token - first check company-level, then try all staff tokens
      try {
        // Try company token first
        let tokenResult = await supabase
          .from("google_calendar_tokens")
          .select("id, calendar_id, staff_id")
          .eq("company_id", companyId)
          .is("staff_id", null)
          .single();

        if (!tokenResult.data) {
          // Try any staff token (the event could be on any staff calendar)
          tokenResult = await supabase
            .from("google_calendar_tokens")
            .select("id, calendar_id, staff_id")
            .eq("company_id", companyId)
            .limit(1)
            .single();
        }

        if (tokenResult.data) {
          const { accessToken, calendarId } = await getValidToken(companyId, tokenResult.data.staff_id);
          const encodedCalId = encodeURIComponent(calendarId);
          const res = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodedCalId}/events/${eventId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (!res.ok && res.status !== 404) {
            const errBody = await res.text();
            console.error("Failed to delete event:", errBody);
          }
        }
      } catch (err) {
        console.error("Error deleting calendar event:", err);
      }

      return jsonRes({ success: true });
    }

    // === CREATE EVENT (manual, from dashboard) ===
    if (action === "create-event" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

      const companyId = await getCompanyId(authHeader);
      const body = await req.json();
      const { appointmentId, summary, description, startDateTime, endDateTime } = body;

      const { accessToken, calendarId } = await getValidToken(companyId, null);
      const encodedCalId = encodeURIComponent(calendarId);

      const eventRes = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodedCalId}/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary,
          description,
          start: { dateTime: startDateTime, timeZone: "America/Sao_Paulo" },
          end: { dateTime: endDateTime, timeZone: "America/Sao_Paulo" },
          colorId: "2",
        }),
      });

      const event = await eventRes.json();
      if (!eventRes.ok) throw new Error(`Google Calendar API error: ${eventRes.status}`);

      if (appointmentId) {
        const supabase = getSupabaseAdmin();
        await supabase
          .from("appointments")
          .update({ google_calendar_event_id: event.id })
          .eq("id", appointmentId);
      }

      return jsonRes({ eventId: event.id });
    }

    // === DELETE EVENT (manual, from dashboard) ===
    if (action === "delete-event" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

      const companyId = await getCompanyId(authHeader);
      const { eventId } = await req.json();
      if (!eventId) return jsonRes({ error: "eventId required" }, 400);

      const { accessToken, calendarId } = await getValidToken(companyId, null);
      const encodedCalId = encodeURIComponent(calendarId);

      const res = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodedCalId}/events/${eventId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok && res.status !== 404) {
        throw new Error(`Google Calendar API error: ${res.status}`);
      }

      return jsonRes({ success: true });
    }

    return jsonRes({ error: "Not found" }, 404);
  } catch (error: unknown) {
    console.error("Edge function error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return jsonRes({ error: msg }, status);
  }
});

function redirectHtml(message: string, success: boolean): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Google Calendar</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; }
  .card { text-align: center; padding: 2rem; border-radius: 1rem; background: white; box-shadow: 0 4px 20px rgba(0,0,0,.08); max-width: 400px; }
  .icon { font-size: 3rem; margin-bottom: 1rem; }
  h2 { margin: 0 0 .5rem; color: #0f172a; }
  p { color: #64748b; margin: 0; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? "✅" : "❌"}</div>
    <h2>${message}</h2>
    <p>Você pode fechar esta aba e voltar à plataforma.</p>
  </div>
</body>
</html>`;
}
