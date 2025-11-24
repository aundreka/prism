// supabase/functions/meta_set_active_page/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error("Missing env", {
      SUPABASE_URL: !!SUPABASE_URL,
      SERVICE_ROLE: !!SERVICE_ROLE,
    });
    return json(500, { error: "missing_env" });
  }

  try {
    const { user_id, page_id, platform = "facebook" } = await req.json();

    if (!user_id || !page_id) {
      return json(400, {
        error: "bad_request",
        detail: "user_id and page_id are required",
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) Make sure the page actually belongs to this user+platform
    const { data: existing, error: lookupErr } = await supabase
      .from("connected_meta_accounts")
      .select("id, page_id, is_active")
      .eq("user_id", user_id)
      .eq("platform", platform)
      .eq("page_id", page_id)
      .maybeSingle();

    if (lookupErr) {
      console.error("meta_set_active_page: lookupErr", lookupErr);
      return json(500, {
        error: "lookup_failed",
        detail: lookupErr.message ?? "Could not check page ownership",
      });
    }

    if (!existing) {
      return json(404, {
        error: "not_found",
        detail: "Page not found for this user/platform",
      });
    }

    // 2) Use the SQL helper to flip is_active in a single statement
    const { error: rpcErr } = await supabase.rpc("set_active_meta_page", {
      p_user_id: user_id,
      p_platform: platform,
      p_page_id: page_id,
    });

    if (rpcErr) {
      console.error("meta_set_active_page: rpcErr", rpcErr);
      return json(500, {
        error: "update_failed",
        detail: rpcErr.message ?? "Failed to set active page",
      });
    }

    // 3) Return the now-active row (for confirmation / debugging)
    const { data: activeRow, error: activeErr } = await supabase
      .from("connected_meta_accounts")
      .select("id, page_id, page_name, is_active")
      .eq("user_id", user_id)
      .eq("platform", platform)
      .eq("page_id", page_id)
      .maybeSingle();

    if (activeErr) {
      console.error("meta_set_active_page: activeErr", activeErr);
      // Still consider it success, just no extra data
      return json(200, { ok: true, page_id, platform });
    }

    return json(200, { ok: true, active: activeRow });
  } catch (e: any) {
    console.error("meta_set_active_page: fatal", e);
    return json(500, {
      error: "internal_server_error",
      detail: String(e?.message ?? e),
    });
  }
});
