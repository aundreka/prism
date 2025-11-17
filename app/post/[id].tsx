// app/post/[id].tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import * as Linking from "expo-linking";
import { FontAwesome } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { Video } from "expo-av";

type PlatformEnum = "facebook" | "instagram";
type PostStatusEnum = "draft" | "scheduled" | "posting" | "posted" | "failed" | "canceled";

type Post = {
  id: string;
  user_id: string;
  caption: string | null;
  post_type: string;
  created_at: string;
};

type Sched = {
  id: string;
  platform: PlatformEnum;
  status: PostStatusEnum;
  api_post_id: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
  permalink: string | null;
  error_message: string | null;
};

type MediaAsset = { id: string; public_url: string | null; mime_type: string | null };

type AnalyticsRow = { object_id: string | null; metric: string; value: number };

const BG = "#F8FAFC";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E5E7EB";

export default function PostDetail() {
  const params = useLocalSearchParams();
  const rawId = (params as any).id as string | string[] | undefined;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [schedules, setSchedules] = useState<Sched[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setErrorMsg("No post id provided in the route.");
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        // 1) Post
        const { data: p, error: ep } = await supabase
          .from("posts")
          .select("id,user_id,caption,post_type,created_at")
          .eq("id", id)
          .single();
        if (ep) throw ep;
        setPost(p as any);

        // 2) Media
        const { data: pm, error: epm } = await supabase
          .from("posts_media")
          .select("media_assets(id, public_url, mime_type)")
          .eq("post_id", id)
          .order("position");
        if (epm) throw epm;
        const assets: MediaAsset[] = (pm || []).map((x: any) => x.media_assets);
        setMedia(assets);

        // 3) Schedules
        const { data: s, error: es } = await supabase
          .from("scheduled_posts")
          .select("id,platform,status,api_post_id,scheduled_at,posted_at,permalink,error_message")
          .eq("post_id", id)
          .order("scheduled_at", { ascending: false });
        if (es) throw es;
        const scheds = (s || []) as Sched[];
        setSchedules(scheds);

        // 4) Analytics for api_post_id
        const apiIds = scheds.map((x) => x.api_post_id).filter((x): x is string => !!x);
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
      } catch (e: any) {
        console.error("PostDetail load error:", e);
        const msg = e?.message ?? "Failed to load post.";
        setErrorMsg(msg);
        Alert.alert("Error", msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // --- FIXED: use per-object max, then sum across objects ---
  const analyticsRoll = useMemo(() => {
    // 1) For each object_id, keep the max snapshot per metric
    const perObject = new Map<string, Record<string, number>>();

    for (const a of analytics) {
      if (!a.object_id) continue;
      if (!perObject.has(a.object_id)) perObject.set(a.object_id, {});
      const bucket = perObject.get(a.object_id)!;

      const val = Number(a.value) || 0;
      bucket[a.metric] = Math.max(bucket[a.metric] || 0, val);
    }

    // 2) Sum those per-object maxima into a single rollup map
    const total = new Map<string, number>();
    for (const bucket of perObject.values()) {
      for (const [metric, val] of Object.entries(bucket)) {
        total.set(metric, (total.get(metric) || 0) + val);
      }
    }

    return total;
  }, [analytics]);

  // --- metrics computed from analyticsRoll ---
  const impressions = analyticsRoll.get("impressions") || 0;
  const likes = analyticsRoll.get("likes") || 0;
  const comments = analyticsRoll.get("comments") || 0;
  const shares = analyticsRoll.get("shares") || 0;
  const saves = analyticsRoll.get("saves") || 0;
  const profileVisits = analyticsRoll.get("profile_visits") || 0;
  const follows = analyticsRoll.get("follows") || 0;
  const clicks = analyticsRoll.get("clicks") || 0;
  const videoViews = analyticsRoll.get("video_views") || 0;

  const engagement = likes + comments + shares + saves + profileVisits + follows + clicks;
  const engagementRate = impressions > 0 ? (engagement / impressions) * 100 : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

  // simple performance label
  const performanceLabel = useMemo(() => {
    if (impressions < 100 && engagementRate < 1) return "Too early to judge";
    if (engagementRate >= 6 && impressions >= 500) return "High performing";
    if (engagementRate >= 3 && impressions >= 300) return "Solid";
    if (engagementRate < 1 && impressions >= 300) return "Underperforming";
    return "Average";
  }, [impressions, engagementRate]);

  // --- draft / schedule helpers ---
  const hasActiveSchedule = schedules.some(
    (s) => s.status === "scheduled" || s.status === "posting"
  );
  const hasPosted = schedules.some((s) => s.status === "posted");
  const isDraftPost = !hasActiveSchedule && !hasPosted;

  // --- actions ---
  const handleDeleteDraft = () => {
    if (!post) return;

    Alert.alert(
      "Delete draft?",
      "This will permanently delete this draft post and any unsent schedules. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDeleting(true);
              // Clean up any schedules linked to this draft, just in case
              const { error: es } = await supabase
                .from("scheduled_posts")
                .delete()
                .eq("post_id", post.id);
              if (es) throw es;

              const { error: ep } = await supabase.from("posts").delete().eq("id", post.id);
              if (ep) throw ep;

              router.back();
            } catch (e: any) {
              console.error("Delete draft error:", e);
              Alert.alert("Error", e?.message ?? "Failed to delete draft.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelSchedule = (schedId: string) => {
    Alert.alert(
      "Cancel schedule?",
      "This will keep the post as a draft so you can reschedule it later.",
      [
        { text: "Keep scheduled", style: "cancel" },
        {
          text: "Cancel schedule",
          style: "destructive",
          onPress: async () => {
            try {
              setCancelingId(schedId);
              const { error } = await supabase
                .from("scheduled_posts")
                .update({ status: "draft", scheduled_at: null })
                .eq("id", schedId);
              if (error) throw error;

              setSchedules((prev) =>
                prev.map((s) =>
                  s.id === schedId ? { ...s, status: "draft", scheduled_at: null } : s
                )
              );
            } catch (e: any) {
              console.error("Cancel schedule error:", e);
              Alert.alert("Error", e?.message ?? "Failed to cancel schedule.");
            } finally {
              setCancelingId(null);
            }
          },
        },
      ]
    );
  };

  const handleOpenPermalink = (permalink: string | null) => {
    if (!permalink) return;
    Linking.openURL(permalink).catch((err) => {
      console.error("Failed to open permalink:", err);
      Alert.alert("Error", "Could not open the Facebook post.");
    });
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
        <Text style={{ color: MUTED, marginTop: 8 }}>Loading post…</Text>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ color: TEXT, fontWeight: "700", fontSize: 16, marginBottom: 6 }}>Post not found</Text>
        <Text style={{ color: MUTED, textAlign: "center", fontSize: 13 }}>
          {errorMsg || "We couldn’t find this post. It may have been deleted or you might not have access."}
        </Text>
      </View>
    );
  }

  const firstMedia = media[0];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ padding: 16, paddingTop: 50 }}>
      <Text style={{ fontSize: 22, fontWeight: "800", color: TEXT }}>Post details</Text>

      {/* Media preview */}
      <View style={styles.card}>
        {firstMedia ? (
          firstMedia.mime_type?.startsWith("video/") ? (
            <Video
              source={{ uri: firstMedia.public_url || "" }}
              style={{ width: "100%", height: 260, borderRadius: 12, backgroundColor: "#E5E7EB" }}
              resizeMode="cover"
              isMuted
              shouldPlay={false}
            />
          ) : (
            <Image
              source={{ uri: firstMedia.public_url || "" }}
              style={{ width: "100%", height: 260, borderRadius: 12, backgroundColor: "#E5E7EB" }}
            />
          )
        ) : (
          <View style={{ height: 120, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: MUTED }}>No media</Text>
          </View>
        )}
        {post.caption ? <Text style={{ marginTop: 10, color: TEXT }}>{post.caption}</Text> : null}
        <Text style={{ marginTop: 6, color: MUTED, fontSize: 12 }}>
          {post.post_type.toUpperCase()} • {new Date(post.created_at).toLocaleString()}
        </Text>
      </View>

      {/* Schedules */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Schedules</Text>
        {schedules.length === 0 ? (
          <Text style={{ color: MUTED, marginTop: 6 }}>No schedules yet.</Text>
        ) : (
          schedules.map((s) => {
            const icon =
              s.platform === "instagram" ? (
                <FontAwesome name="instagram" size={14} color="#C13584" />
              ) : (
                <FontAwesome name="facebook-square" size={14} color="#1877F2" />
              );
            const when = s.posted_at
              ? new Date(s.posted_at).toLocaleString()
              : s.scheduled_at
              ? new Date(s.scheduled_at).toLocaleString()
              : "—";
            const statusColor =
              s.status === "scheduled" || s.status === "posting"
                ? "#22C55E"
                : s.status === "posted"
                ? "#111827"
                : "#9CA3AF";
            const isCancelable = s.status === "scheduled" || s.status === "posting";

            return (
              <View key={s.id} style={styles.scheduleRow}>
                <View style={[styles.dot, { backgroundColor: statusColor }]} />
                <View style={{ marginHorizontal: 8 }}>{icon}</View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: TEXT, fontWeight: "700" }}>{s.status.toUpperCase()}</Text>
                  <Text style={{ color: MUTED, fontSize: 12 }}>{when}</Text>
                  {s.error_message ? (
                    <Text style={{ color: "#B91C1C", fontSize: 12, marginTop: 2 }}>{s.error_message}</Text>
                  ) : null}
                </View>

                {/* Right-side actions: View + Cancel */}
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {s.permalink ? (
                    <TouchableOpacity
                      onPress={() => handleOpenPermalink(s.permalink)}
                      style={styles.viewChip}
                    >
                      <FontAwesome name="external-link" size={12} color="#1D4ED8" />
                      <Text style={styles.viewChipText}>View</Text>
                    </TouchableOpacity>
                  ) : null}

                  {isCancelable ? (
                    <TouchableOpacity
                      onPress={() => handleCancelSchedule(s.id)}
                      disabled={cancelingId === s.id}
                      style={[
                        styles.cancelChip,
                        cancelingId === s.id && { opacity: 0.6 },
                      ]}
                    >
                      {cancelingId === s.id ? (
                        <ActivityIndicator size="small" />
                      ) : (
                        <Text style={styles.cancelChipText}>Cancel</Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        {/* Delete draft button when this post has no active/posted schedules */}
        {isDraftPost ? (
          <TouchableOpacity
            style={[styles.deleteButton, deleting && { opacity: 0.7 }]}
            disabled={deleting}
            onPress={handleDeleteDraft}
          >
            {deleting ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.deleteButtonText}>Delete draft</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Analytics */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Analytics</Text>

        {/* Summary row */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryTitle}>Engagement rate</Text>
            <Text style={styles.summaryValue}>
              {engagementRate.toFixed(1)}
              <Text style={{ fontSize: 12 }}>%</Text>
            </Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryTitle}>CTR</Text>
            <Text style={styles.summaryValue}>
              {ctr.toFixed(1)}
              <Text style={{ fontSize: 12 }}>%</Text>
            </Text>
          </View>
        </View>

        {/* Simple performance verdict */}
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: MUTED, fontSize: 11 }}>Performance insight</Text>
          <Text style={{ color: TEXT, fontWeight: "700", fontSize: 14, marginTop: 2 }}>
            {performanceLabel}
          </Text>
        </View>

        {/* Raw metrics */}
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.mTitle}>Engagement</Text>
            <Text style={styles.mValue}>{Math.round(engagement)}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.mTitle}>Impressions</Text>
            <Text style={styles.mValue}>{Math.round(impressions)}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.mTitle}>Likes</Text>
            <Text style={styles.mValue}>{Math.round(likes)}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.mTitle}>Comments</Text>
            <Text style={styles.mValue}>{Math.round(comments)}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.mTitle}>Shares</Text>
            <Text style={styles.mValue}>{Math.round(shares)}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.mTitle}>Saves</Text>
            <Text style={styles.mValue}>{Math.round(saves)}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.mTitle}>Profile visits</Text>
            <Text style={styles.mValue}>{Math.round(profileVisits)}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.mTitle}>Follows</Text>
            <Text style={styles.mValue}>{Math.round(follows)}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.mTitle}>Link clicks</Text>
            <Text style={styles.mValue}>{Math.round(clicks)}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.mTitle}>Video views</Text>
            <Text style={styles.mValue}>{Math.round(videoViews)}</Text>
          </View>
        </View>
      </View>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginTop: 12,
  },
  cardTitle: { color: TEXT, fontWeight: "800", fontSize: 15, marginBottom: 8 },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingBottom: 8,
    marginBottom: 8,
    gap: 12,
  },
  summaryMetric: { flex: 1 },
  summaryTitle: { color: MUTED, fontSize: 11 },
  summaryValue: { color: TEXT, fontWeight: "800", fontSize: 18, marginTop: 2 },

  metricsRow: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 6 },
  metric: { minWidth: 90 },
  mTitle: { color: MUTED, fontSize: 11 },
  mValue: { color: TEXT, fontWeight: "800", fontSize: 16, marginTop: 2 },

  viewChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#60A5FA",
    backgroundColor: "#EFF6FF",
    marginLeft: 8,
  },
  viewChipText: {
    color: "#1D4ED8",
    fontSize: 11,
    fontWeight: "700",
  },

  cancelChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#F97373",
    marginLeft: 8,
  },
  cancelChipText: {
    color: "#B91C1C",
    fontSize: 11,
    fontWeight: "700",
  },
  deleteButton: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonText: {
    color: "#B91C1C",
    fontWeight: "700",
    fontSize: 13,
  },
});
