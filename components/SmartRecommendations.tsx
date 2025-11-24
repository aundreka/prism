// components/SmartRecommendations.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import {
  getTimeSegmentRecommendations,
  TimeSegmentRecommendation,
} from "@/lib/timeRecommendations";

const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";

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

const formatHourLabel = (hour: number) => {
  const h = Math.max(0, Math.min(23, hour));
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}${ampm}`;
};

type DayCalendar = {
  key: string;
  date: Date;
  slots: { hour: number; score: number | null }[];
};

export const SmartRecommendationsCard: React.FC = () => {
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [recs, setRecs] = useState<TimeSegmentRecommendation[]>([]);
  const [showMath, setShowMath] = useState(false);

  const loadRecommendations = useCallback(async () => {
    try {
      setLoadingRecs(true);
      setRecError(null);

      const data = await getTimeSegmentRecommendations("facebook", {
        horizonDays: 7,
        weightModel: 0.7,
        weightBandit: 0.3,
      });

      const fbOnly = data.filter((d) => d.platform === "facebook");
      setRecs(fbOnly);
    } catch (err: any) {
      console.error("Failed to load time segment recommendations:", err);
      setRecError(
        err?.message ?? "Could not load recommended times right now."
      );
      setRecs([]);
    } finally {
      setLoadingRecs(false);
    }
  }, []);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  const topTimeRecs = useMemo(() => recs.slice(0, 5), [recs]);

  const recCalendar: DayCalendar[] = useMemo(() => {
    if (!recs.length) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rawMap = new Map<
      string,
      { date: Date; slots: { hour: number; score: number | null }[] }
    >();

    for (const r of recs) {
      const d = new Date(r.timeslot);
      const localDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const key = localDate.toISOString().slice(0, 10);

      if (!rawMap.has(key)) {
        rawMap.set(key, { date: localDate, slots: [] });
      }

      rawMap.get(key)!.slots.push({
        hour: d.getHours(),
        score: r.hybridSample,
      });
    }

    const days: DayCalendar[] = [];

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
  }, [recs]);

  const hasRecs = recs.length > 0;

  return (
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

      {loadingRecs && (
        <View style={styles.centerRow}>
          <ActivityIndicator />
          <Text style={styles.mutedText}>Analyzing your data…</Text>
        </View>
      )}

      {!loadingRecs && recError && (
        <Text style={styles.errorText}>{recError}</Text>
      )}

      {!loadingRecs && !recError && !hasRecs && (
        <Text style={styles.mutedText}>
          Not enough engagement data yet. Once your posts start getting
          likes, comments, and shares, we’ll recommend the best upcoming
          times.
        </Text>
      )}

      {!loadingRecs && !recError && hasRecs && (
        <>
          {/* mini calendar */}
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
                  style={[styles.recDayCell, isToday && styles.recDayToday]}
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
                        const pct =
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
                            <Text style={styles.recSlotScore}>{pct}</Text>
                          </View>
                        );
                      })
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* top N slots list */}
          {topTimeRecs.length > 0 && (
            <View style={{ marginTop: 14 }}>
              {topTimeRecs.map((r, idx) => {
                const scorePct = `${(r.hybridSample * 100).toFixed(0)}%`;
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
                      <Text style={styles.pmValue}>Score: {scorePct}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Explanation */}
          <View style={styles.mathToggleRow}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={styles.mathTitle}>
                How this score is calculated
              </Text>
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
                    From your post analytics, we build hourly engagement
                    features based on your real interactions:
                    {" "}
                    <Text style={styles.codeText}>
                      engagement = likes + comments + shares
                    </Text>
                    . We normalize this to a 0–1 score per slot.
                  </Text>
                </View>
              </View>

              {/* Step 2 */}
              <View style={styles.mathStep}>
                <Text style={styles.mathStepLabel}>2.</Text>
                <View style={styles.mathStepBody}>
                  <Text style={styles.mathText}>
                    For each future time slot, we compute a baseline{" "}
                    <Text style={styles.codeText}>predicted_avg</Text> using
                    your history and industry priors.
                  </Text>
                </View>
              </View>

              {/* Step 3 */}
              <View style={styles.mathStep}>
                <Text style={styles.mathStepLabel}>3.</Text>
                <View style={styles.mathStepBody}>
                  <Text style={styles.mathText}>
                    We keep a Bayesian posterior over engagement for each
                    (day, hour, segment, post type) context in{" "}
                    <Text style={styles.codeText}>v_bandit_params</Text> with
                    parameters α and β, and sample:
                  </Text>
                  <View style={styles.formulaWrapper}>
                    <Text style={styles.mathFormula}>
                      θ ~ Beta(α, β)
                    </Text>
                  </View>
                </View>
              </View>

              {/* Step 4 */}
              <View style={styles.mathStep}>
                <Text style={styles.mathStepLabel}>4.</Text>
                <View style={styles.mathStepBody}>
                  <Text style={styles.mathText}>
                    For each time slot we blend the model prediction with the
                    sampled bandit value:
                  </Text>
                  <View style={styles.formulaWrapper}>
                    <Text style={styles.mathFormula}>
                      score = 0.7 · predicted_avg + 0.3 · θ
                    </Text>
                  </View>
                  <Text style={styles.mathText}>
                    The “Score” you see is this value scaled to 0–100%. Higher
                    means a better predicted hour to post relative to your own
                    history.
                  </Text>
                </View>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: TEXT },
  linkText: { fontSize: 12, color: "#2563EB", fontWeight: "600" },
  centerRow: { marginTop: 8, alignItems: "center", gap: 4 },
  mutedText: { fontSize: 12, color: MUTED },
  errorText: { fontSize: 12, color: "#B91C1C", marginTop: 8 },

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
  recSlotTime: { fontSize: 11, color: "#111827" },
  recSlotScore: { fontSize: 11, color: "#0EA5E9", fontWeight: "600" },

  mathToggleRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mathTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  mathBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F3F4FF",
    borderWidth: 1,
    borderColor: "#E0E7FF",
  },
  mathText: {
    fontSize: 11,
    color: "#4B5563",
    marginTop: 2,
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
    color: "#111827",
    width: 18,
  },
  mathStepBody: { flex: 1 },
  formulaWrapper: {
    marginTop: 6,
    marginBottom: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
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
  pmValue: { color: TEXT, fontSize: 13, fontWeight: "700" },
});
