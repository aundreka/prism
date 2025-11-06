
import { createClient } from "https://esm.sh/@supabase/supabase-js";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FB_GRAPH = "https://graph.facebook.com/v21.0"; // ← bump to v21

type Sched = {
  id: string;
  user_id: string;
  platform: "facebook" | "instagram";
  target_id: string;
  post_id: string | null;
  caption: string | null;
  post_type: "image" | "video" | "reel" | "story" | "carousel" | "link";
  status: "draft" | "scheduled" | "posting" | "posted" | "failed" | "canceled";
  scheduled_at: string | null;
  posted_at: string | null;
  api_post_id: string | null;
  permalink: string | null;
  error_message: string | null;
  attempts?: number | null;
};

type Conn = {
  id: string;
  user_id: string;
  platform: "facebook";
  page_id: string | null;
  page_name: string | null;
  ig_user_id: string | null;
  ig_username: string | null;
  access_token: string; // PAGE token
};

type Media = {
  id: string;
  public_url: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
};

function j(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function sendExpoPush(token: string, title: string, body: string) {
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to: token, sound: "default", title, body }),
  });
}

// Parse any FB response (even non-JSON)
async function parseFB(r: Response) {
  const text = await r.text();
  try { return { ok: r.ok, json: JSON.parse(text), raw: text }; }
  catch { return { ok: r.ok, json: null as any, raw: text }; }
}

Deno.serve(async () => {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    // 1) Pull due jobs (scheduled_at <= now)
    const nowIso = new Date().toISOString();
    const { data: due, error: dueErr } = await sb
      .from("scheduled_posts")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(20);

    if (dueErr) {
      console.error("scheduled_posts query failed:", dueErr);
      return j(500, { error: "select_failed", detail: String(dueErr.message || dueErr) });
    }

    console.log("due count:", (due ?? []).length, "now:", nowIso);
    if (!due || !due.length) return j(200, { ok: true, processed: 0 });

    for (const job of due as Sched[]) {
      // mark as posting (avoid double-run)
      const { error: upErr } = await sb
        .from("scheduled_posts")
        .update({ status: "posting" })
        .eq("id", job.id);

      if (upErr) {
        console.error("failed to mark posting:", job.id, upErr);
        // store the failure (best-effort)
        await sb.rpc("sp_attempt_fail", { p_id: job.id, p_message: "mark_posting_failed" }).catch(() => {});
        continue;
      }

      try {
        // 2) find connection row with page token matching target
        const { data: conns, error: cErr } = await sb
          .from("connected_meta_accounts")
          .select("*")
          .eq("user_id", job.user_id)
          .eq("platform", "facebook");

        if (cErr) throw cErr;

        const connections = (conns || []) as Conn[];
        const conn =
          job.platform === "facebook"
            ? connections.find(c => c.page_id && c.page_id === job.target_id)
            : connections.find(c => c.ig_user_id && c.ig_user_id === job.target_id);

        if (!conn?.access_token) throw new Error("access_token_not_found");

        // 3) gather media (ordered)
        const { data: spm, error: spmErr } = await sb
          .from("scheduled_posts_media")
          .select("media_id, position")
          .eq("scheduled_post_id", job.id)
          .order("position", { ascending: true });

        if (spmErr) throw spmErr;

        const mediaIds = (spm || []).map((r: any) => r.media_id);
        let media: Media[] = [];
        if (mediaIds.length) {
          const { data: assets, error: mErr } = await sb
            .from("media_assets")
            .select("id, public_url, mime_type, width, height, duration_ms")
            .in("id", mediaIds);
          if (mErr) throw mErr;
          media = assets as Media[];
        }

        // 4) publish
        const caption = job.caption ?? "";
        if (job.platform === "facebook") {
          const { apiId, permalink } = await publishToFacebook({
            pageId: (conn.page_id as string),
            pageToken: conn.access_token,
            caption,
            media,
          });

          await sb.from("scheduled_posts").update({
            status: "posted",
            posted_at: new Date().toISOString(),
            api_post_id: apiId ?? null,
            permalink: permalink ?? null,
            error_message: null,
          }).eq("id", job.id);
        } else {
          const { apiId } = await publishToInstagram({
            igUserId: (conn.ig_user_id as string),
            pageToken: conn.access_token,
            caption,
            media,
          });

          await sb.from("scheduled_posts").update({
            status: "posted",
            posted_at: new Date().toISOString(),
            api_post_id: apiId ?? null,
            error_message: null,
          }).eq("id", job.id);
        }

        // 5) push notify
        const { data: devices } = await sb
          .from("user_devices")
          .select("expo_push_token")
          .eq("user_id", job.user_id)
          .not("expo_push_token", "is", null);

        for (const d of devices || []) {
          await sendExpoPush(
            d.expo_push_token,
            "Post published ✅",
            job.platform === "facebook"
              ? "Your Facebook post has been published."
              : "Your Instagram post has been published."
          ).catch(() => {});
        }
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        console.error("job failed:", job.id, msg);
        await sb.rpc("sp_attempt_fail", { p_id: job.id, p_message: msg }).catch(() => {});
      }
    }

    return j(200, { ok: true, processed: due.length });
  } catch (e: any) {
    console.error("worker top-level error:", e);
    return j(500, { error: "worker_failed", detail: String(e?.message ?? e) });
  }
});

/** ------------------ FB helpers ------------------ */
type PublishArgsFB = {
  pageId: string;
  pageToken: string;
  caption: string;
  media: Media[];
};

async function publishToFacebook({ pageId, pageToken, caption, media }: PublishArgsFB) {
  if (!media.length) throw new Error("no_media_for_fb");

  const imgs = media.filter((m) => (m.mime_type ?? "").startsWith("image/") && m.public_url);
  const vids = media.filter((m) => (m.mime_type ?? "").startsWith("video/") && m.public_url);

  // Multi-image carousel (photos → unpublished children → /feed)
  if (imgs.length > 1 && vids.length === 0) {
    const childIds: string[] = [];
    for (const img of imgs) {
      const u = new URL(`${FB_GRAPH}/${pageId}/photos`);
      u.searchParams.set("url", img.public_url!);
      u.searchParams.set("published", "false");
      u.searchParams.set("access_token", pageToken);
      const r = await fetch(u, { method: "POST" });
      const { ok, json, raw } = await parseFB(r);
      if (!ok || !json?.id) throw new Error(`fb_child_photo_failed:${raw}`);
      childIds.push(json.id);
    }
    const pf = new URL(`${FB_GRAPH}/${pageId}/feed`);
    if (caption) pf.searchParams.set("message", caption);
    childIds.forEach((id, i) =>
      pf.searchParams.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: id }))
    );
    pf.searchParams.set("access_token", pageToken);
    const pr = await fetch(pf, { method: "POST" });
    const { ok, json, raw } = await parseFB(pr);
    if (!ok || !json?.id) throw new Error(`fb_feed_failed:${raw}`);

    let permalink: string | undefined;
    try {
      const g = new URL(`${FB_GRAPH}/${json.id}`);
      g.searchParams.set("fields", "permalink_url");
      g.searchParams.set("access_token", pageToken);
      const rr = await fetch(g);
      const { json: jj } = await parseFB(rr);
      permalink = jj?.permalink_url;
    } catch {}
    return { apiId: json.id as string | undefined, permalink };
  }

  // Single image
  if (imgs.length >= 1 && vids.length === 0) {
    const img = imgs[0];
    const u = new URL(`${FB_GRAPH}/${pageId}/photos`);
    u.searchParams.set("url", img.public_url!);
    if (caption) u.searchParams.set("caption", caption);
    u.searchParams.set("published", "true");
    u.searchParams.set("access_token", pageToken);
    const r = await fetch(u, { method: "POST" });
    const { ok, json, raw } = await parseFB(r);
    if (!ok || !json?.post_id) throw new Error(`fb_photo_failed:${raw}`);

    let permalink: string | undefined;
    try {
      const g = new URL(`${FB_GRAPH}/${json.post_id}`);
      g.searchParams.set("fields", "permalink_url");
      g.searchParams.set("access_token", pageToken);
      const rr = await fetch(g);
      const { json: jj } = await parseFB(rr);
      permalink = jj?.permalink_url;
    } catch {}
    return { apiId: json.post_id as string | undefined, permalink };
  }

  // Single video
  const v = vids[0];
  const u = new URL(`${FB_GRAPH}/${pageId}/videos`);
  u.searchParams.set("file_url", v.public_url!);
  if (caption) u.searchParams.set("description", caption);
  u.searchParams.set("access_token", pageToken);
  const r = await fetch(u, { method: "POST" });
  const { ok, json, raw } = await parseFB(r);
  if (!ok || !json?.id) throw new Error(`fb_video_failed:${raw}`);

  let permalink: string | undefined;
  try {
    const g = new URL(`${FB_GRAPH}/${json.id}`);
    g.searchParams.set("fields", "permalink_url");
    g.searchParams.set("access_token", pageToken);
    const rr = await fetch(g);
    const { json: jj } = await parseFB(rr);
    permalink = jj?.permalink_url;
  } catch {}
  return { apiId: json.id as string | undefined, permalink };
}

/** ------------------ IG helpers ------------------ */
type PublishArgsIG = {
  igUserId: string;
  pageToken: string;
  caption: string;
  media: Media[];
};

async function publishToInstagram({ igUserId, pageToken, caption, media }: PublishArgsIG) {
  if (!media.length) throw new Error("no_media_for_ig");
  const first = media[0];
  const mt = (first.mime_type ?? "").toLowerCase();

  const creation = new URL(`${FB_GRAPH}/${igUserId}/media`);
  if (mt.startsWith("image/")) {
    creation.searchParams.set("image_url", first.public_url!);
  } else if (mt.startsWith("video/")) {
    creation.searchParams.set("media_type", "VIDEO");
    creation.searchParams.set("video_url", first.public_url!);
  } else {
    throw new Error(`unsupported_media_ig:${mt}`);
  }
  if (caption) creation.searchParams.set("caption", caption);
  creation.searchParams.set("access_token", pageToken);

  let cr = await fetch(creation, { method: "POST" });
  let { ok: cOk, json: cJ, raw: cRaw } = await parseFB(cr);
  if (!cOk || !cJ?.id) throw new Error(`ig_creation_failed:${cRaw}`);

  // publish
  const pub = new URL(`${FB_GRAPH}/${igUserId}/media_publish`);
  pub.searchParams.set("creation_id", cJ.id);
  pub.searchParams.set("access_token", pageToken);
  const pr = await fetch(pub, { method: "POST" });
  const { ok: pOk, json: pJ, raw: pRaw } = await parseFB(pr);
  if (!pOk || !pJ?.id) throw new Error(`ig_publish_failed:${pRaw}`);

  return { apiId: pJ.id as string | undefined };
}
