// supabase/functions/insights_pull/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

serve(async () => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Look back 30 days for posts we marked as "posted"
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Only FACEBOOK posts with a non-null api_post_id
  const { data: posts, error: ePosts } = await sb
    .from("scheduled_posts")
    .select("id,user_id,platform,post_type,api_post_id,posted_at")
    .gte("posted_at", since)
    .eq("status", "posted")
    .eq("platform", "facebook")
    .not("api_post_id", "is", null)
    .limit(200);

  if (ePosts) {
    console.error("insights_pull: error loading posts", ePosts);
    return new Response("ERROR loading posts", { status: 500 });
  }

  const touchedUserPlatforms = new Set<string>();

  for (const p of posts ?? []) {
    try {
      // Get the token for this user+platform (only active page)
      const { data: acct, error: eAcct } = await sb
        .from("connected_meta_accounts")
        .select("access_token,page_id,ig_user_id,is_active")
        .eq("user_id", p.user_id)
        .eq("platform", "facebook")
        .eq("is_active", true)
        .single();

      if (eAcct || !acct?.access_token || !p.api_post_id) {
        if (eAcct) console.error("insights_pull: account error", eAcct);
        continue;
      }

      const ts = new Date().toISOString();
      const accessToken = acct.access_token;
      const postId = p.api_post_id;

      /* -------------------------------------------------
       * 1) INSIGHTS: impressions + likes
       * ------------------------------------------------- */
      const fbMetrics = [
        "post_impressions",          // impressions
        "post_reactions_like_total", // likes
      ];

      const insightsUrl =
        `https://graph.facebook.com/v19.0/${postId}/insights` +
        `?metric=${fbMetrics.join(",")}` +
        `&access_token=${encodeURIComponent(accessToken)}`;

      const insightsRes = await fetch(insightsUrl);
      const insightsJson = await insightsRes.json();

      if (insightsJson.error) {
        console.error("FB insights error", insightsJson.error);
        // We'll still try fields below
      }

      let impressions = 0;
      let likes = 0;

      for (const m of insightsJson?.data || []) {
        const rawName = m.name as string;
        const val = m?.values?.[0]?.value ?? 0;
        const numVal = Number(val) || 0;

        if (rawName === "post_impressions") {
          impressions = numVal;
          await sb.from("analytics_events").insert({
            user_id: p.user_id,
            platform: "facebook",
            object_id: postId,
            metric: "impressions",
            value: numVal,
            ts,
          });
        } else if (rawName === "post_reactions_like_total") {
          likes = numVal;
          await sb.from("analytics_events").insert({
            user_id: p.user_id,
            platform: "facebook",
            object_id: postId,
            metric: "likes",
            value: numVal,
            ts,
          });
        }
      }

      /* -------------------------------------------------
       * 2) FIELDS: comments + shares
       *    GET /{postId}?fields=shares,comments.summary(true)
       * ------------------------------------------------- */
      const fieldsUrl =
        `https://graph.facebook.com/v19.0/${postId}` +
        `?fields=shares,comments.summary(true).limit(0)` +
        `&access_token=${encodeURIComponent(accessToken)}`;

      const fieldsRes = await fetch(fieldsUrl);
      const fieldsJson = await fieldsRes.json();

      if (fieldsJson.error) {
        console.error("FB fields error", fieldsJson.error);
      }

      let shares = 0;
      let comments = 0;

      if (!fieldsJson.error) {
        if (fieldsJson.shares && typeof fieldsJson.shares.count === "number") {
          shares = fieldsJson.shares.count;
          await sb.from("analytics_events").insert({
            user_id: p.user_id,
            platform: "facebook",
            object_id: postId,
            metric: "shares",
            value: shares,
            ts,
          });
        }

        if (
          fieldsJson.comments &&
          fieldsJson.comments.summary &&
          typeof fieldsJson.comments.summary.total_count === "number"
        ) {
          comments = fieldsJson.comments.summary.total_count;
          await sb.from("analytics_events").insert({
            user_id: p.user_id,
            platform: "facebook",
            object_id: postId,
            metric: "comments",
            value: comments,
            ts,
          });
        }
      }

      /* -------------------------------------------------
       * 3) DERIVED METRIC: engagement
       * ------------------------------------------------- */
      const engagement = likes + comments + shares;
      await sb.from("analytics_events").insert({
        user_id: p.user_id,
        platform: "facebook",
        object_id: postId,
        metric: "engagement",
        value: engagement,
        ts,
      });

      touchedUserPlatforms.add(`${p.user_id}|facebook`);
    } catch (err) {
      console.error("insights_pull: per-post error", err);
    }
  }

  // Build time-slot features for all touched users
  for (const key of touchedUserPlatforms) {
    const [userId, platform] = key.split("|") as [string, "facebook"];
    try {
      const { data: featResult, error: eFeat } = await sb.rpc(
        "build_timeslot_features",
        {
          p_user_id: userId,
          p_platform: platform,
        },
      );

      if (eFeat) {
        console.error(
          "insights_pull: build_timeslot_features error",
          { userId, platform, eFeat },
        );
      } else {
        console.log(
          "insights_pull: build_timeslot_features OK",
          { userId, platform, featResult },
        );
      }
    } catch (err) {
      console.error(
          "insights_pull: exception calling build_timeslot_features",
          { userId, platform, err },
      );
    }
  }

  return new Response("OK");
});
