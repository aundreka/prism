// supabase/functions/meta_publish_worker/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FB_GRAPH = "https://graph.facebook.com/v21.0";

type Sched = {
  id: string;
  user_id: string;
  platform: "facebook"; // we only support facebook here
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
  page_id: string | null;
};

type Conn = {
  id: string;
  user_id: string;
  platform: "facebook";
  page_id: string | null;
  page_name: string | null;
  ig_user_id: string | null;
  ig_username: string | null;
  access_token: string;
  token_expires_at: string | null;
  user_access_token: string | null;
  user_token_expires_at: string | null;
  is_active: boolean | null;
  scopes: string[] | null;
};

type Media = {
  id: string;
  public_url: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
};

type ParsedFB = {
  ok: boolean;
  json: any;
  raw: string;
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

async function parseFB(r: Response): Promise<ParsedFB> {
  const text = await r.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore parse failures
  }
  return { ok: r.ok, json, raw: text };
}

/** Try to fetch permalink for an existing post ID */
async function fetchPermalinkById(
  apiId: string,
  pageToken: string,
): Promise<string | null> {
  try {
    const u = new URL(`${FB_GRAPH}/${apiId}`);
    u.searchParams.set("fields", "permalink_url");
    u.searchParams.set("access_token", pageToken);
    const r = await fetch(u, { method: "GET" });
    const { ok, json } = await parseFB(r);
    if (!ok || !json || !json.permalink_url) return null;
    return json.permalink_url as string;
  } catch {
    return null;
  }
}

/** ------------------ FB helpers ------------------ */
type PublishArgsFB = {
  pageId: string;
  pageToken: string;
  caption: string;
  media: Media[];
};

async function publishToFacebook({
  pageId,
  pageToken,
  caption,
  media,
}: PublishArgsFB) {
  if (!media.length) {
    throw new Error("no_media_for_fb");
  }

  const imgs = media.filter(
    (m) => (m.mime_type || "").startsWith("image/") && m.public_url,
  );
  const vids = media.filter(
    (m) => (m.mime_type || "").startsWith("video/") && m.public_url,
  );

  // Multi-image carousel
  if (imgs.length > 1 && vids.length === 0) {
    const childIds: string[] = [];
    for (const img of imgs) {
      const u = new URL(`${FB_GRAPH}/${pageId}/photos`);
      u.searchParams.set("url", img.public_url as string);
      u.searchParams.set("published", "false");
      u.searchParams.set("access_token", pageToken);
      const r = await fetch(u, { method: "POST" });
      const { ok, json, raw } = await parseFB(r);
      if (!ok || !json || !json.id) {
        throw new Error(`fb_child_photo_failed:${raw}`);
      }
      childIds.push(json.id as string);
    }

    const pf = new URL(`${FB_GRAPH}/${pageId}/feed`);
    if (caption) {
      pf.searchParams.set("message", caption);
    }
    childIds.forEach((id, i) => {
      pf.searchParams.set(
        `attached_media[${i}]`,
        JSON.stringify({ media_fbid: id }),
      );
    });
    pf.searchParams.set("access_token", pageToken);
    const pr = await fetch(pf, { method: "POST" });
    const { ok, json, raw } = await parseFB(pr);
    if (!ok || !json || !json.id) {
      throw new Error(`fb_feed_failed:${raw}`);
    }

    let permalink: string | undefined;
    try {
      const g = new URL(`${FB_GRAPH}/${json.id}`);
      g.searchParams.set("fields", "permalink_url");
      g.searchParams.set("access_token", pageToken);
      const rr = await fetch(g);
      const parsed = await parseFB(rr);
      if (parsed.json && parsed.json.permalink_url) {
        permalink = parsed.json.permalink_url as string;
      }
    } catch {
      // ignore permalink failures here
    }

    return { apiId: json.id as string | undefined, permalink };
  }

  // Single image
  if (imgs.length >= 1 && vids.length === 0) {
    const img = imgs[0];
    const u = new URL(`${FB_GRAPH}/${pageId}/photos`);
    u.searchParams.set("url", img.public_url as string);
    if (caption) {
      u.searchParams.set("caption", caption);
    }
    u.searchParams.set("published", "true");
    u.searchParams.set("access_token", pageToken);
    const r = await fetch(u, { method: "POST" });
    const { ok, json, raw } = await parseFB(r);
    if (!ok || !json || !json.post_id) {
      throw new Error(`fb_photo_failed:${raw}`);
    }

    let permalink: string | undefined;
    try {
      const g = new URL(`${FB_GRAPH}/${json.post_id}`);
      g.searchParams.set("fields", "permalink_url");
      g.searchParams.set("access_token", pageToken);
      const rr = await fetch(g);
      const parsed = await parseFB(rr);
      if (parsed.json && parsed.json.permalink_url) {
        permalink = parsed.json.permalink_url as string;
      }
    } catch {
      // ignore
    }

    return { apiId: json.post_id as string | undefined, permalink };
  }

  // Single video
  const v = vids[0];
  const u = new URL(`${FB_GRAPH}/${pageId}/videos`);
  u.searchParams.set("file_url", v.public_url as string);
  if (caption) {
    u.searchParams.set("description", caption);
  }
  u.searchParams.set("access_token", pageToken);
  const r = await fetch(u, { method: "POST" });
  const { ok, json, raw } = await parseFB(r);
  if (!ok || !json || !json.id) {
    throw new Error(`fb_video_failed:${raw}`);
  }

  let permalink: string | undefined;
  try {
    const g = new URL(`${FB_GRAPH}/${json.id}`);
    g.searchParams.set("fields", "permalink_url");
    g.searchParams.set("access_token", pageToken);
    const rr = await fetch(g);
    const parsed = await parseFB(rr);
    if (parsed.json && parsed.json.permalink_url) {
      permalink = parsed.json.permalink_url as string;
    }
  } catch {
    // ignore
  }

  return { apiId: json.id as string | undefined, permalink };
}

Deno.serve(async (_req: Request) => {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
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
      return j(500, {
        error: "select_failed",
        detail: String((dueErr as any).message || dueErr),
      });
    }

    console.log("due count:", (due || []).length, "now:", nowIso);
    if (!due || !due.length) {
      return j(200, { ok: true, processed: 0 });
    }

    for (const job of due as Sched[]) {
      // safety: only facebook is supported
      if (job.platform !== "facebook") {
        console.warn(
          "Unsupported platform for job, marking failed:",
          job.id,
          job.platform,
        );
        try {
          await sb
            .from("scheduled_posts")
            .update({
              status: "failed",
              error_message: "platform_not_supported",
            })
            .eq("id", job.id);
        } catch (markErr) {
          console.error("failed to mark unsupported job failed:", job.id, markErr);
        }
        continue;
      }

      // First move to "posting"
      const { error: upErr } = await sb
        .from("scheduled_posts")
        .update({ status: "posting" })
        .eq("id", job.id);

      if (upErr) {
        console.error("failed to mark posting:", job.id, upErr);
        try {
          await sb.rpc("sp_attempt_fail", {
            p_id: job.id,
            p_message: "mark_posting_failed",
          });
        } catch {
          // ignore
        }
        continue;
      }

      try {
        // Allow any connected page for this user
        const { data: conns, error: cErr } = await sb
          .from("connected_meta_accounts")
          .select("*")
          .eq("user_id", job.user_id)
          .eq("platform", "facebook");

        if (cErr) {
          throw cErr;
        }

        const connections = (conns || []) as Conn[];

        const conn = connections.find(
          (c) => c.page_id && c.page_id === job.target_id,
        );

        if (!conn || !conn.access_token) {
          throw new Error("access_token_not_found_for_target_page");
        }

        const pageIdForJob = conn.page_id ?? job.target_id;

        // 3) gather media (ordered)
        const { data: spm, error: spmErr } = await sb
          .from("scheduled_posts_media")
          .select("media_id, position")
          .eq("scheduled_post_id", job.id)
          .order("position", { ascending: true });

        if (spmErr) {
          throw spmErr;
        }

        const mediaIds = (spm || []).map((r: any) => r.media_id);
        let media: Media[] = [];
        if (mediaIds.length) {
          const { data: assets, error: mErr } = await sb
            .from("media_assets")
            .select("id, public_url, mime_type, width, height, duration_ms")
            .in("id", mediaIds);
          if (mErr) {
            throw mErr;
          }
          media = (assets || []) as Media[];
        }

        const caption = job.caption || "";

        // Publish to Facebook
        let { apiId, permalink } = await publishToFacebook({
          pageId: pageIdForJob,
          pageToken: conn.access_token,
          caption,
          media,
        });

        // If we got an ID but no permalink, try once more
        if (apiId && !permalink) {
          const retryPermalink = await fetchPermalinkById(
            apiId,
            conn.access_token,
          );
          if (retryPermalink) {
            permalink = retryPermalink;
          }
        }

        // Decide posted_at: prefer existing posted_at, then scheduled_at, then now
        const postedAtIso =
          job.posted_at ??
          job.scheduled_at ??
          new Date().toISOString();

        const { error: updateErr } = await sb
          .from("scheduled_posts")
          .update({
            status: "posted",
            posted_at: postedAtIso,
            api_post_id: apiId || null,
            permalink: permalink || null,
            error_message: null,
            page_id: pageIdForJob,
          })
          .eq("id", job.id);

        if (updateErr) {
          throw new Error(
            `mark_posted_failed:${(updateErr as any).message || updateErr}`,
          );
        }

        // Bandit reward is best-effort and MUST NOT break posting
        try {
          await sb.rpc("record_bandit_reward_for_post", {
            p_scheduled_post_id: job.id,
          });
        } catch (rbErr) {
          console.error("record_bandit_reward_for_post failed:", job.id, rbErr);
        }

        // Push notifications (best effort)
        const { data: devices } = await sb
          .from("user_devices")
          .select("expo_push_token")
          .eq("user_id", job.user_id)
          .not("expo_push_token", "is", null);

        for (const d of devices || []) {
          try {
            await sendExpoPush(
              (d as any).expo_push_token,
              "Post published ✅",
              "Your Facebook post has been published.",
            );
          } catch {
            // ignore push errors
          }
        }
      } catch (e) {
        const msg =
          e && typeof e === "object" && "message" in e
            ? (e as any).message
            : String(e);
        console.error("job failed:", job.id, msg);

        try {
          await sb
            .from("scheduled_posts")
            .update({
              status: "failed",
              error_message: msg,
            })
            .eq("id", job.id);
        } catch (markErr) {
          console.error("failed to mark job failed:", job.id, markErr);
        }

        try {
          await sb.rpc("sp_attempt_fail", {
            p_id: job.id,
            p_message: String(msg),
          });
        } catch {
          // ignore
        }
      }
    }

    return j(200, { ok: true, processed: due.length });
  } catch (e) {
    const detail =
      e && typeof e === "object" && "message" in e
        ? (e as any).message
        : String(e);
    console.error("worker top-level error:", detail);
    return j(500, { error: "worker_failed", detail: String(detail) });
  }
});
