// app/(tabs)/calendar.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";

type PlatformEnum = "facebook" | "instagram";
type PostStatusEnum = "draft" | "scheduled" | "posting" | "posted" | "failed" | "canceled";

type ScheduledRow = {
  id: string;
  user_id: string;
  platform: PlatformEnum;
  target_id: string;
  post_id: string | null;
  caption: string | null;
  post_type: string;
  status: PostStatusEnum;
  scheduled_at: string | null; // ISO
  posted_at: string | null;
  permalink: string | null;
  error_message: string | null;
};

const BG = "#F8FAFC";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E5E7EB";
const SOFT = "#EEF2F7";
const TINT = "#111827";

function zeroPad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function ymd(d: Date) { return `${d.getFullYear()}-${zeroPad(d.getMonth() + 1)}-${zeroPad(d.getDate())}`; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addMonths(d: Date, delta: number) { return new Date(d.getFullYear(), d.getMonth() + delta, 1); }
function daysInMonth(d: Date) { return endOfMonth(d).getDate(); }
function trunc(s: string, n: number) { const t = s.trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; }

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const [cursor, setCursor] = useState<Date>(startOfMonth(new Date()));
  const [selected, setSelected] = useState<string>(ymd(new Date()));
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ScheduledRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) { Alert.alert("Sign in required", "Please sign in."); return; }

      setLoading(true);
      try {
        const min = addMonths(startOfMonth(new Date()), -6);
        const max = addMonths(startOfMonth(new Date()), +7);
        const { data: sched, error } = await supabase
          .from("scheduled_posts")
          .select("id,user_id,platform,target_id,post_id,caption,post_type,status,scheduled_at,posted_at,permalink,error_message")
          .eq("user_id", user.id)
          .gte("scheduled_at", min.toISOString())
          .lte("scheduled_at", new Date(max.getFullYear(), max.getMonth(), 0, 23, 59, 59).toISOString())
          .order("scheduled_at", { ascending: true });
        if (error) throw error;
        setRows((sched || []) as any);
      } catch (e: any) {
        console.error(e);
        Alert.alert("Error", e?.message ?? "Failed to load calendar.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const byDate = useMemo(() => {
    const m = new Map<string, ScheduledRow[]>();
    for (const r of rows) {
      const dt = r.scheduled_at ? new Date(r.scheduled_at) : null;
      if (!dt) continue;
      const key = ymd(dt);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return m;
  }, [rows]);

  const selectedList = byDate.get(selected) || [];

  // Build grid for current month
  const monthStart = startOfMonth(cursor);
  const firstWeekday = (monthStart.getDay() + 6) % 7; // Mon start
  const totalDays = daysInMonth(cursor);
  const cells: Array<{ date: Date | null; key: string }> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ date: null, key: `b-${i}` });
  for (let d = 1; d <= totalDays; d++) {
    const dayDate = new Date(cursor.getFullYear(), cursor.getMonth(), d);
    cells.push({ date: dayDate, key: ymd(dayDate) });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, key: `a-${cells.length}` });
  while (cells.length < 42) cells.push({ date: null, key: `a2-${cells.length}` });

  const todayKey = ymd(new Date());

  // Sizing to make grid fill most of screen
  const screenW = Dimensions.get("window").width;
  const horizontalPad = 16 * 2; // container padding
  const cellW = (screenW - horizontalPad - 1) / 7; // −1 to avoid wrap from borders
  const cellH = cellW * 1.15;                        // a bit taller like the screenshot
  const rowsCount = Math.ceil(cells.length / 7);     // 5 or 6
  const gridHeight = rowsCount * cellH;

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: headerHeight + insets.top + 8, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator />
        <Text style={{ color: MUTED, marginTop: 8 }}>Loading calendar…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: headerHeight + insets.top + 8 }]}>
      {/* Month header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            const m = addMonths(cursor, -1);
            setCursor(m);
            setSelected(ymd(new Date(m.getFullYear(), m.getMonth(), 1)));
          }}
          style={styles.navBtn}
        >
          <FontAwesome name="chevron-left" size={14} color={TEXT} />
        </TouchableOpacity>
        <Text style={styles.title}>
          {cursor.toLocaleString(undefined, { month: "long" })} {cursor.getFullYear()}
        </Text>
        <TouchableOpacity
          onPress={() => {
            const m = addMonths(cursor, +1);
            setCursor(m);
            setSelected(ymd(new Date(m.getFullYear(), m.getMonth(), 1)));
          }}
          style={styles.navBtn}
        >
          <FontAwesome name="chevron-right" size={14} color={TEXT} />
        </TouchableOpacity>
      </View>

      {/* Unified card: grid (top) + day list (bottom) */}
      <View style={[styles.card, { flex: 1 }]}>
        {/* Week headings */}
        <View style={styles.weekRow}>
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((w) => (
            <Text key={w} style={styles.weekLabel}>{w}</Text>
          ))}
        </View>

        {/* Grid fills most of the screen */}
        <View style={[styles.grid, { height: gridHeight }]}>
          {cells.map((c, idx) => {
            if (!c.date) {
              return <View key={c.key} style={[styles.cellBlank, { width: cellW, height: cellH }]} />;
            }
            const key = ymd(c.date);
            const list = byDate.get(key) || [];
            const isToday = key === todayKey;
            const isSelected = key === selected;

            const dueCount = list.filter((r) => r.status === "scheduled" || r.status === "posting").length;
            const pastCount = list.filter((r) => ["posted","failed","canceled"].includes(r.status)).length;

            const firstCaption = list.find((r) => (r.caption || "").trim().length > 0)?.caption || "";

            return (
              <TouchableOpacity
                key={c.key}
                onPress={() => setSelected(key)}
                style={[styles.cell, { width: cellW, height: cellH }]}
                activeOpacity={0.8}
              >
                <View style={[
                  styles.dayBubble,
                  isToday && !isSelected && styles.dayBubbleToday,
                  isSelected && styles.dayBubbleSelected,
                ]}>
                  <Text style={[
                    styles.dayNum,
                    isToday && !isSelected && styles.dayNumToday,
                    isSelected && styles.dayNumSelected,
                  ]}>
                    {c.date.getDate()}
                  </Text>
                </View>

                <View style={styles.dotRow}>
                  {dueCount > 0 && <View style={[styles.dot,{ backgroundColor:"#22C55E"}]} />}
                  {pastCount > 0 && <View style={[styles.dot,{ backgroundColor:"#9CA3AF"}]} />}
                </View>

                {/* Show a small caption pill if there is one (like “Code Posi…”) */}
                {firstCaption ? (
                  <View style={styles.captionPill}>
                    <Text numberOfLines={1} style={styles.captionPillText}>{trunc(firstCaption, 14)}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Day details (no month-jump footer) */}
        <View style={styles.bottomSheet}>
          <View style={styles.bottomHeader}>
            <Text style={styles.bottomTitle}>
              {new Date(selected).toLocaleDateString(undefined,{ month:"short", day:"numeric", year:"numeric" })}
            </Text>
            <Text style={styles.countPill}>{selectedList.length} items</Text>
          </View>

          {selectedList.length === 0 ? (
            <Text style={{ color: MUTED, marginTop: 6 }}>No posts on this date.</Text>
          ) : (
            <FlatList
              data={selectedList}
              keyExtractor={(i) => i.id}
              ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
              renderItem={({ item }) => {
                const time = item.scheduled_at ? new Date(item.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
                const isDue = item.status === "scheduled" || item.status === "posting";
                const dotColor = isDue ? "#22C55E" : item.status === "posted" ? "#111827" : "#9CA3AF";
                const icon = item.platform === "instagram"
                  ? <FontAwesome name="instagram" size={16} color="#C13584" />
                  : <FontAwesome name="facebook-square" size={16} color="#1877F2" />;

                return (
                  <TouchableOpacity onPress={() => item.post_id && router.push(`/post/${item.post_id}`)} activeOpacity={0.8} style={styles.itemRow}>
                    <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                    <View style={{ marginHorizontal: 8 }}>{icon}</View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={2} style={styles.itemCaption}>{item.caption || "(no caption)"}</Text>
                      <Text style={styles.itemMeta}>{time} • {item.status.toUpperCase()}</Text>
                    </View>
                    {item.permalink ? <FontAwesome name="external-link" size={16} color={MUTED} /> : null}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, paddingHorizontal: 16 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  navBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#fff",
  },
  title: { fontSize: 18, fontWeight: "800", color: TEXT },

  card: {
    borderRadius: 18,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },

  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: SOFT,
    backgroundColor: "#fff",
  },
  weekLabel: { width: `${100/7}%`, textAlign: "center", color: MUTED, fontSize: 12, fontWeight: "700" },

  grid: {
    backgroundColor: "#fff",
    flexWrap: "wrap",
    flexDirection: "row",
  },
  cellBlank: {
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderColor: SOFT,
  },
  cell: {
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderColor: SOFT,
    alignItems: "center",
    paddingTop: 6,
  },

  dayBubble: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dayBubbleToday: { backgroundColor: "#F3F4F6" },
  dayBubbleSelected: { backgroundColor: TINT },
  dayNum: { fontWeight: "800", color: TEXT, fontSize: 13 },
  dayNumToday: { color: "#111827" },
  dayNumSelected: { color: "#fff" },

  dotRow: { flexDirection: "row", gap: 4, marginTop: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },

  // small badge for first caption
  captionPill: {
    position: "absolute",
    right: 4,
    bottom: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: "95%",
  },
  captionPillText: { fontSize: 10, fontWeight: "700", color: "#111827" },

  bottomSheet: {
    borderTopWidth: 1,
    borderTopColor: SOFT,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12, // compact; no jump-to-month
    backgroundColor: "#fff",
    flexGrow: 1,
    minHeight: 120,
  },
  bottomHeader: { flexDirection: "row", alignItems: "center" },
  bottomTitle: { fontWeight: "800", color: TEXT, fontSize: 15 },
  countPill: {
    marginLeft: "auto",
    backgroundColor: "#F3F4F6",
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    color: TEXT,
    fontWeight: "700",
    fontSize: 12,
  },

  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: SOFT,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  itemCaption: { color: TEXT, fontWeight: "700", fontSize: 13 },
  itemMeta: { color: MUTED, fontSize: 12, marginTop: 2 },
});
