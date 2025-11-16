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
  Platform,
} from "react-native";
import { supabase } from "@/lib/supabase";
import { router } from "expo-router";

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

// NEW: external_posts (manual + API posts pulled from FB)
type ExternalPostRow = {
  object_id: string;
  caption: string | null;
  content_type: string | null;
  created_at: string;
};

// NEW: combined stat type (app + manual)
type CombinedPostStat = {
  objectId: string;
  caption: string;
  source: "app" | "manual";
  createdAt: Date;
  impressions: number;
  engagement: number;
};

type DailyEngRow = {
  day: string;
  engagement: number;
};

type TimeRecommendation = {
  platform: PlatformEnum;
  timeslot: string;
  dow: number;
  hour: number;
  predicted_avg: number | null;
  segment_id: number | null;
  segment_name: string | null;
};

const BG = "#F8FAFC";
const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";

const graphBarHeight = (value: number, max: number) => {
  if (!max || max <= 0) return 8;
  const ratio = value / max;
  return 8 + Math.round(ratio * 52);
};

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [sched, setSched] = useState<SchedRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);
  const [externalPosts, setExternalPosts] = useState<ExternalPostRow[]>([]);

  const [dailyEng, setDailyEng] = useState<DailyEngRow[]>([]);
  const [timeRecs, setTimeRecs] = useState<TimeRecommendation[]>([]);
  const [recError, setRecError] = useState<string | null>(null);
  const [showMath, setShowMath] = useState(false);
  

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

        // 🔹 Call backfill_fb_insights every time we load the dashboard
        // This fetches historical manual posts + insights and upserts into analytics_events + external_posts.
        try {
          const { data: fbData, error: fbError } =
            await supabase.functions.invoke("backfill_fb_insights", {
              body: {
                userId: user.id,
              },
            });

          if (fbError) {
            console.log("backfill_fb_insights error:", fbError);
          } else {
            console.log("backfill_fb_insights OK:", fbData);
          }
        } catch (err) {
          console.log("backfill_fb_insights invoke failed:", err);
          // non-fatal; we still load whatever data is already in DB
        }
        try {
          const { data: publishData, error: publishError } =
            await supabase.functions.invoke("meta_publish_worker", {
              body: {
                userId: user.id,
              },
            });

          if (publishError) {
            console.log("meta_publish_worker error:", publishError);
          } else {
            console.log("meta_publish_worker OK:", publishData);
          }
        } catch (err) {
          console.log("meta_publish_worker invoke failed:", err);
          // non-fatal; we still load whatever data is already in DB
        }



        // 1) App-created posts
        const { data: p, error: ep } = await supabase
          .from("posts")
          .select("id,user_id,caption,post_type,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(300);
        if (ep) throw ep;
        const postsData = (p || []) as PostRow[];
        setPosts(postsData);

        // 2) Schedules (FB only) for app posts
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

        // 3) External posts (manual + API posts from FB)
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

        // 4) Analytics for all relevant object_ids (app + manual)
        const objectIdsSet = new Set<string>();

        // app posts → scheduled_posts.api_post_id
        for (const s of schedData) {
          if (s.api_post_id) objectIdsSet.add(s.api_post_id);
        }

        // manual + app posts from FB → external_posts.object_id
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

        // 5) Daily engagement (from v_user_recent_engagement)
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

        // 6) Time + Segment recommendations (FB only)
        setRecError(null);
        const { data: recs, error: er } = await supabase.rpc(
          "get_time_segment_recommendations",
          {
            p_platform: "facebook",
          }
        );

        if (er) {
          console.log("get_time_segment_recommendations error:", er);
          setRecError(er.message ?? "Could not load recommendations.");
          setTimeRecs([]);
        } else {
          const fbRecs = ((recs || []) as TimeRecommendation[]).filter(
            (r) => r.platform === "facebook"
          );
          setTimeRecs(fbRecs);
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

  // ---------- First load: still calling insights_pull (your existing function) ----------
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

  // ---------- Pull-to-refresh ----------
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

  // ---------- Helpers ----------
  const formatNumber = (n: number) =>
    n >= 1000000
      ? `${(n / 1000000).toFixed(1)}M`
      : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : `${n}`;

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

  const formatHourLabel = (hour: number) => {
    const h = Math.max(0, Math.min(23, hour));
    const ampm = h >= 12 ? "PM" : "AM";
    const hour12 = ((h + 11) % 12) + 1; // 0→12, 13→1, etc.
    return `${hour12}${ampm}`;
  };

  // Analytics mapping: object_id -> metric map (using MAX per metric)
  const analyticsByObject = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const a of analytics) {
      if (!a.object_id) continue;
      if (!map.has(a.object_id)) map.set(a.object_id, {});
      const bucket = map.get(a.object_id)!;
      const val = Number(a.value) || 0;
      bucket[a.metric] = Math.max(bucket[a.metric] || 0, val);
    }
    return map;
  }, [analytics]);

  // Build per-post stats (app-created posts only, for Recent Posts)
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
      let engagement = 0;
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
        const bucket = analyticsByObject.get(s.api_post_id);
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

        // Engagement = likes + comments + shares
        engagement += like + comm + sh;
      }

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
  }, [posts, sched, analyticsByObject]);

  // ----- Combined meta: app + manual posts, keyed by FB object_id -----
  const combinedMetaByObject = useMemo(() => {
    const map = new Map<
      string,
      { caption: string; createdAt: Date; source: "app" | "manual" }
    >();

    // 1) Manual + API posts from external_posts
    for (const ex of externalPosts) {
      const objectId = ex.object_id;
      if (!objectId) continue;
      const caption = ex.caption || "(no caption)";
      const createdAt = new Date(ex.created_at);

      const existing = map.get(objectId);
      if (!existing || createdAt > existing.createdAt) {
        map.set(objectId, {
          caption,
          createdAt,
          source: existing?.source === "app" ? "app" : "manual",
        });
      }
    }

    // 2) App-created posts via scheduled_posts.api_post_id
    for (const s of sched) {
      if (!s.api_post_id) continue;
      const objectId = s.api_post_id;
      const post = posts.find((p) => p.id === s.post_id);

      const caption = post?.caption || "(no caption)";
      let createdAt: Date;
      if (s.posted_at) createdAt = new Date(s.posted_at);
      else if (s.scheduled_at) createdAt = new Date(s.scheduled_at);
      else if (post?.created_at) createdAt = new Date(post.created_at);
      else createdAt = new Date();

      const existing = map.get(objectId);
      if (!existing) {
        map.set(objectId, { caption, createdAt, source: "app" });
      } else {
        // Prefer app as source, and the latest createdAt
        const newerDate =
          createdAt > existing.createdAt ? createdAt : existing.createdAt;
        const source: "app" | "manual" =
          existing.source === "app" ? "app" : "app"; // once app, always app
        map.set(objectId, {
          caption,
          createdAt: newerDate,
          source,
        });
      }
    }

    return map;
  }, [externalPosts, sched, posts]);

  const dayMs = 24 * 60 * 60 * 1000;

  // Posts with analytics in the last 30 calendar days (app + manual)
  const combinedStatsLast30 = useMemo<CombinedPostStat[]>(() => {
    const now = new Date();
    const start30 = new Date(now.getTime() - 29 * dayMs);

    const results: CombinedPostStat[] = [];

    for (const [objectId, meta] of combinedMetaByObject.entries()) {
      if (meta.createdAt < start30) continue;
      const bucket = analyticsByObject.get(objectId);
      if (!bucket) continue;

      const impressions = bucket["impressions"] || 0;
      const likes = bucket["likes"] || 0;
      const comments = bucket["comments"] || 0;
      const shares = bucket["shares"] || 0;
      const engagement = likes + comments + shares;

      if (impressions === 0 && engagement === 0) continue;

      results.push({
        objectId,
        caption: meta.caption,
        source: meta.source,
        createdAt: meta.createdAt,
        impressions,
        engagement,
      });
    }

    return results;
  }, [combinedMetaByObject, analyticsByObject, dayMs]);

  // Total posts with any analytics (all-time, app + manual)
  const totalPostsWithAnalytics = useMemo(() => {
    let count = 0;
    for (const [objectId] of combinedMetaByObject.entries()) {
      if (analyticsByObject.has(objectId)) count++;
    }
    return count;
  }, [combinedMetaByObject, analyticsByObject]);

  // Posts with analytics in the last 7 days (app + manual)
  const postsLast7Count = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 6 * dayMs);

    let count = 0;
    for (const [objectId, meta] of combinedMetaByObject.entries()) {
      if (!analyticsByObject.has(objectId)) continue;
      if (meta.createdAt >= cutoff) count++;
    }
    return count;
  }, [combinedMetaByObject, analyticsByObject, dayMs]);

  // ----- KPIs (now use combinedStatsLast30 + all analytics posts) -----
  const kpis = useMemo(() => {
    const totalPosts = totalPostsWithAnalytics;
    const postsThisWeek = postsLast7Count;

    let totalImpressions30 = 0;
    let sumEngRate30 = 0;
    let countEngRate30 = 0;

    for (const s of combinedStatsLast30) {
      totalImpressions30 += s.impressions;
      if (s.impressions > 0) {
        sumEngRate30 += s.engagement / s.impressions;
        countEngRate30 += 1;
      }
    }

    const avgEngagementRate30 = countEngRate30
      ? (sumEngRate30 / countEngRate30) * 100
      : 0;

    return [
      {
        label: "Total Posts with Analytics",
        value: String(totalPosts),
        hint: "All-time (FB, app + manual)",
      },
      {
        label: "Posts (Last 7 days)",
        value: String(postsThisWeek),
        hint: "With analytics, last 7 days",
      },
      {
        label: "Total Impressions (30d)",
        value: formatNumber(totalImpressions30),
        hint: "FB posts with analytics",
      },
      {
        label: "Avg Engagement Rate (30d)",
        value: `${avgEngagementRate30.toFixed(1)}%`,
        hint: "Posts with impressions",
      },
    ];
  }, [combinedStatsLast30, postsLast7Count, totalPostsWithAnalytics]);

  // ----- Recent posts (app-created only, as before) -----
  const recentPosts = useMemo(() => {
    const sortedPosts = [...posts].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const subset = sortedPosts.slice(0, 5);

    return subset.map((post) => {
      const stat = postStats.find((s) => s.post.id === post.id);
      const srows = sched.filter((s) => s.post_id === post.id);

      let status: "Published" | "Scheduled" | "Draft" = "Draft";
      if (srows.some((s) => s.status === "posted")) status = "Published";
      else if (
        srows.some((s) => s.status === "scheduled" || s.status === "posting")
      )
        status = "Scheduled";

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
      const engRate =
        stat && stat.impressions > 0
          ? (stat.engagement / stat.impressions) * 100
          : 0;

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

  // ----- Engagement trend (Last 7 days) from SQL view -----
  const engagementTrend = useMemo(() => {
    if (!dailyEng.length) {
      return { series: [] as { key: string; label: string; value: number }[], maxVal: 0 };
    }

    let maxVal = 0;
    const series = dailyEng.map((row) => {
      const d = new Date(row.day);
      const value = Number(row.engagement) || 0;
      if (value > maxVal) maxVal = value;

      return {
        key: row.day,
        label: d.toLocaleDateString(undefined, {
          weekday: "short",
        }),
        value,
      };
    });

    return { series, maxVal };
  }, [dailyEng]);

  const hasTrendData = engagementTrend.series.some((d) => d.value > 0);

  // ----- Recommendation calendar (next 7 days) -----
  const recCalendar = useMemo(() => {
    if (!timeRecs.length) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rawMap = new Map<
      string,
      { date: Date; slots: { hour: number; score: number | null }[] }
    >();

    for (const r of timeRecs) {
      const d = new Date(r.timeslot);
      const localDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const key = localDate.toISOString().slice(0, 10);
      if (!rawMap.has(key)) {
        rawMap.set(key, { date: localDate, slots: [] });
      }
      rawMap.get(key)!.slots.push({
        hour: d.getHours(),
        score: r.predicted_avg,
      });
    }

    const days: {
      key: string;
      date: Date;
      slots: { hour: number; score: number | null }[];
    }[] = [];

    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(today);
      dayDate.setDate(today.getDate() + i);
      const key = dayDate.toISOString().slice(0, 10);
      const entry = rawMap.get(key) || { date: dayDate, slots: [] };

      const sortedSlots = [...entry.slots]
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 3);

      days.push({
        key,
        date: dayDate,
        slots: sortedSlots,
      });
    }

    return days;
  }, [timeRecs]);

  const topTimeRecs = timeRecs.slice(0, 5);

  // ---------- RENDER ----------
  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { alignItems: "center", justifyContent: "center" },
        ]}
      >
        <ActivityIndicator />
        <Text style={{ color: MUTED, marginTop: 8 }}>Loading dashboard…</Text>
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

      {/* Smart Recommendations — When to Post */}
      <Text style={styles.sectionTitle}>Smart Recommendations</Text>
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>Best time to post (next 7 days)</Text>
          <TouchableOpacity
            onPress={() => router.push("/calendar")}
            activeOpacity={0.8}
          >
            <Text style={styles.linkText}>Open calendar ›</Text>
          </TouchableOpacity>
        </View>

        {recError ? (
          <Text style={{ color: "#B91C1C", fontSize: 12, marginTop: 8 }}>
            {recError}
          </Text>
        ) : !timeRecs.length ? (
          <Text style={{ color: MUTED, fontSize: 12, marginTop: 8 }}>
            Not enough engagement data yet. Once your posts start getting
            activity, we’ll recommend the best upcoming times and audience
            segments.
          </Text>
        ) : (
          <>
            {/* Mini calendar view of recommended hours */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 12 }}
            >
              {recCalendar.map((day) => {
                const isToday =
                  day.date.toDateString() === new Date().toDateString();
                return (
                  <TouchableOpacity
                    key={day.key}
                    style={[
                      styles.recDayCell,
                      isToday && styles.recDayToday,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => router.push("/calendar")}
                  >
                    <Text
                      style={[
                        styles.recDayLabel,
                        isToday && styles.recDayLabelToday,
                      ]}
                    >
                      {day.date.toLocaleDateString(undefined, {
                        weekday: "short",
                      })}
                    </Text>
                    <Text
                      style={[
                        styles.recDayNumber,
                        isToday && styles.recDayNumberToday,
                      ]}
                    >
                      {day.date.getDate()}
                    </Text>
                    <View style={{ marginTop: 6 }}>
                      {day.slots.length === 0 ? (
                        <Text style={styles.recDayNoData}>No picks</Text>
                      ) : (
                        day.slots.map((slot, idx) => {
                          const scorePct =
                            slot.score != null
                              ? `${Math.round((slot.score || 0) * 100)}%`
                              : "—";
                          return (
                            <View
                              key={`${slot.hour}-${idx}`}
                              style={styles.recSlotRow}
                            >
                              <Text style={styles.recSlotTime}>
                                {formatHourLabel(slot.hour)}
                              </Text>
                              <Text style={styles.recSlotScore}>{scorePct}</Text>
                            </View>
                          );
                        })
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Top individual slots list (optional quick view) */}
            {topTimeRecs.length > 0 && (
              <View style={{ marginTop: 14 }}>
                {topTimeRecs.map((r, idx) => {
                  const scorePct =
                    r.predicted_avg != null
                      ? `${(r.predicted_avg * 100).toFixed(0)}%`
                      : "N/A";
                  return (
                    <View
                      key={`${r.platform}-${r.timeslot}-${idx}`}
                      style={{ marginBottom: 6 }}
                    >
                      <View style={styles.rowBetween}>
                        <View style={styles.row}>
                          <Text style={styles.perfLabel}>
                            {formatTimeSlot(r.timeslot)}
                          </Text>
                        </View>
                        <Text style={[styles.pmValue, { fontSize: 13 }]}>
                          Score: {scorePct}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Explanation toggle */}
            <View style={styles.mathToggleRow}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={styles.mathTitle}>How this score is calculated</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowMath((prev) => !prev)}
                style={styles.infoButton}
                activeOpacity={0.7}
              >
                <Text style={styles.infoIcon}>i</Text>
              </TouchableOpacity>
            </View>

            {showMath && (
              <View style={styles.mathBox}>
                {/* Step 1 */}
                <View style={styles.mathStep}>
                  <Text style={styles.mathStepLabel}>1.</Text>
                  <View style={styles.mathStepBody}>
                    <Text style={styles.mathText}>
                      From your post analytics, we build hourly features in{" "}
                      <Text style={styles.codeText}>
                        features_engagement_timeslots
                      </Text>{" "}
                      using an engagement rate:
                    </Text>
                    <View style={styles.formulaWrapper}>
                      <Text style={styles.mathFormula}>
                        engagement_rate = (likes + comments + 0.5·saves + 0.2·shares) / impressions
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Step 2 */}
                <View style={styles.mathStep}>
                  <Text style={styles.mathStepLabel}>2.</Text>
                  <View style={styles.mathStepBody}>
                    <Text style={styles.mathText}>
                      We normalize this per user with{" "}
                      <Text style={styles.codeText}>norm_engagement()</Text>{" "}
                      using the 10th/90th percentiles of your engagement,
                      producing{" "}
                      <Text style={styles.codeText}>label_engagement</Text>{" "}
                      between 0 and 1.
                    </Text>
                  </View>
                </View>

                {/* Step 3 */}
                <View style={styles.mathStep}>
                  <Text style={styles.mathStepLabel}>3.</Text>
                  <View style={styles.mathStepBody}>
                    <Text style={styles.mathText}>
                      For future hours,{" "}
                      <Text style={styles.codeText}>
                        get_time_segment_recommendations
                      </Text>{" "}
                      computes a baseline score:
                    </Text>
                    <View style={styles.formulaWrapper}>
                      <Text style={styles.mathFormula}>
                        predicted_avg = {"{label_engagement or user_recent_avg_7d or industry prior}"}
                      </Text>
                    </View>
                    <Text style={styles.mathText}>
                      Industry priors come from{" "}
                      <Text style={styles.codeText}>global_hourly_priors</Text>,{" "}
                      using your{" "}
                      <Text style={styles.codeText}>
                        brand_profiles.industry
                      </Text>
                      .
                    </Text>
                  </View>
                </View>

                {/* Step 4 */}
                <View style={styles.mathStep}>
                  <Text style={styles.mathStepLabel}>4.</Text>
                  <View style={styles.mathStepBody}>
                    <Text style={styles.mathText}>
                      We then mix in feedback from your historical posting
                      experiments using{" "}
                      <Text style={styles.codeText}>bandit_rewards</Text> and{" "}
                      <Text style={styles.codeText}>v_bandit_params</Text>:
                    </Text>
                    <View style={styles.formulaWrapper}>
                      <Text style={styles.mathFormula}>
                        final_score = 0.7 · predicted_avg + 0.3 · α / (α + β)
                      </Text>
                    </View>
                    <Text style={styles.mathText}>
                      The “Score” shown above is this{" "}
                      <Text style={styles.codeText}>final_score</Text>, scaled
                      to 0–100%. Higher means a better predicted hour to post
                      relative to your own historic performance.
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </>
        )}
      </View>

      {/* Engagement Graph */}
      <Text style={styles.sectionTitle}>Engagement (Last 7 days)</Text>
      <View style={styles.card}>
        {!hasTrendData ? (
          <Text style={{ color: MUTED, fontSize: 12 }}>
            No engagement data yet for the last 7 days.
          </Text>
        ) : (
          <View style={styles.analyticsGraph}>
            <View style={styles.analyticsBarsRow}>
              {engagementTrend.series.map((d) => (
                <View key={d.key} style={styles.analyticsBarContainer}>
                  <View
                    style={[
                      styles.analyticsBar,
                      {
                        height: graphBarHeight(
                          d.value,
                          engagementTrend.maxVal
                        ),
                      },
                    ]}
                  />
                  <Text style={styles.analyticsBarLabel}>
                    {d.label.slice(0, 3)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      
      {/* Top Posts (Last 30 days) */}
      <Text style={styles.sectionTitle}>Top Posts (Last 30 days)</Text>
      <View style={styles.card}>
        {combinedStatsLast30.length === 0 ? (
          <Text style={{ color: MUTED, fontSize: 12 }}>
            No analytics yet. Publish or sync some posts to see insights (app
            + manual Facebook posts).
          </Text>
        ) : (
          (() => {
            const sorted = [...combinedStatsLast30]
              .sort((a, b) => b.engagement - a.engagement)
              .slice(0, 5);
            const maxEng = sorted[0]?.engagement || 1;

            return sorted.map((p, idx) => {
              const shortCaption =
                p.caption.length > 24
                  ? p.caption.slice(0, 24) + "…"
                  : p.caption || "(no caption)";
              const labelPrefix =
                p.source === "app" ? "FB • App" : "FB • Manual";

              const engRate =
                p.impressions > 0
                  ? (p.engagement / p.impressions) * 100
                  : 0;

              return (
                <View key={p.objectId} style={{ marginBottom: 10 }}>
                  <Text style={styles.perfLabel}>
                    {idx + 1}. {labelPrefix} • {shortCaption}
                  </Text>
                  <View style={styles.perfTrack}>
                    <View
                      style={[
                        styles.perfFill,
                        {
                          width: barWidthPct(p.engagement, maxEng),
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.perfMeta}>
                    Engagement: {formatNumber(p.engagement)} • Impressions:{" "}
                    {formatNumber(p.impressions)} • Eng. rate:{" "}
                    {engRate.toFixed(1)}%
                  </Text>
                </View>
              );
            });
          })()
        )}
      </View>

      {/* Recent Posts (App-created only) */}
      <Text style={styles.sectionTitle}>Recent Posts (Created in Prism)</Text>
      {recentPosts.map((p) => (
        <TouchableOpacity
          key={p.id}
          style={styles.postCard}
          activeOpacity={0.85}
        >
          <View style={styles.rowBetween}>
            <View style={styles.row}>
              {p.platforms.length > 0 && (
                <View
                  style={[
                    styles.statusPill,
                    styles.pillFB,
                    { marginRight: 6 },
                  ]}
                >
                  <Text style={styles.pillText}>FB</Text>
                </View>
              )}
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
              Impressions: {formatNumber(p.impressions)} • Eng. rate:{" "}
              {p.engRate.toFixed(1)}%
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
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: TEXT },
  cardHint: { color: MUTED, fontSize: 12 },

  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
  },
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

  // Smart recs mini calendar
  recDayCell: {
    width: 90,
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F9FAFB",
    marginRight: 10,
  },
  recDayToday: {
    backgroundColor: "#E0F2FE",
    borderColor: "#38BDF8",
  },
  recDayLabel: { fontSize: 11, color: MUTED, textAlign: "center" },
  recDayLabelToday: { color: "#0369A1" },
  recDayNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: TEXT,
    textAlign: "center",
    marginTop: 2,
  },
  recDayNumberToday: { color: "#0284C7" },
  recDayNoData: {
    fontSize: 10,
    color: MUTED,
    textAlign: "center",
    marginTop: 6,
  },
  recSlotRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  recSlotTime: {
    fontSize: 11,
    color: "#111827",
  },
  recSlotScore: {
    fontSize: 11,
    color: "#0EA5E9",
    fontWeight: "600",
  },

  // Explanation toggle
  mathToggleRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  // Math explanation box
  mathBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F3F4FF",
    borderWidth: 1,
    borderColor: "#E0E7FF",
  },
  mathTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  mathText: {
    fontSize: 11,
    color: "#4B5563",
    marginTop: 2,
  },
  mathFormula: {
    fontSize: 16,
    color: "#111827",
    fontFamily: Platform.select({
      ios: "Times New Roman",
      android: "serif",
      default: "serif",
    }),
    textAlign: "center",
  },
  codeText: {
    fontFamily: "monospace",
  },
  mathStep: {
    flexDirection: "row",
    marginTop: 8,
  },
  mathStepLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: TEXT,
    width: 18,
  },
  mathStepBody: {
    flex: 1,
  },
  formulaWrapper: {
    marginTop: 6,
    marginBottom: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  infoButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD5F5",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },
  infoIcon: {
    fontSize: 13,
    fontStyle: "italic",
    color: "#4F46E5",
    fontWeight: "600",
  },

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

  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  pillText: { fontSize: 11, fontWeight: "700" },
  pillPublished: { backgroundColor: "#DCFCE7", borderColor: "#16A34A" },
  pillScheduled: { backgroundColor: "#DBEAFE", borderColor: "#2563EB" },
  pillDraft: { backgroundColor: "#F3F4F6", borderColor: "#D1D5DB" },
  pillFB: { backgroundColor: "#EFF6FF", borderColor: "#1877F2" },

  analyticsGraph: {
    height: 80,
    justifyContent: "flex-end",
  },
  analyticsBarsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    flex: 1,
  },
  analyticsBarContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  analyticsBar: {
    width: 10,
    borderRadius: 8,
    backgroundColor: "#38BDF8",
  },
  analyticsBarLabel: {
    marginTop: 4,
    fontSize: 10,
    color: MUTED,
  },

  platformMetric: { flex: 1 },
  pmLabel: { color: MUTED, fontSize: 11 },
  pmValue: { color: TEXT, fontSize: 15, fontWeight: "700", marginTop: 2 },

  linkText: {
    fontSize: 12,
    color: "#2563EB",
    fontWeight: "600",
  },
});
