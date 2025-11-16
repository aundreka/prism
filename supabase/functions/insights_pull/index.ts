
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

serve(async () => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Look back 30 days for posts we marked as "posted"
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Get all posted items that have an api_post_id
  const { data: posts, error: ePosts } = await sb
    .from("scheduled_posts")
    .select("id,user_id,platform,post_type,api_post_id,posted_at")
    .gte("posted_at", since)
    .eq("status", "posted")
    .not("api_post_id", "is", null)
    .limit(200);

  if (ePosts) {
    console.error("insights_pull: error loading posts", ePosts);
    return new Response("ERROR loading posts", { status: 500 });
  }

  for (const p of posts ?? []) {
    try {
      // Get the right token for this user+platform
      const { data: acct, error: eAcct } = await sb
        .from("connected_meta_accounts")
        .select("access_token,page_id,ig_user_id")
        .eq("user_id", p.user_id)
        .eq("platform", p.platform)
        .single();

      if (eAcct || !acct?.access_token || !p.api_post_id) {
        if (eAcct) console.error("insights_pull: account error", eAcct);
        continue;
      }

      const ts = new Date().toISOString();

      if (p.platform === "facebook") {
        // ✅ VALID PAGE POST METRICS
        // See: post_reach, post_reactions_like_total, post_comments, post_shares
        const fbMetrics = [
          "post_reach",
          "post_reactions_like_total",
          "post_comments",
          "post_shares",
        ];

        const url =
          `https://graph.facebook.com/v19.0/${p.api_post_id}/insights` +
          `?metric=${fbMetrics.join(",")}` +
          `&access_token=${encodeURIComponent(acct.access_token)}`;

        const r = await fetch(url).then((r) => r.json());

        if (r.error) {
          // Most common: post was deleted or perms missing
          console.error("FB insights error", r.error);
          continue;
        }

        for (const m of r?.data || []) {
          const rawName = m.name as string;
          const val = m?.values?.[0]?.value ?? 0;

          // Map FB metric name -> your metric_enum
          let metric: string | null = null;
          switch (rawName) {
            case "post_reach":
              metric = "reach";
              break;
            case "post_reactions_like_total":
              metric = "likes";
              break;
            case "post_comments":
              metric = "comments";
              break;
            case "post_shares":
              metric = "shares";
              break;
            default:
              metric = null;
          }
          if (!metric) continue;

          await sb.from("analytics_events").insert({
            user_id: p.user_id,
            platform: "facebook",
            object_id: p.api_post_id,
            metric, // 'reach' | 'likes' | 'comments' | 'shares'
            value: Number(val) || 0,
            ts,
          });
        }
      } else {
        const igMetrics = [
          "impressions",
          "reach",
          "likes",
          "comments",
          "saved",       
          "shares",
          "video_views", 
        ];

        const url =
          `https://graph.facebook.com/v19.0/${p.api_post_id}/insights` +
          `?metric=${igMetrics.join(",")}` +
          `&access_token=${encodeURIComponent(acct.access_token)}`;

        const r = await fetch(url).then((r) => r.json());

        if (r.error) {
          console.error("IG insights error", r.error);
          continue;
        }

        for (const m of r?.data || []) {
          const rawName = m.name as string;
          const val = m?.values?.[0]?.value ?? 0;

          // normalize raw IG names -> metric_enum
          const metricMap: Record<string, string> = {
            impressions: "impressions",
            reach: "reach",
            likes: "likes",
            comments: "comments",
            saved: "saves",      
            saves: "saves",     
            shares: "shares",
            video_views: "video_views",
            plays: "video_views", 
          };

          const metric = metricMap[rawName];
          if (!metric) continue;

          await sb.from("analytics_events").insert({
            user_id: p.user_id,
            platform: "instagram",
            object_id: p.api_post_id,
            metric,
            value: Number(val) || 0,
            ts,
          });
        }
      }
    } catch (err) {
      console.error("insights_pull: per-post error", err);
    }
  }

  return new Response("OK");
});
