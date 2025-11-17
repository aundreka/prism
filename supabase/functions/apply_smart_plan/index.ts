// supabase/functions/apply_smart_plan/index.ts
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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase env vars in apply_smart_plan");
}

// Helper: build a final caption from the brief
function buildCaptionFromBrief(brief?: SmartPlanBrief | null): string {
  if (!brief) return "";

  const hook = brief.hook?.trim() ?? "";
  const captionBody = brief.caption?.trim() ?? "";
  const cta = brief.cta?.trim() ?? "";

  let finalCaption = "";

  // 1) Prefer full caption if present
  if (captionBody.length > 0) {
    finalCaption = captionBody;
  }
  // 2) Otherwise fallback to hook as the caption
  else if (hook.length > 0) {
    finalCaption = hook;
  }

  // 3) If we have a CTA, append it nicely
  if (cta.length > 0) {
    // If caption already has some content, separate with a blank line
    if (finalCaption.length > 0) {
      finalCaption += finalCaption.endsWith(".") ? " " : "\n\n";
    }
    finalCaption += cta;
  }

  return finalCaption.trim();
}

// Angle-aware fallback when there is no brief at all
function buildAngleAwareFallback(angle: string, objective: string): string {
  const obj = (objective || "").toLowerCase();
  const ang = (angle || "").toLowerCase();

  // Helper to prefix by objective
  const withObjective = (base: string): string => {
    if (obj === "conversion" || obj === "sales") {
      return base + " Focus on why they should take action now.";
    }
    if (obj === "engagement") {
      return base + " End with a question to invite comments or reactions.";
    }
    // awareness or others
    return base + " Highlight your brand story or key value.";
  };

  // Educational / value
  if (
    [
      "how_to",
      "step_by_step",
      "tutorials",
      "beginner_friendly",
      "deep_dive",
      "mini_masterclass",
      "tools_i_use",
      "industry_terms_explained",
      "myths_vs_facts",
      "mistakes_to_avoid",
      "before_after_explained",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft an educational post that clearly teaches your audience something practical related to your offer."
    );
  }

  // Social proof / trust
  if (
    [
      "testimonial",
      "client_story",
      "case_study",
      "transformation",
      "results_breakdown",
      "behind_the_scenes",
      "day_in_the_life",
      "progress_update",
      "user_generated_content",
      "success_path",
      "client_result",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft a social proof post sharing a real client story, testimonial, or behind-the-scenes look."
    );
  }

  // Emotional / relatable
  if (
    [
      "relatable_problem",
      "frustrations",
      "personal_story",
      "founder_story",
      "mission_story",
      "vulnerable_post",
      "gratitude_post",
      "common_struggles",
      "daily_challenges",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft a relatable, human story that talks about a real challenge or experience your audience can connect with."
    );
  }

  // Conversion / offer
  if (
    [
      "promo",
      "limited_offer",
      "scarcity",
      "bundle",
      "price_reveal",
      "freebie",
      "giveaway",
      "call_to_action",
      "top_benefits",
      "faq",
      "comparison_chart",
      "price_bundle",
      "limited_time_item",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft an offer-focused post that clearly explains the promo, key benefits, and how to claim it."
    );
  }

  // Engagement boosters
  if (
    [
      "poll",
      "question_post",
      "opinion_prompt",
      "ranking_list",
      "challenge",
      "hot_take",
      "unpopular_opinion",
      "debate_starter",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft a conversation-starting post that asks for your audience's opinion or experience."
    );
  }

  // Lifestyle / aesthetic
  if (
    [
      "aesthetic_shot",
      "moodboard",
      "inspiration",
      "seasonal_post",
      "holiday_post",
      "trends",
      "lifestyle_fit",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft a lifestyle-focused caption that shows how your brand or offer fits into your audience's daily life."
    );
  }

  // Authority / expert
  if (
    [
      "credibility_boost",
      "stats_and_data",
      "research_backed",
      "certifications",
      "insider_tips",
      "pro_secrets",
      "industry_predictions",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft an authority-building post that shares data, insights, or expert tips in a clear way."
    );
  }

  // Community / collab
  if (
    [
      "community_highlight",
      "local_spotlight",
      "collab",
      "partnership_post",
      "charity_support",
      "volunteer_story",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft a community-focused post highlighting people, partners, or causes you support."
    );
  }

  // Some key industry-specific clusters (generic wording)

  // Creator / influencer style
  if (
    [
      "trending_sound",
      "trend_reaction",
      "stitch_or_duet",
      "prank_content",
      "challenge_participation",
      "aesthetic_unboxing",
      "day_in_my_life",
      "room_setup_tour",
      "productivity_tips",
      "routines",
      "transformation_edit",
      "cosplay",
      "commentary_take",
      "realistic_vs_expectation",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft a casual, creator-style caption that feels like a real day-in-my-life or reaction post."
    );
  }

  // Education / school
  if (
    [
      "study_tips",
      "exam_hacks",
      "reviewer_snippets",
      "campus_life",
      "org_event_highlights",
      "student_testimonial",
      "teacher_profile",
      "alumni_story",
      "subject_minilessons",
      "academic_myth_busting",
      "club_recruitment",
      "org_achievements",
      "competition_results",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft an education-focused caption sharing tips, achievements, or student stories."
    );
  }

  // Nonprofit / mental health / advocacy
  if (
    [
      "impact_story",
      "volunteer_feature",
      "donation_use_breakdown",
      "campaign_pitch",
      "awareness_fact",
      "stigma_busting",
      "call_for_volunteers",
      "success_metrics",
      "community_voice",
      "real_life_case",
      "advocacy_why",
      "behind_the_campaign",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft an impact-driven caption that shares a real story, important fact, or clear call to get involved."
    );
  }

  // Real estate / home / interior
  if (
    [
      "property_tour",
      "neighborhood_highlight",
      "design_trends",
      "price_breakdown",
      "market_update",
      "interior_before_after",
      "renovation_process",
      "staging_tips",
      "buyer_mistakes",
      "lifestyle_fit_story",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft a caption that highlights a property, space, or home story with clear benefits for buyers."
    );
  }

  // Fitness / wellness
  if (
    [
      "workout_of_the_day",
      "nutrition_tip",
      "mindfulness_exercise",
      "pose_tutorial",
      "progress_tracking",
      "healthy_swap",
      "10min_workout",
      "form_check",
      "wellness_challenge",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft a health or fitness caption that shares a simple workout, tip, or mindset shift."
    );
  }

  // Beauty / fashion
  if (
    [
      "get_ready_with_me",
      "product_review",
      "style_guide",
      "color_palette",
      "outfit_inspo",
      "3_ways_to_style",
      "makeup_tutorial",
      "ingredient_spotlight",
      "beauty_myths",
      "new_arrivals",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft a beauty or style caption that feels like a friendly recommendation or tutorial."
    );
  }

  // Trades / services
  if (
    [
      "before_after_fix",
      "emergency_tip",
      "maintenance_reminders",
      "safety_tips",
      "signs_you_need_service",
      "warranty_explanation",
      "project_walkthrough",
      "seasonal_checklist",
      "estimation_guide",
      "cost_transparency",
      "best_practices",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft a practical service caption that explains a problem, fix, or maintenance tip in simple terms."
    );
  }

  // F&B
  if (
    [
      "recipe_teaser",
      "menu_highlight",
      "chef_special",
      "food_aesthetic",
      "behind_the_kitchen",
      "sourcing_ingredients",
      "signature_dish_story",
      "seasonal_menu",
      "customer_favorites",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft a mouth-watering caption describing the dish or drink and why people should try it."
    );
  }

  // Clinic / health
  if (
    [
      "health_tip",
      "symptom_explainer",
      "when_to_seek_help",
      "patient_story",
      "treatment_process",
      "equipment_explained",
      "health_myth_busting",
      "doctor_profile",
      "clinic_tour",
      "recovery_guide",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft a reassuring health-focused caption that explains a condition, tip, or patient journey clearly."
    );
  }

  // Local business / personal brand
  if (
    [
      "founder_intro",
      "origin_story",
      "mission",
      "community_support",
      "customer_review",
      "highlights_of_the_week",
      "local_event",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft a personal, story-driven caption introducing your brand, team, or community moments."
    );
  }

  // Creative / media
  if (
    [
      "shoot_breakdown",
      "lighting_setup",
      "color_grading_before_after",
      "gear_talk",
      "behind_the_shot",
      "portfolio_piece",
      "inspiration",
      "technique_tutorial",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft a creative caption that explains the story or technique behind your work in a simple way."
    );
  }

  // SaaS / tech
  if (
    [
      "feature_spotlight",
      "product_update",
      "roadmap",
      "use_case_explainer",
      "micro_demo",
      "onboarding_tips",
      "performance_metrics",
      "integration_how_to",
      "user_story",
    ].includes(ang)
  ) {
    return withObjective(
      "Draft a product-focused caption that explains a feature, use case, or user story in clear, non-technical language."
    );
  }

  // Default neutral fallback
  return "Write your caption for this planned post. Focus on your main message and what you want your audience to do next.";
}

serve(async (req) => {
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

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Resolve user from JWT
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(jwt);

    if (userError || !user) {
      console.error("getUser error", userError);
      return new Response("Invalid auth token", { status: 401 });
    }

    // Find connected Meta account to know target_id (page_id)
    const { data: account, error: accError } = await supabaseAdmin
      .from("connected_meta_accounts")
      .select("page_id")
      .eq("user_id", user.id)
      .eq("platform", platform)
      .maybeSingle();

    if (accError) {
      console.error("connected_meta_accounts error:", accError);
      return new Response(
        JSON.stringify({ error: "Failed to resolve connected Meta account" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const targetId = (account as any)?.page_id;
    if (!targetId) {
      return new Response(
        JSON.stringify({
          error:
            "No connected page for this platform. Connect your Facebook Page first.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const created: {
      slot_index: number;
      post_id: string | null;
      scheduled_id: string | null;
    }[] = [];

    // In v1 we just iterate; each slot is atomic via create_post_with_schedules
    for (const slot of slots) {
      // Build caption from brief (hook + caption + cta),
      // and only if that's empty, use an angle-aware fallback.
      const briefCaption = buildCaptionFromBrief(slot.brief);
      const caption =
        briefCaption.length > 0
          ? briefCaption
          : buildAngleAwareFallback(slot.angle, slot.objective);

      const postType = (slot.content_type || "image") as any;
      const scheduledAt = slot.timeslot;

      // RPC: create_post_with_schedules
      const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
        "create_post_with_schedules",
        {
          p_user_id: user.id,
          p_caption: caption,
          p_post_type: postType,
          p_media_ids: [], // no media yet; user can attach later
          p_platforms: [platform],
          p_target_ids: [targetId],
          p_status: "draft", // draft schedules; user can review and publish
          p_scheduled_at: scheduledAt,
        }
      );

      if (rpcError) {
        console.error("create_post_with_schedules error:", rpcError);
        // You can choose to skip failing slots instead of aborting all.
        // For now, we'll throw to surface the issue clearly.
        throw rpcError;
      }

      const rpcArr = Array.isArray(rpcData) ? rpcData : [rpcData];
      const first = rpcArr[0] ?? {};
      const postId: string | null = first.post_id ?? null;
      const scheduledIds: string[] = (first.scheduled_ids as string[]) ?? [];
      const scheduledId = scheduledIds[0] ?? null;

      // Attach segment if present
      if (scheduledId && slot.segment_id != null) {
        const { error: segError } = await supabaseAdmin
          .from("scheduled_posts_target_segments")
          .insert({
            scheduled_post_id: scheduledId,
            segment_id: slot.segment_id,
          });

        if (segError) {
          console.error(
            "scheduled_posts_target_segments insert error:",
            segError
          );
          // Decide: continue vs throw; here we throw to surface it
          throw segError;
        }
      }

      created.push({
        slot_index: slot.slot_index,
        post_id: postId,
        scheduled_id: scheduledId,
      });
    }

    return new Response(JSON.stringify({ created }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("apply_smart_plan top-level error:", e);
    return new Response(
      JSON.stringify({ error: "Internal error", details: `${e}` } ),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
