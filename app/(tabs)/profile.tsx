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
  TouchableOpacity,
  View,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements"; // ⬅️ NEW
import { useSafeAreaInsets } from "react-native-safe-area-context"; // ⬅️ NEW

// 🔔 Push helpers — make sure these names match your src/utils/push.ts exports
// Suggested API: ensurePushReady(): Promise<void>, notify(opts: { title: string; body?: string; data?: any })
import { ensurePushReady, notify } from "@/utils/push";

type DBPlatform = "facebook";

type ConnectedMeta = {
  id: string;
  platform: DBPlatform;
  page_id: string | null;
  page_name: string | null;
  ig_user_id: string | null;
  ig_username?: string | null;
  access_token: string;
  token_expires_at: string | null;
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

/* ---------- Data Hook ---------- */
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

  const headerHeight = useHeaderHeight();          // ⬅️ NEW
  const insets = useSafeAreaInsets();              // ⬅️ NEW

  useEffect(() => {
    (async () => {
      // Ensure push is registered once when this tab mounts
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
    })();
  }, []);

  const userTag = displayName || email || "User";
  const avatarText = useMemo(() => initialsFrom(displayName || email), [displayName, email]);

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
        // Enrich IG (best-effort)
        await fetch(`${OAUTH_BASE}/meta_ig_enrich`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ only_missing: true }),
        }).catch(() => {});

        await refresh();

        // 🔔 Push: Connected
        try {
          const latest = (await supabase
            .from("connected_meta_accounts")
            .select("page_name,page_id,ig_user_id,ig_username")
            .eq("platform", "facebook")
            .order("created_at", { ascending: false })
            .limit(1)
            .single()).data as any;

          const pageLabel = latest?.page_name || latest?.page_id || "Facebook Page";
          const igLabel = latest?.ig_username ? ` and @${latest.ig_username}` : "";
          await notify?.({
            title: "Meta account linked",
            body: `Connected to ${pageLabel}${igLabel}.`,
            data: { kind: "meta_connected", page_id: latest?.page_id, ig_user_id: latest?.ig_user_id },
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

      // 🔔 Push: Optional sign-out notice (safe to remove if you don't want this)
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
        { paddingTop: headerHeight }, // ⬅️ NEW: safe space for header
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
        {!connected ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Connect your Meta account</Text>
            <Text style={styles.cardSubtle}>
              Choose a Facebook Page. If it has an Instagram Professional account linked,
              we’ll show its @username too.
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

            <View style={styles.itemRow}>
              <View style={styles.itemIconWrap}>
                <FontAwesome name="instagram" size={20} color="#C13584" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemLabel}>Instagram</Text>
                <Text style={styles.itemValue}>
                  {primary?.ig_user_id
                    ? primary?.ig_username
                      ? `@${primary.ig_username}`
                      : "(linked — fetch pending)"
                    : "—"}
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
  content: { paddingBottom: 0 }, // top padding added dynamically
  hero: {
    backgroundColor: "#111827",
    paddingTop: 72,
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
  cardTitle: { fontSize: 16, fontWeight: "800", color: TEXT_DARK },
  cardSubtle: { fontSize: 13, color: TEXT_MUTED, marginTop: 6 },
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
});
