// supabase/functions/backfill_fb_permalinks/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FB_GRAPH = "https://graph.facebook.com/v21.0";

type SchedRow = {
  id: string;
  user_id: string;
  platform: "facebook";
  api_post_id: string | null;
  permalink: string | null;
  page_id: string | null;
};

type Conn = {
  id: string;
  user_id: string;
  platform: "facebook";
  page_id: string | null;
  access_token: string;
};

function j(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function parseFB(r: Response) {
  const text = await r.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  return { ok: r.ok, json, raw: text };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return j(405, { error: "method_not_allowed" });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 1) Find scheduled_posts needing permalink
  const { data: rows, error: selErr } = await sb
    .from("scheduled_posts")
    .select("id, user_id, platform, api_post_id, permalink, page_id")
    .eq("platform", "facebook")
    .is("permalink", null)
    .not("api_post_id", "is", null)
    .limit(100); // backfill in small batches

  if (selErr) {
    console.error("select failed:", selErr);
    return j(500, { error: "select_failed", detail: String(selErr) });
  }

  if (!rows || !rows.length) {
    return j(200, { ok: true, processed: 0 });
  }

  const schedRows = rows as SchedRow[];

  // 2) Preload all connections for these users
  const userIds = [...new Set(schedRows.map((r) => r.user_id))];

  const { data: conns, error: cErr } = await sb
    .from("connected_meta_accounts")
    .select("id, user_id, platform, page_id, access_token")
    .eq("platform", "facebook")
    .in("user_id", userIds);

  if (cErr) {
    console.error("conns select failed:", cErr);
    return j(500, { error: "conns_failed", detail: String(cErr) });
  }

  const connRows = (conns || []) as Conn[];

  let updated = 0;
  const failures: { id: string; reason: string }[] = [];

  for (const row of schedRows) {
    try {
      const conn =
        connRows.find(
          (c) => c.user_id === row.user_id && c.page_id === row.page_id,
        ) ||
        connRows.find((c) => c.user_id === row.user_id);

      if (!conn || !conn.access_token) {
        failures.push({
          id: row.id,
          reason: "no_access_token",
        });
        continue;
      }

      const u = new URL(`${FB_GRAPH}/${row.api_post_id}`);
      u.searchParams.set("fields", "permalink_url");
      u.searchParams.set("access_token", conn.access_token);

      const r = await fetch(u);
      const { ok, json, raw } = await parseFB(r);

      if (!ok || !json || !json.permalink_url) {
        failures.push({
          id: row.id,
          reason: `fb_error:${raw}`,
        });
        continue;
      }

      const permalink = json.permalink_url as string;

      const { error: upErr } = await sb
        .from("scheduled_posts")
        .update({ permalink })
        .eq("id", row.id);

      if (upErr) {
        failures.push({ id: row.id, reason: `update_failed:${upErr}` });
        continue;
      }

      updated++;
    } catch (e) {
      failures.push({
        id: row.id,
        reason:
          e && typeof e === "object" && "message" in e
            ? (e as any).message
            : String(e),
      });
    }
  }

  return j(200, {
    ok: true,
    processed: schedRows.length,
    updated,
    failures,
  });
});
