// supabase/functions/meta_select_page/index.ts
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { user_id, page_id } = await req.json();
    if (!user_id || !page_id) {
      return new Response("Bad Request", { status: 400 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Get stored USER token
    const { data: acct, error } = await sb
      .from("connected_meta_accounts")
      .select("id, user_access_token")
      .eq("user_id", user_id)
      .eq("platform", "facebook")
      .limit(1)
      .single();

    if (error || !acct?.user_access_token) {
      console.error("No user_access_token", error);
      return new Response(JSON.stringify({ error: "reconnect_required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const userToken = acct.user_access_token as string;

    // Fetch pages for this user
    const fields = "id,name,access_token,connected_instagram_account{ id,username }";
    const pagesRes = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts` +
        `?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(userToken)}`,
    );

    const pagesJson = await pagesRes.json().catch(() => ({} as any));

    if (!pagesRes.ok || !pagesJson?.data?.length) {
      console.error("me/accounts error", pagesJson);
      return new Response(JSON.stringify({ error: "reconnect_required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const page = pagesJson.data.find((p: any) => String(p.id) === String(page_id));
    if (!page) {
      return new Response(JSON.stringify({ error: "page_not_found_for_user" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    const ig = page.connected_instagram_account ?? null;

    // Update row with new page + PAGE TOKEN
    const { error: updErr } = await sb
      .from("connected_meta_accounts")
      .update({
        page_id: String(page.id),
        page_name: page.name ?? null,
        ig_user_id: ig?.id ?? null,
        ig_username: ig?.username ?? null,
        access_token: page.access_token, // fresh PAGE token
      })
      .eq("user_id", user_id)
      .eq("platform", "facebook")
      .eq("page_id", page_id); // or match by id if you have one

    if (updErr) {
      console.error("update failed", updErr);
      return new Response(JSON.stringify({ error: "db_update_failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("meta_select_page fatal", e);
    return new Response(JSON.stringify({ error: "internal_server_error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
