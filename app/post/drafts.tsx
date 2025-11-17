// app/post/drafts.tsx
import { supabase } from "@/lib/supabase";
import { FontAwesome } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

/* -------------------------
   Theme (keep in sync-ish with create.tsx)
--------------------------*/
const BG = "#F8FAFC";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E5E7EB";
const TINT = "#111827";

const HEADER_SPACER = 140;
const FOOTER_SPACER = 80;

type PlatformEnum = "facebook";
type PostTypeEnum =
  | "image"
  | "video"
  | "reel"
  | "story"
  | "carousel"
  | "link";
type PostStatusEnum =
  | "draft"
  | "scheduled"
  | "posting"
  | "posted"
  | "failed"
  | "canceled";

type DraftRow = {
  id: string;
  user_id: string;
  caption: string | null;
  post_type: PostTypeEnum;
  status: PostStatusEnum;
  created_at: string;
  scheduled_at: string | null;
  media_ids: string[];
};

type MediaAsset = {
  id: string;
  public_url: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  mime_type: string | null;
};

function formatShortDateTime(iso: string | null) {
  if (!iso) return "Unsched.";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Unsched.";
  return d.toLocaleString();
}

export default function DraftsScreen() {
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [mediaMap, setMediaMap] = useState<Record<string, MediaAsset>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadDrafts = useCallback(
    async (opts: { quiet?: boolean } = {}) => {
      try {
        if (!uid) {
          const { data } = await supabase.auth.getUser();
          const user = data?.user;
          if (!user) {
            Alert.alert("Sign in required", "Please log in to view drafts.");
            router.replace("/(auth)");
            return;
          }
          setUid(user.id);
        }
        const userId = uid || (await supabase.auth.getUser()).data?.user?.id;
        if (!userId) return;

        if (!opts.quiet) setLoading(true);

        // 1) fetch drafts from view
        const { data: rows, error } = await supabase
          .from("v_scheduled_posts_with_media")
          .select(
            "id, user_id, caption, post_type, status, created_at, scheduled_at, media_ids"
          )
          .eq("user_id", userId)
          .eq("status", "draft")
          .order("created_at", { ascending: false });

        if (error) throw error;

        const draftsData = (rows || []) as any[];
        setDrafts(
          draftsData.map((r) => ({
            id: r.id,
            user_id: r.user_id,
            caption: r.caption,
            post_type: r.post_type,
            status: r.status,
            created_at: r.created_at,
            scheduled_at: r.scheduled_at,
            media_ids: (r.media_ids || []) as string[],
          }))
        );

        // 2) fetch media assets in one go
        const allMediaIds = Array.from(
          new Set(
            draftsData.flatMap((r) => ((r.media_ids || []) as string[]))
          )
        );
        if (allMediaIds.length) {
          const { data: mediaRows, error: mediaErr } = await supabase
            .from("media_assets")
            .select(
              "id, public_url, width, height, duration_ms, mime_type"
            )
            .in("id", allMediaIds);

          if (mediaErr) throw mediaErr;

          const map: Record<string, MediaAsset> = {};
          (mediaRows || []).forEach((m: any) => {
            map[m.id] = {
              id: m.id,
              public_url: m.public_url,
              width: m.width,
              height: m.height,
              duration_ms: m.duration_ms,
              mime_type: m.mime_type,
            };
          });
          setMediaMap(map);
        } else {
          setMediaMap({});
        }
      } catch (e: any) {
        console.error("Error loading drafts:", e);
        Alert.alert("Error", e?.message ?? "Failed to load drafts.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [uid]
  );

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDrafts({ quiet: true });
  }, [loadDrafts]);

  const handleDeleteDraft = useCallback(
    (draft: DraftRow) => {
      Alert.alert(
        "Delete draft?",
        "This will permanently delete this draft. This can't be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                setDeletingId(draft.id);
                const { error } = await supabase
                  .from("scheduled_posts")
                  .delete()
                  .eq("id", draft.id);

                if (error) throw error;

                // Optimistic update
                setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
              } catch (e: any) {
                console.error("Error deleting draft:", e);
                Alert.alert(
                  "Error",
                  e?.message ?? "Failed to delete draft."
                );
              } finally {
                setDeletingId(null);
              }
            },
          },
        ]
      );
    },
    []
  );

  const renderDraft = ({ item }: { item: DraftRow }) => {
    const firstMediaId = item.media_ids?.[0];
    const media = firstMediaId ? mediaMap[firstMediaId] : undefined;
    const isVideo =
      media?.mime_type?.toLowerCase().startsWith("video") ||
      item.post_type === "video" ||
      item.post_type === "reel";

    const isDeleting = deletingId === item.id;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() =>
          router.push({
            pathname: "/(tabs)/create",
            params: { draft_id: item.id },
          })
        }
      >
        <View style={styles.cardMediaWrap}>
          {media?.public_url ? (
            isVideo ? (
              <View style={styles.cardMedia}>
                <Image
                  source={{ uri: media.public_url }}
                  style={styles.cardMedia}
                  resizeMode="cover"
                />
                <View style={styles.cardPlayBadge}>
                  <FontAwesome name="play" size={14} color="#fff" />
                </View>
              </View>
            ) : (
              <Image
                source={{ uri: media.public_url }}
                style={styles.cardMedia}
                resizeMode="cover"
              />
            )
          ) : (
            <View style={[styles.cardMedia, styles.cardMediaPlaceholder]}>
              <FontAwesome name="image" size={20} color={MUTED} />
            </View>
          )}
        </View>

        <View style={styles.cardContent}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTypeLabel}>
              {item.post_type.toUpperCase()}
            </Text>
            <Text style={styles.cardCreatedAt}>
              {formatShortDateTime(item.scheduled_at || item.created_at)}
            </Text>
            <TouchableOpacity
              style={styles.cardDeleteBtn}
              onPress={() => handleDeleteDraft(item)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color={MUTED} />
              ) : (
                <FontAwesome name="trash" size={14} color={MUTED} />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.cardCaption} numberOfLines={2}>
            {item.caption || "(No caption yet)"}
          </Text>
          <View style={styles.cardFooterRow}>
            <View style={styles.cardStatusPill}>
              <View style={styles.cardStatusDot} />
              <Text style={styles.cardStatusText}>Draft</Text>
            </View>
            <View style={styles.cardChevron}>
              <Text style={styles.cardChevronText}>Load in Create</Text>
              <FontAwesome name="chevron-right" size={10} color={MUTED} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const emptyState = useMemo(
    () => (
      <View style={styles.emptyState}>
        <View style={styles.emptyIconWrap}>
          <FontAwesome name="file-text-o" size={28} color={MUTED} />
        </View>
        <Text style={styles.emptyTitle}>No drafts yet</Text>
        <Text style={styles.emptyText}>
          Save a post as a draft from the Create screen to see it here.
        </Text>
      </View>
    ),
    []
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/create")}
            style={styles.backBtn}
          >
            <FontAwesome name="chevron-left" size={12} color={TINT} />
          </TouchableOpacity>
          <Text style={styles.title}>Drafts</Text>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Loading drafts…</Text>
          </View>
        ) : drafts.length === 0 ? (
          emptyState
        ) : (
          <FlatList
            data={drafts}
            keyExtractor={(item) => item.id}
            renderItem={renderDraft}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            contentContainerStyle={{ paddingTop: 8 }}
          />
        )}

        <View style={{ height: FOOTER_SPACER }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: HEADER_SPACER,
    paddingBottom: FOOTER_SPACER,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: TEXT,
  },

  loadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  loadingText: {
    fontSize: 12,
    color: MUTED,
  },

  card: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  cardMediaWrap: {
    width: 90,
    height: 90,
  },
  cardMedia: {
    width: "100%",
    height: "100%",
  },
  cardMediaPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5E7EB",
  },
  cardPlayBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    backgroundColor: "rgba(15,23,42,0.75)",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  cardContent: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  cardTypeLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: TINT,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: "#EEF2FF",
  },
  cardCreatedAt: {
    marginLeft: "auto",
    fontSize: 11,
    color: MUTED,
  },
  cardDeleteBtn: {
    marginLeft: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardCaption: {
    fontSize: 13,
    color: TEXT,
    marginBottom: 6,
  },
  cardFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: "auto",
  },
  cardStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: "#ECFEFF",
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  cardStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22C55E",
    marginRight: 4,
  },
  cardStatusText: {
    fontSize: 11,
    color: "#059669",
    fontWeight: "700",
  },
  cardChevron: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cardChevronText: {
    fontSize: 11,
    color: MUTED,
  },

  emptyState: {
    marginTop: 24,
    alignItems: "center",
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    backgroundColor: "#E5E7EB",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: TEXT,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
  },
});
