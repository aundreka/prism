// supabase/functions/meta_oauth_callback/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const EDGE_BASE_URL = Deno.env.get("EDGE_BASE_URL");
const FB_APP_ID = Deno.env.get("FB_APP_ID");
const FB_APP_SECRET = Deno.env.get("FB_APP_SECRET");

// Must match FB app settings
const FB_REDIRECT = `${EDGE_BASE_URL}/meta_oauth_callback`;
const DEFAULT_APP_DEEP_LINK = "prism://oauth/callback";

function toClosePage(targetDeepLink: string, extra: Record<string, string> = {}) {
  const u = new URL(`${EDGE_BASE_URL}/meta_web_close`);
  u.searchParams.set("target", targetDeepLink);
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return u.toString();
}

// ✅ Permissions we require to consider the connection "valid"
const REQUIRED_PERMS = [
  "pages_read_engagement",
  "pages_show_list",
  "pages_manage_metadata",
  "pages_read_user_content",
];

Deno.serve(async (req) => {
  try {
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
    if (!code || !state) {
      return json(400, { error: "bad_request", detail: "Missing code/state" });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) Look up oauth_state
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

    // 2) Exchange code -> short-lived user token
    const tokUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    tokUrl.searchParams.set("client_id", FB_APP_ID!);
    tokUrl.searchParams.set("client_secret", FB_APP_SECRET!);
    tokUrl.searchParams.set("redirect_uri", FB_REDIRECT);
    tokUrl.searchParams.set("code", code);

    const tokRes = await fetch(tokUrl.toString());
    const token1 = await tokRes.json().catch(() => ({} as any));
    if (!tokRes.ok || !token1?.access_token) {
      console.error("token_exchange_failed", token1);
      return Response.redirect(
        toClosePage(deepLink, { error: "oauth_exchange_failed" }),
        302,
      );
    }

    let userToken = token1.access_token as string;
    let userExpiresAt: string | null = null;

    // 3) Upgrade to long-lived user token
    try {
      const llUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
      llUrl.searchParams.set("grant_type", "fb_exchange_token");
      llUrl.searchParams.set("client_id", FB_APP_ID!);
      llUrl.searchParams.set("client_secret", FB_APP_SECRET!);
      llUrl.searchParams.set("fb_exchange_token", userToken);

      const llRes = await fetch(llUrl.toString());
      if (llRes.ok) {
        const ll = await llRes.json();
        if (ll?.access_token) {
          userToken = ll.access_token;
          if (typeof ll.expires_in === "number") {
            userExpiresAt = new Date(Date.now() + ll.expires_in * 1000).toISOString();
          }
        }
      } else {
        console.warn("long_lived_exchange_failed (continuing with short-lived)");
      }
    } catch (e) {
      console.warn("long_lived_exchange_error (continuing with short-lived)", e);
    }

    // 🔍 4) CHECK PERMISSIONS: /me/permissions
    const permRes = await fetch(
      `https://graph.facebook.com/v19.0/me/permissions?access_token=${encodeURIComponent(
        userToken,
      )}`,
    );
    const permJson = await permRes.json().catch(() => ({} as any));

    if (!permRes.ok || !permJson?.data) {
      console.error("permissions_check_failed", permJson);
      return Response.redirect(
        toClosePage(deepLink, { error: "permissions_check_failed" }),
        302,
      );
    }

    const permMap = new Map<string, string>();
    for (const row of permJson.data as Array<{ permission: string; status: string }>) {
      permMap.set(row.permission, row.status);
    }

    const missing = REQUIRED_PERMS.filter((p) => permMap.get(p) !== "granted");

    if (missing.length > 0) {
      console.warn("Missing required perms", missing);

      // ❌ Do NOT store connection, do NOT call /me/accounts
      return Response.redirect(
        toClosePage(deepLink, {
          error: "missing_permissions",
          missing: missing.join(","),
        }),
        302,
      );
    }

    // ✅ At this point, we KNOW the token has the perms we need.

    // 5) List pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(
        userToken,
      )}`,
    );
    const pagesJson = await pagesRes.json().catch(() => ({} as any));
    if (!pagesRes.ok || !pagesJson?.data?.length) {
      console.error("list_pages_failed", pagesJson);
      return Response.redirect(toClosePage(deepLink, { error: "no_pages" }), 302);
    }

    type FBPage = { id: string; name?: string; access_token?: string };

    const pages: FBPage[] = (pagesJson.data as FBPage[]).filter(
      (p) => p.id && p.access_token,
    );

    if (!pages.length) {
      console.error("no_pages_with_tokens", pagesJson);
      return Response.redirect(toClosePage(deepLink, { error: "no_pages" }), 302);
    }

    // 6) Find existing active page (if any) so we don't break it
    const { data: existingActive, error: activeErr } = await sb
      .from("connected_meta_accounts")
      .select("page_id")
      .eq("user_id", st.user_id)
      .eq("platform", "facebook")
      .eq("is_active", true)
      .maybeSingle();

    if (activeErr) {
      console.error("existing_active_lookup_failed", activeErr);
    }

    const existingActivePageId: string | null = existingActive?.page_id ?? null;

    // 7) Build upsert payloads for ALL pages
    const rowsToUpsert: any[] = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageId = String(page.id);
      const pageName = page?.name ? String(page.name) : null;
      const pageAccessToken = String(page.access_token);

      // Decide is_active:
      // - If there's already an active page for this user+platform, keep that page active.
      // - Otherwise, make the FIRST page in this list active.
      const isActive =
        existingActivePageId != null
          ? existingActivePageId === pageId
          : i === 0;

      // Optional IG fetch per page
      let igUserId: string | null = null;
      let igUsername: string | null = null;

      try {
        const igRes = await fetch(
          `https://graph.facebook.com/v19.0/${encodeURIComponent(
            pageId,
          )}?fields=connected_instagram_account&access_token=${encodeURIComponent(
            pageAccessToken,
          )}`,
        );
        const ig = await igRes.json().catch(() => ({} as any));
        igUserId = ig?.connected_instagram_account?.id ?? null;

        if (igUserId) {
          const igUserRes = await fetch(
            `https://graph.facebook.com/v19.0/${encodeURIComponent(
              igUserId,
            )}?fields=username,name&access_token=${encodeURIComponent(
              pageAccessToken,
            )}`,
          );
          const igUserJson = await igUserRes.json().catch(() => ({} as any));
          if (igUserRes.ok) {
            igUsername = igUserJson?.username ?? null;
          }
        }
      } catch (e) {
        console.warn("IG fetch error for page", pageId, e);
      }

      rowsToUpsert.push({
        user_id: st.user_id,
        platform: "facebook",
        page_id: pageId,
        page_name: pageName,
        ig_user_id: igUserId,
        ig_username: igUsername,
        access_token: pageAccessToken,
        token_expires_at: null,
        user_access_token: userToken,
        user_token_expires_at: userExpiresAt,
        is_active: isActive,
      });
    }

    // 8) Persist ALL connections (multi-page)
    const { error: upErr } = await sb
      .from("connected_meta_accounts")
      .upsert(rowsToUpsert, {
        onConflict: "user_id,platform,page_id",
      });

    if (upErr) {
      console.error("db_upsert_failed", upErr);
      return Response.redirect(toClosePage(deepLink, { error: "db_upsert_failed" }), 302);
    }

    // 9) Clean up oauth_state row
    await sb.from("oauth_state").delete().eq("id", st.id);

    // 10) Tell the app we're done
    return Response.redirect(toClosePage(deepLink, { ok: "1" }), 302);
  } catch (e: any) {
    console.error("callback_fatal", e);
    return json(500, { error: "internal_server_error", detail: String(e?.message ?? e) });
  }
});
