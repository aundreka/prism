import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";

const PLATFORM_COLORS = {
  Instagram: "#E1306C",
  Facebook: "#1877F2",
  TikTok: "#111111",
  "X (Twitter)": "#1DA1F2",
  YouTube: "#FF0000",
};
const ALL_PLATFORMS = Object.keys(PLATFORM_COLORS);
const STATUS = ["All", "Published", "Scheduled", "Draft"];

const INITIAL_POSTS = [
  { id: "1", platform: "Instagram", status: "Published", caption: "Carousel: Studio lighting before/after ✨", date: "2025-10-22T10:15:00", metrics: { reach: 14210, likes: 1820, comments: 210, saves: 130 } },
  { id: "2", platform: "TikTok", status: "Published", caption: "30s edit: Color grading on mobile 🎨", date: "2025-10-23T18:05:00", metrics: { views: 20120, hearts: 3560, comments: 420, shares: 260 } },
  { id: "3", platform: "Facebook", status: "Published", caption: "BTS album from today’s shoot 📸", date: "2025-10-21T14:30:00", metrics: { reach: 11200, reactions: 980, comments: 140, shares: 96 } },
  { id: "4", platform: "Facebook", status: "Scheduled", caption: "Weekend drop: Limited bundle with freebies 🎁", date: "2025-10-24T09:00:00" },
  { id: "5", platform: "YouTube", status: "Scheduled", caption: "Vlog #12: Rebranding journey & lessons learned", date: "2025-10-25T19:00:00" },
  { id: "6", platform: "X (Twitter)", status: "Draft", caption: "Poll: Which colorway should we drop next?", date: "2025-10-26T08:00:00" },
  { id: "7", platform: "Instagram", status: "Draft", caption: "Story idea: quick rig setup + gear list", date: "2025-10-27T11:00:00" },
];

export default function PostsScreen() {
  // Filters
  const [platformFilter, setPlatformFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  // Data
  const [posts, setPosts] = useState(INITIAL_POSTS);

  // Composer state
  const [composerCaption, setComposerCaption] = useState("");
  const [composerPlatform, setComposerPlatform] = useState("Instagram");
  const [composerWhen, setComposerWhen] = useState(""); // free-text date/time, optional

  const filtered = useMemo(() => {
    return posts
      .filter((p) => (platformFilter === "All" ? true : p.platform === platformFilter))
      .filter((p) => (statusFilter === "All" ? true : p.status === statusFilter))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [platformFilter, statusFilter, posts]);

  const renderChip = (label, active, onPress, color) => (
    <TouchableOpacity
      key={label}
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.chip,
        active && { backgroundColor: "#DBEAFE", borderColor: "#93C5FD" },
        color && { borderColor: color },
      ]}
    >
      <Text style={[styles.chipText, active && { color: "#1E3A8A", fontWeight: "700" }]}>{label}</Text>
    </TouchableOpacity>
  );

  const renderStatusPill = (status) => {
    const base = [styles.pill];
    if (status === "Published") base.push({ backgroundColor: "#DCFCE7", borderColor: "#16A34A" });
    if (status === "Scheduled") base.push({ backgroundColor: "#DBEAFE", borderColor: "#2563EB" });
    if (status === "Draft") base.push({ backgroundColor: "#F3F4F6", borderColor: "#D1D5DB" });
    return (
      <View style={base}>
        <Text style={styles.pillText}>{status}</Text>
      </View>
    );
  };

  const capitalize = (s) => s.slice(0, 1).toUpperCase() + s.slice(1);

  const renderPost = ({ item }) => {
    const color = PLATFORM_COLORS[item.platform] || "#111827";
    const dt = new Date(item.date);
    const dateStr = dt.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.row}>
            <View style={[styles.platformDot, { backgroundColor: color }]} />
            <Text style={styles.platformName}>{item.platform}</Text>
          </View>
          {renderStatusPill(item.status)}
        </View>

        <Text style={styles.caption}>{item.caption}</Text>

        <View style={styles.rowBetween}>
          <Text style={styles.date}>{dateStr}</Text>
          {item.status === "Published" ? (
            <Text style={styles.metricsText}>
              {item.metrics?.reach
                ? `Reach ${item.metrics.reach.toLocaleString()}`
                : item.metrics?.views
                ? `${item.metrics.views.toLocaleString()} views`
                : `—`}{" "}
              •{" "}
              {item.metrics
                ? Object.entries(item.metrics)
                    .filter(([k]) => !["reach", "views"].includes(k))
                    .map(([k, v]) => `${capitalize(k)} ${v}`)
                    .join(" • ")
                : "No metrics"}
            </Text>
          ) : item.status === "Scheduled" ? (
            <Text style={styles.metricsText}>Scheduled</Text>
          ) : (
            <Text style={styles.metricsText}>Draft</Text>
          )}
        </View>
      </View>
    );
  };

  // --- Composer actions ---
  const publishNow = () => {
    if (!composerCaption.trim()) {
      Alert.alert("Add a caption", "Please enter a caption before publishing.");
      return;
    }
    const now = new Date();
    const newPost = {
      id: `${Date.now()}`,
      platform: composerPlatform,
      status: "Published",
      caption: composerCaption.trim(),
      date: now.toISOString(),
      metrics: { reach: 0, likes: 0, comments: 0 }, // mock
    };
    setPosts((prev) => [newPost, ...prev]);
    setComposerCaption("");
    setComposerWhen("");
  };

  const schedulePost = () => {
    if (!composerCaption.trim()) {
      Alert.alert("Add a caption", "Please enter a caption to schedule.");
      return;
    }
    if (!composerWhen.trim()) {
      Alert.alert("Pick a time", "Enter a date/time (e.g., 2025-11-01 18:00).");
      return;
    }
    const parsed = parseUserDate(composerWhen);
    if (!parsed) {
      Alert.alert("Invalid date", "Try formats like: 2025-11-01 18:00 or Nov 1, 2025 6:00 PM.");
      return;
    }
    const newPost = {
      id: `${Date.now()}`,
      platform: composerPlatform,
      status: parsed > new Date() ? "Scheduled" : "Published",
      caption: composerCaption.trim(),
      date: parsed.toISOString(),
    };
    setPosts((prev) => [newPost, ...prev]);
    setComposerCaption("");
    setComposerWhen("");
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        contentContainerStyle={{ paddingTop: 110, paddingBottom: 90 }}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={
          <View>
            {/* Title */}
            <View style={styles.headerBlock}>
              <Text style={styles.title}>Posts</Text>
              <Text style={styles.subtitle}>Compose, schedule, and review content</Text>
            </View>

            {/* Inline Composer */}
            <View style={styles.composerCard}>
              <Text style={styles.composerLabel}>Compose</Text>

              {/* Platform selector (chips) */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
                style={{ marginBottom: 10 }}
              >
                {ALL_PLATFORMS.map((p) =>
                  renderChip(
                    p,
                    composerPlatform === p,
                    () => setComposerPlatform(p),
                    PLATFORM_COLORS[p]
                  )
                )}
              </ScrollView>

              {/* Caption */}
              <TextInput
                value={composerCaption}
                onChangeText={setComposerCaption}
                placeholder="Write a caption..."
                placeholderTextColor="#94A3B8"
                multiline
                style={styles.input}
              />

              {/* Date/Time (optional) */}
              <View style={[styles.rowBetween, { marginTop: 8 }]}>
                <TextInput
                  value={composerWhen}
                  onChangeText={setComposerWhen}
                  placeholder="Schedule (optional): e.g., 2025-11-01 18:00"
                  placeholderTextColor="#94A3B8"
                  style={[styles.inputSmall, { flex: 1, marginRight: 8 }]}
                />
                <TouchableOpacity
                  onPress={() => setComposerWhen(makeTonightAt(18))}
                  style={[styles.ghostBtn]}
                >
                  <Text style={styles.ghostBtnText}>Tonight 6PM</Text>
                </TouchableOpacity>
              </View>

              {/* Actions */}
              <View style={[styles.rowBetween, { marginTop: 12 }]}>
                <TouchableOpacity onPress={publishNow} activeOpacity={0.9} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>Publish Now</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={schedulePost} activeOpacity={0.9} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Schedule</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Filters */}
            <View style={styles.headerBlock}>
              <Text style={styles.sectionTitle}>Filters</Text>
            </View>

            {/* Platform filters */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
              style={{ marginBottom: 8 }}
            >
              {renderChip("All", platformFilter === "All", () => setPlatformFilter("All"))}
              {ALL_PLATFORMS.map((p) =>
                renderChip(p, platformFilter === p, () => setPlatformFilter(p), PLATFORM_COLORS[p])
              )}
            </ScrollView>

            {/* Status filters */}
            <View style={styles.statusRow}>
              {STATUS.map((s) => renderChip(s, statusFilter === s, () => setStatusFilter(s)))}
            </View>

            {/* Section label */}
            <View style={styles.headerBlock}>
              <Text style={styles.sectionTitle}>All Posts</Text>
            </View>
          </View>
        }
      />
    </View>
  );
}

/* --- Small helpers --- */
function parseUserDate(s) {
  // Super forgiving parser for quick demos
  // Accepts "YYYY-MM-DD HH:mm" or anything Date can parse.
  const trimmed = s.replace(" at ", " ").replace("  ", " ").trim();
  const tryIso = Date.parse(trimmed);
  if (!Number.isNaN(tryIso)) return new Date(tryIso);
  return null;
}
function makeTonightAt(hour = 18) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  if (d < new Date()) d.setDate(d.getDate() + 1);
  // Return a user-editable string
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  const HH = `${d.getHours()}`.padStart(2, "0");
  const MM = `${d.getMinutes()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${HH}:${MM}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },

  headerBlock: { paddingHorizontal: 16, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 13, color: "#6B7280", marginTop: 2 },

  /* Composer */
  composerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  composerLabel: { fontSize: 14, fontWeight: "700", color: "#111827", marginBottom: 8 },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#111827",
    minHeight: 70,
    textAlignVertical: "top",
  },
  inputSmall: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#111827",
  },
  primaryBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flex: 1,
    marginRight: 8,
  },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "700", textAlign: "center" },
  secondaryBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flex: 1,
    marginLeft: 8,
  },
  secondaryBtnText: { color: "#2563EB", fontWeight: "700", textAlign: "center" },
  ghostBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ghostBtnText: { color: "#111827", fontWeight: "600" },

  /* Chips & filters */
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  chipText: { fontSize: 13, color: "#1F2937" },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  /* Post cards */
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  row: { flexDirection: "row", alignItems: "center" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  platformDot: { width: 10, height: 10, borderRadius: 10, marginRight: 8 },
  platformName: { fontSize: 14, fontWeight: "700", color: "#111827" },

  caption: { color: "#374151", marginTop: 6, fontSize: 13 },

  date: { color: "#6B7280", fontSize: 12, marginTop: 10 },
  metricsText: { color: "#334155", fontSize: 12, marginTop: 10, textAlign: "right" },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#F3F4F6",
    borderColor: "#D1D5DB",
  },
  pillText: { fontSize: 11, fontWeight: "700", color: "#111827" },
});
