import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  GestureResponderEvent,
} from "react-native";

type PostsByDate = Record<string, number>; // {"YYYY-MM-DD": count}

function zeroPad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function ymd(d: Date) { return `${d.getFullYear()}-${zeroPad(d.getMonth() + 1)}-${zeroPad(d.getDate())}`; }
function daysInMonth(year: number, monthIdx0: number) { return new Date(year, monthIdx0 + 1, 0).getDate(); }
function addMonths(base: Date, delta: number) {
  const d = new Date(base.getFullYear(), base.getMonth() + delta, 1);
  return d;
}

const BORDER = "#E6E6EA";
const BLUE = "#1D4ED8";

/** ---------- Month View (single month) ---------- */
function MonthView({
  year,
  monthIdx0,
  postsByDate,
}: {
  year: number;
  monthIdx0: number; // 0..11
  postsByDate: PostsByDate;
}) {
  const today = new Date();

  // Build 6x7 grid with adjacent-month days (muted)
  const { rows, label } = useMemo(() => {
    const firstOfMonth = new Date(year, monthIdx0, 1);
    const firstWeekday = firstOfMonth.getDay(); // 0..6 (Sun..Sat)
    const numDays = daysInMonth(year, monthIdx0);

    const prevMonth = monthIdx0 === 0 ? 11 : monthIdx0 - 1;
    const prevYear = monthIdx0 === 0 ? year - 1 : year;
    const nextMonth = monthIdx0 === 11 ? 0 : monthIdx0 + 1;
    const nextYear = monthIdx0 === 11 ? year + 1 : year;

    const prevNumDays = daysInMonth(prevYear, prevMonth);

    const cells: Array<{ key: string; date: Date; inMonth: boolean }> = [];

    // leading (previous month)
    for (let i = 0; i < firstWeekday; i++) {
      const day = prevNumDays - firstWeekday + 1 + i;
      const d = new Date(prevYear, prevMonth, day);
      cells.push({ key: `p-${ymd(d)}`, date: d, inMonth: false });
    }
    // current month
    for (let d = 1; d <= numDays; d++) {
      const dd = new Date(year, monthIdx0, d);
      cells.push({ key: ymd(dd), date: dd, inMonth: true });
    }
    // trailing (next month)
    while (cells.length < 42) {
      const day = cells.length - (firstWeekday + numDays) + 1;
      const d = new Date(nextYear, nextMonth, day);
      cells.push({ key: `n-${ymd(d)}`, date: d, inMonth: false });
    }

    const rows = Array.from({ length: 6 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
    const label = new Date(year, monthIdx0, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    return { rows, label };
  }, [year, monthIdx0, postsByDate]);

  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  /** ----- Pinch-to-zoom per month (no libs) ----- */
  const [scale, setScale] = useState(1);
  const baseScale = useRef(1);
  const startDist = useRef<number | null>(null);

  const onStartShouldSet = () => true;
  const onMoveShouldSet = () => true;

  const handleResponderGrant = (e: GestureResponderEvent) => {
    const touches = e.nativeEvent.touches;
    if (touches.length === 2) {
      startDist.current = distance(touches[0].pageX, touches[0].pageY, touches[1].pageX, touches[1].pageY);
      baseScale.current = scale;
    }
  };
  const handleResponderMove = (e: GestureResponderEvent) => {
    const touches = e.nativeEvent.touches;
    if (touches.length === 2 && startDist.current) {
      const d = distance(touches[0].pageX, touches[0].pageY, touches[1].pageX, touches[1].pageY);
      const factor = d / startDist.current;
      const next = clamp(baseScale.current * factor, 1, 1.8);
      setScale(next);
    }
  };
  const handleResponderRelease = () => {
    startDist.current = null;
    baseScale.current = scale;
  };

  function distance(x1: number, y1: number, x2: number, y2: number) {
    const dx = x1 - x2, dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
  const fs = (n: number) => Math.round(n * scale);
  const pad = (n: number) => Math.max(4, Math.round(n * scale));

  return (
    <View style={styles.monthBlock}>
      {/* Month label */}
      <View style={styles.monthHeader}>
        <Text style={styles.monthLabel}>{label}</Text>
      </View>

      {/* Weekday labels */}
      <View style={styles.weekdays}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
          <View key={w} style={styles.weekdayCell}>
            <Text style={styles.weekdayText}>{w}</Text>
          </View>
        ))}
      </View>

      {/* Zoomable month grid */}
      <View
        style={styles.zoomWrap}
        onStartShouldSetResponder={onStartShouldSet}
        onMoveShouldSetResponder={onMoveShouldSet}
        onResponderGrant={handleResponderGrant}
        onResponderMove={handleResponderMove}
        onResponderRelease={handleResponderRelease}
      >
        <View style={[styles.grid, { transform: [{ scale }] }]}>
          {rows.map((row, rIdx) => (
            <View key={`row-${rIdx}`} style={styles.row}>
              {row.map((cell, cIdx) => {
                const dateStr = ymd(cell.date);
                const postCount = postsByDate[dateStr] || 0;
                const dots = Math.min(2, postCount); // 0..2 tiny dots

                return (
                  <View
                    key={cell.key}
                    style={[
                      styles.cell,
                      cIdx === 0 && styles.cellLeft,
                      rIdx === 0 && styles.cellTop,
                    ]}
                  >
                    <TouchableOpacity activeOpacity={0.8} style={[styles.dayWrap, { padding: pad(8) }]}>
                      <View style={styles.dayHeader}>
                        <Text
                          style={[
                            styles.dayNumber,
                            { fontSize: fs(16) },
                            !cell.inMonth && styles.dayMuted,
                            isToday(cell.date) && styles.dayToday,
                          ]}
                        >
                          {cell.date.getDate()}
                        </Text>
                      </View>

                      {/* tiny dot markers */}
                      <View style={styles.dotsRow}>
                        {Array.from({ length: dots }).map((_, i) => (
                          <View
                            key={i}
                            style={[
                              styles.dot,
                              {
                                width: fs(6),
                                height: fs(6),
                                borderRadius: fs(3),
                              },
                            ]}
                          />
                        ))}
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** ---------- Screen (multi-month scroll) ---------- */
export default function Screen() {
  // Sample: replace via API/DB
  const postsByDate: PostsByDate = {
    "2025-09-28": 1,
    "2025-10-03": 1,
    "2025-10-12": 3,
    "2025-10-19": 2,
    "2025-10-23": 1,
    "2025-10-30": 2,
    "2025-11-05": 1,
    "2025-11-18": 2,
  };

  const base = new Date(); // today
  // Build a range of months (e.g., past 6 to next 6 = 13 total)
  const months = useMemo(() => {
    const arr: { y: number; m: number; key: string }[] = [];
    for (let d = -6; d <= 6; d++) {
      const dt = addMonths(base, d);
      arr.push({ y: dt.getFullYear(), m: dt.getMonth(), key: `${dt.getFullYear()}-${dt.getMonth()}` });
    }
    return arr;
  }, []);

  const renderItem = ({ item }: { item: { y: number; m: number } }) => (
    <MonthView year={item.y} monthIdx0={item.m} postsByDate={postsByDate} />
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Top app header with quick jump (optional) */}
        <View style={styles.appHeader}>
          <Text style={styles.appTitle}>Calendar</Text>
        </View>

        {/* Scrollable list of months */}
        <FlatList
          data={months}
          keyExtractor={(it) => `${it.y}-${it.m}`}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      </View>
    </SafeAreaView>
  );
}

/** ---------- Styles ---------- */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  container: { flex: 1, backgroundColor: "#FFFFFF" },

  appHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  appTitle: { fontSize: 20, fontWeight: "800", color: "#111827" },

  monthBlock: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },

  monthHeader: {
    paddingHorizontal: 4,
    paddingVertical: 6,
    alignItems: "center",
  },
  monthLabel: { fontSize: 18, fontWeight: "800", color: "#111827" },

  weekdays: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    marginTop: 4,
  },
  weekdayCell: { flex: 1, paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  weekdayText: { fontSize: 11, fontWeight: "700", color: "#6B7280", textTransform: "uppercase" },

  zoomWrap: { flex: 1, overflow: "hidden" },
  grid: { flex: 1 },
  row: { flexDirection: "row" },

  cell: {
    flex: 1,
    aspectRatio: 1, // keeps squares; zoom scales it visually
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
  },
  cellLeft: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: BORDER },
  cellTop: {},

  dayWrap: { flex: 1, justifyContent: "space-between" },
  dayHeader: { alignItems: "flex-start" },
  dayNumber: { fontWeight: "700", color: "#111827", fontSize: 16 },
  dayMuted: { color: "#9CA3AF" },
  dayToday: { color: BLUE },

  dotsRow: { flexDirection: "row", gap: 6, paddingBottom: 8 },
  dot: { backgroundColor: BLUE },
});
