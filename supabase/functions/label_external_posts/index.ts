// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  try {
    const { user_id } = await req.json(); // or get from JWT

    // 1. Fetch a small batch of unlabeled external posts
    const { data: posts, error } = await supabase
      .from("external_posts")
      .select("id, caption, post_type, created_at")
      .eq("user_id", user_id)
      .is("objective", null)
      .is("angle", null)
      .limit(20);

    if (error) {
      console.error("Error fetching external posts", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
      });
    }

    if (!posts || posts.length === 0) {
      return new Response(JSON.stringify({ done: true }), { status: 200 });
    }

    // 2. Call your LLM classifier once with all posts
    const prompt = buildClassificationPrompt(posts);

    const llmResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // or whatever
        messages: [
          {
            role: "system",
            content:
              "You are a marketing classifier. For each post caption, you output JSON with objective and angle.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0,
      }),
    });

    const json = await llmResp.json();
    const content = json.choices[0].message.content.trim();

    // Expecting something like:
    // [{ "id": 123, "objective": "awareness", "angle": "how_to" }, ...]
    const labels: { id: number; objective: string; angle: string }[] =
      JSON.parse(content);

    // 3. Upsert labels
    const now = new Date().toISOString();

    for (const label of labels) {
      const { error: updateErr } = await supabase
        .from("external_posts")
        .update({
          objective: label.objective,
          angle: label.angle,
          labeled_at: now,
          label_source: "gpt-4o-mini:v1",
        })
        .eq("id", label.id);

      if (updateErr) {
        console.error("Error updating external_post label", label, updateErr);
      }
    }

    return new Response(JSON.stringify({ labeled: labels.length }), {
      status: 200,
    });
  } catch (e) {
    console.error("Unhandled error", e);
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
    });
  }
});

function buildClassificationPrompt(
  posts: { id: number; caption: string | null; post_type: string | null }[],
): string {
  return `
You will classify social media posts for a brand.

For each post, return a JSON array where each item is:
{
  "id": <id>,
  "objective": "awareness" | "engagement" | "conversion",
  "angle": "how_to" | "testimonial" | "promo" | "faq" | "behind_the_scenes" | "storytelling" | "other"
}

Posts:
${posts
  .map(
    (p) =>
      `- id: ${p.id}\n  type: ${p.post_type ?? "unknown"}\n  caption: ${
        p.caption ?? "(no caption)"
      }`,
  )
  .join("\n\n")}

Return ONLY the JSON array, nothing else.
`.trim();
}
