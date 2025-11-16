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

import { ensurePushReady, notify } from "@/utils/push";

type DBPlatform = "facebook";

type ConnectedMeta = {
  id: string;
  platform: DBPlatform;
  page_id: string | null;
  page_name: string | null;
  ig_user_id: string | null; // kept in type in case other screens use it
  ig_username?: string | null; // but not used in this UI
  access_token: string;
  token_expires_at: string | null;
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
  | "other";

const INDUSTRY_OPTIONS: { value: Industry; label: string }[] = [
  { value: "content_creator", label: "Content Creator" },
  { value: "ecommerce", label: "E-commerce / Online Shop" },
  { value: "restaurant", label: "Restaurant / Food" },
  { value: "cafe", label: "Café / Beverage" },
  { value: "clinic", label: "Clinic / Health" },
  { value: "coach_consultant", label: "Coach / Consultant" },
  { value: "agency", label: "Agency / Services" },
  { value: "education", label: "Education" },
  { value: "other", label: "Other" },
];

type BrandProfileRow = {
  brand_name: string | null;
  industry: Industry | null;
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
          "id, platform, page_id, page_name, ig_user_id, ig_username, access_token, token_expires_at"
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

  // Brand profile state
  const [brandName, setBrandName] = useState("");
  const [industry, setIndustry] = useState<Industry>("other");
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandSaving, setBrandSaving] = useState(false);
  const [isEditingBrand, setIsEditingBrand] = useState(false);

  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const loadBrandProfile = useCallback(
    async (uid: string) => {
      try {
        setBrandLoading(true);
        const { data, error } = await supabase
          .from("brand_profiles")
          .select("brand_name, industry")
          .eq("user_id", uid)
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

  useEffect(() => {
    (async () => {
      try {
        await ensurePushReady?.();
      } catch {}
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
        await loadBrandProfile(user.id);
      }
    })();
  }, [loadBrandProfile]);

  const industryLabel = useMemo(
    () => INDUSTRY_OPTIONS.find((opt) => opt.value === industry)?.label ?? "Other",
    [industry]
  );

  const saveBrandProfile = useCallback(async () => {
    if (!userId) {
      Alert.alert("Sign in required", "Please sign in first.");
      return;
    }
    try {
      setBrandSaving(true);
      const payload = {
        user_id: userId,
        brand_name: brandName.trim() || null,
        industry,
      };

      const { error } = await supabase
        .from("brand_profiles")
        .upsert(payload, { onConflict: "user_id" });
      if (error) throw error;

      Alert.alert("Saved", "Brand profile updated.");
      setIsEditingBrand(false);
    } catch (e: any) {
      console.error("Save brand profile failed:", e?.message || e);
      Alert.alert("Error", e?.message ?? "Could not save brand profile.");
    } finally {
      setBrandSaving(false);
    }
  }, [userId, brandName, industry]);

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
        redirect_override: Platform.OS === "web" ? `${OAUTH_BASE}/meta_web_close` : undefined,
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

        // 🔔 Push: Connected (Facebook only)
        try {
          const latest = (await supabase
            .from("connected_meta_accounts")
            .select("page_name,page_id")
            .eq("platform", "facebook")
            .order("created_at", { ascending: false })
            .limit(1)
            .single()).data as any;

          const pageLabel = latest?.page_name || latest?.page_id || "Facebook Page";
          await notify?.({
            title: "Meta account linked",
            body: `Connected to ${pageLabel}.`,
            data: {
              kind: "meta_connected",
              page_id: latest?.page_id,
            },
          });
        } catch {}

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

      // 🔔 Push: Disconnected
      try {
        await notify?.({
          title: "Meta account disconnected",
          body: row.page_name ? `${row.page_name} has been removed.` : "Facebook Page removed.",
          data: { kind: "meta_disconnected", id: row.id, page_id: row.page_id },
        });
      } catch {}

      await refresh();
    } catch (e: any) {
      Alert.alert("Disconnect failed", e?.message ?? "Unexpected error.");
    } finally {
      setWorking(null);
    }
  };

  const onSignOut = async () => {
    try {
      await supabase.auth.signOut();

      try {
        await notify?.({
          title: "Signed out",
          body: "You’ve been signed out of PRISM.",
          data: { kind: "signed_out" },
        });
      } catch {}

      router.replace("/(auth)");
    } catch (e: any) {
      Alert.alert("Sign out failed", e?.message ?? "Unexpected error.");
    }
  };

  const connected = rows.length > 0;
  const primary = rows[0] || null;

  const connectedStatus = connected ? "Connected" : "Not Connected";
  const statusBg = connected ? "#DCFCE7" : "#FEF2F2";
  const statusFg = connected ? "#166534" : "#991B1B";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: headerHeight,
          paddingBottom: insets.bottom + 24,
        },
      ]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* ---------- HEADER ---------- */}
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <TouchableOpacity onPress={onSignOut} style={styles.signOutBtn} activeOpacity={0.85}>
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
            {email ? (
              <Text style={styles.userEmail} numberOfLines={1}>
                {email}
              </Text>
            ) : null}
            <View style={[styles.statusPill, { backgroundColor: statusBg }]}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: connected ? "#22C55E" : "#EF4444" },
                ]}
              />
              <Text style={[styles.statusText, { color: statusFg }]}>{connectedStatus}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ---------- BODY ---------- */}
      <View style={styles.body}>
        {/* Brand Profile Card */}
        
        <View style={styles.profilecard}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Brand Profile</Text>
            </View>
            <TouchableOpacity
              onPress={() => setIsEditingBrand((v) => !v)}
              style={styles.editPill}
              activeOpacity={0.9}
              disabled={brandLoading || brandSaving || !userId}
            >
              <Text style={styles.editPillText}>
                {isEditingBrand ? "Done" : brandName || industry ? "Edit" : "Set up"}
              </Text>
            </TouchableOpacity>
          </View>

          {brandLoading ? (
            <View style={[styles.rowCenter, { marginTop: 12 }]}>
              <ActivityIndicator />
              <Text style={{ marginLeft: 8, color: "#6B7280", fontSize: 13 }}>Loading…</Text>
            </View>
          ) : (
            <>
              {/* Minimal summary view (always visible) */}
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

              {/* Editable controls only when editing */}
              {isEditingBrand && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Brand name</Text>
                  <TextInput
                    value={brandName}
                    onChangeText={setBrandName}
                    placeholder="e.g. Salus Skin & Wellness Clinic"
                    placeholderTextColor="#9CA3AF"
                    style={styles.textInput}
                    editable={!brandLoading && !brandSaving}
                  />

                  <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Industry</Text>
                  <View style={styles.chipRow}>
                    {INDUSTRY_OPTIONS.map((opt) => {
                      const selected = industry === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.chip, selected && styles.chipSelected]}
                          onPress={() => setIndustry(opt.value)}
                          activeOpacity={0.9}
                          disabled={brandSaving}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              selected && styles.chipTextSelected,
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    onPress={saveBrandProfile}
                    style={[
                      styles.primaryBtn,
                      (brandSaving || brandLoading || !userId) && styles.btnDisabled,
                      { marginTop: 16 },
                    ]}
                    activeOpacity={0.92}
                    disabled={brandSaving || brandLoading || !userId}
                  >
                    {brandSaving ? (
                      <View style={styles.rowCenter}>
                        <ActivityIndicator />
                        <Text style={[styles.primaryBtnText, { marginLeft: 8 }]}>Saving…</Text>
                      </View>
                    ) : (
                      <Text style={styles.primaryBtnText}>Save Brand Profile</Text>
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
                  <Text style={[styles.primaryBtnText, { marginLeft: 8 }]}>Connecting…</Text>
                </View>
              ) : (
                <Text style={styles.primaryBtnText}>Connect Meta Account</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Linked Accounts</Text>

            <View style={styles.itemRow}>
              <View style={styles.itemIconWrap}>
                <FontAwesome name="facebook-square" size={20} color="#1877F2" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemLabel}>Facebook Page</Text>
                <Text style={styles.itemValue}>
                  {primary?.page_name || primary?.page_id || "—"}
                </Text>
              </View>
            </View>

            <View style={styles.inlineRow}>
              <TouchableOpacity
                onPress={connectMeta}
                style={[styles.secondaryBtn, (connecting || working) && styles.btnDisabled]}
                activeOpacity={0.92}
                disabled={!!(connecting || working)}
              >
                {connecting ? (
                  <View style={styles.rowCenter}>
                    <ActivityIndicator />
                    <Text style={[styles.secondaryBtnText, { marginLeft: 8 }]}>Opening…</Text>
                  </View>
                ) : (
                  <Text style={styles.secondaryBtnText}>Change Page</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => disconnect(primary!)}
                style={[
                  styles.ghostDanger,
                  (working === primary?.id || connecting) && styles.btnDisabled,
                ]}
                activeOpacity={0.92}
                disabled={working === primary?.id || connecting}
              >
                {working === primary?.id ? (
                  <View style={styles.rowCenter}>
                    <ActivityIndicator />
                    <Text style={[styles.ghostDangerText, { marginLeft: 8 }]}>Removing…</Text>
                  </View>
                ) : (
                  <Text style={styles.ghostDangerText}>Disconnect</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
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
    marginTop: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
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
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F9FAFB",
  },
  chipSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  chipText: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontWeight: "600",
  },
  chipTextSelected: {
    color: "#F9FAFB",
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
});
