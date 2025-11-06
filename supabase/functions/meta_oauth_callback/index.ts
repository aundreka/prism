// supabase/functions/meta_oauth_callback/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// --- Env ---
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const EDGE_BASE_URL = Deno.env.get("EDGE_BASE_URL"); // e.g. https://<ref>.functions.supabase.co
const FB_APP_ID = Deno.env.get("FB_APP_ID");
const FB_APP_SECRET = Deno.env.get("FB_APP_SECRET");

// IMPORTANT: must exactly match Facebook “Valid OAuth Redirect URIs”
const FB_REDIRECT = `${EDGE_BASE_URL}/meta_oauth_callback`;

// Your app deep link fallback (Expo/Linking target)
const DEFAULT_APP_DEEP_LINK = "prism://oauth/callback";

function toClosePage(targetDeepLink: string, extra: Record<string, string> = {}) {
  const u = new URL(`${EDGE_BASE_URL}/meta_web_close`);
  u.searchParams.set("target", targetDeepLink);
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return u.toString();
}

Deno.serve(async (req) => {
  try {
    // --- Guard env ---
    if (!SUPABASE_URL || !SERVICE_ROLE || !EDGE_BASE_URL || !FB_APP_ID || !FB_APP_SECRET) {
      console.error("Missing env", {
        SUPABASE_URL: !!SUPABASE_URL,
        SERVICE_ROLE: !!SERVICE_ROLE,
        EDGE_BASE_URL: !!EDGE_BASE_URL,
        FB_APP_ID: !!FB_APP_ID,
        FB_APP_SECRET: !!FB_APP_SECRET,
      });
      return json(500, { error: "missing_env" });
    }

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return json(400, { error: "bad_request", detail: "Missing code/state" });

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // --- Look up oauth_state row we created in /meta_connect ---
    // (Contains the correct user_id and, optionally, an app deep link in code_verifier)
    const { data: st, error: stErr } = await sb
      .from("oauth_state")
      .select("*")
      .eq("state", state)
      .eq("platform", "facebook")
      .single();

    if (stErr || !st) {
      console.error("state lookup failed", stErr);
      return json(400, { error: "invalid_state" });
    }

    const deepLink = st.code_verifier || DEFAULT_APP_DEEP_LINK;

    // --- 1) Exchange code -> short-lived user token ---
    const tokUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    tokUrl.searchParams.set("client_id", FB_APP_ID);
    tokUrl.searchParams.set("client_secret", FB_APP_SECRET);
    tokUrl.searchParams.set("redirect_uri", FB_REDIRECT);
    tokUrl.searchParams.set("code", code);

    const tokRes = await fetch(tokUrl.toString());
    const token1 = await tokRes.json().catch(() => ({} as any));
    if (!tokRes.ok || !token1?.access_token) {
      console.error("token_exchange_failed", token1);
      return Response.redirect(toClosePage(deepLink, { error: "oauth_exchange_failed" }), 302);
    }

    // --- 2) Upgrade to long-lived user token (recommended) ---
    let userToken = token1.access_token as string;
    try {
      const llUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
      llUrl.searchParams.set("grant_type", "fb_exchange_token");
      llUrl.searchParams.set("client_id", FB_APP_ID);
      llUrl.searchParams.set("client_secret", FB_APP_SECRET);
      llUrl.searchParams.set("fb_exchange_token", userToken);

      const llRes = await fetch(llUrl.toString());
      if (llRes.ok) {
        const ll = await llRes.json();
        if (ll?.access_token) userToken = ll.access_token;
      } else {
        console.warn("long_lived_exchange_failed (continuing with short-lived)");
      }
    } catch (e) {
      console.warn("long_lived_exchange_error (continuing with short-lived)", e);
    }

    // --- 3) List Pages the user manages ---
    // Requires pages_show_list (and often pages_read_engagement in practice)
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(userToken)}`
    );
    const pages = await pagesRes.json().catch(() => ({} as any));
    if (!pagesRes.ok || !pages?.data?.length) {
      console.error("list_pages_failed", pages);
      return Response.redirect(toClosePage(deepLink, { error: "no_pages" }), 302);
    }

    // TODO: If you pass a chosen page in state, pick that here.
    const first = pages.data[0];
    const pageId = String(first.id);
    const pageName = first?.name ? String(first.name) : null;
    const pageAccessToken = String(first.access_token);

    // --- 4) Get linked IG business/creator account ID (if any) ---
    // Requires the Page to be linked to an IG professional account AND your app to have appropriate scopes
    let igUserId: string | null = null;
    try {
      const igRes = await fetch(
        `https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}?fields=connected_instagram_account&access_token=${encodeURIComponent(pageAccessToken)}`
      );
      const ig = await igRes.json().catch(() => ({} as any));
      igUserId = ig?.connected_instagram_account?.id ?? null;
    } catch (e) {
      console.warn("fetch_connected_instagram_account_error", e);
      igUserId = null;
    }

    // --- 4b) If we have an IG user id, fetch username (needs instagram_basic) ---
    let igUsername: string | null = null;
    if (igUserId) {
      try {
        const igUserRes = await fetch(
          `https://graph.facebook.com/v19.0/${encodeURIComponent(igUserId)}?fields=username,name&access_token=${encodeURIComponent(pageAccessToken)}`
        );
        const igUserJson = await igUserRes.json().catch(() => ({} as any));
        if (igUserRes.ok) {
          igUsername = igUserJson?.username ?? null;
        } else {
          console.warn("ig_username_fetch_failed", igUserJson);
        }
      } catch (e) {
        console.warn("ig_username_fetch_error", e);
      }
    }

    // --- 5) Persist connection (service role bypasses RLS) ---
    // Ensure you have this UNIQUE index created once:
    //   create unique index if not exists uq_cma_user_platform_page
    //     on public.connected_meta_accounts(user_id, platform, page_id);
    const { error: upErr } = await sb
      .from("connected_meta_accounts")
      .upsert(
        {
          user_id: st.user_id,
          platform: "facebook",
          page_id: pageId,
          page_name: pageName,
          ig_user_id: igUserId,
          ig_username: igUsername,
          access_token: pageAccessToken,
          token_expires_at: null,
        },
        { onConflict: "user_id,platform,page_id" }
      );

    if (upErr) {
      console.error("db_upsert_failed", upErr);
      return Response.redirect(toClosePage(deepLink, { error: "db_upsert_failed" }), 302);
    }

    // --- 6) Clean state (optional) ---
    await sb.from("oauth_state").delete().eq("id", st.id);

    // --- 7) Back to the app (use the small close page to handle deep-link quirks) ---
    return Response.redirect(toClosePage(deepLink, { ok: "1" }), 302);
  } catch (e: any) {
    console.error("callback_fatal", e);
    return json(500, { error: "internal_server_error", detail: String(e?.message ?? e) });
  }
});
