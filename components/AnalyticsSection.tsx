// components/AnalyticsSection.tsx
import React, { useMemo } from "react";
import { StyleSheet, Text, View, TouchableOpacity } from "react-native";

const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";

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

type CombinedPostStat = {
  objectId: string;
  caption: string;
  source: "app" | "manual";
  createdAt: Date;
  impressions: number;
  engagement: number; // always likes + comments + shares
};

type RecentPostCard = {
  id: string;
  caption: string;
  status: "Published" | "Scheduled" | "Draft";
  date: Date;
  platforms: PlatformEnum[];
  engagement: number;
};

type Props = {
  posts: PostRow[];
  sched: SchedRow[];
  analytics: AnalyticsRow[];
  externalPosts: ExternalPostRow[];
  dailyEng: DailyEngRow[];
};

const graphBarHeight = (value: number, max: number) => {
  if (!max || max <= 0) return 8;
  const ratio = value / max;
  return 8 + Math.round(ratio * 52);
};

const formatNumber = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
    ? `${(n / 1000).toFixed(1)}k`
    : `${n}`;

// keep returning a string, but we'll cast it at usage to satisfy TS
const barWidthPct = (val: number, max: number): string =>
  `${Math.max(6, Math.min(100, (val / (max || 1)) * 100))}%`;

export const AnalyticsSection: React.FC<Props> = ({
  posts,
  sched,
  analytics,
  externalPosts,
  dailyEng,
}) => {
  const dayMs = 24 * 60 * 60 * 1000;

  // Bucket analytics metrics by object_id: { [metric]: max(value) }
  const analyticsByObject = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const a of analytics) {
      if (!a.object_id) continue;
      if (!map.has(a.object_id)) map.set(a.object_id, {});
      const bucket = map.get(a.object_id)!;
      const val = Number(a.value) || 0;
      // Store the max we’ve seen for each metric for that object
      bucket[a.metric] = Math.max(bucket[a.metric] || 0, val);
    }
    return map;
  }, [analytics]);

  // Stats for posts created in Prism (joined to scheduled/meta objects)
  const postStats = useMemo(() => {
    const stats: {
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
    }[] = [];

    for (const post of posts) {
      const srows = sched.filter((s) => s.post_id === post.id);

      let impressions = 0;
      let likes = 0;
      let comments = 0;
      let shares = 0;
      let saves = 0;
      let clicks = 0;
      let videoViews = 0;
      let engagement = 0; // likes + comments + shares
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

        engagement += like + comm + sh;
      }

      // If impressions are missing, fall back to engagement so we never divide by 0
      if (impressions === 0 && engagement > 0) {
        impressions = engagement;
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

  // Combine metadata (caption, createdAt, source) per Meta object_id
  const combinedMetaByObject = useMemo(() => {
    const map = new Map<
      string,
      { caption: string; createdAt: Date; source: "app" | "manual" }
    >();

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
        const newerDate =
          createdAt > existing.createdAt ? createdAt : existing.createdAt;
        const source: "app" | "manual" =
          existing.source === "app" ? "app" : "app";
        map.set(objectId, {
          caption,
          createdAt: newerDate,
          source,
        });
      }
    }

    return map;
  }, [externalPosts, sched, posts]);

  // Combined stats per Meta object_id (last 30 days)
  const combinedStatsLast30 = useMemo<CombinedPostStat[]>(() => {
    const now = new Date();
    const start30 = new Date(now.getTime() - 29 * dayMs);
    const results: CombinedPostStat[] = [];

    for (const [objectId, meta] of combinedMetaByObject.entries()) {
      if (meta.createdAt < start30) continue;
      const bucket = analyticsByObject.get(objectId);
      if (!bucket) continue;

      const likes = bucket["likes"] || 0;
      const comments = bucket["comments"] || 0;
      const shares = bucket["shares"] || 0;

      const engagement = likes + comments + shares;

      let impressions = bucket["impressions"] || 0;
      if (impressions === 0 && engagement > 0) {
        impressions = engagement;
      }

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

  const totalPostsWithAnalytics = useMemo(() => {
    let count = 0;
    for (const [objectId] of combinedMetaByObject.entries()) {
      if (analyticsByObject.has(objectId)) count++;
    }
    return count;
  }, [combinedMetaByObject, analyticsByObject]);

  const postsLast7Count = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 6 * dayMs);

    let count = 0;

    for (const [objectId, meta] of combinedMetaByObject.entries()) {
      // only count posts that actually have analytics
      if (!analyticsByObject.has(objectId)) continue;

      if (meta.createdAt >= cutoff) {
        count++;
      }
    }

    return count;
  }, [combinedMetaByObject, analyticsByObject, dayMs]);

  // KPI cards at the top
  const kpis = useMemo(() => {
    const totalPosts = totalPostsWithAnalytics;
    const postsThisWeek = postsLast7Count;

    let totalEngagement30 = 0;

    for (const s of combinedStatsLast30) {
      totalEngagement30 += s.engagement;
    }

    const avgEngagementPerPost30 = combinedStatsLast30.length
      ? totalEngagement30 / combinedStatsLast30.length
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
        label: "Total Engagement (30d)",
        value: formatNumber(totalEngagement30),
        hint: "Likes + comments + shares",
      },
      {
        label: "Avg Engagement / Post (30d)",
        value: avgEngagementPerPost30.toFixed(1),
        hint: "Based on posts with analytics",
      },
    ];
  }, [combinedStatsLast30, postsLast7Count, totalPostsWithAnalytics]);

  // Engagement trend from dailyEng
  const engagementTrend = useMemo(() => {
    if (!dailyEng || dailyEng.length === 0) {
      return {
        series: [] as {
          key: string;
          label: string;
          value: number;
        }[],
        maxVal: 0,
      };
    }

    let maxVal = 0;
    const series = dailyEng.map((row) => {
      const d = new Date(row.day);
      const value = Number(row.engagement) || 0;
      if (value > maxVal) maxVal = value;

      return {
        key: row.day,
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
        value,
      };
    });

    return { series, maxVal };
  }, [dailyEng]);

  // show the chart as long as we *have rows*, even if all are 0
  const hasTrendData = !!dailyEng && dailyEng.length > 0;

  // Top posts (engagement-based) over last 30 days
  const topPostsLast30 = useMemo(() => {
    if (!combinedStatsLast30.length) {
      return { sorted: [] as CombinedPostStat[], maxEng: 1 };
    }
    const sorted = [...combinedStatsLast30]
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 5);
    const maxEng = sorted[0]?.engagement || 1;
    return { sorted, maxEng };
  }, [combinedStatsLast30]);

  // PAGE-SPECIFIC: only posts that are actually scheduled for this page
  const recentPosts: RecentPostCard[] = useMemo(() => {
    const schedPostIds = new Set(
      sched
        .map((s) => s.post_id)
        .filter((id): id is string => !!id)
    );

    // Only include Prism posts that belong to a schedule row we received
    const eligiblePosts = posts.filter((p) => schedPostIds.has(p.id));
    if (eligiblePosts.length === 0) return [];

    const sortedPosts = [...eligiblePosts].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const subset = sortedPosts.slice(0, 5);

    return subset.map((post) => {
      const stat = postStats.find((s) => s.post.id === post.id) ?? null;
      const srows = sched.filter((s) => s.post_id === post.id);

      let status: "Published" | "Scheduled" | "Draft" = "Draft";
      if (srows.some((s) => s.status === "posted")) status = "Published";
      else if (
        srows.some(
          (s) => s.status === "scheduled" || s.status === "posting"
        )
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
      const engagement = stat?.engagement || 0;

      return {
        id: post.id,
        caption: post.caption || "(no caption)",
        status,
        date,
        platforms,
        engagement,
      };
    });
  }, [posts, sched, postStats]);

  return (
    <>
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

      {/* Engagement (Last 7 days) */}
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
            No analytics yet. Publish or sync some posts to see insights (app +
            manual Facebook posts).
          </Text>
        ) : (
          topPostsLast30.sorted.map((p: CombinedPostStat, idx: number) => {
            const shortCaption =
              p.caption.length > 24
                ? p.caption.slice(0, 24) + "…"
                : p.caption || "(no caption)";
            const labelPrefix =
              p.source === "app" ? "FB • App" : "FB • Manual";

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
                        width: barWidthPct(
                          p.engagement,
                          topPostsLast30.maxEng
                        ) as any,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.perfMeta}>
                  Engagement: {formatNumber(p.engagement)}
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* Recent Posts (Created in Prism) */}
      <Text style={styles.sectionTitle}>Recent Posts (Created in Prism)</Text>
      {recentPosts.length === 0 ? (
        <View style={styles.card}>
          <Text style={{ color: MUTED, fontSize: 12 }}>
            No posts created in Prism yet for this Page.
          </Text>
        </View>
      ) : (
        recentPosts.map((p) => (
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
            <Text style={styles.postDate}>
              {p.date.toLocaleDateString()}
            </Text>
            {p.engagement > 0 && (
              <Text style={styles.postMeta}>
                Engagement: {formatNumber(p.engagement)}
              </Text>
            )}
          </TouchableOpacity>
        ))
      )}
    </>
  );
};

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },

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

  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },

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
});
