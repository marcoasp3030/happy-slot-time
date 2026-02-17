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

async function getCompanyId(authHeader: string): Promise<string> {
  const supabase = getSupabaseWithAuth(authHeader);
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error } = await supabase.auth.getClaims(token);
  if (error || !claims?.claims) throw new Error("Unauthorized");

  const userId = claims.claims.sub as string;
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("user_id", userId)
    .single();

  if (!profile?.company_id) throw new Error("No company found");
  return profile.company_id;
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

async function getValidAccessToken(companyId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data: tokenRow } = await supabase
    .from("google_calendar_tokens")
    .select("*")
    .eq("company_id", companyId)
    .single();

  if (!tokenRow) throw new Error("Google Calendar not connected");

  const expiresAt = new Date(tokenRow.token_expires_at);
  if (expiresAt > new Date(Date.now() + 60_000)) {
    return tokenRow.access_token;
  }

  // Refresh
  const refreshed = await refreshAccessToken(tokenRow.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await supabase
    .from("google_calendar_tokens")
    .update({ access_token: refreshed.access_token, token_expires_at: newExpiresAt })
    .eq("company_id", companyId);

  return refreshed.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // Path after /google-calendar/
    const action = pathParts[pathParts.length - 1];

    // === AUTHORIZE: redirect user to Google OAuth ===
    if (action === "authorize" && req.method === "GET") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const companyId = await getCompanyId(authHeader);
      const redirectUri = `${getEnv("SUPABASE_URL")}/functions/v1/google-calendar/callback`;

      const params = new URLSearchParams({
        client_id: getEnv("GOOGLE_CLIENT_ID"),
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email",
        access_type: "offline",
        prompt: "consent",
        state: companyId,
      });

      return new Response(JSON.stringify({ url: `${GOOGLE_AUTH_URL}?${params}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === CALLBACK: handle Google OAuth callback ===
    if (action === "callback" && req.method === "GET") {
      const code = url.searchParams.get("code");
      const companyId = url.searchParams.get("state");
      const errorParam = url.searchParams.get("error");

      if (errorParam) {
        return new Response(redirectHtml("Autorização negada.", false), {
          headers: { "Content-Type": "text/html" },
        });
      }

      if (!code || !companyId) {
        return new Response(redirectHtml("Parâmetros inválidos.", false), {
          headers: { "Content-Type": "text/html" },
        });
      }

      const redirectUri = `${getEnv("SUPABASE_URL")}/functions/v1/google-calendar/callback`;

      // Exchange code for tokens
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
        return new Response(redirectHtml("Erro ao trocar código por token.", false), {
          headers: { "Content-Type": "text/html" },
        });
      }

      // Get user email
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

      // Upsert tokens
      const { error: upsertError } = await supabase
        .from("google_calendar_tokens")
        .upsert({
          company_id: companyId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: expiresAt,
          connected_email: email,
        }, { onConflict: "company_id" });

      if (upsertError) {
        console.error("Upsert error:", upsertError);
        return new Response(redirectHtml("Erro ao salvar tokens.", false), {
          headers: { "Content-Type": "text/html" },
        });
      }

      return new Response(redirectHtml("Google Agenda conectado com sucesso!", true), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // === STATUS: check connection status ===
    if (action === "status" && req.method === "GET") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const companyId = await getCompanyId(authHeader);
      const supabase = getSupabaseWithAuth(authHeader);
      const { data } = await supabase
        .from("google_calendar_tokens")
        .select("connected_email, created_at")
        .eq("company_id", companyId)
        .single();

      return new Response(JSON.stringify({
        connected: !!data,
        email: data?.connected_email || null,
        connectedAt: data?.created_at || null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === DISCONNECT: remove tokens ===
    if (action === "disconnect" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const companyId = await getCompanyId(authHeader);
      const supabase = getSupabaseWithAuth(authHeader);
      await supabase
        .from("google_calendar_tokens")
        .delete()
        .eq("company_id", companyId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === CREATE EVENT ===
    if (action === "create-event" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const companyId = await getCompanyId(authHeader);
      const body = await req.json();
      const { appointmentId, summary, description, startDateTime, endDateTime } = body;

      const accessToken = await getValidAccessToken(companyId);

      const eventRes = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events`, {
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
        }),
      });

      const event = await eventRes.json();
      if (!eventRes.ok) {
        console.error("Failed to create event:", event);
        throw new Error(`Google Calendar API error: ${eventRes.status}`);
      }

      // Save event ID to appointment
      if (appointmentId) {
        const supabase = getSupabaseAdmin();
        await supabase
          .from("appointments")
          .update({ google_calendar_event_id: event.id })
          .eq("id", appointmentId);
      }

      return new Response(JSON.stringify({ eventId: event.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === DELETE EVENT ===
    if (action === "delete-event" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const companyId = await getCompanyId(authHeader);
      const { eventId } = await req.json();

      if (!eventId) {
        return new Response(JSON.stringify({ error: "eventId required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = await getValidAccessToken(companyId);

      const res = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events/${eventId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok && res.status !== 404) {
        const errBody = await res.text();
        console.error("Failed to delete event:", errBody);
        throw new Error(`Google Calendar API error: ${res.status}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Edge function error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
    <script>setTimeout(() => window.close(), 3000);</script>
  </div>
</body>
</html>`;
}
