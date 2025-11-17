// app/(tabs)/posts.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

type PlatformEnum = "facebook" | "instagram";
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
type ScheduledRow = {
  id: string;
  post_id: string | null;
  status: PostStatusEnum;
  platform: PlatformEnum;
  api_post_id: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
};
type MetricEnum =
  | "impressions"
  | "reach"
  | "likes"
  | "comments"
  | "shares"
  | "saves"
  | "profile_visits"
  | "follows"
  | "clicks"
  | "video_views"
  | "engagement";
type AnalyticsRow = {
  object_id: string | null;
  metric: MetricEnum;
  value: number;
};

const BG = "#F8FAFC";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E5E7EB";
const TINT = "#111827";

const ALL_STATUS: PostStatusEnum[] = [
  "draft",
  "scheduled",
  "posting",
  "posted",
  "failed",
  "canceled",
];

export default function PostsScreen() {
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [sched, setSched] = useState<ScheduledRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);

  const [activeStatuses, setActiveStatuses] = useState<PostStatusEnum[]>([
    "scheduled",
    "posting",
    "posted",
    "failed",
    "canceled",
    "draft",
  ]);
  const [showFilters, setShowFilters] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) {
        Alert.alert("Sign in required", "Please sign in.");
        setPosts([]);
        setSched([]);
        setAnalytics([]);
        return;
      }

      const { data: p, error: e1 } = await supabase
        .from("posts")
        .select("id,user_id,caption,post_type,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (e1) throw e1;

      const postsData = (p || []) as PostRow[];
      setPosts(postsData);

      if (postsData.length === 0) {
        setSched([]);
        setAnalytics([]);
        return;
      }

      const postIds = postsData.map((x) => x.id);
      const { data: s, error: e2 } = await supabase
        .from("scheduled_posts")
        .select("id,post_id,status,platform,api_post_id,scheduled_at,posted_at")
        .in("post_id", postIds)
        .order("scheduled_at", { ascending: false });

      if (e2) throw e2;

      const schedData = (s || []) as ScheduledRow[];
      setSched(schedData);

      const apiIds = schedData
        .map((x) => x.api_post_id)
        .filter((x): x is string => !!x);

      if (apiIds.length) {
        const { data: a, error: e3 } = await supabase
          .from("analytics_events")
          .select("object_id,metric,value")
          .in("object_id", apiIds);

        if (e3) throw e3;

        setAnalytics((a || []) as AnalyticsRow[]);
      } else {
        setAnalytics([]);
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", e?.message ?? "Failed to load posts.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reload whenever the screen comes into focus (so new drafts show up)
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Groupings
  const schedByPost = useMemo(() => {
    const map = new Map<string, ScheduledRow[]>();
    for (const s of sched) {
      if (!s.post_id) continue;
      if (!map.has(s.post_id)) map.set(s.post_id, []);
      map.get(s.post_id)!.push(s);
    }
    return map;
  }, [sched]);

  const analyticsByApi = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const a of analytics) {
      if (!a.object_id) continue;
      if (!map.has(a.object_id)) map.set(a.object_id, {});
      const bucket = map.get(a.object_id)!;

      // Use the highest snapshot value for each metric per object_id
      const val = Number(a.value) || 0;
      bucket[a.metric] = Math.max(bucket[a.metric] || 0, val);
    }
    return map;
  }, [analytics]);

  // Filter predicate – considers ALL platforms (FB + IG)
  const filteredPosts = useMemo(() => {
    return posts.filter((p) => {
      const srows = schedByPost.get(p.id) || [];

      // If no schedules at all, treat as draft-only visibility controlled by status filter
      if (srows.length === 0) {
        return activeStatuses.includes("draft");
      }

      // Include post if ANY schedule (any platform) matches the selected statuses
      return srows.some((s) => activeStatuses.includes(s.status));
    });
  }, [posts, schedByPost, activeStatuses]);

  function summarizePostAnalytics(postId: string) {
    // Use ALL platforms for analytics
    const srows = schedByPost.get(postId) || [];
    const apiIds = srows
      .map((x) => x.api_post_id)
      .filter((x): x is string => !!x);

    let engagement = 0,
      impressions = 0,
      likes = 0,
      comments = 0,
      shares = 0,
      saves = 0,
      videoViews = 0;

    for (const id of apiIds) {
      const b = analyticsByApi.get(id) || {};
      engagement += b["engagement"] || 0;
      impressions += b["impressions"] || 0;
      likes += b["likes"] || 0;
      comments += b["comments"] || 0;
      shares += b["shares"] || 0;
      saves += b["saves"] || 0;
      videoViews += b["video_views"] || 0;
    }
    return { engagement, impressions, likes, comments, shares, saves, videoViews };
  }

  function summarizeStatuses(postId: string) {
    // Use ALL platforms for statuses
    const srows = schedByPost.get(postId) || [];
    const counts: Record<PostStatusEnum, number> = {
      draft: 0,
      scheduled: 0,
      posting: 0,
      posted: 0,
      failed: 0,
      canceled: 0,
    };
    const platforms = new Set<PlatformEnum>();

    for (const s of srows) {
      counts[s.status] = (counts[s.status] || 0) + 1;
      platforms.add(s.platform);
    }
    return { counts, platforms: Array.from(platforms) };
  }

  function toggleStatus(s: PostStatusEnum) {
    setActiveStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { alignItems: "center", justifyContent: "center" },
        ]}
      >
        <ActivityIndicator />
        <Text style={{ color: MUTED, marginTop: 8 }}>Loading posts…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with filter toggle */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>Posts</Text>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilters((prev) => !prev)}
          activeOpacity={0.8}
        >
          <FontAwesome
            name="filter"
            size={12}
            color={showFilters ? "#fff" : TINT}
          />
          <Text
            style={[
              styles.filterButtonText,
              showFilters && { color: "#fff" },
            ]}
          >
            Filters
          </Text>
        </TouchableOpacity>
      </View>

      {/* Status filters – only shown when toggled */}
      {showFilters && (
        <View style={styles.filterCard}>
          <View style={styles.filterHeaderRowInner}>
            <Text style={styles.filterLabel}>Status</Text>
            <TouchableOpacity
              onPress={() => setActiveStatuses([...ALL_STATUS])}
              activeOpacity={0.8}
            >
              <Text style={styles.resetText}>Reset</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.chipsRow}>
            {ALL_STATUS.map((s) => {
              const active = activeStatuses.includes(s);
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => toggleStatus(s)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {s}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {filteredPosts.length === 0 ? (
        <Text style={{ color: MUTED, marginTop: 8 }}>
          No posts matching filters.
        </Text>
      ) : (
        <FlatList
          data={filteredPosts}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingBottom: 32 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => {
            const created = new Date(item.created_at).toLocaleString([], {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            const { counts, platforms } = summarizeStatuses(item.id);
            const a = summarizePostAnalytics(item.id);

            return (
              <TouchableOpacity
                onPress={() => router.push(`/post/${item.id}`)}
                activeOpacity={0.85}
                style={styles.card}
              >
                <View style={styles.row}>
                  <Text numberOfLines={2} style={styles.caption}>
                    {item.caption || "(no caption)"}
                  </Text>
                  <Text style={styles.created}>{created}</Text>
                </View>

                <View style={styles.badgesRow}>
                  {platforms.includes("instagram") && (
                    <View style={styles.badge}>
                      <FontAwesome name="instagram" size={12} color="#C13584" />
                      <Text style={styles.badgeText}>IG</Text>
                    </View>
                  )}
                  {platforms.includes("facebook") && (
                    <View style={styles.badge}>
                      <FontAwesome
                        name="facebook-square"
                        size={12}
                        color="#1877F2"
                      />
                      <Text style={styles.badgeText}>FB</Text>
                    </View>
                  )}
                  <View style={styles.badgeMuted}>
                    <Text style={styles.badgeMutedText}>
                      {item.post_type.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.statusRow}>
                  {(
                    [
                      ["scheduled", counts.scheduled],
                      ["posting", counts.posting],
                      ["posted", counts.posted],
                      ["failed", counts.failed],
                      ["canceled", counts.canceled],
                    ] as Array<[string, number]>
                  )
                    .filter(([, n]) => n > 0)
                    .map(([label, n]) => (
                      <View key={label} style={styles.stateChip}>
                        <Text style={styles.stateChipText}>
                          {label} • {n}
                        </Text>
                      </View>
                    ))}
                </View>

                <View style={styles.analyticsRow}>
                  <View style={styles.metric}>
                    <Text style={styles.mTitle}>Engagement</Text>
                    <Text style={styles.mValue}>
                      {Math.round(a.engagement)}
                    </Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.mTitle}>Impressions</Text>
                    <Text style={styles.mValue}>
                      {Math.round(a.impressions)}
                    </Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.mTitle}>Likes</Text>
                    <Text style={styles.mValue}>{Math.round(a.likes)}</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.mTitle}>Comments</Text>
                    <Text style={styles.mValue}>
                      {Math.round(a.comments)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, paddingHorizontal: 16, paddingTop: 100 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: { fontSize: 22, fontWeight: "800", color: TEXT },

  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TINT,
    backgroundColor: "#fff",
  },
  filterButtonText: {
    color: TINT,
    fontWeight: "700",
    fontSize: 12,
  },

  filterCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    marginBottom: 10,
  },
  filterHeaderRowInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  filterLabel: { color: TEXT, fontWeight: "800", fontSize: 13 },
  resetText: { color: MUTED, fontSize: 11 },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F8FAFC",
  },
  chipActive: { backgroundColor: TINT, borderColor: TINT },
  chipText: { color: TEXT, fontWeight: "800", fontSize: 12 },
  chipTextActive: { color: "#fff" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
  },
  row: { flexDirection: "row", alignItems: "flex-start" },
  caption: { flex: 1, color: TEXT, fontWeight: "700", fontSize: 14 },
  created: { marginLeft: 10, color: MUTED, fontSize: 12 },

  badgesRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  badge: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F8FAFC",
  },
  badgeText: { color: TEXT, fontWeight: "800", fontSize: 11 },
  badgeMuted: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F3F4F6",
  },
  badgeMutedText: { color: TEXT, fontWeight: "800", fontSize: 11 },

  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  stateChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#111827",
  },
  stateChipText: { color: "#fff", fontWeight: "800", fontSize: 11 },

  analyticsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 10,
  },
  metric: { minWidth: 80 },
  mTitle: { color: MUTED, fontSize: 11 },
  mValue: { color: TEXT, fontWeight: "800", fontSize: 14, marginTop: 2 },
});
