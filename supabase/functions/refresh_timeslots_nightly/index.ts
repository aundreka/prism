// supabase/functions/refresh_timeslots_nightly/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

serve(async () => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Use a wider window for history – e.g. 90 days (matches build_timeslot_features default)
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Get candidate posts (uses your existing helper)
  const { data: candidates, error: eCand } = await sb.rpc(
    "sp_insights_candidate_posts",
    { p_since: since },
  );

  if (eCand) {
    console.error("refresh_timeslots_nightly: error loading candidates", eCand);
    return new Response("ERROR loading candidates", { status: 500 });
  }

  const touchedUserPlatforms = new Set<string>();

  for (const c of candidates ?? []) {
    // c.platform is already platform_enum from DB (facebook/instagram/etc.)
    touchedUserPlatforms.add(`${c.user_id}|${c.platform}`);
  }

  // 1) Rebuild features for each (user, platform) that had recent posts
  for (const key of touchedUserPlatforms) {
    const [userId, platform] = key.split("|");
    try {
      const { data: featResult, error: eFeat } = await sb.rpc(
        "build_timeslot_features",
        {
          p_user_id: userId,
          p_platform: platform as any,
          // optional: override history/future days here if you want
          // p_history_days: 90,
          // p_future_days: 14,
        },
      );

      if (eFeat) {
        console.error(
          "refresh_timeslots_nightly: build_timeslot_features error",
          { userId, platform, eFeat },
        );
      } else {
        console.log(
          "refresh_timeslots_nightly: build_timeslot_features OK",
          { userId, platform, featResult },
        );
      }
    } catch (err) {
      console.error(
        "refresh_timeslots_nightly: exception calling build_timeslot_features",
        { userId, platform, err },
      );
    }
  }

  // 2) Record bandit rewards for each candidate scheduled_post
  //    (idempotent if you added the UNIQUE index + ON CONFLICT in SQL)
  for (const c of candidates ?? []) {
    try {
      const { error: eReward } = await sb.rpc(
        "record_bandit_reward_for_post",
        {
          p_scheduled_post_id: c.id,
        },
      );

      if (eReward) {
        console.error(
          "refresh_timeslots_nightly: record_bandit_reward_for_post error",
          { scheduledPostId: c.id, eReward },
        );
      } else {
        console.log(
          "refresh_timeslots_nightly: recorded reward for scheduled_post",
          { scheduledPostId: c.id },
        );
      }
    } catch (err) {
      console.error(
        "refresh_timeslots_nightly: exception calling record_bandit_reward_for_post",
        { scheduledPostId: c.id, err },
      );
    }
  }

  return new Response(
    `OK – refreshed features for ${touchedUserPlatforms.size} user/platform combos and attempted rewards for ${(candidates ?? []).length} posts`,
  );
});
