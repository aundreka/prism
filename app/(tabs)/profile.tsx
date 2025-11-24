// app/(tabs)/profile.tsx
import { supabase } from "@/lib/supabase";
import { FontAwesome } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type DBPlatform = "facebook";

type ConnectedMeta = {
  id: string;
  platform: DBPlatform;
  page_id: string | null;
  page_name: string | null;
  access_token: string;
  token_expires_at: string | null;
  user_token_expires_at?: string | null;
  is_active?: boolean | null;
};

type Industry =
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

type IndustryOption = {
  value: Industry;
  label: string;
  category: string;
};

const INDUSTRY_OPTIONS: IndustryOption[] = [
  // Food & Beverage
  { value: "restaurant", label: "Restaurant", category: "Food & Beverage" },
  { value: "cafe", label: "Café / Beverage", category: "Food & Beverage" },
  { value: "food_truck", label: "Food Truck", category: "Food & Beverage" },
  { value: "catering", label: "Catering", category: "Food & Beverage" },

  // Health & Wellness
  { value: "clinic", label: "Clinic / Health", category: "Health & Wellness" },
  { value: "fitness", label: "Fitness / Gym", category: "Health & Wellness" },
  { value: "beauty", label: "Beauty / Aesthetics", category: "Health & Wellness" },
  { value: "spa_wellness", label: "Spa & Wellness", category: "Health & Wellness" },
  { value: "mental_health", label: "Mental Health", category: "Health & Wellness" },
  { value: "nutritionist", label: "Nutritionist / Dietitian", category: "Health & Wellness" },
  { value: "yoga_studio", label: "Yoga Studio", category: "Health & Wellness" },
  { value: "therapist", label: "Therapist / Counseling", category: "Health & Wellness" },

  // Creators & Influencers
  { value: "influencer", label: "Influencer", category: "Creators & Influencers" },
  { value: "content_creator", label: "Content Creator", category: "Creators & Influencers" },
  { value: "personal_brand", label: "Personal Brand", category: "Creators & Influencers" },
  { value: "artist", label: "Artist", category: "Creators & Influencers" },
  { value: "writer", label: "Writer / Author", category: "Creators & Influencers" },
  { value: "voice_actor", label: "Voice Actor", category: "Creators & Influencers" },
  { value: "photography", label: "Photography", category: "Creators & Influencers" },
  { value: "videographer", label: "Videographer / Filmmaker", category: "Creators & Influencers" },
  { value: "travel_blog", label: "Travel Blogger / Vlogger", category: "Creators & Influencers" },
  { value: "gaming_channel", label: "Gaming Channel / Streamer", category: "Creators & Influencers" },
  { value: "parenting", label: "Parenting Creator", category: "Creators & Influencers" },
  { value: "diy_maker", label: "DIY / Maker", category: "Creators & Influencers" },
  { value: "edu_creator", label: "Educational Creator", category: "Creators & Influencers" },

  // Education
  { value: "education", label: "Education Business", category: "Education" },
  { value: "school_organization", label: "School / Organization", category: "Education" },
  { value: "tutor", label: "Tutor / Tutoring Center", category: "Education" },
  { value: "language_school", label: "Language School", category: "Education" },
  { value: "test_prep", label: "Test Prep / Review Center", category: "Education" },

  // Professional Services & Agencies
  { value: "coach_consultant", label: "Coach / Consultant", category: "Professional Services & Agencies" },
  { value: "career_coach", label: "Career Coach", category: "Professional Services & Agencies" },
  { value: "agency", label: "Marketing / Creative Agency", category: "Professional Services & Agencies" },
  { value: "consulting_firm", label: "Consulting Firm", category: "Professional Services & Agencies" },
  { value: "law_firm", label: "Law Firm", category: "Professional Services & Agencies" },
  { value: "accountant", label: "Accountant / Accounting Firm", category: "Professional Services & Agencies" },
  { value: "virtual_assistant", label: "Virtual Assistant", category: "Professional Services & Agencies" },
  { value: "it_services", label: "IT Services", category: "Professional Services & Agencies" },
  { value: "web_agency", label: "Web Design / Dev Agency", category: "Professional Services & Agencies" },
  { value: "mobile_app", label: "Mobile App Business", category: "Professional Services & Agencies" },
  { value: "tech_startup", label: "Tech Startup", category: "Professional Services & Agencies" },
  { value: "saas", label: "SaaS Product", category: "Professional Services & Agencies" },

  // Local & Home Services
  { value: "local_business", label: "Local Business", category: "Local & Home Services" },
  { value: "service_business", label: "Service Business", category: "Local & Home Services" },
  { value: "plumber", label: "Plumber", category: "Local & Home Services" },
  { value: "electrician", label: "Electrician", category: "Local & Home Services" },
  { value: "cleaning_service", label: "Cleaning Service", category: "Local & Home Services" },
  { value: "landscaping", label: "Landscaping / Gardening", category: "Local & Home Services" },
  { value: "auto_repair", label: "Auto Repair / Car Care", category: "Local & Home Services" },
  { value: "pet_services", label: "Pet Services / Grooming", category: "Local & Home Services" },

  // Retail & Brands
  { value: "ecommerce", label: "E-commerce / Online Shop", category: "Retail & Brands" },
  { value: "fashion_brand", label: "Fashion Brand", category: "Retail & Brands" },
  { value: "accessories", label: "Accessories / Jewelry", category: "Retail & Brands" },
  { value: "home_goods", label: "Home Goods / Decor", category: "Retail & Brands" },
  { value: "toy_store", label: "Toy Store", category: "Retail & Brands" },
  { value: "bookstore", label: "Bookstore", category: "Retail & Brands" },

  // Events & Venues
  { value: "events_planner", label: "Events Planner", category: "Events & Venues" },
  { value: "event_venue", label: "Event Venue", category: "Events & Venues" },
  { value: "wedding_vendor", label: "Wedding Vendor", category: "Events & Venues" },

  // Real Estate & Travel
  { value: "real_estate", label: "Real Estate", category: "Real Estate & Travel" },

  // Nonprofit & Community
  { value: "nonprofit", label: "Nonprofit / NGO", category: "Nonprofit & Community" },

  // Catch-all / Other
  { value: "other", label: "Other / Not Listed", category: "Other" },
];

type BrandProfileRow = {
  brand_name: string | null;
  industry: Industry | null;
  platform?: DBPlatform;
  page_id?: string | null;
};

const OAUTH_BASE =
  process.env.EXPO_PUBLIC_OAUTH_BASE ??
  "https://lsaicrbtnbufgzxlyash.functions.supabase.co";

const REDIRECT_URI = Linking.createURL("/oauth/callback");

function initialsFrom(nameOrEmail?: string | null) {
  if (!nameOrEmail) return "U";
  const parts = nameOrEmail.replace(/@.*/, "").split(/[ ._]/).filter(Boolean);
  const first = parts[0]?.[0]?.toUpperCase() ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0]?.toUpperCase() ?? "" : "";
  return (first + last) || first || "U";
}

/* ---------- Data Hook: Meta Connections ---------- */
function useConnections() {
  const [rows, setRows] = useState<ConnectedMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("connected_meta_accounts")
        .select(
          "id, platform, page_id, page_name, access_token, token_expires_at, user_token_expires_at, is_active"
        )
        .eq("platform", "facebook")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRows((data || []) as any);
    } catch (e: any) {
      console.error("Load connections failed:", e?.message || e);
      Alert.alert("Error", "Could not load linked accounts.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      if (url?.includes("oauth/callback")) fetchRows();
    });
    fetchRows();
    return () => sub.remove();
  }, [fetchRows]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRows();
  }, [fetchRows]);

  return { rows, loading, refreshing, onRefresh, refresh: fetchRows };
}

/* ---------- Screen ---------- */
export default function ProfileScreen() {
  const { rows, refreshing, onRefresh, refresh } = useConnections();
  const [working, setWorking] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Brand profile state (now page-specific)
  const [brandName, setBrandName] = useState("");
  const [industry, setIndustry] = useState<Industry>("other");
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandSaving, setBrandSaving] = useState(false);
  const [isEditingBrand, setIsEditingBrand] = useState(false);

  // Industry picker state
  const [industryPickerVisible, setIndustryPickerVisible] = useState(false);
  const [industrySearch, setIndustrySearch] = useState("");

  // Page picker state
  const [pagePickerVisible, setPagePickerVisible] = useState(false);

  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const loadBrandProfile = useCallback(
    async (uid: string, platform: DBPlatform, pageId: string) => {
      try {
        setBrandLoading(true);
        const { data, error } = await supabase
          .from("brand_profiles")
          .select("brand_name, industry")
          .eq("user_id", uid)
          .eq("platform", platform)
          .eq("page_id", pageId)
          .maybeSingle<BrandProfileRow>();

        if (error && error.code !== "PGRST116") {
          throw error;
        }

        if (data) {
          setBrandName(data.brand_name ?? "");
          setIndustry((data.industry as Industry | null) ?? "other");
        } else {
          setBrandName("");
          setIndustry("other");
        }
      } catch (e: any) {
        console.error("Load brand profile failed:", e?.message || e);
      } finally {
        setBrandLoading(false);
      }
    },
    []
  );

  // Load user basics
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      setDisplayName(
        (user?.user_metadata?.full_name as string) ||
          (user?.user_metadata?.name as string) ||
          null
      );
      setEmail(user?.email ?? null);
      if (user?.id) {
        setUserId(user.id);
      }
    })();
  }, []);

  const industryLabel = useMemo(
    () =>
      INDUSTRY_OPTIONS.find((opt) => opt.value === industry)?.label ??
      "Other / Not Listed",
    [industry]
  );

  const connected = rows.length > 0;

  const activeConnection = useMemo<ConnectedMeta | null>(() => {
    if (!rows.length) return null;
    const active = rows.find((r) => r.is_active);
    return active ?? rows[0];
  }, [rows]);

  const hasPageContext = !!(activeConnection && activeConnection.page_id);

  // Re-load brand profile whenever user or active page changes
  useEffect(() => {
    (async () => {
      if (!userId || !hasPageContext || !activeConnection?.page_id) {
        // Reset to blank when there is no active page
        setBrandName("");
        setIndustry("other");
        return;
      }
      await loadBrandProfile(userId, activeConnection.platform, activeConnection.page_id);
    })();
  }, [userId, hasPageContext, activeConnection, loadBrandProfile]);

  const saveBrandProfile = useCallback(async () => {
    if (!userId) {
      Alert.alert("Sign in required", "Please sign in first.");
      return;
    }
    if (!activeConnection?.page_id) {
      Alert.alert(
        "Connect a Page",
        "Link a Facebook Page first so we can save a brand profile for it."
      );
      return;
    }
    try {
      setBrandSaving(true);
      const payload = {
        user_id: userId,
        platform: activeConnection.platform,
        page_id: activeConnection.page_id,
        brand_name: brandName.trim() || null,
        industry,
      };

      const { error } = await supabase
        .from("brand_profiles")
        .upsert(payload, { onConflict: "user_id,platform,page_id" });
      if (error) throw error;

      Alert.alert("Saved", "Brand profile updated for this page.");
      setIsEditingBrand(false);
    } catch (e: any) {
      console.error("Save brand profile failed:", e?.message || e);
      Alert.alert("Error", e?.message ?? "Could not save brand profile.");
    } finally {
      setBrandSaving(false);
    }
  }, [userId, brandName, industry, activeConnection]);

  const userTag = displayName || email || "User";
  const avatarText = useMemo(
    () => initialsFrom(displayName || email),
    [displayName, email]
  );

  const connectMeta = async () => {
    try {
      setConnecting(true);
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) {
        Alert.alert("Sign in required", "Please sign in first.");
        return;
      }

      const body = {
        user_id: user.id,
        platform: "facebook",
        redirect_uri: REDIRECT_URI,
        pick: true,
        redirect_override:
          Platform.OS === "web" ? `${OAUTH_BASE}/meta_web_close` : undefined,
      };

      const resp = await fetch(`${OAUTH_BASE}/meta_connect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`Connect failed (${resp.status})`);
      const { url } = await resp.json();

      const res = await WebBrowser.openAuthSessionAsync(url, REDIRECT_URI, {
        showInRecents: true,
        preferEphemeralSession: true,
      });

      if (res.type === "success" && res.url?.includes("ok=1")) {
        await refresh();
        Alert.alert("Connected", "Meta account linked.");
      }
    } catch (e: any) {
      Alert.alert("OAuth failed", e?.message ?? "Could not start OAuth.");
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async (row: ConnectedMeta) => {
    try {
      setWorking(row.id);
      const { error } = await supabase
        .from("connected_meta_accounts")
        .delete()
        .eq("id", row.id);
      if (error) throw error;

      await refresh();
    } catch (e: any) {
      Alert.alert("Disconnect failed", e?.message ?? "Unexpected error.");
    } finally {
      setWorking(null);
    }
  };

  const setActivePage = useCallback(
    async (row: ConnectedMeta) => {
      if (!userId || !row.page_id) return;
      try {
        setWorking(row.id);
        const resp = await fetch(`${OAUTH_BASE}/meta_set_active_page`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, page_id: row.page_id }),
        });
        if (!resp.ok) {
          const txt = await resp.text();
          console.error("meta_set_active_page error", txt);
          Alert.alert("Error", "Could not set active page.");
        } else {
          await refresh();
        }
      } catch (e: any) {
        console.error("setActivePage failed", e?.message || e);
        Alert.alert("Error", e?.message ?? "Could not set active page.");
      } finally {
        setWorking(null);
        setPagePickerVisible(false);
      }
    },
    [userId, refresh]
  );

  const tokenWarning = useMemo(() => {
    if (!activeConnection) return null;
    const raw =
      activeConnection.user_token_expires_at ?? activeConnection.token_expires_at;
    if (!raw) return null;
    const expMs = new Date(raw).getTime();
    if (Number.isNaN(expMs)) return null;
    const now = Date.now();
    const diffDays = (expMs - now) / (1000 * 60 * 60 * 24);

    if (diffDays <= 0) {
      return { status: "expired" as const };
    }
    if (diffDays <= 7) {
      return {
        status: "expiring" as const,
        days: Math.max(1, Math.round(diffDays)),
      };
    }
    return null;
  }, [activeConnection]);

  const onSignOut = async () => {
    try {
      await supabase.auth.signOut();
      router.replace("/(auth)");
    } catch (e: any) {
      Alert.alert("Sign out failed", e?.message ?? "Unexpected error.");
    }
  };

  const connectedStatus = connected ? "Connected" : "Not Connected";
  const statusBg = connected ? "#DCFCE7" : "#FEF2F2";
  const statusFg = connected ? "#166534" : "#991B1B";

  // ---- Industry search + grouping ----
  const filteredIndustryOptions = useMemo(() => {
    const q = industrySearch.trim().toLowerCase();
    if (!q) return INDUSTRY_OPTIONS;
    return INDUSTRY_OPTIONS.filter((opt) => {
      const label = opt.label.toLowerCase();
      const value = opt.value.replace(/_/g, " ").toLowerCase();
      return label.includes(q) || value.includes(q);
    });
  }, [industrySearch]);

  const industryGroups = useMemo(() => {
    const groups: Record<string, IndustryOption[]> = {};
    filteredIndustryOptions.forEach((opt) => {
      if (!groups[opt.category]) groups[opt.category] = [];
      groups[opt.category].push(opt);
    });
    return Object.keys(groups)
      .sort()
      .map((key) => ({ category: key, items: groups[key] }));
  }, [filteredIndustryOptions]);

  const closeIndustryPicker = () => {
    setIndustryPickerVisible(false);
    setIndustrySearch("");
  };

  const avatarStatusSubtitle = email ? email : undefined;

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: headerHeight,
            paddingBottom: insets.bottom + 24,
          },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ---------- HEADER ---------- */}
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <TouchableOpacity
              onPress={onSignOut}
              style={styles.signOutBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.heroBody}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{avatarText}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName} numberOfLines={1}>
                {userTag}
              </Text>
              {avatarStatusSubtitle ? (
                <Text style={styles.userEmail} numberOfLines={1}>
                  {avatarStatusSubtitle}
                </Text>
              ) : null}
              <View style={[styles.statusPill, { backgroundColor: statusBg }]}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: connected ? "#22C55E" : "#EF4444" },
                  ]}
                />
                <Text style={[styles.statusText, { color: statusFg }]}>
                  {connectedStatus}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ---------- BODY ---------- */}
        <View style={styles.body}>
          {/* Brand Profile Card (now per page) */}
          <View style={styles.profilecard}>
            <View style={styles.cardHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Brand Profile</Text>
                <Text style={styles.cardSubtle}>
                  {hasPageContext
                    ? `For page: ${
                        activeConnection?.page_name ||
                        activeConnection?.page_id ||
                        "Unnamed Page"
                      }`
                    : "Connect a Facebook Page to set up a brand profile for it."}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (!hasPageContext) {
                    Alert.alert(
                      "Connect a Page",
                      "Link a Facebook Page first so we know which page this brand profile belongs to."
                    );
                    return;
                  }
                  setIsEditingBrand((v) => !v);
                }}
                style={styles.editPill}
                activeOpacity={0.9}
                disabled={brandLoading || brandSaving || !userId || !hasPageContext}
              >
                <Text style={styles.editPillText}>
                  {isEditingBrand ? "Done" : brandName || industry ? "Edit" : "Set up"}
                </Text>
              </TouchableOpacity>
            </View>

            {brandLoading ? (
              <View style={[styles.rowCenter, { marginTop: 12 }]}>
                <ActivityIndicator />
                <Text style={{ marginLeft: 8, color: "#6B7280", fontSize: 13 }}>
                  Loading…
                </Text>
              </View>
            ) : (
              <>
                {/* Minimal summary view */}
                <View style={styles.summaryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.summaryLabel}>Brand name</Text>
                    <Text style={styles.summaryValue}>
                      {brandName.trim() || "Not set"}
                    </Text>
                  </View>
                </View>

                <View style={[styles.summaryRow, { marginTop: 8 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.summaryLabel}>Industry</Text>
                    <Text style={styles.summaryValue}>{industryLabel}</Text>
                  </View>
                </View>

                {/* Editable controls */}
                {isEditingBrand && (
                  <>
                    <Text style={[styles.fieldLabel, { marginTop: 18 }]}>
                      Brand name
                    </Text>
                    <TextInput
                      value={brandName}
                      onChangeText={setBrandName}
                      placeholder="e.g. Salus Skin & Wellness Clinic"
                      placeholderTextColor="#9CA3AF"
                      style={styles.textInput}
                      editable={!brandLoading && !brandSaving && hasPageContext}
                    />

                    <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
                      Industry
                    </Text>
                    <TouchableOpacity
                      style={styles.selectField}
                      onPress={() => setIndustryPickerVisible(true)}
                      activeOpacity={0.9}
                      disabled={brandSaving || !hasPageContext}
                    >
                      <Text
                        style={
                          industry
                            ? styles.selectFieldText
                            : styles.selectFieldPlaceholder
                        }
                        numberOfLines={1}
                      >
                        {industryLabel}
                      </Text>
                      <FontAwesome
                        name="chevron-down"
                        size={14}
                        color="#9CA3AF"
                        style={{ marginLeft: 8 }}
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={saveBrandProfile}
                      style={[
                        styles.primaryBtn,
                        (brandSaving || brandLoading || !userId || !hasPageContext) &&
                          styles.btnDisabled,
                        { marginTop: 16 },
                      ]}
                      activeOpacity={0.92}
                      disabled={
                        brandSaving || brandLoading || !userId || !hasPageContext
                      }
                    >
                      {brandSaving ? (
                        <View style={styles.rowCenter}>
                          <ActivityIndicator />
                          <Text
                            style={[styles.primaryBtnText, { marginLeft: 8 }]}
                          >
                            Saving…
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.primaryBtnText}>
                          Save Brand Profile
                        </Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </View>

          {/* Meta Connection Card */}
          {!connected ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Connect your Meta account</Text>
              <Text style={styles.cardSubtle}>
                Choose a Facebook Page to connect. We’ll use its analytics to power your
                recommendations.
              </Text>

              <TouchableOpacity
                onPress={connectMeta}
                style={[styles.primaryBtn, connecting && styles.btnDisabled]}
                activeOpacity={0.92}
                disabled={connecting}
              >
                {connecting ? (
                  <View style={styles.rowCenter}>
                    <ActivityIndicator />
                    <Text style={[styles.primaryBtnText, { marginLeft: 8 }]}>
                      Connecting…
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.primaryBtnText}>Connect Meta Account</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Linked Facebook Page</Text>
              <Text style={styles.cardSubtle}>
                PRISM uses your active page for posting and analytics.
              </Text>

              {activeConnection && (
                <>
                  <TouchableOpacity
                    style={styles.activePageField}
                    activeOpacity={0.9}
                    onPress={() => setPagePickerVisible(true)}
                  >
                    <View style={styles.itemIconWrap}>
                      <FontAwesome name="facebook-square" size={20} color="#1877F2" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemLabel}>Active Page</Text>
                      <Text style={styles.itemValue} numberOfLines={1}>
                        {activeConnection.page_name ||
                          activeConnection.page_id ||
                          "—"}
                      </Text>
                    </View>
                    <View className="activeBadge">
                      <View style={styles.activeBadge}>
                        <Text style={styles.activeBadgeText}>Active</Text>
                      </View>
                    </View>
                    <FontAwesome
                      name="chevron-down"
                      size={14}
                      color="#9CA3AF"
                      style={{ marginLeft: 6 }}
                    />
                  </TouchableOpacity>

                  {tokenWarning && (
                    <View style={styles.warningBanner}>
                      <View style={styles.warningIconWrap}>
                        <FontAwesome
                          name="exclamation-triangle"
                          size={14}
                          color="#B45309"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.warningTitle}>
                          {tokenWarning.status === "expired"
                            ? "Connection expired"
                            : "Connection expiring soon"}
                        </Text>
                        <Text style={styles.warningText}>
                          {tokenWarning.status === "expired"
                            ? "Your Meta connection has expired. Please reconnect to keep insights and scheduling working."
                            : `Your Meta connection will expire in about ${tokenWarning.days} day(s). Reconnect to avoid interruptions.`}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={connectMeta}
                        style={styles.warningButton}
                        activeOpacity={0.9}
                      >
                        <Text style={styles.warningButtonText}>Reconnect</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <View style={styles.inlineRow}>
                    <TouchableOpacity
                      onPress={() => setPagePickerVisible(true)}
                      style={[
                        styles.secondaryBtn,
                        (connecting || working) && styles.btnDisabled,
                      ]}
                      activeOpacity={0.92}
                      disabled={!!(connecting || working)}
                    >
                      <Text style={styles.secondaryBtnText}>
                        Change Active Page
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => disconnect(activeConnection)}
                      style={[
                        styles.ghostDanger,
                        (working === activeConnection.id || connecting) &&
                          styles.btnDisabled,
                      ]}
                      activeOpacity={0.92}
                      disabled={working === activeConnection.id || connecting}
                    >
                      {working === activeConnection.id ? (
                        <View style={styles.rowCenter}>
                          <ActivityIndicator />
                          <Text
                            style={[styles.ghostDangerText, { marginLeft: 8 }]}
                          >
                            Removing…
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.ghostDangerText}>Disconnect</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )}

          {/* All Pages List (for clarity) */}
          {connected && rows.length > 1 && (
            <View style={[styles.card, { marginTop: 16 }]}>
              <Text style={styles.cardTitle}>Your Connected Pages</Text>
              <Text style={styles.cardSubtle}>
                Tap a page below to make it active.
              </Text>

              {rows.map((row) => {
                const active = !!row.is_active;
                return (
                  <TouchableOpacity
                    key={row.id}
                    style={[
                      styles.itemRow,
                      { borderTopWidth: 1, borderTopColor: BORDER },
                      active && { backgroundColor: "#ECFDF5" },
                    ]}
                    activeOpacity={0.85}
                    onPress={() => setActivePage(row)}
                  >
                    <View style={styles.itemIconWrap}>
                      <FontAwesome name="facebook-square" size={20} color="#1877F2" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemLabel}>
                        {active ? "Active" : "Connected"}
                      </Text>
                      <Text style={styles.itemValue} numberOfLines={1}>
                        {row.page_name || row.page_id || "—"}
                      </Text>
                    </View>
                    {active && (
                      <FontAwesome name="check-circle" size={18} color="#16A34A" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Connect CTA if already connected but want another page */}
          {connected && (
            <View style={[styles.card, { marginTop: 16 }]}>
              <Text style={styles.cardTitle}>Add another Page</Text>
              <Text style={styles.cardSubtle}>
                You can connect multiple Facebook Pages and switch which one is active.
              </Text>
              <TouchableOpacity
                onPress={connectMeta}
                style={[styles.primaryBtn, connecting && styles.btnDisabled]}
                activeOpacity={0.92}
                disabled={connecting}
              >
                {connecting ? (
                  <View style={styles.rowCenter}>
                    <ActivityIndicator />
                    <Text style={[styles.primaryBtnText, { marginLeft: 8 }]}>
                      Opening…
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.primaryBtnText}>Connect Another Page</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ---------- INDUSTRY PICKER MODAL ---------- */}
      <Modal
        visible={industryPickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeIndustryPicker}
      >
        <View
          style={[
            styles.modalContainer,
            { paddingTop: insets.top + 12 },
          ]}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={closeIndustryPicker}
              style={styles.modalClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Choose your industry</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={styles.searchWrapper}>
            <FontAwesome
              name="search"
              size={14}
              color="#9CA3AF"
              style={{ marginRight: 6 }}
            />
            <TextInput
              value={industrySearch}
              onChangeText={setIndustrySearch}
              placeholder="Search industries…"
              placeholderTextColor="#9CA3AF"
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {industryGroups.length === 0 ? (
              <View style={styles.noResults}>
                <Text style={styles.noResultsText}>
                  No industries found. Try a different keyword.
                </Text>
              </View>
            ) : (
              industryGroups.map((group) => (
                <View key={group.category} style={styles.groupSection}>
                  <Text style={styles.groupHeaderText}>{group.category}</Text>
                  {group.items.map((opt) => {
                    const selected = opt.value === industry;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.industryOptionRow,
                          selected && styles.industryOptionSelected,
                        ]}
                        activeOpacity={0.85}
                        onPress={() => {
                          setIndustry(opt.value);
                          closeIndustryPicker();
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.industryOptionLabel}>
                            {opt.label}
                          </Text>
                          <Text style={styles.industryOptionSlug}>
                            {opt.value.replace(/_/g, " ")}
                          </Text>
                        </View>
                        {selected && (
                          <FontAwesome
                            name="check"
                            size={16}
                            color="#111827"
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ---------- PAGE PICKER MODAL ---------- */}
      <Modal
        visible={pagePickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPagePickerVisible(false)}
      >
        <View
          style={[
            styles.modalContainer,
            { paddingTop: insets.top + 12 },
          ]}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setPagePickerVisible(false)}
              style={styles.modalClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          <Text style={styles.modalTitle}>Select active page</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {rows.length === 0 ? (
              <View style={styles.noResults}>
                <Text style={styles.noResultsText}>
                  No pages connected yet.
                </Text>
              </View>
            ) : (
              rows.map((row) => {
                const active = !!row.is_active;
                return (
                  <TouchableOpacity
                    key={row.id}
                    style={[
                      styles.industryOptionRow,
                      active && styles.industryOptionSelected,
                    ]}
                    activeOpacity={0.85}
                    onPress={() => setActivePage(row)}
                  >
                    <View style={styles.itemIconWrap}>
                      <FontAwesome
                        name="facebook-square"
                        size={20}
                        color="#1877F2"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.industryOptionLabel}>
                        {row.page_name || row.page_id || "—"}
                      </Text>
                      <Text style={styles.industryOptionSlug}>
                        {active ? "Active page" : "Tap to make active"}
                      </Text>
                    </View>
                    {active && (
                      <FontAwesome name="check-circle" size={18} color="#16A34A" />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

/* ---------- Styles ---------- */
const BG = "#F8FAFC";
const TEXT_DARK = "#0F172A";
const TEXT_MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const CARD_BG = "#FFFFFF";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { paddingBottom: 0 },
  hero: {
    backgroundColor: "#111827",
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 28,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroTopRow: { alignItems: "flex-end" },
  signOutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#1F2937",
    borderRadius: 10,
  },
  signOutText: { color: "#E5E7EB", fontWeight: "700", fontSize: 13 },
  heroBody: { marginTop: 18, flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#F9FAFB", fontWeight: "800", fontSize: 20 },
  userName: { color: "#F9FAFB", fontSize: 20, fontWeight: "800" },
  userEmail: { color: "#CBD5E1", fontSize: 13, marginTop: 2 },
  statusPill: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: "700" },
  body: { marginTop: -16, paddingHorizontal: 20 },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
  },
  profilecard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginTop: 30,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: TEXT_DARK },
  cardSubtle: { fontSize: 12, color: TEXT_MUTED, marginTop: 4 },
  editPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: BORDER,
    alignSelf: "flex-start",
  },
  editPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  itemRow: {
    marginTop: 8,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  itemIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  itemLabel: { fontSize: 12, color: TEXT_MUTED },
  itemValue: { fontSize: 15, color: TEXT_DARK, fontWeight: "800", marginTop: 2 },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: "#ffffff", fontWeight: "800", fontSize: 14 },
  inlineRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  secondaryBtnText: { color: "#111827", fontWeight: "800", fontSize: 14 },
  ghostDanger: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    paddingVertical: 12,
    alignItems: "center",
  },
  ghostDangerText: { color: "#B91C1C", fontWeight: "800", fontSize: 14 },
  btnDisabled: { opacity: 0.6 },
  rowCenter: { flexDirection: "row", alignItems: "center" },

  // Brand profile styles
  fieldLabel: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "700",
    color: TEXT_DARK,
  },
  textInput: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: TEXT_DARK,
    backgroundColor: "#F9FAFB",
  },
  summaryRow: {
    marginTop: 14,
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 11,
    color: TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 14,
    color: TEXT_DARK,
    fontWeight: "700",
    marginTop: 2,
  },

  // Active page capsule
  activePageField: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F9FAFB",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  activeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#DCFCE7",
    borderRadius: 999,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#166534",
    textTransform: "uppercase",
  },

  // Warning banner
  warningBanner: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FBBF24",
    backgroundColor: "#FFFBEB",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  warningIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#92400E",
  },
  warningText: {
    fontSize: 12,
    color: "#92400E",
    marginTop: 2,
  },
  warningButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D97706",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  warningButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#92400E",
  },

  // Industry select
  selectField: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#F9FAFB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectFieldText: {
    flex: 1,
    fontSize: 14,
    color: TEXT_DARK,
    fontWeight: "600",
  },
  selectFieldPlaceholder: {
    flex: 1,
    fontSize: 14,
    color: "#9CA3AF",
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: TEXT_DARK,
  },
  modalClose: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 60,
  },
  modalCloseText: {
    fontSize: 13,
    color: "#6B7280",
  },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: TEXT_DARK,
  },
  groupSection: {
    marginTop: 14,
  },
  groupHeaderText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  industryOptionRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 10,
  },
  industryOptionSelected: {
    borderColor: "#111827",
    backgroundColor: "#F3F4F6",
  },
  industryOptionLabel: {
    fontSize: 14,
    color: TEXT_DARK,
    fontWeight: "600",
  },
  industryOptionSlug: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 2,
    textTransform: "lowercase",
  },
  noResults: {
    marginTop: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  noResultsText: {
    fontSize: 13,
    color: "#9CA3AF",
  },
});
