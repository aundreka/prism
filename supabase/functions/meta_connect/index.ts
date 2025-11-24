// supabase/functions/meta_connect/index.ts
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { user_id, platform, redirect_uri, redirect_override } = await req.json();
  if (!user_id || platform !== "facebook" || !redirect_uri) {
    return new Response("Bad Request", { status: 400 });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const state = crypto.randomUUID();
  const exp = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await sb.from("oauth_state").insert({
    user_id,
    platform: "facebook",
    state,
    expires_at: exp,
  });

  const callback = `${Deno.env.get("EDGE_BASE_URL")}/meta_oauth_callback`;

  // 🔴 IMPORTANT: explicitly include the page perms we need
  const perms = [
    "pages_show_list",
    "pages_manage_posts",
    "pages_manage_engagement",
    "pages_read_engagement",   // <-- NEW
    "pages_manage_metadata",   // <-- NEW
    "pages_read_user_content",
    "read_insights",

    "instagram_basic",
    "instagram_content_publish",
    "instagram_manage_insights",
  ].join(",");

  const url = new URL("https://www.facebook.com/dialog/oauth");
  url.searchParams.set("client_id", Deno.env.get("FB_APP_ID")!);
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", perms);
  url.searchParams.set("auth_type", "rerequest"); // re-ask if they previously declined

  await sb
    .from("oauth_state")
    .update({ code_verifier: redirect_override ?? redirect_uri })
    .eq("state", state)
    .eq("user_id", user_id)
    .eq("platform", "facebook");

  return new Response(JSON.stringify({ url: url.toString() }), {
    headers: { "content-type": "application/json" },
  });
});
