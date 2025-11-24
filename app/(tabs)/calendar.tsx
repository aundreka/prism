// app/(tabs)/calendar.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  NativeTouchEvent,
  GestureResponderEvent,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import {
  getTimeSegmentRecommendations,
  TimeSegmentRecommendation,
} from "@/lib/timeRecommendations";

type PlatformEnum = "facebook" | "instagram";
type PostStatusEnum =
  | "draft"
  | "scheduled"
  | "posting"
  | "posted"
  | "failed"
  | "canceled";

type ScheduledRow = {
  id: string;
  user_id: string;
  platform: PlatformEnum;
  target_id: string;
  post_id: string | null;
  caption: string | null;
  post_type: string;
  status: PostStatusEnum;
  scheduled_at: string | null;
  posted_at: string | null;
  permalink: string | null;
  error_message: string | null;
};

type PageOption = {
  id: string;
  label: string;
  platform: PlatformEnum;
};

const BG = "#F8FAFC";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E5E7EB";
const SOFT = "#EEF2F7";
const TINT = "#111827";

function zeroPad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${zeroPad(d.getMonth() + 1)}-${zeroPad(
    d.getDate()
  )}`;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}
function daysInMonth(d: Date) {
  return endOfMonth(d).getDate();
}
function addDays(d: Date, delta: number) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + delta);
  return nd;
}
function trunc(s: string, n: number) {
  const t = s.trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}
function formatHourLabel(hour: number) {
  const h = Math.max(0, Math.min(23, hour));
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:00 ${ampm}`;
}
function formatTimeWithDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Yellow/green gradient with white at 0
function scoreToGradientColor(score: number, maxScore: number) {
  if (!maxScore || score <= 0) return "#FFFFFF";

  const t = Math.max(0, Math.min(1, score / maxScore));

  const hsl = (
    h1: number,
    s1: number,
    l1: number,
    h2: number,
    s2: number,
    l2: number,
    tt: number
  ) => {
    const h = h1 + (h2 - h1) * tt;
    const s = s1 + (s2 - s1) * tt;
    const l = l1 + (l2 - l1) * tt;
    return `hsl(${h}, ${s}%, ${l}%)`;
  };

  if (t < 0.5) {
    const tt = t / 0.5;
    return hsl(55, 15, 98, 52, 85, 85, tt);
  } else {
    const tt = (t - 0.5) / 0.5;
    return hsl(52, 85, 85, 125, 65, 78, tt);
  }
}

type HourSlot = { hour: number; rec?: TimeSegmentRecommendation };

function getRecScore(rec?: TimeSegmentRecommendation | undefined): number {
  if (!rec) return 0;
  return rec.hybridSample ?? 0;
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();

  const [cursor, setCursor] = useState<Date>(startOfMonth(new Date()));
  const [selected, setSelected] = useState<string>(ymd(new Date()));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<ScheduledRow[]>([]);

  const [viewMode, setViewMode] = useState<"month" | "day">("month");
  const [recs, setRecs] = useState<TimeSegmentRecommendation[]>([]);
  const [recError, setRecError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [sortMode, setSortMode] = useState<"time" | "score">("time");

  const [pages, setPages] = useState<PageOption[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | "all">("all");

  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const SWIPE_THRESHOLD = 40;

  const selectedDate = useMemo(() => {
    const [y, m, d] = selected.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }, [selected]);

  const fetchAll = useCallback(
    async (opts?: { isRefresh?: boolean }) => {
      const isRefresh = opts?.isRefresh ?? false;
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        if (!user) {
          Alert.alert("Sign in required", "Please sign in.");
          return;
        }

        const min = addMonths(startOfMonth(new Date()), -6);
        const max = addMonths(startOfMonth(new Date()), +7);
        const { data: sched, error } = await supabase
          .from("scheduled_posts")
          .select(
            "id,user_id,platform,target_id,post_id,caption,post_type,status,scheduled_at,posted_at,permalink,error_message"
          )
          .eq("user_id", user.id)
          .gte("scheduled_at", min.toISOString())
          .lte(
            "scheduled_at",
            new Date(
              max.getFullYear(),
              max.getMonth(),
              0,
              23,
              59,
              59
            ).toISOString()
          )
          .order("scheduled_at", { ascending: true });

        if (error) throw error;
        setRows((sched || []) as any);

        const { data: conns, error: connsErr } = await supabase
          .from("connected_meta_accounts")
          .select("page_id,page_name,ig_user_id,ig_username,is_active")
          .eq("user_id", user.id)
          .eq("is_active", true);

        if (connsErr) {
          console.log("connected_meta_accounts error:", connsErr);
        } else {
          const opts: PageOption[] = [];
          (conns || []).forEach((c: any) => {
            if (c.page_id) {
              opts.push({
                id: c.page_id,
                label: c.page_name || c.page_id,
                platform: "facebook",
              });
            }
            if (c.ig_user_id) {
              opts.push({
                id: c.ig_user_id,
                label: c.ig_username || c.ig_user_id,
                platform: "instagram",
              });
            }
          });
          setPages(opts);
          if (opts.length === 1) {
            setSelectedPageId(opts[0].id);
          } else {
            setSelectedPageId("all");
          }
        }

        setRecError(null);
        try {
          const recsData = await getTimeSegmentRecommendations("facebook", {
            horizonDays: 7,
            weightModel: 0.7,
            weightBandit: 0.3,
          });
          setRecs(recsData);
        } catch (err: any) {
          console.log("getTimeSegmentRecommendations error:", err);
          setRecError(err?.message ?? "Could not load recommendations.");
          setRecs([]);
        }
      } catch (e: any) {
        console.error(e);
        Alert.alert("Error", e?.message ?? "Failed to load calendar.");
      } finally {
        if (isRefresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRefresh = useCallback(() => {
    fetchAll({ isRefresh: true });
  }, [fetchAll]);

  const pageMetaByTargetId = useMemo(() => {
    const m = new Map<
      string,
      {
        label: string;
        platform: PlatformEnum;
      }
    >();
    for (const p of pages) {
      m.set(p.id, { label: p.label, platform: p.platform });
    }
    return m;
  }, [pages]);

  const filteredRows = useMemo(() => {
    if (selectedPageId === "all") return rows;
    return rows.filter((r) => r.target_id === selectedPageId);
  }, [rows, selectedPageId]);

  const byDate = useMemo(() => {
    const m = new Map<string, ScheduledRow[]>();
    for (const r of filteredRows) {
      const dt = r.scheduled_at ? new Date(r.scheduled_at) : null;
      if (!dt) continue;
      const key = ymd(dt);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return m;
  }, [filteredRows]);

  const selectedList = byDate.get(selected) || [];

  const recsByDow = useMemo(() => {
    const m = new Map<number, TimeSegmentRecommendation[]>();
    for (const r of recs) {
      if (!m.has(r.dow)) m.set(r.dow, []);
      m.get(r.dow)!.push(r);
    }
    return m;
  }, [recs]);

  const hourlySlots: HourSlot[] = useMemo(() => {
    const jsDow = selectedDate.getDay();
    const list = recsByDow.get(jsDow) || [];
    const bestByHour = new Map<number, TimeSegmentRecommendation>();

    for (const r of list) {
      const existing = bestByHour.get(r.hour);
      const s = getRecScore(r);
      const sExisting = existing ? getRecScore(existing) : 0;
      if (!existing || s > sExisting) {
        bestByHour.set(r.hour, r);
      }
    }

    const result: HourSlot[] = [];
    for (let h = 0; h < 24; h++) {
      result.push({ hour: h, rec: bestByHour.get(h) });
    }
    return result;
  }, [recsByDow, selectedDate]);

  const maxScore = useMemo(() => {
    let max = 0;
    for (const slot of hourlySlots) {
      const s = getRecScore(slot.rec);
      if (s > max) max = s;
    }
    return max;
  }, [hourlySlots]);

  const slotsToRender: HourSlot[] = useMemo(() => {
    const base = [...hourlySlots];
    if (sortMode === "time") {
      return base.sort((a, b) => a.hour - b.hour);
    }
    return base.sort((a, b) => {
      const sa = getRecScore(a.rec);
      const sb = getRecScore(b.rec);
      if (sb !== sa) return sb - sa;
      return a.hour - b.hour;
    });
  }, [hourlySlots, sortMode]);

  const monthStart = startOfMonth(cursor);
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const totalDays = daysInMonth(cursor);
  const cells: Array<{ date: Date | null; key: string }> = [];

  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ date: null, key: `b-${i}` });
  }
  for (let d = 1; d <= totalDays; d++) {
    const dayDate = new Date(cursor.getFullYear(), cursor.getMonth(), d);
    cells.push({ date: dayDate, key: ymd(dayDate) });
  }
  while (cells.length % 7 !== 0)
    cells.push({ date: null, key: `a-${cells.length}` });
  while (cells.length < 42)
    cells.push({ date: null, key: `a2-${cells.length}` });

  const todayKey = ymd(new Date());

  const handleTouchStart = (e: GestureResponderEvent) => {
    const evt = e.nativeEvent as NativeTouchEvent;
    setTouchStartX(evt.pageX);
  };

  const handleMonthTouchEnd = (e: GestureResponderEvent) => {
    if (touchStartX == null) return;
    const evt = e.nativeEvent as NativeTouchEvent;
    const dx = evt.pageX - touchStartX;
    setTouchStartX(null);
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;

    if (dx < 0) {
      const m = addMonths(cursor, +1);
      setCursor(m);
      setSelected(ymd(new Date(m.getFullYear(), m.getMonth(), 1)));
    } else {
      const m = addMonths(cursor, -1);
      setCursor(m);
      setSelected(ymd(new Date(m.getFullYear(), m.getMonth(), 1)));
    }
  };

  const handleDayTouchEnd = (e: GestureResponderEvent) => {
    if (touchStartX == null) return;
    const evt = e.nativeEvent as NativeTouchEvent;
    const dx = evt.pageX - touchStartX;
    setTouchStartX(null);
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;

    if (dx < 0) {
      const d = addDays(selectedDate, +1);
      setSelected(ymd(d));
    } else {
      const d = addDays(selectedDate, -1);
      setSelected(ymd(d));
    }
  };

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          {
            paddingTop: headerHeight + insets.top + 8,
            paddingBottom: insets.bottom + tabBarHeight + 12,
            alignItems: "center",
            justifyContent: "center",
          },
        ]}
      >
        <ActivityIndicator />
        <Text style={{ color: MUTED, marginTop: 8 }}>Loading calendar…</Text>
      </View>
    );
  }

  const activePageFilterLabel =
    selectedPageId === "all"
      ? "All pages"
      : pageMetaByTargetId.get(selectedPageId)?.label ?? "This page";

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: headerHeight + insets.top + 8,
          paddingBottom: insets.bottom + tabBarHeight + 12,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>
          {cursor.toLocaleString(undefined, { month: "long" })}{" "}
          {cursor.getFullYear()}
        </Text>
      </View>

      {viewMode === "month" ? (
        <FlatList
          data={[]}
          keyExtractor={(_, index) => `month-${index}`}
          contentContainerStyle={{ paddingBottom: 16 }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleMonthTouchEnd}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListHeaderComponent={
            <View style={styles.card}>
              <View style={styles.modeToggleRow}>
                <TouchableOpacity
                  onPress={() => setViewMode("month")}
                  style={[
                    styles.modeTab,
                    viewMode === "month" && styles.modeTabActive,
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.modeTabText,
                      viewMode === "month" && styles.modeTabTextActive,
                    ]}
                  >
                    Monthly
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setViewMode("day")}
                  style={[
                    styles.modeTab,
                    viewMode === "day" && styles.modeTabActive,
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.modeTabText,
                      viewMode === "day" && styles.modeTabTextActive,
                    ]}
                  >
                    Daily
                  </Text>
                </TouchableOpacity>
              </View>

              {pages.length > 0 && (
                <View style={styles.pageFilterRow}>
                  <Text style={styles.pageFilterLabel}>Page</Text>
                  <View style={styles.pageFilterChips}>
                    {pages.length > 1 && (
                      <TouchableOpacity
                        style={[
                          styles.pageChip,
                          selectedPageId === "all" && styles.pageChipActive,
                        ]}
                        onPress={() => setSelectedPageId("all")}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.pageChipText,
                            selectedPageId === "all" &&
                              styles.pageChipTextActive,
                          ]}
                        >
                          All
                        </Text>
                      </TouchableOpacity>
                    )}
                    {pages.map((p) => (
                      <TouchableOpacity
                        key={`${p.platform}-${p.id}`}
                        style={[
                          styles.pageChip,
                          selectedPageId === p.id && styles.pageChipActive,
                        ]}
                        onPress={() => setSelectedPageId(p.id)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.pageChipText,
                            selectedPageId === p.id &&
                              styles.pageChipTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.monthContainer}>
                <View style={styles.weekRow}>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                    (w) => (
                      <Text key={w} style={styles.weekLabel}>
                        {w}
                      </Text>
                    )
                  )}
                </View>

                <View style={styles.grid}>
                  {cells.map((c) => {
                    if (!c.date) {
                      return <View key={c.key} style={styles.cellBlank} />;
                    }

                    const key = ymd(c.date);
                    const list = byDate.get(key) || [];
                    const isToday = key === todayKey;
                    const isSelected = key === selected;

                    const dueCount = list.filter(
                      (r) =>
                        r.status === "scheduled" || r.status === "posting"
                    ).length;
                    const pastCount = list.filter((r) =>
                      ["posted", "failed", "canceled"].includes(r.status)
                    ).length;

                    return (
                      <TouchableOpacity
                        key={c.key}
                        onPress={() => setSelected(key)}
                        style={styles.cell}
                        activeOpacity={0.8}
                      >
                        <View
                          style={[
                            styles.dayBubble,
                            isToday && !isSelected && styles.dayBubbleToday,
                            isSelected && styles.dayBubbleSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayNum,
                              isToday && !isSelected && styles.dayNumToday,
                              isSelected && styles.dayNumSelected,
                            ]}
                          >
                            {c.date.getDate()}
                          </Text>
                        </View>

                        <View style={styles.dotRow}>
                          {dueCount > 0 && (
                            <View
                              style={[
                                styles.dot,
                                { backgroundColor: "#22C55E" },
                              ]}
                            />
                          )}
                          {pastCount > 0 && (
                            <View
                              style={[
                                styles.dot,
                                { backgroundColor: "#9CA3AF" },
                              ]}
                            />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.bottomSheet}>
                  <View style={styles.bottomHeader}>
                    <Text style={styles.bottomTitle}>
                      {selectedDate.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </Text>
                    <Text style={styles.countPill}>
                      {selectedList.length} items
                    </Text>
                  </View>
                  {pages.length > 0 && (
                    <Text style={styles.bottomSubLabel}>
                      Showing: {activePageFilterLabel}
                    </Text>
                  )}

                  {selectedList.length === 0 ? (
                    <Text style={{ color: MUTED, marginTop: 6 }}>
                      No posts on this date.
                    </Text>
                  ) : (
                    <View style={{ marginTop: 4 }}>
                      {selectedList.map((item, idx) => {
                        const time = item.scheduled_at
                          ? new Date(item.scheduled_at).toLocaleTimeString(
                              [],
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )
                          : "—";
                        const isDue =
                          item.status === "scheduled" ||
                          item.status === "posting";
                        const dotColor = isDue
                          ? "#22C55E"
                          : item.status === "posted"
                          ? "#111827"
                          : "#9CA3AF";
                        const icon =
                          item.platform === "instagram" ? (
                            <FontAwesome
                              name="instagram"
                              size={16}
                              color="#C13584"
                            />
                          ) : (
                            <FontAwesome
                              name="facebook-square"
                              size={16}
                              color="#1877F2"
                            />
                          );

                        const pageMeta = pageMetaByTargetId.get(
                          item.target_id
                        );

                        return (
                          <View
                            key={item.id}
                            style={idx === 0 ? {} : { marginTop: 6 }}
                          >
                            <TouchableOpacity
                              onPress={() =>
                                item.post_id &&
                                router.push(`/post/${item.post_id}`)
                              }
                              activeOpacity={0.8}
                              style={styles.itemRow}
                            >
                              <View
                                style={[
                                  styles.statusDot,
                                  { backgroundColor: dotColor },
                                ]}
                              />
                              <View style={{ marginHorizontal: 8 }}>
                                {icon}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text
                                  numberOfLines={2}
                                  style={styles.itemCaption}
                                >
                                  {item.caption
                                    ? trunc(item.caption, 80)
                                    : "(no caption)"}
                                </Text>
                                <Text style={styles.itemMeta}>
                                  {time} • {item.status.toUpperCase()}
                                  {pageMeta ? ` • ${pageMeta.label}` : ""}
                                </Text>
                              </View>
                              {item.permalink ? (
                                <FontAwesome
                                  name="external-link"
                                  size={16}
                                  color={MUTED}
                                />
                              ) : null}
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>
            </View>
          }
        />
      ) : (
        <FlatList
          data={slotsToRender}
          keyExtractor={(item, index) => `slot-${item.hour}-${index}`}
          contentContainerStyle={{ paddingBottom: 16 }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleDayTouchEnd}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListHeaderComponent={
            <View style={styles.card}>
              <View style={styles.modeToggleRow}>
                <TouchableOpacity
                  onPress={() => setViewMode("month")}
                  style={[
                    styles.modeTab,
                    viewMode === "month" && styles.modeTabActive,
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.modeTabText,
                      viewMode === "month" && styles.modeTabTextActive,
                    ]}
                  >
                    Monthly
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setViewMode("day")}
                  style={[
                    styles.modeTab,
                    viewMode === "day" && styles.modeTabActive,
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.modeTabText,
                      viewMode === "day" && styles.modeTabTextActive,
                    ]}
                  >
                    Daily
                  </Text>
                </TouchableOpacity>
              </View>

              {pages.length > 0 && (
                <View style={styles.pageFilterRow}>
                  <Text style={styles.pageFilterLabel}>Page</Text>
                  <View style={styles.pageFilterChips}>
                    {pages.length > 1 && (
                      <TouchableOpacity
                        style={[
                          styles.pageChip,
                          selectedPageId === "all" && styles.pageChipActive,
                        ]}
                        onPress={() => setSelectedPageId("all")}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.pageChipText,
                            selectedPageId === "all" &&
                              styles.pageChipTextActive,
                          ]}
                        >
                          All
                        </Text>
                      </TouchableOpacity>
                    )}
                    {pages.map((p) => (
                      <TouchableOpacity
                        key={`${p.platform}-${p.id}`}
                        style={[
                          styles.pageChip,
                          selectedPageId === p.id && styles.pageChipActive,
                        ]}
                        onPress={() => setSelectedPageId(p.id)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.pageChipText,
                            selectedPageId === p.id &&
                              styles.pageChipTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.dailyContainer}>
                <View style={styles.dailyHeaderRow}>
                  <Text style={styles.dailyTitle}>
                    {selectedDate.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                </View>

                {pages.length > 0 && (
                  <Text style={styles.bottomSubLabel}>
                    Recommendations use your data across{" "}
                    {activePageFilterLabel.toLowerCase()}.
                  </Text>
                )}

                {recError ? (
                  <Text
                    style={{ color: "#B91C1C", fontSize: 12, marginTop: 8 }}
                  >
                    {recError}
                  </Text>
                ) : (
                  <>
                    {recs.length === 0 ? (
                      <Text
                        style={{ color: MUTED, fontSize: 12, marginTop: 8 }}
                      >
                        No recommendation data yet. Once your posts have
                        engagement, scores for each hour will start to appear
                        here.
                      </Text>
                    ) : null}

                    <View style={styles.dailyInfoRow}>
                      <Text style={styles.dailySubtitle}>
                        Recommended hours (Facebook) for this weekday —{" "}
                        {sortMode === "score"
                          ? "top scores first."
                          : "in chronological order."}
                      </Text>
                      <TouchableOpacity
                        style={styles.infoIconBtn}
                        onPress={() => setShowInfo((v) => !v)}
                        activeOpacity={0.7}
                      >
                        <FontAwesome
                          name="info-circle"
                          size={14}
                          color={showInfo ? "#0EA5E9" : MUTED}
                        />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.sortToggleRow}>
                      <TouchableOpacity
                        style={[
                          styles.sortToggleBtn,
                          sortMode === "time" && styles.sortToggleBtnActive,
                        ]}
                        onPress={() => setSortMode("time")}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.sortToggleText,
                            sortMode === "time" &&
                              styles.sortToggleTextActive,
                          ]}
                        >
                          Time order
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.sortToggleBtn,
                          sortMode === "score" && styles.sortToggleBtnActive,
                        ]}
                        onPress={() => setSortMode("score")}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.sortToggleText,
                            sortMode === "score" &&
                              styles.sortToggleTextActive,
                          ]}
                        >
                          Top scores
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {showInfo && (
                      <View style={styles.dailyMathBox}>
                        <Text style={styles.dailyMathTitle}>
                          How these “best hours” are calculated
                        </Text>

                        <Text style={styles.dailyMathText}>
                          <Text style={styles.mathStep}>
                            1. Engagement rate per hour
                          </Text>
                          {"\n"}
                          Every past post is aggregated into hourly features in{" "}
                          <Text style={styles.codeText}>
                            features_engagement_timeslots
                          </Text>
                          . For each hour:
                        </Text>
                        <Text style={styles.dailyMathFormula}>
                          engagement_rate = (likes + comments + 0.5·saves +
                          0.2·shares) / impressions
                        </Text>

                        <Text style={styles.dailyMathText}>
                          <Text style={styles.mathStep}>
                            2. Normalize to your own performance
                          </Text>
                          {"\n"}
                          We compute your 10th and 90th percentiles of
                          engagement and convert each hour into{" "}
                          <Text style={styles.codeText}>
                            label_engagement
                          </Text>{" "}
                          between 0 and 1:
                        </Text>
                        <Text style={styles.dailyMathFormula}>
                          label_engagement = clamp₀₋₁(
                          (engagement_rate − p10) / (p90 − p10) )
                        </Text>

                        <Text style={styles.dailyMathText}>
                          <Text style={styles.mathStep}>
                            3. Predict each future hour
                          </Text>
                          {"\n"}
                          For each weekday × hour,{" "}
                          <Text style={styles.codeText}>
                            get_time_segment_recommendations
                          </Text>{" "}
                          blends:
                        </Text>
                        <Text style={styles.dailyMathFormula}>
                          predicted_avg ≈ f( label_engagement, recent_7d_avg,
                          global_hourly_priors(industry) )
                        </Text>

                        <Text style={styles.dailyMathText}>
                          <Text style={styles.mathStep}>
                            4. Contextual bandit boost
                          </Text>
                          {"\n"}
                          A Thompson Sampling layer (
                          <Text style={styles.codeText}>
                            v_bandit_params
                          </Text>
                          ) keeps exploring new hours while exploiting strong
                          ones:
                        </Text>
                        <Text style={styles.dailyMathFormula}>
                          final_score = 0.7 · predicted_avg + 0.3 · α / (α + β)
                        </Text>

                        <Text style={styles.dailyMathText}>
                          The color of each slot reflects{" "}
                          <Text style={styles.codeText}>final_score</Text>{" "}
                          (scaled relative to today’s max): stronger colors =
                          stronger expected performance, white = no uplift yet.
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            </View>
          }
          renderItem={({ item }) => {
            const { hour, rec } = item;
            const rawScore = getRecScore(rec);
            const scorePct =
              rawScore > 0 ? `${Math.round(rawScore * 100)}%` : "0%";

            const bgColor = scoreToGradientColor(rawScore, maxScore);
            const sampleCount = (rec as any)?.sample_count ?? 0;

            const postsForHour = selectedList.filter((row) => {
              const tsStr = row.scheduled_at || row.posted_at;
              if (!tsStr) return false;
              const dt = new Date(tsStr);
              return (
                dt.getFullYear() === selectedDate.getFullYear() &&
                dt.getMonth() === selectedDate.getMonth() &&
                dt.getDate() === selectedDate.getDate() &&
                dt.getHours() === hour
              );
            });
            const postsCount = postsForHour.length;
           const postsLabel =
  postsCount > 0
    ? `${postsCount} post${
        postsCount > 1 ? "s" : ""
      } on this day at this hour`
    : "No posts at this hour on this day";
            const slotDate = new Date(
              selectedDate.getFullYear(),
              selectedDate.getMonth(),
              selectedDate.getDate(),
              hour,
              0,
              0,
              0
            );
            const slotIso = slotDate.toISOString();

            return (
              <View style={[styles.slotCard, { backgroundColor: bgColor }]}>
                <View style={styles.slotTextCol}>
                  <Text style={styles.slotHour}>{formatHourLabel(hour)}</Text>
                  <Text style={styles.slotMeta}>
                    Score: {scorePct} • {postsLabel}
                  </Text>
                  {rec?.timeslot ? (
                    <Text style={styles.slotMetaSecondary}>
                      Based on data like {formatTimeWithDate(rec.timeslot)}
                    </Text>
                  ) : null}

                  {sampleCount > 0 && (
                    <View style={styles.slotBadgeRow}>
                      <View style={styles.slotBadge}>
                        <Text style={styles.slotBadgeText}>
                          Learned from {sampleCount} post
                          {sampleCount > 1 ? "s" : ""}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.slotPlusBtn}
                  activeOpacity={0.8}
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/create",
                      params: {
                        mode: "schedule",
                        scheduled_at: slotIso,
                      },
                    })
                  }
                >
                  <FontAwesome name="plus" size={13} color={TINT} />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  header: {
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    marginBottom: 4,
  },
  title: { fontSize: 18, fontWeight: "800", color: TEXT },

  card: {
    borderRadius: 0,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },

  modeToggleRow: {
    flexDirection: "row",
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: SOFT,
    backgroundColor: "#fff",
    gap: 8,
  },
  modeTab: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: SOFT,
    backgroundColor: "#F9FAFB",
  },
  modeTabActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  modeTabText: { fontSize: 12, fontWeight: "600", color: MUTED },
  modeTabTextActive: { color: "#FFFFFF" },

  pageFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 8,
  },
  pageFilterLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: MUTED,
  },
  pageFilterChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    flex: 1,
  },
  pageChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: SOFT,
    backgroundColor: "#F9FAFB",
  },
  pageChipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  pageChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: MUTED,
  },
  pageChipTextActive: {
    color: "#FFFFFF",
  },

  monthContainer: {
    flex: 1,
    height: "100%",
  },

  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: SOFT,
    backgroundColor: "#fff",
  },
  weekLabel: {
    width: `${100 / 7}%`,
    textAlign: "center",
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
  },

  grid: {
    backgroundColor: "#fff",
    flexWrap: "wrap",
    flexDirection: "row",
  },

  cellBlank: {
    width: `${100 / 7}%`,
    aspectRatio: 0.87,
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderColor: SOFT,
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 0.87,
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderColor: SOFT,
    alignItems: "center",
    paddingTop: 6,
    height: "100%",
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

  bottomSheet: {
    borderTopWidth: 1,
    borderTopColor: SOFT,
    paddingHorizontal: 4,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: "#fff",
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
  bottomSubLabel: {
    marginTop: 4,
    fontSize: 11,
    color: MUTED,
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

  dailyContainer: {
    paddingTop: 10,
    backgroundColor: "#fff",
  },
  dailyHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  dailyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: TEXT,
  },
  dailyInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  dailySubtitle: {
    flex: 1,
    fontSize: 12,
    color: MUTED,
  },
  infoIconBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginLeft: 6,
  },

  sortToggleRow: {
    flexDirection: "row",
    alignSelf: "flex-start",
    marginTop: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    padding: 2,
  },
  sortToggleBtn: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  sortToggleBtnActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  sortToggleText: {
    fontSize: 11,
    fontWeight: "600",
    color: MUTED,
  },
  sortToggleTextActive: {
    color: TINT,
  },

  slotCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    minHeight: 52,
    marginHorizontal: 16,
  },
  slotTextCol: {
    flex: 1,
  },
  slotHour: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  slotMeta: {
    fontSize: 11,
    color: "#1F2933",
    marginTop: 2,
  },
  slotMetaSecondary: {
    fontSize: 10,
    color: "#4B5563",
    marginTop: 2,
  },
  slotBadgeRow: {
    marginTop: 6,
    flexDirection: "row",
  },
  slotBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.07)",
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.08)",
  },
  slotBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#0F172A",
  },
  slotPlusBtn: {
    marginLeft: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.16)",
  },

  dailyMathBox: {
    marginTop: 14,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  dailyMathTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT,
    marginBottom: 6,
  },
  dailyMathText: {
    fontSize: 11,
    color: "#4B5563",
    marginTop: 4,
  },
  dailyMathFormula: {
    fontSize: 11,
    color: "#111827",
    marginTop: 4,
    fontFamily: "monospace",
  },
  mathStep: {
    fontWeight: "700",
    color: "#111827",
  },
  codeText: {
    fontFamily: "monospace",
  },
});
