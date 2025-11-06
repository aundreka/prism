// supabase/functions/meta_ig_enrich/index.ts
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

type Row = {
  id: string;
  user_id: string;
  platform: "facebook";
  page_id: string | null;
  page_name: string | null;
  ig_user_id: string | null;
  ig_username: string | null;
  access_token: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

async function fetchJSON(url: string) {
  const r = await fetch(url);
  const t = await r.text();
  try {
    return { ok: r.ok, status: r.status, data: t ? JSON.parse(t) : {} };
  } catch {
    return { ok: r.ok, status: r.status, data: t };
  }
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST,OPTIONS",
        "access-control-allow-headers": "content-type,authorization",
      },
    });
  }
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Server env not configured" }, 500);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Optional targeting:
  // body: { user_id?, id?, page_id?, only_missing?: boolean }
  const body = await req.json().catch(() => ({}));
  const { user_id, id, page_id, only_missing = true } = body || {};

  let q = sb
    .from("connected_meta_accounts")
    .select("id,user_id,platform,page_id,page_name,ig_user_id,ig_username,access_token")
    .eq("platform", "facebook");

  if (user_id) q = q.eq("user_id", user_id);
  if (id) q = q.eq("id", id);
  if (page_id) q = q.eq("page_id", page_id);
  if (only_missing) q = q.is("ig_username", null);

  const { data: rows, error } = await q.limit(2000);
  if (error) return json({ error: "DB query failed", details: error.message }, 500);
  if (!rows || rows.length === 0) return json({ updated: 0, skipped: 0, items: [] });

  const results: Array<{ id: string; status: "ok" | "skip" | "error"; username?: string; reason?: string }> = [];
  let updated = 0;
  let skipped = 0;

  // Process sequentially (safe). You can parallelize if you like.
  for (const r of rows as Row[]) {
    if (!r.ig_user_id) {
      results.push({ id: r.id, status: "skip", reason: "no_ig_user_id" });
      skipped++;
      continue;
    }
    if (!r.access_token) {
      results.push({ id: r.id, status: "error", reason: "missing_page_token" });
      continue;
    }

    // GET /{ig_user_id}?fields=username
    const u = new URL(`https://graph.facebook.com/v19.0/${r.ig_user_id}`);
    u.searchParams.set("fields", "username");
    u.searchParams.set("access_token", r.access_token);

    const { ok, status, data } = await fetchJSON(u.toString());
    const igUsername = (data && typeof data === "object" && (data as any).username) || null;

    if (!ok || !igUsername) {
      results.push({
        id: r.id,
        status: "error",
        reason: `graph_${status}` + (data?.error?.message ? `:${data.error.message}` : ""),
      });
      continue;
    }

    const { error: upErr } = await sb
      .from("connected_meta_accounts")
      .update({ ig_username: igUsername })
      .eq("id", r.id);

    if (upErr) {
      results.push({ id: r.id, status: "error", reason: `db_update:${upErr.message}` });
      continue;
    }

    updated++;
    results.push({ id: r.id, status: "ok", username: igUsername });
  }

  return json({ updated, skipped, total: rows.length, items: results });
});
