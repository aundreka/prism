// config/angles.ts

export type AngleKey = string;

export type AngleDef = {
  key: AngleKey;
  label: string;
};

export type AngleCategory = {
  id: string;
  label: string;
  description?: string;
  angles: AngleDef[];
};

export const ANGLE_CATEGORIES: AngleCategory[] = [
  /* -------------------------
     UNIVERSAL – EDUCATIONAL / VALUE
  --------------------------*/
  {
    id: "educational_value",
    label: "Educational / Value",
    description: "Teach, explain, and break things down.",
    angles: [
      { key: "how_to", label: "How-To" },
      { key: "step_by_step", label: "Step-by-Step" },
      { key: "tutorials", label: "Tutorials" },
      { key: "beginner_friendly", label: "Beginner-Friendly" },
      { key: "myths_vs_facts", label: "Myths vs Facts" },
      { key: "mistakes_to_avoid", label: "Mistakes to Avoid" },
      {
        key: "before_after_explained",
        label: "Before / After (Explained)",
      },
      { key: "deep_dive", label: "Deep Dive" },
      { key: "mini_masterclass", label: "Mini Masterclass" },
      { key: "tools_i_use", label: "Tools I Use" },
      {
        key: "industry_terms_explained",
        label: "Industry Terms Explained",
      },
    ],
  },

  /* -------------------------
     UNIVERSAL – SOCIAL PROOF / TRUST
  --------------------------*/
  {
    id: "social_proof",
    label: "Social Proof / Trust",
    description: "Stories, results, and credibility.",
    angles: [
      { key: "testimonial", label: "Testimonial" },
      { key: "client_story", label: "Client Story" },
      { key: "case_study", label: "Case Study" },
      { key: "transformation", label: "Transformation" },
      { key: "results_breakdown", label: "Results Breakdown" },
      { key: "behind_the_scenes", label: "Behind the Scenes" },
      { key: "day_in_the_life", label: "Day in the Life" },
      { key: "progress_update", label: "Progress Update" },
      {
        key: "user_generated_content",
        label: "User-Generated Content",
      },
      { key: "success_path", label: "Success Path" },
    ],
  },

  /* -------------------------
     UNIVERSAL – EMOTIONAL / RELATABLE
  --------------------------*/
  {
    id: "emotional_relatable",
    label: "Emotional / Relatable",
    description: "Human, personal, and vulnerable content.",
    angles: [
      { key: "relatable_problem", label: "Relatable Problem" },
      { key: "frustrations", label: "Frustrations" },
      { key: "personal_story", label: "Personal Story" },
      { key: "founder_story", label: "Founder Story" },
      { key: "mission_story", label: "Mission Story" },
      { key: "vulnerable_post", label: "Vulnerable Post" },
      { key: "gratitude_post", label: "Gratitude Post" },
      { key: "common_struggles", label: "Common Struggles" },
      { key: "daily_challenges", label: "Daily Challenges" },
    ],
  },

  /* -------------------------
     UNIVERSAL – CONVERSION / OFFER
  --------------------------*/
  {
    id: "conversion_offer",
    label: "Conversion / Offer",
    description: "Promos, deals, and call-to-actions.",
    angles: [
      { key: "promo", label: "Promo" },
      { key: "limited_offer", label: "Limited Offer" },
      { key: "scarcity", label: "Scarcity" },
      { key: "bundle", label: "Bundle" },
      { key: "price_reveal", label: "Price Reveal" },
      { key: "freebie", label: "Freebie" },
      { key: "giveaway", label: "Giveaway" },
      { key: "call_to_action", label: "Call to Action" },
      { key: "top_benefits", label: "Top Benefits" },
      { key: "faq", label: "FAQ" },
      { key: "comparison_chart", label: "Comparison Chart" },
    ],
  },

  /* -------------------------
     UNIVERSAL – ENGAGEMENT BOOSTERS
  --------------------------*/
  {
    id: "engagement_boosters",
    label: "Engagement Boosters",
    description: "Comments, reactions, and interaction bait.",
    angles: [
      { key: "poll", label: "Poll" },
      { key: "question_post", label: "Question Post" },
      { key: "opinion_prompt", label: "Opinion Prompt" },
      { key: "ranking_list", label: "Ranking List" },
      { key: "challenge", label: "Challenge" },
      { key: "hot_take", label: "Hot Take" },
      { key: "unpopular_opinion", label: "Unpopular Opinion" },
      { key: "debate_starter", label: "Debate Starter" },
    ],
  },

  /* -------------------------
     UNIVERSAL – LIFESTYLE
  --------------------------*/
  {
    id: "lifestyle",
    label: "Lifestyle",
    description: "Vibes, aesthetics, and living the brand.",
    angles: [
      { key: "aesthetic_shot", label: "Aesthetic Shot" },
      { key: "moodboard", label: "Moodboard" },
      { key: "inspiration", label: "Inspiration" },
      { key: "seasonal_post", label: "Seasonal Post" },
      { key: "holiday_post", label: "Holiday Post" },
      { key: "trends", label: "Trends" },
      { key: "lifestyle_fit", label: "Lifestyle Fit" },
    ],
  },

  /* -------------------------
     UNIVERSAL – AUTHORITY / EXPERT
  --------------------------*/
  {
    id: "authority_expert",
    label: "Authority / Expert",
    description: "Show you know what you’re doing.",
    angles: [
      { key: "credibility_boost", label: "Credibility Boost" },
      { key: "stats_and_data", label: "Stats & Data" },
      { key: "research_backed", label: "Research-Backed" },
      { key: "certifications", label: "Certifications" },
      { key: "insider_tips", label: "Insider Tips" },
      { key: "pro_secrets", label: "Pro Secrets" },
      {
        key: "industry_predictions",
        label: "Industry Predictions",
      },
    ],
  },

  /* -------------------------
     UNIVERSAL – COMMUNITY
  --------------------------*/
  {
    id: "community",
    label: "Community-Focused",
    description: "Highlight people around the brand.",
    angles: [
      { key: "community_highlight", label: "Community Highlight" },
      { key: "local_spotlight", label: "Local Spotlight" },
      { key: "collab", label: "Collab" },
      { key: "partnership_post", label: "Partnership Post" },
      { key: "charity_support", label: "Charity Support" },
      { key: "volunteer_story", label: "Volunteer Story" },
    ],
  },

  /* -------------------------
     INFLUENCER / CREATOR / GAMING / PARENTING / DIY
  --------------------------*/
  {
    id: "creator",
    label: "Influencer / Content Creator",
    description: "Trends, edits, and creator-style content.",
    angles: [
      { key: "trending_sound", label: "Trending Sound" },
      { key: "trend_reaction", label: "Trend Reaction" },
      { key: "stitch_or_duet", label: "Stitch / Duet" },
      { key: "prank_content", label: "Prank Content" },
      {
        key: "challenge_participation",
        label: "Challenge Participation",
      },
      { key: "aesthetic_unboxing", label: "Aesthetic Unboxing" },
      { key: "day_in_my_life", label: "Day in My Life" },
      { key: "room_setup_tour", label: "Room / Setup Tour" },
      { key: "productivity_tips", label: "Productivity Tips" },
      { key: "routines", label: "Routines" },
      { key: "transformation_edit", label: "Transformation Edit" },
      { key: "cosplay", label: "Cosplay" },
      { key: "commentary_take", label: "Commentary Take" },
      {
        key: "realistic_vs_expectation",
        label: "Realistic vs Expectation",
      },
    ],
  },

  /* -------------------------
     SCHOOL / EDUCATION / TUTOR / LANGUAGE / TEST PREP
  --------------------------*/
  {
    id: "education_org",
    label: "School / Education",
    description: "For orgs, tutors, and education brands.",
    angles: [
      { key: "study_tips", label: "Study Tips" },
      { key: "exam_hacks", label: "Exam Hacks" },
      { key: "reviewer_snippets", label: "Reviewer Snippets" },
      { key: "campus_life", label: "Campus Life" },
      {
        key: "org_event_highlights",
        label: "Org Event Highlights",
      },
      { key: "student_testimonial", label: "Student Testimonial" },
      { key: "teacher_profile", label: "Teacher Profile" },
      { key: "alumni_story", label: "Alumni Story" },
      {
        key: "subject_minilessons",
        label: "Subject Mini-Lessons",
      },
      {
        key: "academic_myth_busting",
        label: "Academic Myth-Busting",
      },
      { key: "club_recruitment", label: "Club Recruitment" },
      { key: "org_achievements", label: "Org Achievements" },
      {
        key: "competition_results",
        label: "Competition Results",
      },
    ],
  },

  /* -------------------------
     NONPROFIT / ADVOCACY / MENTAL HEALTH
  --------------------------*/
  {
    id: "nonprofit",
    label: "Nonprofit / Advocacy",
    description: "Impact, campaigns, and stories.",
    angles: [
      { key: "impact_story", label: "Impact Story" },
      { key: "volunteer_feature", label: "Volunteer Feature" },
      {
        key: "donation_use_breakdown",
        label: "Donation Use Breakdown",
      },
      { key: "campaign_pitch", label: "Campaign Pitch" },
      { key: "awareness_fact", label: "Awareness Fact" },
      { key: "stigma_busting", label: "Stigma-Busting" },
      {
        key: "call_for_volunteers",
        label: "Call for Volunteers",
      },
      { key: "success_metrics", label: "Success Metrics" },
      { key: "community_voice", label: "Community Voice" },
      { key: "real_life_case", label: "Real-Life Case" },
      { key: "advocacy_why", label: "Advocacy Why" },
      {
        key: "behind_the_campaign",
        label: "Behind the Campaign",
      },
    ],
  },

  /* -------------------------
     REAL ESTATE / HOME / INTERIOR
  --------------------------*/
  {
    id: "real_estate",
    label: "Real Estate / Home",
    description: "Tours, homes, and interiors.",
    angles: [
      { key: "property_tour", label: "Property Tour" },
      {
        key: "neighborhood_highlight",
        label: "Neighborhood Highlight",
      },
      { key: "design_trends", label: "Design Trends" },
      { key: "price_breakdown", label: "Price Breakdown" },
      { key: "market_update", label: "Market Update" },
      {
        key: "interior_before_after",
        label: "Interior Before / After",
      },
      {
        key: "renovation_process",
        label: "Renovation Process",
      },
      { key: "staging_tips", label: "Staging Tips" },
      { key: "buyer_mistakes", label: "Buyer Mistakes" },
      {
        key: "lifestyle_fit_story",
        label: "Lifestyle Fit Story",
      },
    ],
  },

  /* -------------------------
     FITNESS / NUTRITION / YOGA / SPA
  --------------------------*/
  {
    id: "fitness",
    label: "Fitness / Wellness",
    description: "Workouts, health, and routines.",
    angles: [
      {
        key: "workout_of_the_day",
        label: "Workout of the Day",
      },
      { key: "nutrition_tip", label: "Nutrition Tip" },
      {
        key: "mindfulness_exercise",
        label: "Mindfulness Exercise",
      },
      { key: "pose_tutorial", label: "Pose Tutorial" },
      {
        key: "progress_tracking",
        label: "Progress Tracking",
      },
      { key: "healthy_swap", label: "Healthy Swap" },
      { key: "myth_busting", label: "Myth-Busting" },
      { key: "10min_workout", label: "10-Min Workout" },
      { key: "form_check", label: "Form Check" },
      {
        key: "wellness_challenge",
        label: "Wellness Challenge",
      },
      { key: "client_result", label: "Client Result" },
    ],
  },

  /* -------------------------
     BEAUTY / FASHION / ACCESSORIES
  --------------------------*/
  {
    id: "beauty_fashion",
    label: "Beauty / Fashion",
    description: "Looks, outfits, and aesthetics.",
    angles: [
      {
        key: "get_ready_with_me",
        label: "Get Ready With Me",
      },
      { key: "product_review", label: "Product Review" },
      { key: "style_guide", label: "Style Guide" },
      { key: "color_palette", label: "Color Palette" },
      { key: "outfit_inspo", label: "Outfit Inspo" },
      { key: "3_ways_to_style", label: "3 Ways to Style" },
      { key: "makeup_tutorial", label: "Makeup Tutorial" },
      { key: "transformation", label: "Transformation" },
      {
        key: "ingredient_spotlight",
        label: "Ingredient Spotlight",
      },
      { key: "beauty_myths", label: "Beauty Myths" },
      { key: "new_arrivals", label: "New Arrivals" },
    ],
  },

  /* -------------------------
     FREELANCER / VA / AGENCY / CREATIVE
  --------------------------*/
  {
    id: "freelancer",
    label: "Freelancer / Creative / Agency",
    description: "Behind the work and business side.",
    angles: [
      {
        key: "productivity_workflow",
        label: "Productivity Workflow",
      },
      { key: "client_pipeline", label: "Client Pipeline" },
      {
        key: "how_i_manage_clients",
        label: "How I Manage Clients",
      },
      {
        key: "deliverable_breakdown",
        label: "Deliverable Breakdown",
      },
      { key: "systems_and_tools", label: "Systems & Tools" },
      { key: "value_stack", label: "Value Stack" },
      {
        key: "pricing_philosophy",
        label: "Pricing Philosophy",
      },
      {
        key: "process_explained",
        label: "Process Explained",
      },
      {
        key: "mistakes_clients_make",
        label: "Mistakes Clients Make",
      },
      {
        key: "breakdown_of_a_project",
        label: "Breakdown of a Project",
      },
    ],
  },

  /* -------------------------
     TRADES / SERVICES (PLUMBER, AUTO, CLEANING…)
  --------------------------*/
  {
    id: "services_trades",
    label: "Local Services / Trades",
    description: "Repairs, maintenance, and know-how.",
    angles: [
      { key: "before_after_fix", label: "Before / After Fix" },
      { key: "emergency_tip", label: "Emergency Tip" },
      {
        key: "maintenance_reminders",
        label: "Maintenance Reminders",
      },
      { key: "safety_tips", label: "Safety Tips" },
      {
        key: "signs_you_need_service",
        label: "Signs You Need Service",
      },
      {
        key: "warranty_explanation",
        label: "Warranty Explanation",
      },
      {
        key: "project_walkthrough",
        label: "Project Walkthrough",
      },
      {
        key: "seasonal_checklist",
        label: "Seasonal Checklist",
      },
      { key: "estimation_guide", label: "Estimation Guide" },
      {
        key: "cost_transparency",
        label: "Cost Transparency",
      },
      { key: "best_practices", label: "Best Practices" },
    ],
  },

  /* -------------------------
     RESTAURANTS / CAFES / FOOD
  --------------------------*/
  {
    id: "food",
    label: "Restaurants / Cafes / Food",
    description: "Food shots, menus, and cravings.",
    angles: [
      { key: "recipe_teaser", label: "Recipe Teaser" },
      { key: "menu_highlight", label: "Menu Highlight" },
      { key: "chef_special", label: "Chef’s Special" },
      { key: "food_aesthetic", label: "Food Aesthetic" },
      {
        key: "behind_the_kitchen",
        label: "Behind the Kitchen",
      },
      {
        key: "sourcing_ingredients",
        label: "Sourcing Ingredients",
      },
      {
        key: "signature_dish_story",
        label: "Signature Dish Story",
      },
      { key: "seasonal_menu", label: "Seasonal Menu" },
      {
        key: "customer_favorites",
        label: "Customer Favorites",
      },
      { key: "price_bundle", label: "Price Bundle" },
      {
        key: "limited_time_item",
        label: "Limited-Time Item",
      },
    ],
  },

  /* -------------------------
     CLINIC / THERAPIST / HEALTH
  --------------------------*/
  {
    id: "clinic",
    label: "Clinic / Wellness / Therapist",
    description: "Health guidance and trust-building.",
    angles: [
      { key: "health_tip", label: "Health Tip" },
      {
        key: "symptom_explainer",
        label: "Symptom Explainer",
      },
      {
        key: "when_to_seek_help",
        label: "When to Seek Help",
      },
      { key: "patient_story", label: "Patient Story" },
      {
        key: "treatment_process",
        label: "Treatment Process",
      },
      {
        key: "equipment_explained",
        label: "Equipment Explained",
      },
      {
        key: "health_myth_busting",
        label: "Health Myth-Busting",
      },
      { key: "doctor_profile", label: "Doctor Profile" },
      { key: "clinic_tour", label: "Clinic Tour" },
      { key: "recovery_guide", label: "Recovery Guide" },
    ],
  },

  /* -------------------------
     LOCAL BUSINESS / PERSONAL BRAND
  --------------------------*/
  {
    id: "local_brand",
    label: "Local Business / Personal Brand",
    description: "You, your story, and your town.",
    angles: [
      { key: "founder_intro", label: "Founder Intro" },
      { key: "origin_story", label: "Origin Story" },
      { key: "mission", label: "Mission" },
      {
        key: "community_support",
        label: "Community Support",
      },
      { key: "customer_review", label: "Customer Review" },
      {
        key: "highlights_of_the_week",
        label: "Highlights of the Week",
      },
      { key: "local_event", label: "Local Event" },
    ],
  },

  /* -------------------------
     PHOTOGRAPHY / VIDEO / ART / VOICE
  --------------------------*/
  {
    id: "creative_media",
    label: "Photo / Video / Art",
    description: "Behind the lens or mic.",
    angles: [
      { key: "shoot_breakdown", label: "Shoot Breakdown" },
      { key: "lighting_setup", label: "Lighting Setup" },
      {
        key: "color_grading_before_after",
        label: "Color Grading Before / After",
      },
      { key: "gear_talk", label: "Gear Talk" },
      {
        key: "behind_the_shot",
        label: "Behind the Shot",
      },
      {
        key: "client_testimonial",
        label: "Client Testimonial",
      },
      { key: "portfolio_piece", label: "Portfolio Piece" },
      {
        key: "technique_tutorial",
        label: "Technique Tutorial",
      },
    ],
  },

  /* -------------------------
     SAAS / TECH / IT / WEB
  --------------------------*/
  {
    id: "saas",
    label: "SaaS / Tech / IT",
    description: "Features, use-cases, and roadmaps.",
    angles: [
      { key: "feature_spotlight", label: "Feature Spotlight" },
      { key: "product_update", label: "Product Update" },
      { key: "roadmap", label: "Roadmap" },
      {
        key: "use_case_explainer",
        label: "Use Case Explainer",
      },
      { key: "micro_demo", label: "Micro Demo" },
      { key: "onboarding_tips", label: "Onboarding Tips" },
      {
        key: "performance_metrics",
        label: "Performance Metrics",
      },
      {
        key: "integration_how_to",
        label: "Integration How-To",
      },
      { key: "user_story", label: "User Story" },
    ],
  },

  /* -------------------------
     MISC / OTHER
  --------------------------*/
  {
    id: "other",
    label: "Other",
    description: "For anything that doesn’t quite fit.",
    angles: [{ key: "other", label: "Other" }],
  },
];

/* -------------------------
   Industry → Suggested Angle Keys
--------------------------*/

export type IndustryEnum =
  | "restaurant"
  | "cafe"
  | "clinic"
  | "ecommerce"
  | "coach_consultant"
  | "content_creator"
  | "agency"
  | "education"
  | "other"
  | "influencer"
  | "school_organization"
  | "nonprofit"
  | "personal_brand"
  | "local_business"
  | "freelancer"
  | "service_business"
  | "real_estate"
  | "fitness"
  | "beauty"
  | "photography"
  | "events_planner"
  | "therapist"
  | "law_firm"
  | "accountant"
  | "consulting_firm"
  | "career_coach"
  | "virtual_assistant"
  | "fashion_brand"
  | "accessories"
  | "home_goods"
  | "toy_store"
  | "bookstore"
  | "yoga_studio"
  | "nutritionist"
  | "spa_wellness"
  | "mental_health"
  | "plumber"
  | "electrician"
  | "cleaning_service"
  | "landscaping"
  | "auto_repair"
  | "graphic_designer"
  | "videographer"
  | "artist"
  | "writer"
  | "voice_actor"
  | "tutor"
  | "language_school"
  | "test_prep"
  | "edu_creator"
  | "saas"
  | "web_agency"
  | "mobile_app"
  | "tech_startup"
  | "it_services"
  | "food_truck"
  | "catering"
  | "event_venue"
  | "wedding_vendor"
  | "pet_services"
  | "travel_blog"
  | "gaming_channel"
  | "parenting"
  | "diy_maker";

export const INDUSTRY_TO_ANGLE_KEYS: Partial<
  Record<IndustryEnum, AngleKey[]>
> = {
  restaurant: [
    "menu_highlight",
    "customer_favorites",
    "signature_dish_story",
    "food_aesthetic",
    "limited_time_item",
  ],
  cafe: [
    "menu_highlight",
    "food_aesthetic",
    "seasonal_menu",
    "customer_favorites",
    "local_spotlight",
  ],
  food_truck: [
    "menu_highlight",
    "local_event",
    "limited_time_item",
    "behind_the_kitchen",
  ],
  catering: [
    "event_venue",
    "chef_special",
    "case_study",
    "client_testimonial",
  ],
  event_venue: [
    "property_tour",
    "event_venue",
    "behind_the_scenes",
    "client_testimonial",
  ],
  wedding_vendor: [
    "event_venue",
    "client_story",
    "before_after_explained",
    "testimonials",
  ] as any, // if you want, you can refine keys

  ecommerce: [
    "product_review",
    "top_benefits",
    "comparison_chart",
    "limited_offer",
    "freebie",
  ],
  fashion_brand: [
    "outfit_inspo",
    "3_ways_to_style",
    "get_ready_with_me",
    "new_arrivals",
  ],
  accessories: ["product_review", "outfit_inspo", "aesthetic_shot"],
  home_goods: [
    "interior_before_after",
    "design_trends",
    "product_review",
    "style_guide",
  ],
  toy_store: ["product_review", "parenting", "lifestyle_fit"],
  bookstore: ["reviewer_snippets", "inspiration", "lifestyle_fit"],

  clinic: [
    "health_tip",
    "symptom_explainer",
    "when_to_seek_help",
    "patient_story",
    "clinic_tour",
  ],
  therapist: [
    "mental_health",
    "stigma_busting",
    "when_to_seek_help",
    "patient_story",
  ] as any,
  mental_health: [
    "stigma_busting",
    "awareness_fact",
    "real_life_case",
    "community_voice",
  ],
  nonprofit: [
    "impact_story",
    "donation_use_breakdown",
    "volunteer_feature",
    "campaign_pitch",
  ],

  content_creator: [
    "trending_sound",
    "day_in_my_life",
    "realistic_vs_expectation",
    "aesthetic_unboxing",
  ],
  influencer: [
    "trending_sound",
    "get_ready_with_me",
    "day_in_my_life",
    "commentary_take",
  ],
  gaming_channel: [
    "day_in_my_life",
    "commentary_take",
    "challenge_participation",
    "trending_sound",
  ],
  travel_blog: [
    "property_tour",
    "neighborhood_highlight",
    "lifestyle_fit_story",
    "aesthetic_shot",
  ],
  parenting: [
    "relatable_problem",
    "daily_challenges",
    "study_tips",
    "lifestyle_fit",
  ],
  diy_maker: [
    "how_to",
    "step_by_step",
    "before_after_explained",
    "deep_dive",
  ],

  real_estate: [
    "property_tour",
    "neighborhood_highlight",
    "price_breakdown",
    "market_update",
  ],
  local_business: [
    "community_highlight",
    "local_spotlight",
    "customer_review",
    "highlights_of_the_week",
  ],
  personal_brand: [
    "founder_intro",
    "origin_story",
    "mission_story",
    "personal_story",
  ],

  fitness: [
    "workout_of_the_day",
    "10min_workout",
    "progress_tracking",
    "client_result",
  ],
  beauty: [
    "get_ready_with_me",
    "makeup_tutorial",
    "ingredient_spotlight",
    "product_review",
  ],
  yoga_studio: [
    "pose_tutorial",
    "mindfulness_exercise",
    "wellness_challenge",
    "healthy_swap",
  ],
  nutritionist: [
    "nutrition_tip",
    "healthy_swap",
    "myth_busting",
    "deep_dive",
  ],
  spa_wellness: [
    "wellness_challenge",
    "health_tip",
    "lifestyle_fit",
    "gratitude_post",
  ],
  pet_services: [
    "aesthetic_shot",
    "client_story",
    "before_after_fix",
    "seasonal_post",
  ],

  freelancer: [
    "productivity_workflow",
    "how_i_manage_clients",
    "process_explained",
    "client_testimonial",
  ],
  service_business: [
    "before_after_fix",
    "signs_you_need_service",
    "cost_transparency",
    "project_walkthrough",
  ],
  plumber: [
    "before_after_fix",
    "emergency_tip",
    "maintenance_reminders",
    "signs_you_need_service",
  ],
  electrician: [
    "safety_tips",
    "emergency_tip",
    "maintenance_reminders",
    "project_walkthrough",
  ],
  cleaning_service: [
    "before_after_fix",
    "seasonal_checklist",
    "best_practices",
    "client_testimonial",
  ],
  landscaping: [
    "before_after_fix",
    "seasonal_checklist",
    "project_walkthrough",
    "lifestyle_fit_story",
  ],
  auto_repair: [
    "before_after_fix",
    "emergency_tip",
    "maintenance_reminders",
    "cost_transparency",
  ],

  graphic_designer: [
    "portfolio_piece",
    "process_explained",
    "before_after_explained",
    "technique_tutorial",
  ],
  videographer: [
    "shoot_breakdown",
    "behind_the_shot",
    "color_grading_before_after",
    "client_testimonial",
  ],
  artist: ["portfolio_piece", "inspiration", "process_explained"],
  writer: [
    "personal_story",
    "deep_dive",
    "case_study",
    "client_testimonial",
  ],
  voice_actor: [
    "behind_the_shot",
    "gear_talk",
    "portfolio_piece",
    "client_testimonial",
  ],

  tutor: [
    "study_tips",
    "exam_hacks",
    "reviewer_snippets",
    "student_testimonial",
  ],
  language_school: [
    "study_tips",
    "subject_minilessons",
    "campus_life",
    "student_testimonial",
  ],
  test_prep: [
    "exam_hacks",
    "reviewer_snippets",
    "academic_myth_busting",
  ],
  edu_creator: [
    "study_tips",
    "subject_minilessons",
    "deep_dive",
    "mini_masterclass",
  ],
  school_organization: [
    "org_event_highlights",
    "org_achievements",
    "campus_life",
    "club_recruitment",
  ],

  coach_consultant: [
    "case_study",
    "client_story",
    "success_path",
    "industry_predictions",
  ],
  consulting_firm: [
    "case_study",
    "stats_and_data",
    "research_backed",
    "success_path",
  ],
  career_coach: [
    "personal_story",
    "client_story",
    "success_path",
    "mistakes_to_avoid",
  ],
  virtual_assistant: [
    "productivity_workflow",
    "systems_and_tools",
    "how_i_manage_clients",
    "client_testimonial",
  ],
  law_firm: [
    "case_study",
    "stats_and_data",
    "credibility_boost",
    "faq",
  ],
  accountant: [
    "stats_and_data",
    "myths_vs_facts",
    "mistakes_to_avoid",
    "cost_transparency",
  ],

  saas: [
    "feature_spotlight",
    "micro_demo",
    "use_case_explainer",
    "product_update",
  ],
  web_agency: [
    "case_study",
    "before_after_explained",
    "process_explained",
    "client_testimonial",
  ],
  mobile_app: [
    "feature_spotlight",
    "micro_demo",
    "user_story",
    "roadmap",
  ],
  tech_startup: [
    "product_update",
    "roadmap",
    "industry_predictions",
    "case_study",
  ],
  it_services: [
    "case_study",
    "process_explained",
    "stats_and_data",
    "best_practices",
  ],
};

/* -------------------------
   Helpers
--------------------------*/

export function getAngleByKey(key: AngleKey): AngleDef | undefined {
  for (const cat of ANGLE_CATEGORIES) {
    const found = cat.angles.find((a) => a.key === key);
    if (found) return found;
  }
  return undefined;
}

export function getSuggestedAnglesForIndustry(
  industry: string | null | undefined
): AngleDef[] {
  if (!industry) return [];
  const angleKeys =
    INDUSTRY_TO_ANGLE_KEYS[industry as IndustryEnum] || [];

  const seen = new Set<string>();
  const result: AngleDef[] = [];

  for (const k of angleKeys) {
    if (!k || seen.has(k)) continue;
    const def = getAngleByKey(k);
    if (def) {
      seen.add(k);
      result.push(def);
    }
  }
  return result;
}
