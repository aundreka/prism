// supabase/functions/meta_webhook/index.ts
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const VERIFY = Deno.env.get("META_VERIFY_TOKEN")!;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  const u = new URL(req.url);

  if (req.method === "GET") {
    const mode = u.searchParams.get("hub.mode");
    const token = u.searchParams.get("hub.verify_token");
    const challenge = u.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    // record raw event (you can map to analytics_events later)
    await sb.from("post_logs").insert({
      step: "explore",
      request_summary: body,
      response_summary: null,
    });
    return new Response("ok");
  }

  return new Response("Method Not Allowed", { status: 405 });
});
