// app/(tabs)/index.tsx
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { supabase } from "@/lib/supabase";
import { SmartRecommendationsCard } from "@/components/SmartRecommendations";
import { AnalyticsSection } from "@/components/AnalyticsSection";

type PlatformEnum = "facebook";
type PostStatusEnum =
  | "draft"
  | "scheduled"
  | "posting"
  | "posted"
  | "failed"
  | "canceled";

type PostRow = {
  id: string;
  user_id: string;
  caption: string | null;
  post_type: string;
  created_at: string;
};

type SchedRow = {
  id: string;
  post_id: string | null;
  status: PostStatusEnum;
  platform: PlatformEnum;
  api_post_id: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
};

type AnalyticsRow = {
  object_id: string | null;
  metric: string;
  value: number;
};

type ExternalPostRow = {
  object_id: string;
  caption: string | null;
  content_type: string | null;
  created_at: string;
};

type DailyEngRow = {
  day: string;
  engagement: number;
};

type SmartPlanBrief = {
  hook: string;
  caption: string;
  cta: string;
  visual_idea: string;
};

type SmartPlanSlot = {
  slot_index: number;
  platform: PlatformEnum;
  timeslot: string; // ISO string
  score: number;

  content_type: string; // "reel" | "image" | ...
  objective: string; // "awareness" | "engagement" | "sales"
  angle: string; // "promo" | "how_to" | ...

  segment_id: number | null;
  segment_name?: string | null;

  brief: SmartPlanBrief | null;
};

const BG = "#F8FAFC";
const TEXT = "#111827";
const MUTED = "#6B7280";

/* ============================================================
   ANGLE CATALOG — UNIVERSAL + INDUSTRY-SPECIFIC
   ============================================================ */

// 1) Universal angle families (usable across all industries)
const UNIVERSAL_ANGLES: string[] = [
  // Educational / Value
  "how_to",
  "step_by_step",
  "tutorials",
  "beginner_friendly",
  "myths_vs_facts",
  "mistakes_to_avoid",
  "before_after_explained",
  "deep_dive",
  "mini_masterclass",
  "tools_i_use",
  "industry_terms_explained",

  // Social Proof / Trust
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

  // Emotional / Relatable
  "relatable_problem",
  "frustrations",
  "personal_story",
  "founder_story",
  "mission_story",
  "vulnerable_post",
  "gratitude_post",
  "common_struggles",
  "daily_challenges",

  // Conversion / Offer
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

  // Engagement Boosters
  "poll",
  "question_post",
  "opinion_prompt",
  "ranking_list",
  "challenge",
  "hot_take",
  "unpopular_opinion",
  "debate_starter",

  // Lifestyle
  "aesthetic_shot",
  "moodboard",
  "inspiration",
  "seasonal_post",
  "holiday_post",
  "trends",
  "lifestyle_fit",

  // Authority / Expert
  "credibility_boost",
  "stats_and_data",
  "research_backed",
  "certifications",
  "insider_tips",
  "pro_secrets",
  "industry_predictions",

  // Community-Focused
  "community_highlight",
  "local_spotlight",
  "collab",
  "partnership_post",
  "charity_support",
  "volunteer_story",
];

// 2) Industry-specific pools
const INDUSTRY_ANGLE_POOLS: Record<string, string[]> = {
  // Influencer / Content Creator / Gaming / Parenting / DIY
  influencer: [
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
  ],
  content_creator: [
    "trending_sound",
    "trend_reaction",
    "stitch_or_duet",
    "challenge_participation",
    "aesthetic_unboxing",
    "day_in_my_life",
    "productivity_tips",
    "routines",
    "commentary_take",
    "realistic_vs_expectation",
  ],
  gaming: [
    "trending_sound",
    "challenge_participation",
    "routines",
    "commentary_take",
    "realistic_vs_expectation",
  ],
  personal_brand: [
    "day_in_my_life",
    "founder_story",
    "origin_story",
    "mission_story",
    "realistic_vs_expectation",
  ],

  // School Organization / Education / Tutor / Language School / Test Prep
  education: [
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
  ],
  school_organization: [
    "campus_life",
    "org_event_highlights",
    "club_recruitment",
    "org_achievements",
    "competition_results",
  ],
  tutor: [
    "study_tips",
    "exam_hacks",
    "reviewer_snippets",
    "subject_minilessons",
    "academic_myth_busting",
    "student_testimonial",
  ],
  language_school: [
    "subject_minilessons",
    "study_tips",
    "exam_hacks",
    "student_testimonial",
    "campus_life",
  ],
  test_prep: [
    "study_tips",
    "exam_hacks",
    "reviewer_snippets",
    "subject_minilessons",
    "academic_myth_busting",
  ],

  // Nonprofit / Charity / Advocacy / Mental Health
  nonprofit: [
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
  ],
  charity: [
    "impact_story",
    "volunteer_feature",
    "donation_use_breakdown",
    "campaign_pitch",
    "success_metrics",
    "community_voice",
  ],
  advocacy: [
    "awareness_fact",
    "stigma_busting",
    "advocacy_why",
    "real_life_case",
    "behind_the_campaign",
  ],
  mental_health: [
    "awareness_fact",
    "stigma_busting",
    "real_life_case",
    "impact_story",
    "community_voice",
    "advocacy_why",
  ],

  // Real Estate / Home Goods / Interior / Architecture
  real_estate: [
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
  ],
  home_goods: [
    "design_trends",
    "interior_before_after",
    "lifestyle_fit_story",
    "staging_tips",
    "buyer_mistakes",
  ],
  interior: [
    "design_trends",
    "interior_before_after",
    "renovation_process",
    "staging_tips",
    "lifestyle_fit_story",
  ],
  architecture: [
    "design_trends",
    "interior_before_after",
    "renovation_process",
    "project_walkthrough",
  ],

  // Fitness / Nutritionist / Yoga / Wellness / Spa
  fitness: [
    "workout_of_the_day",
    "nutrition_tip",
    "mindfulness_exercise",
    "pose_tutorial",
    "progress_tracking",
    "healthy_swap",
    "myth_busting",
    "10min_workout",
    "form_check",
    "wellness_challenge",
    "client_result",
  ],
  nutritionist: [
    "nutrition_tip",
    "healthy_swap",
    "myth_busting",
    "progress_tracking",
    "client_result",
  ],
  yoga_studio: [
    "pose_tutorial",
    "mindfulness_exercise",
    "wellness_challenge",
    "progress_tracking",
  ],
  spa_wellness: [
    "wellness_challenge",
    "mindfulness_exercise",
    "healthy_swap",
    "client_result",
  ],

  // Beauty / Fashion / Accessories
  beauty: [
    "get_ready_with_me",
    "product_review",
    "style_guide",
    "color_palette",
    "outfit_inspo",
    "3_ways_to_style",
    "makeup_tutorial",
    "transformation",
    "ingredient_spotlight",
    "beauty_myths",
    "new_arrivals",
  ],
  fashion_brand: [
    "style_guide",
    "color_palette",
    "outfit_inspo",
    "3_ways_to_style",
    "new_arrivals",
    "customer_favorites",
  ],
  accessories: [
    "aesthetic_shot",
    "style_guide",
    "outfit_inspo",
    "new_arrivals",
    "bundle",
  ],

  // Freelancer / VA / Consulting Firm / Agency / Writing / Creative
  freelancer: [
    "productivity_workflow",
    "client_pipeline",
    "how_i_manage_clients",
    "deliverable_breakdown",
    "systems_and_tools",
    "value_stack",
    "pricing_philosophy",
    "process_explained",
    "mistakes_clients_make",
    "breakdown_of_a_project",
  ],
  virtual_assistant: [
    "productivity_workflow",
    "systems_and_tools",
    "how_i_manage_clients",
    "process_explained",
  ],
  consulting_firm: [
    "client_pipeline",
    "case_study",
    "value_stack",
    "pricing_philosophy",
    "process_explined",
  ],
  agency: [
    "case_study",
    "client_pipeline",
    "systems_and_tools",
    "process_explained",
    "value_stack",
  ],
  writer: [
    "process_explained",
    "breakdown_of_a_project",
    "behind_the_scenes",
    "daily_challenges",
  ],
  service_business: [
    "client_story",
    "before_after",
    "process_explained",
    "mistakes_clients_make",
  ],

  // Plumber / Electrician / Auto Repair / Landscaping / Cleaning Service
  plumber: [
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
  ],
  electrician: [
    "before_after_fix",
    "safety_tips",
    "emergency_tip",
    "maintenance_reminders",
    "seasonal_checklist",
    "cost_transparency",
  ],
  auto_repair: [
    "before_after_fix",
    "signs_you_need_service",
    "maintenance_reminders",
    "cost_transparency",
    "warranty_explanation",
  ],
  landscaping: [
    "project_walkthrough",
    "before_after_fix",
    "seasonal_checklist",
    "best_practices",
  ],
  cleaning_service: [
    "before_after_fix",
    "project_walkthrough",
    "maintenance_reminders",
    "seasonal_checklist",
    "cost_transparency",
  ],

  // Restaurants / Cafes / Food Truck / Catering
  restaurant: [
    "recipe_teaser",
    "menu_highlight",
    "chef_special",
    "food_aesthetic",
    "behind_the_kitchen",
    "sourcing_ingredients",
    "signature_dish_story",
    "seasonal_menu",
    "customer_favorites",
    "price_bundle",
    "limited_time_item",
  ],
  cafe: [
    "menu_highlight",
    "food_aesthetic",
    "signature_dish_story",
    "seasonal_menu",
    "customer_favorites",
    "limited_time_item",
  ],

  // Clinic / Wellness / Therapist
  clinic: [
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
  ],
  therapist: [
    "health_tip",
    "symptom_explainer",
    "when_to_seek_help",
    "patient_story",
    "recovery_guide",
  ],

  // Local Business / Personal Brand
  local_business: [
    "founder_intro",
    "origin_story",
    "mission",
    "community_support",
    "customer_review",
    "highlights_of_the_week",
    "local_event",
  ],

  // Photography / Videography / Artist / Voice Actor
  photography: [
    "shoot_breakdown",
    "lighting_setup",
    "color_grading_before_after",
    "gear_talk",
    "behind_the_shot",
    "client_testimonial",
    "inspiration",
    "portfolio_piece",
    "technique_tutorial",
  ],
  videography: [
    "shoot_breakdown",
    "lighting_setup",
    "color_grading_before_after",
    "gear_talk",
    "behind_the_shot",
    "portfolio_piece",
    "technique_tutorial",
  ],
  artist: [
    "behind_the_shot",
    "portfolio_piece",
    "technique_tutorial",
    "inspiration",
  ],
  voice_actor: [
    "portfolio_piece",
    "behind_the_scenes",
    "process_explained",
  ],

  // SAAS / Tech Startup / IT Services / Web Agency / Mobile App
  saas: [
    "feature_spotlight",
    "product_update",
    "roadmap",
    "use_case_explainer",
    "micro_demo",
    "case_study",
    "onboarding_tips",
    "performance_metrics",
    "integration_how_to",
    "user_story",
  ],
  tech_startup: [
    "feature_spotlight",
    "product_update",
    "roadmap",
    "use_case_explainer",
    "micro_demo",
    "user_story",
  ],
  it_services: [
    "use_case_explainer",
    "case_study",
    "integration_how_to",
    "performance_metrics",
  ],
  web_agency: [
    "feature_spotlight",
    "case_study",
    "micro_demo",
    "use_case_explainer",
  ],
  mobile_app: [
    "feature_spotlight",
    "micro_demo",
    "onboarding_tips",
    "user_story",
  ],
};

// Helper: normalize industry string -> key for INDUSTRY_ANGLE_POOLS
const normalizeIndustry = (raw?: string | null): string =>
  (raw ?? "other").toLowerCase();

// Helper: fuzzy mapping when enum name and group labels differ slightly
function getIndustrySpecificAngles(industry?: string | null): string[] {
  const key = normalizeIndustry(industry);

  if (INDUSTRY_ANGLE_POOLS[key]) {
    return INDUSTRY_ANGLE_POOLS[key];
  }

  // Fuzzy fallbacks (if your enum names differ)
  if (key.includes("school") || key.includes("org")) {
    return INDUSTRY_ANGLE_POOLS["education"] ?? [];
  }
  if (key.includes("saas") || key.includes("startup") || key.includes("tech")) {
    return INDUSTRY_ANGLE_POOLS["saas"] ?? [];
  }
  if (key.includes("photography")) {
    return INDUSTRY_ANGLE_POOLS["photography"] ?? [];
  }
  if (key.includes("fitness") || key.includes("gym")) {
    return INDUSTRY_ANGLE_POOLS["fitness"] ?? [];
  }
  if (key.includes("yoga")) {
    return INDUSTRY_ANGLE_POOLS["yoga_studio"] ?? [];
  }
  if (key.includes("spa") || key.includes("wellness")) {
    return INDUSTRY_ANGLE_POOLS["spa_wellness"] ?? [];
  }
  if (key.includes("clinic") || key.includes("therapist")) {
    return INDUSTRY_ANGLE_POOLS["clinic"] ?? [];
  }
  if (key.includes("restaurant") || key.includes("food")) {
    return INDUSTRY_ANGLE_POOLS["restaurant"] ?? [];
  }
  if (key.includes("cafe") || key.includes("coffee")) {
    return INDUSTRY_ANGLE_POOLS["cafe"] ?? [];
  }
  if (key.includes("agency")) {
    return INDUSTRY_ANGLE_POOLS["agency"] ?? [];
  }
  if (key.includes("freelancer")) {
    return INDUSTRY_ANGLE_POOLS["freelancer"] ?? [];
  }

  return [];
}

// Final helper: build full angle pool for a brand
function buildAnglePoolForIndustry(industry?: string | null): string[] {
  const universal = UNIVERSAL_ANGLES;
  const specific = getIndustrySpecificAngles(industry);
  // de-dup
  const merged = [...universal, ...specific];
  return Array.from(new Set(merged));
}

/* ============================================================
   DASHBOARD COMPONENT
   ============================================================ */

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [sched, setSched] = useState<SchedRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);
  const [externalPosts, setExternalPosts] = useState<ExternalPostRow[]>([]);
  const [dailyEng, setDailyEng] = useState<DailyEngRow[]>([]);

  // 7-Day Smart Plan state
  const [smartPlan, setSmartPlan] = useState<SmartPlanSlot[] | null>(null);
  const [smartPlanLoading, setSmartPlanLoading] = useState(false);
  const [applyingSmartPlan, setApplyingSmartPlan] = useState(false);

  const loadDashboard = useCallback(
    async (opts?: { silent?: boolean }) => {
      try {
        if (!opts?.silent) setLoading(true);

        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        if (!user) {
          Alert.alert("Sign in required", "Please sign in.");
          return;
        }

        // 1) Backfill FB insights (manual + API posts)
        try {
          const { data: fbData, error: fbError } =
            await supabase.functions.invoke("backfill_fb_insights", {
              body: { userId: user.id },
            });

          if (fbError) {
            console.log("backfill_fb_insights error:", fbError);
          } else {
            console.log("backfill_fb_insights OK:", fbData);
          }
        } catch (err) {
          console.log("backfill_fb_insights invoke failed:", err);
        }

        // 2) meta_publish_worker to process any pending schedules
        try {
          const { data: publishData, error: publishError } =
            await supabase.functions.invoke("meta_publish_worker", {
              body: { userId: user.id },
            });

          if (publishError) {
            console.log("meta_publish_worker error:", publishError);
          } else {
            console.log("meta_publish_worker OK:", publishData);
          }
        } catch (err) {
          console.log("meta_publish_worker invoke failed:", err);
        }

        // 3) Posts created in Prism
        const { data: p, error: ep } = await supabase
          .from("posts")
          .select("id,user_id,caption,post_type,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(300);
        if (ep) throw ep;
        const postsData = (p || []) as PostRow[];
        setPosts(postsData);

        // 4) Schedules for these posts (FB only)
        let schedData: SchedRow[] = [];
        if (postsData.length) {
          const postIds = postsData.map((x) => x.id);
          const { data: s, error: es } = await supabase
            .from("scheduled_posts")
            .select(
              "id,post_id,status,platform,api_post_id,scheduled_at,posted_at"
            )
            .in("post_id", postIds)
            .eq("platform", "facebook")
            .order("scheduled_at", { ascending: false });
          if (es) throw es;
          schedData = (s || []) as SchedRow[];
        }
        setSched(schedData);

        // 5) external_posts (manual + API posts)
        const { data: ex, error: eEx } = await supabase
          .from("external_posts")
          .select("object_id, caption, content_type, created_at")
          .eq("user_id", user.id)
          .eq("platform", "facebook")
          .order("created_at", { ascending: false })
          .limit(300);
        if (eEx) {
          console.log("external_posts error:", eEx);
        }
        const externalData = (ex || []) as ExternalPostRow[];
        setExternalPosts(externalData);

        // 6) analytics_events for all relevant object_ids
        const objectIdsSet = new Set<string>();
        for (const s of schedData) {
          if (s.api_post_id) objectIdsSet.add(s.api_post_id);
        }
        for (const exPost of externalData) {
          if (exPost.object_id) objectIdsSet.add(exPost.object_id);
        }
        const objectIds = Array.from(objectIdsSet);

        if (objectIds.length) {
          const { data: a, error: ea } = await supabase
            .from("analytics_events")
            .select("object_id,metric,value")
            .eq("user_id", user.id)
            .eq("platform", "facebook")
            .in("object_id", objectIds);
          if (ea) throw ea;
          setAnalytics((a || []) as AnalyticsRow[]);
        } else {
          setAnalytics([]);
        }

        // 7) Daily engagement (from v_user_recent_engagement)
        const { data: engRows, error: eEng } = await supabase
          .from("v_user_recent_engagement")
          .select("day, engagement")
          .eq("user_id", user.id)
          .eq("platform", "facebook")
          .order("day", { ascending: true })
          .limit(7);
        if (eEng) {
          console.log("v_user_recent_engagement error:", eEng);
        }
        setDailyEng((engRows || []) as DailyEngRow[]);
      } catch (e: any) {
        console.error("Dashboard load error:", e);
        Alert.alert("Error", e?.message ?? "Failed to load dashboard.");
      } finally {
        if (!opts?.silent) setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  const bootstrapDashboard = useCallback(async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase.functions.invoke("insights_pull", {
        body: {},
      });

      if (error) {
        console.log("insights_pull (bootstrap) error:", error);
      } else {
        console.log("insights_pull (bootstrap) OK:", data);
      }

      await loadDashboard({ silent: true });
    } catch (e: any) {
      console.error("bootstrapDashboard error:", e);
      Alert.alert("Error", e?.message ?? "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [loadDashboard]);

  useEffect(() => {
    bootstrapDashboard();
  }, [bootstrapDashboard]);

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);

      const { data, error } = await supabase.functions.invoke("insights_pull", {
        body: {},
      });

      if (error) {
        console.log("insights_pull error:", error);
        Alert.alert(
          "Analytics refresh failed",
          error.message ?? "Could not refresh insights."
        );
      } else {
        console.log("insights_pull OK:", data);
      }

      await loadDashboard({ silent: true });
    } catch (e: any) {
      console.error("handleRefresh error:", e);
      Alert.alert("Error", e?.message ?? "Failed to refresh analytics.");
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboard]);

  /**
   * 7-Day Smart Plan generator
   *
   * From the mobile app:
   * 1) rpc('generate_7day_smart_plan', { p_platform: 'facebook', p_n_slots: 7 })
   * 2) rpc('get_content_mix_recommendations', { p_platform: 'facebook' })
   * 3) select from v_segment_engagement_scores
   * 4) invoke edge function 'generate_smart_plan_briefs' (OpenAI) to get hook/caption/CTA/visual
   */
  const loadSmartPlan = useCallback(async () => {
    try {
      setSmartPlanLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) {
        Alert.alert("Sign in required", "Please sign in to generate a plan.");
        return;
      }

      // --- NEW: fetch brand industry to bias angle selection ---
      let brandIndustry: string | null = null;
      try {
        const { data: brandRows, error: brandErr } = await supabase
          .from("brand_profiles")
          .select("industry")
          .eq("user_id", user.id)
          .limit(1);
        if (brandErr) {
          console.log("brand_profiles error:", brandErr);
        } else if (brandRows && brandRows.length > 0) {
          // industry is enum in DB, string in JS
          brandIndustry = (brandRows[0] as any).industry ?? null;
        }
      } catch (e) {
        console.log("brand_profiles fetch failed:", e);
      }

      const anglePool = buildAnglePoolForIndustry(brandIndustry);
      const anglePoolLen = Math.max(anglePool.length, 1);

      // 1) Get best upcoming slots (time bandit + priors)
      const { data: baseSlots, error: baseErr } = await supabase.rpc(
        "generate_7day_smart_plan",
        { p_platform: "facebook", p_n_slots: 7 }
      );

      if (baseErr) {
        console.error("generate_7day_smart_plan error:", baseErr);
        throw baseErr;
      }

      const baseSlotsArr: any[] = (baseSlots || []) as any[];

      if (!baseSlotsArr.length) {
        Alert.alert(
          "Smart Plan",
          "No recommended time slots available yet. Try again after some analytics data comes in."
        );
        setSmartPlan([]);
        return;
      }

      // 2) Get content mix response (what types/angles tend to work)
      const { data: mixData, error: mixErr } = await supabase.rpc(
        "get_content_mix_recommendations",
        { p_platform: "facebook" }
      );
      if (mixErr) {
        console.error("get_content_mix_recommendations error:", mixErr);
        throw mixErr;
      }

      const mixArr: any[] = (mixData || []) as any[];

      // 3) Segment scores (who tends to respond)
      const { data: segRows, error: segErr } = await supabase
        .from("v_segment_engagement_scores")
        .select("segment_id, segment_engagement_rate, segment_name, platform")
        .eq("user_id", user.id)
        .eq("platform", "facebook");

      if (segErr) {
        console.error("v_segment_engagement_scores error:", segErr);
        // Not fatal; we can still make a plan without segments
      }

      const segArr: any[] = (segRows || []) as any[];

      // Sort mixes and segments by their scores (if present)
      const sortedMix = [...mixArr].sort(
        (a, b) =>
          (b.expected_engagement_rate ?? 0) -
          (a.expected_engagement_rate ?? 0)
      );

      const sortedSegments = [...segArr].sort(
        (a, b) =>
          (b.segment_engagement_rate ?? 0) -
          (a.segment_engagement_rate ?? 0)
      );

      const mixLen = Math.max(sortedMix.length, 1);
      const segLen = Math.max(sortedSegments.length || 0, 1);

      // 4) Assign content_type + objective + angle + segment locally (simple greedy)
      const designedSlots: SmartPlanSlot[] = baseSlotsArr.map(
        (raw: any, idx: number) => {
          const mix = sortedMix[idx % mixLen] || {};
          const seg =
            sortedSegments.length > 0
              ? sortedSegments[idx % segLen] || {}
              : {};

          // Prefer learned mix angle if it's specific (not "generic");
          // fall back to curated angle pool for this industry.
          const mixAngle =
            typeof mix.angle === "string" && mix.angle !== "generic"
              ? mix.angle
              : null;

          const defaultAngle =
            anglePoolLen > 0 ? anglePool[idx % anglePoolLen] : "promo";

          const chosenAngle = mixAngle || defaultAngle;

          return {
            slot_index: raw.slot_index ?? idx + 1,
            platform: "facebook",
            timeslot: raw.timeslot,
            score: raw.score ?? raw.predicted_avg ?? 0,
            content_type: mix.content_type ?? "image",
            objective: mix.objective ?? "engagement",
            angle: chosenAngle,
            segment_id:
              typeof seg.segment_id === "number" ? seg.segment_id : null,
            segment_name: seg.segment_name ?? null,
            brief: null,
          };
        }
      );

      // 5) Call OpenAI Edge Function to generate actual creative briefs
      const { data: briefResp, error: briefErr } =
        await supabase.functions.invoke("generate_smart_plan_briefs", {
          body: {
            platform: "facebook",
            slots: designedSlots,
          },
        });

      if (briefErr) {
        console.error("generate_smart_plan_briefs error:", briefErr);
        throw briefErr;
      }

      const finalSlots: SmartPlanSlot[] =
        (briefResp?.slots as SmartPlanSlot[]) ?? designedSlots;

      setSmartPlan(finalSlots);
    } catch (e: any) {
      console.error("loadSmartPlan error:", e);
      Alert.alert(
        "Smart Plan",
        e?.message ?? "Failed to generate 7-day smart plan."
      );
    } finally {
      setSmartPlanLoading(false);
    }
  }, []);

  const handleApplySmartPlan = useCallback(
    async () => {
      if (!smartPlan || smartPlan.length === 0) {
        Alert.alert("Smart Plan", "Generate a plan first.");
        return;
      }

      try {
        setApplyingSmartPlan(true);

        const { data, error } = await supabase.functions.invoke(
          "apply_smart_plan",
          {
            body: {
              platform: "facebook",
              slots: smartPlan,
            },
          }
        );

        if (error) {
          console.error("apply_smart_plan error:", error);
          throw error;
        }

        console.log("apply_smart_plan OK:", data);
        Alert.alert(
          "Smart Plan",
          "Draft schedules created from your 7-day plan."
        );

        // Reload dashboard so new drafts appear
        await loadDashboard({ silent: true });
      } catch (e: any) {
        console.error("handleApplySmartPlan error:", e);
        Alert.alert(
          "Smart Plan",
          e?.message ?? "Failed to convert plan into drafts."
        );
      } finally {
        setApplyingSmartPlan(false);
      }
    },
    [smartPlan, loadDashboard]
  );

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { alignItems: "center", justifyContent: "center" },
        ]}
      >
        <ActivityIndicator />
        <Text style={{ color: MUTED, marginTop: 8 }}>
          Loading dashboard…
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 80, paddingTop: 110 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Insights & Analytics</Text>
        <Text style={styles.subtitle}>
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </Text>
      </View>

      {/* 7-Day Smart Plan */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.sectionTitle}>PRISM 7-Day Smart Plan</Text>
            <Text style={styles.sectionSubtitle}>
              Auto-generated schedule & content ideas from your data, goals,
              audience segments, and angle playbook.
            </Text>
          </View>
          <View style={styles.sectionHeaderActions}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={loadSmartPlan}
              disabled={smartPlanLoading}
            >
              {smartPlanLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Generate Plan</Text>
              )}
            </TouchableOpacity>

            {smartPlan && smartPlan.length > 0 && (
              <TouchableOpacity
                style={[
                  styles.ghostButton,
                  applyingSmartPlan && { opacity: 0.6 },
                ]}
                onPress={handleApplySmartPlan}
                disabled={applyingSmartPlan}
              >
                {applyingSmartPlan ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text style={styles.ghostButtonText}>Convert to Drafts</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {smartPlanLoading && !smartPlan && (
          <View
            style={{
              marginTop: 12,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <ActivityIndicator />
            <Text style={{ marginLeft: 8, color: MUTED, fontSize: 13 }}>
              Analysing your data and building a 7-day plan…
            </Text>
          </View>
        )}

        {!smartPlanLoading && (!smartPlan || smartPlan.length === 0) && (
          <Text style={styles.emptyText}>
            Tap “Generate Plan” to see your recommended 7-day content schedule,
            including formats, angles, and suggested captions.
          </Text>
        )}

        {!smartPlanLoading && smartPlan && smartPlan.length > 0 && (
          <View style={styles.planList}>
            {smartPlan.map((slot) => {
              const dt = new Date(slot.timeslot);
              const dayLabel = dt.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              const timeLabel = dt.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              });

              return (
                <View key={slot.slot_index} style={styles.planItem}>
                  <View style={styles.planItemHeaderRow}>
                    <Text style={styles.planItemDay}>{dayLabel}</Text>
                    <Text style={styles.planItemTime}>{timeLabel}</Text>
                  </View>

                  <View style={styles.chipRow}>
                    <View style={styles.chipPrimary}>
                      <Text style={styles.chipPrimaryText}>
                        {slot.content_type.toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>
                        Objective: {slot.objective}
                      </Text>
                    </View>
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>Angle: {slot.angle}</Text>
                    </View>
                    {slot.segment_name && (
                      <View style={styles.chipMuted}>
                        <Text style={styles.chipMutedText}>
                          Segment: {slot.segment_name}
                        </Text>
                      </View>
                    )}
                  </View>

                  {slot.brief && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={styles.briefLabel}>Hook</Text>
                      <Text style={styles.briefText}>{slot.brief.hook}</Text>

                      <Text style={styles.briefLabel}>Caption idea</Text>
                      <Text style={styles.briefText} numberOfLines={3}>
                        {slot.brief.caption}
                      </Text>

                      <Text style={styles.briefLabel}>CTA</Text>
                      <Text style={styles.briefText}>{slot.brief.cta}</Text>

                      <Text style={styles.briefLabel}>Suggested visual</Text>
                      <Text style={styles.briefText}>
                        {slot.brief.visual_idea}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Smart Recommendations (Thompson Sampling) */}
      <SmartRecommendationsCard />

      {/* Analytics (KPIs, trends, top posts, recent posts) */}
      <AnalyticsSection
        posts={posts}
        sched={sched}
        analytics={analytics}
        externalPosts={externalPosts}
        dailyEng={dailyEng}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { paddingHorizontal: 16, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "700", color: TEXT },
  subtitle: { color: MUTED, fontSize: 13 },

  /* Smart Plan section */
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  sectionHeaderActions: {
    alignItems: "flex-end",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: TEXT,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },
  primaryButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: "#2563EB",
    marginBottom: 6,
  },
  primaryButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  ghostButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#CBD5F5",
  },
  ghostButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
  },
  emptyText: {
    marginTop: 8,
    fontSize: 12,
    color: MUTED,
  },

  planList: {
    marginTop: 10,
  },
  planItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 10,
    marginBottom: 8,
    backgroundColor: "#F9FAFB",
  },
  planItemHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  planItemDay: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT,
  },
  planItemTime: {
    fontSize: 12,
    color: MUTED,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },
  chipPrimary: {
    marginRight: 6,
    marginBottom: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#EEF2FF",
  },
  chipPrimaryText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#312E81",
  },
  chip: {
    marginRight: 6,
    marginBottom: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#E0F2FE",
  },
  chipText: {
    fontSize: 11,
    color: "#0F172A",
  },
  chipMuted: {
    marginRight: 6,
    marginBottom: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#E5E7EB",
  },
  chipMutedText: {
    fontSize: 11,
    color: "#4B5563",
  },
  briefLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: MUTED,
    marginTop: 4,
  },
  briefText: {
    fontSize: 12,
    color: TEXT,
  },
});
