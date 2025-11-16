// supabase/functions/publisher_due/index.ts
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

const G = (path: string, params: URLSearchParams) =>
  `https://graph.facebook.com/v19.0/${path}?${params.toString()}`;

serve(async () => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  const nowIso = new Date().toISOString();

  // 1) strictly: only due + scheduled, ordered by scheduled_at
  const { data: due, error } = await sb
    .from("scheduled_posts")
    .select("id,user_id,platform,target_id,caption,post_type,status")
    .lte("scheduled_at", nowIso)
    .eq("status", "scheduled")
    .order("scheduled_at", { ascending: true })
    .limit(20);

  if (error) {
    console.error("publisher_due: DB error loading due posts", error);
    return new Response("DB error", { status: 500 });
  }

  if (!due?.length) return new Response("OK");

  for (const sp of due) {
    try {
      // 2) resolve correct account for THIS row
      const { data: acct, error: acctErr } = await sb
        .from("connected_meta_accounts")
        .select("access_token,page_id,ig_user_id")
        .eq("user_id", sp.user_id)
        .eq("platform", sp.platform)
        .single();

      if (acctErr || !acct?.access_token) {
        throw new Error(`Missing or invalid access token for user ${sp.user_id}, platform ${sp.platform}`);
      }

      let result: any = {};

      if (sp.platform === "facebook") {
        // 3a) FB publish (simple feed post with message – no media yet)
        const params = new URLSearchParams({
          message: sp.caption || "",
          access_token: acct.access_token,
        });

        const ep = `${acct.page_id}/feed`;
        const res = await fetch(G(ep, params), { method: "POST" });
        result = await res.json();

        if (result.error) {
          throw new Error(`FB publish error: ${JSON.stringify(result.error)}`);
        }
      } else {
        // 3b) Instagram publish (image only, using scheduled_posts_media)
        // get media linked to THIS scheduled_post
        const { data: v, error: vErr } = await sb
          .from("v_scheduled_posts_with_media")
          .select("media_ids")
          .eq("id", sp.id)
          .single();

        if (vErr) throw new Error(`View lookup failed for scheduled_post ${sp.id}: ${vErr.message}`);
        const first = v?.media_ids?.[0];
        if (!first) throw new Error(`No media linked to scheduled_post ${sp.id}`);

        const { data: m, error: mErr } = await sb
          .from("media_assets")
          .select("public_url")
          .eq("id", first)
          .single();

        if (mErr) throw new Error(`Media lookup failed for media_id ${first}: ${mErr.message}`);
        if (!m?.public_url) throw new Error(`No public_url on media_id ${first}`);

        // 1) create container
        const cRes = await fetch(
          G(
            `${acct.ig_user_id}/media`,
            new URLSearchParams({
              image_url: m.public_url,
              caption: sp.caption || "",
              access_token: acct.access_token,
            }),
          ),
          { method: "POST" },
        ).then((r) => r.json());

        if (!cRes?.id) {
          throw new Error(`IG container failed: ${JSON.stringify(cRes)}`);
        }

        // 2) publish
        const pub = await fetch(
          G(
            `${acct.ig_user_id}/media_publish`,
            new URLSearchParams({
              creation_id: cRes.id,
              access_token: acct.access_token,
            }),
          ),
          { method: "POST" },
        ).then((r) => r.json());

        if (pub.error) {
          throw new Error(`IG publish error: ${JSON.stringify(pub.error)}`);
        }

        result = pub;
      }

      // 4) mark THIS row as posted + store ids
      const postedAt = new Date().toISOString();
      await sb
        .from("scheduled_posts")
        .update({
          status: "posted",
          posted_at: postedAt,
          api_post_id: result.id ?? null,
          permalink: result.permalink_url ?? null,
          error_message: null,
        })
        .eq("id", sp.id);

      await sb.from("post_logs").insert({
        scheduled_post_id: sp.id,
        step: "post",
        request_summary: { platform: sp.platform },
        response_summary: result,
      });
    } catch (e) {
      console.error("publisher_due: error posting", sp.id, e);
      await sb
        .from("scheduled_posts")
        .update({ status: "failed", error_message: String(e) })
        .eq("id", sp.id);

      await sb.from("post_logs").insert({
        scheduled_post_id: sp.id,
        step: "error",
        response_summary: { error: String(e) },
      });
    }
  }

  return new Response("OK");
});
