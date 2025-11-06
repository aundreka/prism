
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

async function getJSON(u: string) { const r = await fetch(u); return r.json().catch(() => ({})); }

serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  const u = new URL(req.url);
  const state = u.searchParams.get("state");
  const pageId = u.searchParams.get("page_id");
  if (!state || !pageId) return new Response("Bad Request", { status: 400 });

  const { data: st } = await sb.from("oauth_state")
    .select("*")
    .eq("state", state)
    .eq("platform", "facebook")
    .single();
  if (!st) return new Response("Invalid state", { status: 400 });

  let payload = { returnTo: "prism://oauth/callback", pick: false } as { returnTo: string; pick: boolean; userToken?: string };
  try { payload = JSON.parse(st.code_verifier || "{}"); } catch {}

  if (!payload.userToken) return Response.redirect(`${payload.returnTo}?error=session_lost`, 302);

  // 1) get page access_token for selected page
  const pages = await getJSON(`https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(payload.userToken)}`);
  const match = (pages?.data || []).find((p: any) => p.id === pageId);
  if (!match?.access_token) return Response.redirect(`${payload.returnTo}?error=page_not_found`, 302);

  // 2) find IG user linked to the page
  const pageInfo = await getJSON(
    `https://graph.facebook.com/v19.0/${pageId}` +
    `?fields=connected_instagram_account{username,id,name}` +
    `&access_token=${encodeURIComponent(match.access_token)}`
  );
  const igUserId = pageInfo?.connected_instagram_account?.id ?? null;

  // 3) upsert
  await sb.from("connected_meta_accounts").delete()
    .eq("user_id", st.user_id).eq("platform","facebook").eq("page_id", pageId);
  await sb.from("connected_meta_accounts").insert({
    user_id: st.user_id,
    platform: "facebook",
    page_id: pageId,
    page_name: match.name ?? null,
    ig_user_id: igUserId,
    access_token: match.access_token,
    token_expires_at: null
  });

  // 4) cleanup
  await sb.from("oauth_state").delete().eq("id", st.id);

  // 5) redirect back to app/web
  return Response.redirect(`${payload.returnTo}?ok=1`, 302);
});
