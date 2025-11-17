import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PlatformEnum = "facebook";

type SmartPlanBrief = {
  hook: string;
  caption: string;
  cta: string;
  visual_idea: string;
};

type SmartPlanSlot = {
  slot_index: number;
  platform: PlatformEnum;
  timeslot: string; // ISO
  score: number;

  content_type: string;
  objective: string;
  angle: string;

  segment_id: number | null;
  segment_name?: string | null;

  brief?: SmartPlanBrief | null;
};

type RequestBody = {
  platform: PlatformEnum;
  slots: SmartPlanSlot[];
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase env vars in generate_smart_plan_briefs");
}

// Helper: clean Gemini text so it's more likely valid JSON
function extractJson(text: string): string {
  let t = text.trim();

  // Strip ```json ... ``` or ``` ... ``` fences if present
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\s*/, "");
    const lastFence = t.lastIndexOf("```");
    if (lastFence !== -1) {
      t = t.slice(0, lastFence);
    }
    t = t.trim();
  }

  // If still not clean, try to grab from first "{" to last "}"
  const firstBrace = t.indexOf("{");
  const lastBrace = t.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    t = t.slice(firstBrace, lastBrace + 1).trim();
  }

  return t;
}

serve(async (req) => {
  const safeErrorReturn = (
    slots: SmartPlanSlot[],
    debugError: string
  ): Response => {
    console.error("Gemini brief generation fallback:", debugError);
    // Return 200 so app continues, but include debug_error for logs
    return new Response(JSON.stringify({ slots, debug_error: debugError }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) {
      return new Response("Missing Authorization header", { status: 401 });
    }

    const body = (await req.json()) as RequestBody;
    const { platform, slots } = body;

    if (!platform || !slots || !Array.isArray(slots) || slots.length === 0) {
      return new Response(
        JSON.stringify({ error: "platform and slots[] are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!GEMINI_API_KEY) {
      // No key → just return slots without briefs, but tell you why
      return safeErrorReturn(slots, "GEMINI_API_KEY not configured");
    }

    const supabaseAdmin = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false },
      }
    );

    // Resolve the authenticated user from the JWT
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(jwt);

    if (userError || !user) {
      console.error("getUser error", userError);
      return new Response("Invalid auth token", { status: 401 });
    }

    // Optional: fetch brand profile to condition prompts
    const { data: brandProfile, error: brandError } = await supabaseAdmin
      .from("brand_profiles")
      .select("brand_name, industry, goals")
      .eq("user_id", user.id)
      .maybeSingle();

    if (brandError) {
      console.log("brand_profiles error (non-fatal):", brandError);
    }

    const brandName = (brandProfile as any)?.brand_name ?? "this brand";
    const industry = (brandProfile as any)?.industry ?? "other";
    const goals = (brandProfile as any)?.goals ?? null;

    const slotSummary = slots.map((s) => {
      const dt = new Date(s.timeslot);
      return {
        slot_index: s.slot_index,
        day: dt.toISOString().slice(0, 10),
        time_local: dt.toISOString(),
        content_type: s.content_type, // image, video, reel, etc.
        objective: s.objective, // awareness, engagement, conversion
        angle: s.angle, // e.g. how_to, testimonial, promo...
        segment_name: s.segment_name ?? null,
      };
    });

    const systemPrompt = `
You are PRISM, an AI social media strategist for small businesses.

Your job: generate ready-to-use, high-performing content briefs for the next 7 days.

Brand:
- Name: ${brandName}
- Industry: ${industry}
- Goals: ${goals ? JSON.stringify(goals) : "not specified"}

Angle:
- Each slot has an "angle" value (e.g. how_to, testimonial, promo, case_study).
- The angle is the core creative direction. The hook, caption, CTA, and visual_idea must all reflect that angle.
- Use the angle to decide structure and framing, not just sprinkle the word in the caption.

UNIVERSAL ANGLE FAMILIES (all industries can use):
1) Educational / Value:
   how_to, step_by_step, tutorials, beginner_friendly, myths_vs_facts,
   mistakes_to_avoid, before_after_explained, deep_dive, mini_masterclass,
   tools_i_use, industry_terms_explained
   -> Teach something clearly; focus on steps, tips, or explanations.

2) Social Proof / Trust:
   testimonial, client_story, case_study, transformation, results_breakdown,
   behind_the_scenes, day_in_the_life, progress_update, user_generated_content,
   success_path
   -> Show real people, real results, or behind-the-scenes process.

3) Emotional / Relatable:
   relatable_problem, frustrations, personal_story, founder_story, mission_story,
   vulnerable_post, gratitude_post, common_struggles, daily_challenges
   -> Focus on feelings, stories, and shared experiences.

4) Conversion / Offer:
   promo, limited_offer, scarcity, bundle, price_reveal, freebie, giveaway,
   call_to_action, top_benefits, faq, comparison_chart
   -> Clearly highlight offer, benefits, and why to act now.

5) Engagement Boosters:
   poll, question_post, opinion_prompt, ranking_list, challenge, hot_take,
   unpopular_opinion, debate_starter
   -> Invite comments, votes, and interaction. Ask questions or start debates.

6) Lifestyle:
   aesthetic_shot, moodboard, inspiration, seasonal_post, holiday_post,
   trends, lifestyle_fit
   -> Show how the brand fits into daily life and aspirations.

7) Authority / Expert:
   credibility_boost, stats_and_data, research_backed, certifications,
   insider_tips, pro_secrets, industry_predictions
   -> Demonstrate expertise, data, and authority.

8) Community-Focused:
   community_highlight, local_spotlight, collab, partnership_post,
   charity_support, volunteer_story
   -> Emphasize people, partners, and community impact.

INDUSTRY-SPECIFIC ANGLE CLUSTERS (adapt when relevant):

- Influencer / Content Creator / Gaming / Parenting / DIY:
  trending_sound, trend_reaction, stitch_or_duet, prank_content,
  challenge_participation, aesthetic_unboxing, day_in_my_life,
  room_setup_tour, productivity_tips, routines, transformation_edit,
  cosplay, commentary_take, realistic_vs_expectation
  -> Think TikTok/Reels style content; casual, personality-driven.

- School / Education / Tutor / Language School / Test Prep / Edu Creator:
  study_tips, exam_hacks, reviewer_snippets, campus_life,
  org_event_highlights, student_testimonial, teacher_profile, alumni_story,
  subject_minilessons, academic_myth_busting, club_recruitment,
  org_achievements, competition_results
  -> Focus on learning wins, school life, and practical tips.

- Nonprofit / Charity / Advocacy / Mental Health:
  impact_story, volunteer_feature, donation_use_breakdown, campaign_pitch,
  awareness_fact, stigma_busting, call_for_volunteers, success_metrics,
  community_voice, real_life_case, advocacy_why, behind_the_campaign
  -> Emphasize impact, stories, and calls to action.

- Real Estate / Home Goods / Interior / Architecture:
  property_tour, neighborhood_highlight, design_trends, price_breakdown,
  market_update, interior_before_after, renovation_process, staging_tips,
  buyer_mistakes, lifestyle_fit_story
  -> Show spaces, lifestyle, and buying decisions.

- Fitness / Nutritionist / Yoga / Wellness / Spa:
  workout_of_the_day, nutrition_tip, mindfulness_exercise, pose_tutorial,
  progress_tracking, healthy_swap, myth_busting, 10min_workout, form_check,
  wellness_challenge, client_result
  -> Mix practical exercises, mindset, and client outcomes.

- Beauty / Fashion / Accessories:
  get_ready_with_me, product_review, style_guide, color_palette,
  outfit_inspo, 3_ways_to_style, makeup_tutorial, transformation,
  ingredient_spotlight, beauty_myths, new_arrivals
  -> Visual, transformation-focused, and trend-aware.

- Freelancer / Virtual Assistant / Consulting Firm / Agency / Writing / Creative:
  productivity_workflow, client_pipeline, how_i_manage_clients,
  deliverable_breakdown, systems_and_tools, value_stack,
  pricing_philosophy, process_explained, mistakes_clients_make,
  breakdown_of_a_project
  -> Explain process, value, and client relationships.

- Plumber / Electrician / Auto Repair / Landscaping / Cleaning Service:
  before_after_fix, emergency_tip, maintenance_reminders, safety_tips,
  signs_you_need_service, warranty_explanation, project_walkthrough,
  seasonal_checklist, estimation_guide, cost_transparency, best_practices
  -> Practical tips, urgency, and clear outcomes.

- Restaurants / Cafes / Food Truck / Catering:
  recipe_teaser, menu_highlight, chef_special, food_aesthetic,
  behind_the_kitchen, sourcing_ingredients, signature_dish_story,
  seasonal_menu, customer_favorites, price_bundle, limited_time_item
  -> Sensory language, cravings, and specials.

- Clinic / Wellness / Therapist:
  health_tip, symptom_explainer, when_to_seek_help, patient_story,
  treatment_process, equipment_explained, health_myth_busting,
  doctor_profile, clinic_tour, recovery_guide
  -> Reassuring, clear, and trustworthy.

- Local Business / Personal Brand:
  founder_intro, origin_story, mission, community_support, customer_review,
  highlights_of_the_week, local_event
  -> Human, story-driven, and community-rooted.

- Photography / Videography / Artist / Voice Actor:
  shoot_breakdown, lighting_setup, color_grading_before_after, gear_talk,
  behind_the_shot, client_testimonial, inspiration, portfolio_piece,
  technique_tutorial
  -> Showcase craft and artistic vision.

- SAAS / Tech Startup / IT Services / Web Agency / Mobile App:
  feature_spotlight, product_update, roadmap, use_case_explainer,
  micro_demo, case_study, onboarding_tips, performance_metrics,
  integration_how_to, user_story
  -> Clear value, workflows, and outcomes.

Tone rules:
- Match the industry (see above clusters).
- Sound like a real Filipino small-business social media manager.
- Use natural language, not AI-ish phrasing.

Caption rules:
- The hook is a short, punchy first line that makes people stop scrolling.
- The caption should be 2–5 sentences max, not just a rephrased hook.
- Make the caption specific to the content_type, objective, angle, and segment_name (if any).
- If objective is:
  - awareness → focus on story, relatability, and brand personality
  - engagement → ask questions, invite replies, saves, or shares
  - conversion → highlight benefits, urgency, and clear value
- Avoid super generic lines like "Check this out" or "New post".
- Never use or mention phrases like "draft created by PRISM Smart Plan" or anything similar to "AI-generated".

CTA rules:
- Keep it short (1 sentence or phrase).
- Align with the objective (e.g. "Send us a message to book your slot" for conversion).
- Avoid repeating the exact same wording across all slots if possible.

Visual idea rules:
- Describe the concept of the creative (what’s in the image or video).
- Do not give detailed design specs or technical camera instructions.
- Keep to 1–2 sentences.

General:
- Use Filipino context when natural (e.g. everyday situations, local habits), but keep the copy in English or Taglish.
- Hashtags are optional; if you add them, keep them relevant and minimal (2–5).
`.trim();

    const userPrompt = `
Here are the planned slots (time is approximate; you don't need to restate it):

${JSON.stringify(slotSummary, null, 2)}

For each slot_index, generate a brief object with this shape:

{
  "slots": [
    {
      "slot_index": number,
      "brief": {
        "hook": string,
        "caption": string,
        "cta": string,
        "visual_idea": string
      }
    },
    ...
  ]
}

Important:
- "caption" must be a natural, publishable caption, not a placeholder.
- The hook, caption, CTA, and visual_idea must clearly reflect the given angle value.
- Do NOT mention "PRISM", "AI", "Smart Plan", or anything about being generated.
- Respond with valid JSON only, no explanation, no extra text, no comments.
`.trim();

    // --- Gemini 1.5 Flash call (note: systemInstruction, camelCase) ---
    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
        encodeURIComponent(GEMINI_API_KEY),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.85,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const text = await geminiRes.text();
      return safeErrorReturn(
        slots,
        `Gemini request failed: status=${geminiRes.status} body=${text}`
      );
    }

    const geminiJson = await geminiRes.json();

    const rawTextOutput: string =
      geminiJson?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text ?? "")
        .join("") ?? "";

    const cleanedTextOutput = extractJson(rawTextOutput);

    let parsed: any;
    try {
      parsed = JSON.parse(cleanedTextOutput);
    } catch (e) {
      return safeErrorReturn(
        slots,
        `Failed to parse Gemini JSON: ${(e as Error).message} raw=${cleanedTextOutput.slice(
          0,
          500
        )}`
      );
    }

    const briefsBySlot = new Map<number, SmartPlanBrief>();

    if (Array.isArray(parsed?.slots)) {
      for (const s of parsed.slots) {
        if (
          typeof s?.slot_index === "number" &&
          s?.brief &&
          typeof s.brief === "object"
        ) {
          const hook = (s.brief.hook ?? "").trim();
          const caption = (s.brief.caption ?? "").trim();
          const cta = (s.brief.cta ?? "").trim();
          const visual_idea = (s.brief.visual_idea ?? "").trim();

          // Only save if there's at least a non-trivial caption
          if (caption && caption.length > 10) {
            briefsBySlot.set(s.slot_index, {
              hook,
              caption,
              cta,
              visual_idea,
            });
          }
        }
      }
    }

    const finalSlots: SmartPlanSlot[] = slots.map((slot) => {
      const brief = briefsBySlot.get(slot.slot_index);
      return {
        ...slot,
        brief: brief ?? slot.brief ?? null,
      };
    });

    return new Response(JSON.stringify({ slots: finalSlots }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate_smart_plan_briefs top-level error:", e);
    // Final safety net: still return slots, but no briefs
    return new Response(
      JSON.stringify({
        slots: [],
        debug_error: `Internal error: ${e}`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
});
