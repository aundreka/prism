// supabase/functions/insights_pull/index.ts
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

serve(async () => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: posts } = await sb
    .from("scheduled_posts")
    .select("id,user_id,platform,api_post_id,posted_at")
    .gte("posted_at", since)
    .eq("status", "posted")
    .limit(200);

  for (const p of posts ?? []) {
    try {
      const { data: acct } = await sb
        .from("connected_meta_accounts")
        .select("access_token,page_id,ig_user_id")
        .eq("user_id", p.user_id)
        .eq("platform", p.platform)
        .single();
      if (!acct?.access_token || !p.api_post_id) continue;

      const ts = new Date().toISOString();
      if (p.platform === "facebook") {
        // Example FB metrics
        const r = await fetch(
          `https://graph.facebook.com/v19.0/${p.api_post_id}/insights` +
            `?metric=post_impressions,post_engaged_users` +
            `&access_token=${encodeURIComponent(acct.access_token)}`
        ).then((r) => r.json());

        for (const m of r?.data || []) {
          const val = m?.values?.[0]?.value ?? 0;
          const metric =
            m.name === "post_impressions" ? "impressions" :
            m.name === "post_engaged_users" ? "engagement" : null;
          if (!metric) continue;

          await sb.from("analytics_events").insert({
            user_id: p.user_id,
            platform: "facebook",
            object_id: p.api_post_id,
            metric,
            value: Number(val) || 0,
            ts,
          });
        }
      } else {
        // Example IG metrics (varies by media type/permissions)
        const r = await fetch(
          `https://graph.facebook.com/v19.0/${p.api_post_id}/insights` +
            `?metric=impressions,reach,likes,comments,saves,shares` +
            `&access_token=${encodeURIComponent(acct.access_token)}`
        ).then((r) => r.json());

        for (const m of r?.data || []) {
          const val = m?.values?.[0]?.value ?? 0;
          await sb.from("analytics_events").insert({
            user_id: p.user_id,
            platform: "instagram",
            object_id: p.api_post_id,
            metric: m.name,
            value: Number(val) || 0,
            ts,
          });
        }
      }
    } catch {
      // ignore per-post failures for robustness
    }
  }

  return new Response("OK");
});
