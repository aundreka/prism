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

  const { data: due, error } = await sb
    .from("scheduled_posts")
    .select("id,user_id,platform,target_id,caption,post_type,status")
    .lte("scheduled_at", nowIso)
    .eq("status", "scheduled")
    .limit(20);
  if (error) return new Response("DB error", { status: 500 });
  if (!due?.length) return new Response("OK");

  for (const sp of due) {
    try {
      const { data: acct } = await sb
        .from("connected_meta_accounts")
        .select("access_token,page_id,ig_user_id")
        .eq("user_id", sp.user_id)
        .eq("platform", sp.platform)
        .single();

      if (!acct?.access_token) throw new Error("Missing access token");

      let result: any = {};
      if (sp.platform === "facebook") {
        // FB publish now (you can also schedule FB server-side by adding published=false + scheduled_publish_time)
        const params = new URLSearchParams({
          message: sp.caption || "",
          access_token: acct.access_token,
        });
        // choose /photos if you want to send an image URL instead
        const ep = `${acct.page_id}/feed`;
        const res = await fetch(G(ep, params), { method: "POST" });
        result = await res.json();
      } else {
        // Instagram publish (image). We cron the schedule ourselves.
        // 1) get first media URL from your view
        const { data: v } = await sb
          .from("v_scheduled_posts_with_media")
          .select("media_ids")
          .eq("id", sp.id)
          .single();
        const first = v?.media_ids?.[0];
        if (!first) throw new Error("No media linked");

        const { data: m } = await sb
          .from("media_assets")
          .select("public_url")
          .eq("id", first)
          .single();
        if (!m?.public_url) throw new Error("No media URL");

        // 2) create container
        const cRes = await fetch(
          G(`${acct.ig_user_id}/media`, new URLSearchParams({
            image_url: m.public_url,
            caption: sp.caption || "",
            access_token: acct.access_token,
          })),
          { method: "POST" },
        ).then((r) => r.json());

        if (!cRes?.id) throw new Error("IG container failed");

        // 3) publish
        const pub = await fetch(
          G(`${acct.ig_user_id}/media_publish`, new URLSearchParams({
            creation_id: cRes.id,
            access_token: acct.access_token,
          })),
          { method: "POST" },
        ).then((r) => r.json());
        result = pub;
      }

      await sb
        .from("scheduled_posts")
        .update({
          status: "posted",
          posted_at: new Date().toISOString(),
          api_post_id: result.id ?? null,
          permalink: result.permalink_url ?? null,
        })
        .eq("id", sp.id);

      await sb.from("post_logs").insert({
        scheduled_post_id: sp.id,
        step: "post",
        request_summary: { platform: sp.platform },
        response_summary: result,
      });
    } catch (e) {
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
