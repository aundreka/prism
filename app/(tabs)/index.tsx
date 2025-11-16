// app/(tabs)/index.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { supabase } from "@/lib/supabase";

type PlatformEnum = "facebook" | "instagram";
type PostStatusEnum = "draft" | "scheduled" | "posting" | "posted" | "failed" | "canceled";

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

type PostStat = {
  post: PostRow;
  impressions: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  videoViews: number;
  latestAt: Date | null;
  platforms: Set<PlatformEnum>;
};

// ---- Time + Segment recommendation type ----
type TimeRecommendation = {
  platform: PlatformEnum;
  timeslot: string;        // ISO timestamptz from DB
  dow: number;             // 0-6
  hour: number;            // 0-23
  predicted_avg: number | null;
  segment_id: number | null;
  segment_name: string | null;
};

const BG = "#F8FAFC";
const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [sched, setSched] = useState<SchedRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);

  // NEW: recommendations
  const [timeRecs, setTimeRecs] = useState<TimeRecommendation[]>([]);
  const [recError, setRecError] = useState<string | null>(null);

  // ---------- DATA LOADER ----------
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

        // 1) Posts
        const { data: p, error: ep } = await supabase
          .from("posts")
          .select("id,user_id,caption,post_type,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(300);
        if (ep) throw ep;
        const postsData = (p || []) as PostRow[];
        setPosts(postsData);

        if (!postsData.length) {
          setSched([]);
          setAnalytics([]);
          setTimeRecs([]);
          return;
        }

        // 2) Schedules for those posts
        const postIds = postsData.map((x) => x.id);
        const { data: s, error: es } = await supabase
          .from("scheduled_posts")
          .select("id,post_id,status,platform,api_post_id,scheduled_at,posted_at")
          .in("post_id", postIds)
          .order("scheduled_at", { ascending: false });
        if (es) throw es;
        const schedData = (s || []) as SchedRow[];
        setSched(schedData);

        // 3) Analytics for all api_post_id
        const apiIds = schedData.map((x) => x.api_post_id).filter((x): x is string => !!x);
        if (apiIds.length) {
          const { data: a, error: ea } = await supabase
            .from("analytics_events")
            .select("object_id,metric,value")
            .in("object_id", apiIds);
          if (ea) throw ea;
          setAnalytics((a || []) as AnalyticsRow[]);
        } else {
          setAnalytics([]);
        }

        // 4) Time + Segment recommendations (NEW)
        setRecError(null);
        const { data: recs, error: er } = await supabase.rpc(
          "get_time_segment_recommendations",
          {
          }
        );

        if (er) {
          console.log("get_time_segment_recommendations error:", er);
          setRecError(er.message ?? "Could not load recommendations.");
          setTimeRecs([]);
        } else {
          setTimeRecs((recs || []) as TimeRecommendation[]);
        }
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

  // ---------- First load: call insights_pull automatically ----------
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

      // Then load dashboard data from DB (+ recommendations)
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

  // ---------- Pull-to-refresh ----------
  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);

      const { data, error } = await supabase.functions.invoke("insights_pull", {
        body: {},
      });

      if (error) {
        console.log("insights_pull error:", error);
        Alert.alert("Analytics refresh failed", error.message ?? "Could not refresh insights.");
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

  // ---------- Helpers ----------
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const dayLabel = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short" });
  const formatNumber = (n: number) =>
    n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
  const barWidthPct = (val: number, max: number) =>
    `${Math.max(6, Math.min(100, (val / (max || 1)) * 100))}%`;

  const formatTimeSlot = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const segmentLabel = (segmentName: string | null, segmentId: number | null) => {
    if (segmentName) return segmentName;
    if (segmentId != null) return `Segment ${segmentId}`;
    return "All followers";
  };

  // Week (Mon–Sun) for calendar
  const week = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, []);

  // Analytics mapping: api_post_id -> metric map
  const analyticsByApi = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const a of analytics) {
      if (!a.object_id) continue;
      if (!map.has(a.object_id)) map.set(a.object_id, {});
      const bucket = map.get(a.object_id)!;
      bucket[a.metric] = (bucket[a.metric] || 0) + (Number(a.value) || 0);
    }
    return map;
  }, [analytics]);

  // Build per-post stats
  const postStats: PostStat[] = useMemo(() => {
    const stats: PostStat[] = [];

    for (const post of posts) {
      const srows = sched.filter((s) => s.post_id === post.id);

      let impressions = 0;
      let likes = 0;
      let comments = 0;
      let shares = 0;
      let saves = 0;
      let clicks = 0;
      let videoViews = 0;
      let latestAt: Date | null = null;
      const platforms = new Set<PlatformEnum>();

      for (const s of srows) {
        const scheduleTs = s.posted_at || s.scheduled_at;
        if (scheduleTs) {
          const dt = new Date(scheduleTs);
          if (!latestAt || dt > latestAt) latestAt = dt;
        }
        platforms.add(s.platform);

        if (!s.api_post_id) continue;
        const bucket = analyticsByApi.get(s.api_post_id);
        if (!bucket) continue;

        const imp = bucket["impressions"] || 0;
        const like = bucket["likes"] || 0;
        const comm = bucket["comments"] || 0;
        const sh = bucket["shares"] || 0;
        const sv = bucket["saves"] || 0;
        const clk = bucket["clicks"] || 0;
        const vv = bucket["video_views"] || 0;

        impressions += imp;
        likes += like;
        comments += comm;
        shares += sh;
        saves += sv;
        clicks += clk;
        videoViews += vv;
      }

      const engagement = likes + comments + shares + saves + clicks;

      stats.push({
        post,
        impressions,
        engagement,
        likes,
        comments,
        shares,
        saves,
        clicks,
        videoViews,
        latestAt,
        platforms,
      });
    }

    return stats;
  }, [posts, sched, analyticsByApi]);

  // Time windows
  const dayMs = 24 * 60 * 60 * 1000;
  const start7 = useMemo(() => new Date(Date.now() - 6 * dayMs), []);
  const start30 = useMemo(() => new Date(Date.now() - 29 * dayMs), []);

  const statsLast7 = useMemo(
    () => postStats.filter((s) => s.latestAt && s.latestAt >= start7),
    [postStats, start7]
  );
  const statsLast30 = useMemo(
    () => postStats.filter((s) => s.latestAt && s.latestAt >= start30),
    [postStats, start30]
  );

  const postsLast7Count = useMemo(() => {
    const cutoff = start7;
    const ids = new Set<string>();

    for (const s of sched) {
      // only care about posts that are posted / scheduled / posting
      if (!["posted", "scheduled", "posting"].includes(s.status)) continue;
      if (!s.post_id) continue;

      const tsStr = s.posted_at || s.scheduled_at;
      if (!tsStr) continue;

      const ts = new Date(tsStr);
      if (ts >= cutoff) {
        ids.add(s.post_id);
      }
    }

    return ids.size;
  }, [sched, start7]);

  // ----- KPIs -----
  const kpis = useMemo(() => {
    const totalPosts = posts.length;
    const postsThisWeek = postsLast7Count;

    let totalImpressions30 = 0;
    let sumEngRate30 = 0;
    let countEngRate30 = 0;

    for (const s of statsLast30) {
      totalImpressions30 += s.impressions;
      if (s.impressions > 0) {
        sumEngRate30 += s.engagement / s.impressions;
        countEngRate30 += 1;
      }
    }

    const avgEngagementRate30 = countEngRate30 ? (sumEngRate30 / countEngRate30) * 100 : 0;

    return [
      {
        label: "Total Posts",
        value: String(totalPosts),
        hint: "All-time",
      },
      {
        label: "Posts (Last 7 days)",
        value: String(postsThisWeek),
        hint: "Published or scheduled",
      },
      {
        label: "Total Impressions (30d)",
        value: formatNumber(totalImpressions30),
        hint: "Across IG + FB",
      },
      {
        label: "Avg Engagement Rate (30d)",
        value: `${avgEngagementRate30.toFixed(1)}%`,
        hint: "Posts with impressions",
      },
    ];
  }, [posts, statsLast30, postsLast7Count]);

  // ----- Week calendar -----
  const scheduledByDate = useMemo(() => {
    const map = new Map<string, PlatformEnum[]>();
    for (const s of sched) {
      const ts = s.posted_at || s.scheduled_at;
      if (!ts) continue;
      const key = ts.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s.platform);
    }
    return map;
  }, [sched]);

  // ----- Platform analytics (last 30 days) -----
  const platformCards = useMemo(() => {
    const platforms: PlatformEnum[] = ["instagram", "facebook"];
    return platforms.map((platform) => {
      const subset = statsLast30.filter((s) => s.platforms.has(platform));
      let impressions = 0;
      let engagement = 0;
      let postsCount = 0;
      let sumEngRate = 0;
      let countEngRate = 0;

      for (const s of subset) {
        impressions += s.impressions;
        engagement += s.engagement;
        postsCount += 1;
        if (s.impressions > 0) {
          sumEngRate += s.engagement / s.impressions;
          countEngRate += 1;
        }
      }

      const avgEngRate = countEngRate ? (sumEngRate / countEngRate) * 100 : 0;

      const color = platform === "instagram" ? "#E1306C" : "#1877F2";
      const name = platform === "instagram" ? "Instagram" : "Facebook";

      return {
        platform,
        name,
        color,
        impressions,
        engagement,
        postsCount,
        avgEngRate,
      };
    });
  }, [statsLast30]);

  // ----- Top posts (last 30 days) -----
  const topPosts = useMemo(() => {
    const candidates = statsLast30.filter((s) => s.engagement > 0 || s.impressions > 0);
    if (!candidates.length) return [];
    const sorted = [...candidates].sort((a, b) => b.engagement - a.engagement).slice(0, 5);
    const maxEng = sorted[0]?.engagement || 1;

    return sorted.map((s) => ({
      id: s.post.id,
      label: `${
        s.platforms.size
          ? Array.from(s.platforms)
              .map((p) => (p === "instagram" ? "IG" : "FB"))
              .join("/")
          : "Post"
      } • ${
        s.post.caption
          ? s.post.caption.length > 24
            ? s.post.caption.slice(0, 24) + "…"
            : s.post.caption
          : "(no caption)"
      }`,
      engagement: s.engagement,
      impressions: s.impressions,
      engRate: s.impressions > 0 ? (s.engagement / s.impressions) * 100 : 0,
      maxEng,
    }));
  }, [statsLast30]);

  // ----- Recent posts -----
  const recentPosts = useMemo(() => {
    const sortedPosts = [...posts].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const subset = sortedPosts.slice(0, 5);

    return subset.map((post) => {
      const stat = postStats.find((s) => s.post.id === post.id);
      const srows = sched.filter((s) => s.post_id === post.id);

      let status: "Published" | "Scheduled" | "Draft" = "Draft";
      if (srows.some((s) => s.status === "posted")) status = "Published";
      else if (srows.some((s) => s.status === "scheduled" || s.status === "posting")) status = "Scheduled";

      let date: Date = new Date(post.created_at);
      const posted = srows
        .filter((s) => s.posted_at)
        .map((s) => new Date(s.posted_at!))
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const scheduled = srows
        .filter((s) => s.scheduled_at)
        .map((s) => new Date(s.scheduled_at!))
        .sort((a, b) => b.getTime() - a.getTime())[0];
      if (posted) date = posted;
      else if (scheduled) date = scheduled;

      const platforms = stat ? Array.from(stat.platforms) : [];
      const impressions = stat?.impressions || 0;
      const engRate = stat && stat.impressions > 0 ? (stat.engagement / stat.impressions) * 100 : 0;

      return {
        id: post.id,
        caption: post.caption || "(no caption)",
        status,
        date,
        platforms,
        impressions,
        engRate,
      };
    });
  }, [posts, postStats, sched]);

  // ---------- RENDER ----------
  if (loading) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator />
        <Text style={{ color: MUTED, marginTop: 8 }}>Loading dashboard…</Text>
      </View>
    );
  }

  const topTimeRecs = timeRecs.slice(0, 5);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 80, paddingTop: 110 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
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

      {/* Week Calendar */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>This Week</Text>
          <Text style={styles.cardHint}>
            {fmt(week[0])} – {fmt(week[6])}
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
          {week.map((d) => {
            const key = d.toISOString().slice(0, 10);
            const isToday = key === todayKey;
            const scheduled = scheduledByDate.get(key) || [];
            return (
              <View
                key={key}
                style={[
                  styles.dayCell,
                  isToday && styles.dayToday,
                  { marginRight: 10, width: 70 },
                ]}
              >
                <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>{dayLabel(d)}</Text>
                <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>{d.getDate()}</Text>
                <View style={styles.dotRow}>
                  {scheduled.slice(0, 3).map((_, i) => (
                    <View key={i} style={styles.dot} />
                  ))}
                  {scheduled.length > 3 && (
                    <Text style={styles.plusMore}>+{scheduled.length - 3}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* KPIs */}
      <View style={styles.kpiRow}>
        {kpis.map((k) => (
          <View key={k.label} style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{k.value}</Text>
            <Text style={styles.kpiLabel}>{k.label}</Text>
            <Text style={styles.kpiHint}>{k.hint}</Text>
          </View>
        ))}
      </View>

      {/* Smart Recommendations (Time + Segment) */}
      <Text style={styles.sectionTitle}>Smart Recommendations</Text>
      <View style={styles.card}>
        {recError ? (
          <Text style={{ color: "#B91C1C", fontSize: 12 }}>{recError}</Text>
        ) : topTimeRecs.length === 0 ? (
          <Text style={{ color: MUTED, fontSize: 12 }}>
            Not enough engagement data yet. Once your posts start getting activity, we’ll recommend the
            best upcoming times and audience segments.
          </Text>
        ) : (
          topTimeRecs.map((r, idx) => {
            const isIG = r.platform === "instagram";
            const scorePct =
              r.predicted_avg != null ? `${(r.predicted_avg * 100).toFixed(0)}%` : "N/A";
            return (
              <View key={`${r.platform}-${r.timeslot}-${idx}`} style={{ marginBottom: 10 }}>
                <View style={styles.rowBetween}>
                  <View style={styles.row}>
                    <View
                      style={[
                        styles.statusPill,
                        isIG ? styles.pillIG : styles.pillFB,
                        { marginRight: 6 },
                      ]}
                    >
                      <Text style={styles.pillText}>{isIG ? "IG" : "FB"}</Text>
                    </View>
                    <Text style={styles.perfLabel}>{formatTimeSlot(r.timeslot)}</Text>
                  </View>
                  <Text style={[styles.pmValue, { fontSize: 13 }]}>Score: {scorePct}</Text>
                </View>
                <Text style={styles.postMeta}>
                  Segment: {segmentLabel(r.segment_name, r.segment_id)}
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* Platform Analytics */}
      <Text style={styles.sectionTitle}>Platform Analytics (Last 30 days)</Text>
      {platformCards.map((p) => (
        <View key={p.platform} style={styles.platformCard}>
          <View style={styles.rowBetween}>
            <View style={styles.row}>
              <View style={[styles.badge, { backgroundColor: p.color }]} />
              <Text style={styles.platformName}>{p.name}</Text>
            </View>
            <Text style={styles.platformSub}>
              {p.postsCount} post{p.postsCount === 1 ? "" : "s"}
            </Text>
          </View>
          <View style={styles.platformMetricsRow}>
            <View style={styles.platformMetric}>
              <Text style={styles.pmLabel}>Impressions</Text>
              <Text style={styles.pmValue}>{formatNumber(p.impressions)}</Text>
            </View>
            <View style={styles.platformMetric}>
              <Text style={styles.pmLabel}>Engagement</Text>
              <Text style={styles.pmValue}>{formatNumber(p.engagement)}</Text>
            </View>
            <View style={styles.platformMetric}>
              <Text style={styles.pmLabel}>Avg Eng. Rate</Text>
              <Text style={styles.pmValue}>{p.avgEngRate.toFixed(1)}%</Text>
            </View>
          </View>
        </View>
      ))}

      {/* Top Posts */}
      <Text style={styles.sectionTitle}>Top Posts (Last 30 days)</Text>
      <View style={styles.card}>
        {topPosts.length === 0 ? (
          <Text style={{ color: MUTED, fontSize: 12 }}>
            No analytics yet. Publish some posts to see insights.
          </Text>
        ) : (
          topPosts.map((it, idx) => (
            <View key={it.id} style={{ marginBottom: 10 }}>
              <Text style={styles.perfLabel}>
                {idx + 1}. {it.label}
              </Text>
              <View style={styles.perfTrack}>
                <View style={[styles.perfFill, { width: barWidthPct(it.engagement, it.maxEng) }]} />
              </View>
              <Text style={styles.perfMeta}>
                Engagement: {formatNumber(it.engagement)} • Impressions:{" "}
                {formatNumber(it.impressions)} • Eng. rate: {it.engRate.toFixed(1)}%
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Recent Posts */}
      <Text style={styles.sectionTitle}>Recent Posts</Text>
      {recentPosts.map((p) => (
        <TouchableOpacity key={p.id} style={styles.postCard} activeOpacity={0.85}>
          <View style={styles.rowBetween}>
            <View style={styles.row}>
              {p.platforms.map((pl) => (
                <View
                  key={pl}
                  style={[
                    styles.statusPill,
                    pl === "instagram" ? styles.pillIG : styles.pillFB,
                    { marginRight: 6 },
                  ]}
                >
                  <Text style={styles.pillText}>{pl === "instagram" ? "IG" : "FB"}</Text>
                </View>
              ))}
            </View>
            <View
              style={[
                styles.statusPill,
                p.status === "Published"
                  ? styles.pillPublished
                  : p.status === "Scheduled"
                  ? styles.pillScheduled
                  : styles.pillDraft,
              ]}
            >
              <Text style={styles.pillText}>{p.status}</Text>
            </View>
          </View>
          <Text style={styles.postCaption}>{p.caption}</Text>
          <Text style={styles.postDate}>{p.date.toLocaleDateString()}</Text>
          {p.impressions > 0 && (
            <Text style={styles.postMeta}>
              Impressions: {formatNumber(p.impressions)} • Eng. rate: {p.engRate.toFixed(1)}%
            </Text>
          )}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { paddingHorizontal: 16, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "700", color: TEXT },
  subtitle: { color: MUTED, fontSize: 13 },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: TEXT },
  cardHint: { color: MUTED, fontSize: 12 },

  dayCell: {
    alignItems: "center",
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F9FAFB",
  },
  dayToday: { backgroundColor: "#E0F2FE", borderColor: "#38BDF8" },
  dayLabel: { fontSize: 11, color: MUTED },
  dayLabelToday: { color: "#0369A1" },
  dayNumber: { fontSize: 18, fontWeight: "700", color: TEXT },
  dayNumberToday: { color: "#0284C7" },
  dotRow: { flexDirection: "row", gap: 4, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 6, backgroundColor: "#38BDF8" },
  plusMore: { fontSize: 10, color: "#0369A1" },

  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginHorizontal: 16, marginBottom: 8 },
  kpiCard: {
    width: "47.5%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  kpiValue: { fontSize: 18, fontWeight: "800", color: TEXT },
  kpiLabel: { color: MUTED, fontSize: 12, marginTop: 2 },
  kpiHint: { color: "#9CA3AF", fontSize: 11, marginTop: 2 },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT,
    marginHorizontal: 16,
    marginVertical: 8,
  },

  platformCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  badge: { width: 10, height: 10, borderRadius: 10 },
  platformName: { fontSize: 15, fontWeight: "700", color: TEXT },
  platformSub: { color: MUTED, fontSize: 12 },
  platformMetricsRow: { flexDirection: "row", marginTop: 8, justifyContent: "space-between" },
  platformMetric: { flex: 1 },
  pmLabel: { color: MUTED, fontSize: 11 },
  pmValue: { color: TEXT, fontSize: 15, fontWeight: "700", marginTop: 2 },

  perfLabel: { fontSize: 13, color: TEXT, marginBottom: 4 },
  perfTrack: { height: 8, backgroundColor: "#E5E7EB", borderRadius: 8 },
  perfFill: { height: 8, backgroundColor: "#38BDF8", borderRadius: 8 },
  perfMeta: { color: MUTED, fontSize: 11, marginTop: 2 },

  postCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  postCaption: { marginTop: 4, color: "#374151", fontSize: 13 },
  postDate: { marginTop: 4, color: MUTED, fontSize: 12 },
  postMeta: { marginTop: 4, color: MUTED, fontSize: 11 },

  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  pillText: { fontSize: 11, fontWeight: "700" },
  pillPublished: { backgroundColor: "#DCFCE7", borderColor: "#16A34A" },
  pillScheduled: { backgroundColor: "#DBEAFE", borderColor: "#2563EB" },
  pillDraft: { backgroundColor: "#F3F4F6", borderColor: "#D1D5DB" },
  pillIG: { backgroundColor: "#FDF2F8", borderColor: "#E1306C" },
  pillFB: { backgroundColor: "#EFF6FF", borderColor: "#1877F2" },
});
