import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Image,
  Alert,
  Platform,
  Modal,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";

/* ---- Config ---- */
const SPACING = 16;
const RADIUS = 16;

const PLATFORM_COLORS = {
  Instagram: "#E1306C",
  Facebook: "#1877F2",
  TikTok: "#111111",
  "X (Twitter)": "#1DA1F2",
  YouTube: "#FF0000",
};
const ALL_PLATFORMS = Object.keys(PLATFORM_COLORS);

const TEMPLATES = [
  {
    id: "t1",
    name: "Product Spotlight",
    caption:
      "Meet our newest drop 🔥 Quick specs, price, and why it’s a game-changer. #NewRelease",
    note: "Best for square (1:1) or 4:5 portrait.",
  },
  {
    id: "t2",
    name: "How-To / Tutorial",
    caption:
      "3-step guide to better lighting 💡 Save for later! #Tips #BehindTheScenes",
    note: "Great for 9:16 (TikTok/Reels/Shorts).",
  },
  {
    id: "t3",
    name: "Announcement",
    caption:
      "We’re going live this weekend! Drop your questions below 👇 #LiveStream",
    note: "Works across platforms; add a thumbnail.",
  },
];

export default function CreateScreen() {
  /* Selection state */
  const [selectedPlatforms, setSelectedPlatforms] = useState(new Set(["Instagram"]));
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [caption, setCaption] = useState("");
  const [mediaUri, setMediaUri] = useState(null);
  const [mediaRatio, setMediaRatio] = useState(1); // width/height

  /* Scheduler state */
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [customDate, setCustomDate] = useState(new Date());
  const [customTime, setCustomTime] = useState(new Date());
  const [useCustom, setUseCustom] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(null); // Date | null

  /* Permissions (iOS needs explicit) */
  useEffect(() => {
    (async () => {
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission needed", "Please allow photo library access to upload media.");
        }
      }
    })();
  }, []);

  const togglePlatform = (p) => {
    const s = new Set(selectedPlatforms);
    if (s.has(p)) s.delete(p);
    else s.add(p);
    setSelectedPlatforms(s);
  };

  const applyTemplate = (tpl) => {
    setSelectedTemplate(tpl.id);
    setCaption((prev) => (prev.trim() ? `${prev}\n\n${tpl.caption}` : tpl.caption));
  };

  const pickMedia = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.9,
        allowsEditing: true,
      });
      if (!res.canceled && res.assets?.length) {
        const asset = res.assets[0];
        setMediaUri(asset.uri);
        if (asset.width && asset.height) setMediaRatio(asset.width / asset.height);
      }
    } catch (e) {
      Alert.alert("Picker error", String(e?.message || e));
    }
  };

  const clearMedia = () => {
    setMediaUri(null);
    setMediaRatio(1);
  };

  const canPreview = selectedPlatforms.size > 0 && caption.trim() && mediaUri;

  /* Preview cards derived from platform */
  const previews = useMemo(() => {
    if (!canPreview) return [];
    return [...selectedPlatforms].map((p) => ({
      platform: p,
      color: PLATFORM_COLORS[p],
      boxStyle: getPreviewBoxStyleForPlatform(p),
    }));
  }, [selectedPlatforms, caption, mediaUri, canPreview]);

  /* ---- Schedule helpers ---- */
  const openScheduler = () => {
    if (!canPreview) {
      Alert.alert("Missing info", "Pick platform(s), upload media, and write a caption first.");
      return;
    }
    setScheduledAt(null);
    setUseCustom(false);
    const now = new Date();
    setCustomDate(now);
    setCustomTime(now);
    setScheduleOpen(true);
  };

  const closeScheduler = () => setScheduleOpen(false);

  const quickSet = (date) => {
    setScheduledAt(date);
    setUseCustom(false);
  };

  const confirmSchedule = () => {
    let when = scheduledAt;
    if (!when && useCustom) {
      when = combineDateAndTime(customDate, customTime);
    }
    if (!when) {
      Alert.alert("Pick a time", "Choose a quick option or set a custom date & time.");
      return;
    }
    if (when < new Date()) {
      Alert.alert("Invalid time", "Schedule must be in the future.");
      return;
    }
    setScheduleOpen(false);
    Alert.alert(
      "Scheduled (mock)",
      `Will schedule for ${when.toLocaleString()} on ${[...selectedPlatforms].join(", ")}`
    );
  };

  /* Quick options */
  const tonight6pm = () => atTodayOrTomorrow(18, 0);
  const tomorrow10am = () => addDaysAtTime(new Date(), 1, 10, 0);
  const nextMon9am = () => nextWeekdayAtTime(1, 9, 0); // Monday = 1 (Mon)
  const in30min = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    return d;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: 110, paddingBottom: 90, gap: SPACING }}
      showsVerticalScrollIndicator={false}
    >
      {/* Title */}
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Create</Text>
        <Text style={styles.subtitle}>Pick a template, choose platforms, add media, and preview.</Text>
      </View>

      {/* Templates */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Templates</Text>
        <Text style={styles.sectionHint}>Tap to apply</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: SPACING, gap: 12 }}
      >
        {TEMPLATES.map((t) => (
          <TouchableOpacity
            key={t.id}
            activeOpacity={0.9}
            onPress={() => applyTemplate(t)}
            style={[
              styles.card,
              styles.templateCard,
              selectedTemplate === t.id && styles.cardSelected,
            ]}
          >
            <Text style={styles.templateName}>{t.name}</Text>
            <Text style={styles.templateCaption} numberOfLines={2}>
              {t.caption}
            </Text>
            <Text style={styles.templateNote}>{t.note}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Platforms */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Platforms</Text>
        <Text style={styles.sectionHint}>Choose one or more</Text>
      </View>
      <View style={[styles.card, { paddingVertical: 10 }]}>
        <View style={styles.platformRow}>
          {ALL_PLATFORMS.map((p) => {
            const active = selectedPlatforms.has(p);
            return (
              <TouchableOpacity
                key={p}
                onPress={() => togglePlatform(p)}
                activeOpacity={0.9}
                style={[
                  styles.chip,
                  { borderColor: PLATFORM_COLORS[p] },
                  active && { backgroundColor: "#DBEAFE", borderColor: "#93C5FD" },
                ]}
              >
                <Text style={[styles.chipText, active && { color: "#1E3A8A", fontWeight: "700" }]}>
                  {p}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Media uploader */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Upload Content</Text>
        <Text style={styles.sectionHint}>Images or videos from your library</Text>
      </View>
      <View style={styles.card}>
        {mediaUri ? (
          <>
            <View style={styles.mediaHeader}>
              <Text style={styles.mediaMeta}>
                Selected • Ratio {mediaRatio.toFixed(2)}:1
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity onPress={pickMedia} style={styles.ghostBtn} activeOpacity={0.9}>
                  <Text style={styles.ghostBtnText}>Replace</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={clearMedia} style={styles.ghostDanger} activeOpacity={0.9}>
                  <Text style={styles.ghostDangerText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.selectedMediaBox}>
              <Image
                source={{ uri: mediaUri }}
                style={{ width: "100%", height: "100%", borderRadius: 12 }}
                resizeMode="cover"
              />
            </View>
          </>
        ) : (
          <TouchableOpacity onPress={pickMedia} activeOpacity={0.95} style={styles.uploadBtn}>
            <Text style={styles.uploadBtnText}>+ Pick from Library</Text>
            <Text style={styles.uploadSub}>Allows crop/edit • High quality</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Caption */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Caption</Text>
        <Text style={styles.sectionHint}>Write your copy</Text>
      </View>
      <View style={styles.card}>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Write a caption…"
          placeholderTextColor="#94A3B8"
          multiline
          style={styles.input}
        />
        <View style={styles.captionActions}>
          <TouchableOpacity
            onPress={() => setCaption("")}
            style={styles.ghostBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.ghostBtnText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              setCaption((c) =>
                `${c}${c && !c.endsWith("\n") ? "\n" : ""}\n#hashtag #another`
              )
            }
            style={styles.ghostBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.ghostBtnText}>Add Hashtags</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Preview */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Preview</Text>
        <Text style={styles.sectionHint}>
          {canPreview ? "Per-platform framing" : "Pick platform(s), media, and caption"}
        </Text>
      </View>

      {canPreview ? (
        <View style={{ gap: 12 }}>
          {previews.map((pv) => (
            <View key={pv.platform} style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={styles.row}>
                  <View style={[styles.platformDot, { backgroundColor: pv.color }]} />
                  <Text style={styles.previewPlatform}>{pv.platform}</Text>
                </View>
                <Text style={styles.previewBadge}>Preview</Text>
              </View>

              <View style={[styles.mediaFrame, pv.boxStyle]}>
                <Image source={{ uri: mediaUri }} style={styles.mediaFramedImage} resizeMode="cover" />
              </View>

              <Text style={styles.previewCaption}>{caption}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.card, styles.centerCard]}>
          <Text style={styles.emptyText}>
            Choose platform(s), upload media, and add a caption to preview.
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          onPress={() => {
            if (!canPreview) return Alert.alert("Missing info", "Complete your post details first.");
            Alert.alert("Mock Publish", `Would publish to: ${[...selectedPlatforms].join(", ")}`);
          }}
          activeOpacity={0.95}
          style={styles.primaryBtn}
        >
          <Text style={styles.primaryBtnText}>Publish</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={openScheduler}
          activeOpacity={0.95}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryBtnText}>
            {scheduledAt ? `Scheduled • ${scheduledAt.toLocaleString()}` : "Schedule"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Schedule Modal */}
      <Modal animationType="slide" transparent visible={scheduleOpen} onRequestClose={closeScheduler}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>Schedule Post</Text>
              <TouchableOpacity onPress={closeScheduler} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>Quick options</Text>
            <View style={styles.quickRow}>
              <QuickChip label="Tonight 6PM" onPress={() => quickSet(tonight6pm())} />
              <QuickChip label="Tomorrow 10AM" onPress={() => quickSet(tomorrow10am())} />
            </View>
            <View style={styles.quickRow}>
              <QuickChip label="Next Mon 9AM" onPress={() => quickSet(nextMon9am())} />
              <QuickChip label="In 30 min" onPress={() => quickSet(in30min())} />
            </View>

            <View style={styles.divider} />

            <TouchableOpacity
              onPress={() => {
                setUseCustom(true);
                setScheduledAt(null);
              }}
              style={[styles.ghostBtn, { alignSelf: "flex-start" }]}
            >
              <Text style={styles.ghostBtnText}>{useCustom ? "Custom (editing)" : "Pick Custom"}</Text>
            </TouchableOpacity>

            {useCustom && (
              <View style={{ gap: 10, marginTop: 8 }}>
                <Text style={styles.modalHint}>Select date</Text>
                <DateTimePicker
                  value={customDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_, d) => d && setCustomDate(d)}
                  style={{ alignSelf: "stretch" }}
                />
                <Text style={styles.modalHint}>Select time</Text>
                <DateTimePicker
                  value={customTime}
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_, d) => d && setCustomTime(d)}
                  style={{ alignSelf: "stretch" }}
                />
              </View>
            )}

            {!!scheduledAt && !useCustom && (
              <View style={styles.selectedRow}>
                <Text style={styles.selectedText}>
                  Selected: {scheduledAt.toLocaleString()}
                </Text>
                <TouchableOpacity onPress={() => setScheduledAt(null)}>
                  <Text style={[styles.ghostDangerText, { fontWeight: "800" }]}>Clear</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={closeScheduler} style={styles.modalSecondary}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmSchedule} style={styles.modalPrimary}>
                <Text style={styles.primaryBtnText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

/* ---- UI bits ---- */
const QuickChip = ({ label, onPress }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={styles.quickChip}>
    <Text style={styles.quickChipText}>{label}</Text>
  </TouchableOpacity>
);

/* ---- Helpers ---- */
function getPreviewBoxStyleForPlatform(platform) {
  switch (platform) {
    case "Instagram": return { aspectRatio: 1 / 1 };
    case "TikTok": return { aspectRatio: 9 / 16 };
    case "YouTube": return { aspectRatio: 16 / 9 };
    case "X (Twitter)": return { aspectRatio: 16 / 9 };
    case "Facebook": return { aspectRatio: 4 / 5 };
    default: return { aspectRatio: 1 / 1 };
  }
}
function combineDateAndTime(d, t) {
  const out = new Date(d);
  out.setHours(t.getHours(), t.getMinutes(), 0, 0);
  return out;
}
function atTodayOrTomorrow(hour, min) {
  const d = new Date();
  d.setHours(hour, min, 0, 0);
  if (d < new Date()) d.setDate(d.getDate() + 1);
  return d;
}
function addDaysAtTime(base, days, hour, min) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(hour, min, 0, 0);
  return d;
}
function nextWeekdayAtTime(weekdayMon1, hour, min) {
  // weekdayMon1: Mon=1 ... Sun=7
  const now = new Date();
  const day = now.getDay(); // Sun=0..Sat=6
  const currentMon1 = day === 0 ? 7 : day;
  let diff = weekdayMon1 - currentMon1;
  if (diff <= 0) diff += 7;
  const next = new Date(now);
  next.setDate(now.getDate() + diff);
  next.setHours(hour, min, 0, 0);
  return next;
}

/* ---- Styles ---- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },

  headerBlock: { paddingHorizontal: SPACING, gap: 4 },
  title: { fontSize: 22, fontWeight: "800", color: "#0F172A" },
  subtitle: { fontSize: 13, color: "#64748B" },

  sectionHeader: {
    paddingHorizontal: SPACING,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
  sectionHint: { fontSize: 12, color: "#6B7280" },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: RADIUS,
    padding: SPACING,
    marginHorizontal: SPACING,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardSelected: { borderColor: "#93C5FD", backgroundColor: "#F8FAFF" },

  templateCard: { width: 260, gap: 6 },
  templateName: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  templateCaption: { fontSize: 12, color: "#334155" },
  templateNote: { fontSize: 11, color: "#64748B" },

  platformRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  chipText: { fontSize: 13, color: "#1F2937" },

  uploadBtn: {
    borderStyle: "dashed",
    borderWidth: 2,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    paddingVertical: 24,
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F8FAFF",
  },
  uploadBtnText: { color: "#2563EB", fontWeight: "800", fontSize: 14 },
  uploadSub: { color: "#64748B", fontSize: 12 },

  mediaHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  mediaMeta: { color: "#64748B", fontSize: 12, fontWeight: "600" },
  selectedMediaBox: {
    width: "100%",
    height: 240,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F1F5F9",
  },

  ghostBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ghostBtnText: { color: "#0F172A", fontWeight: "700" },
  ghostDanger: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ghostDangerText: { color: "#B91C1C", fontWeight: "700" },

  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#111827",
    minHeight: 100,
    textAlignVertical: "top",
  },
  captionActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    justifyContent: "flex-end",
  },

  row: { flexDirection: "row", alignItems: "center" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  platformDot: { width: 10, height: 10, borderRadius: 10, marginRight: 8 },

  mediaFrame: {
    width: "100%",
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    backgroundColor: "#F1F5F9",
  },
  mediaFramedImage: { width: "100%", height: "100%" },

  previewPlatform: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  previewBadge: {
    backgroundColor: "#EEF2FF",
    borderColor: "#C7D2FE",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    color: "#3730A3",
    fontWeight: "800",
    overflow: "hidden",
  },
  previewCaption: { marginTop: 10, color: "#334155", fontSize: 13 },

  centerCard: { alignItems: "center" },
  emptyText: { color: "#64748B", fontSize: 13, textAlign: "center" },

  actionsRow: {
    paddingHorizontal: SPACING,
    flexDirection: "row",
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flex: 1,
  },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "800", textAlign: "center", fontSize: 14 },
  secondaryBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flex: 1,
  },
  secondaryBtnText: { color: "#2563EB", fontWeight: "800", textAlign: "center", fontSize: 14 },

  /* Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    padding: SPACING,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  modalClose: { padding: 6, marginRight: -6 },
  modalCloseText: { fontSize: 18, color: "#334155" },
  modalHint: { fontSize: 12, color: "#64748B", marginTop: 4 },

  quickRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  quickChip: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  quickChipText: { color: "#0F172A", fontWeight: "700", fontSize: 12 },

  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 10,
  },

  selectedRow: {
    marginTop: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectedText: { color: "#0F172A", fontWeight: "700" },

  modalActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  modalPrimary: {
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    borderRadius: 12,
    flex: 1,
    alignItems: "center",
  },
  modalSecondary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#2563EB",
    paddingVertical: 12,
    borderRadius: 12,
    flex: 1,
    alignItems: "center",
  },
});
