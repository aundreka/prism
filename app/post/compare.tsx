// app/post/compare.tsx
import { supabase } from "@/lib/supabase";
import { FontAwesome } from "@expo/vector-icons";
import { router } from "expo-router";
import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

/* -------------------------
   Angles config
--------------------------*/
import { getAngleByKey, AngleKey } from "@/config/angles";

/* -------------------------
   Theme
--------------------------*/
const BG = "#F8FAFC";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E5E7EB";
const TINT = "#111827";

const HEADER_SPACER = 120;
const FOOTER_SPACER = 80;

/* -------------------------
   Types (schema mirror)
--------------------------*/
type PlatformEnum = "facebook";
type PostTypeEnum =
  | "image"
  | "video"
  | "reel"
  | "story"
  | "carousel"
  | "link";
type ObjectiveEnum = "awareness" | "engagement" | "conversion";

type ScenarioInput = {
  dow: number;
  hour: number;
  postType: PostTypeEnum;
  objective: ObjectiveEnum;
  angle: AngleKey;
};

type ScenarioScore = {
  time_score: number | null;
  content_score: number | null;
  combined_score: number | null;
};

/* -------------------------
   Options + helpers
--------------------------*/
const DOW_OPTIONS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

// Curated hours to reduce clutter (you can expand later if you want)
const HOUR_OPTIONS = [7, 9, 12, 15, 18, 20, 21];

const POST_TYPE_OPTIONS: { value: PostTypeEnum; label: string }[] = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "reel", label: "Reel" },
  { value: "carousel", label: "Carousel" },
];

const OBJECTIVE_OPTIONS: { value: ObjectiveEnum; label: string }[] = [
  { value: "awareness", label: "Awareness" },
  { value: "engagement", label: "Engagement" },
  { value: "conversion", label: "Conversion" },
];

const BASIC_ANGLE_KEYS: AngleKey[] = [
  "how_to",
  "testimonial",
  "promo",
  "before_after",
  "faq",
  "story",
] as AngleKey[];

function formatHourLabel(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  const ampm = h >= 12 ? "PM" : "AM";
  const hr12 = h % 12 === 0 ? 12 : h % 12;
  return `${hr12}:00 ${ampm}`;
}

function toPct(n: number | null | undefined) {
  if (n == null || isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function scenarioSummary(s: ScenarioInput) {
  const dow = DOW_OPTIONS.find((d) => d.value === s.dow)?.label ?? "—";
  const hour = formatHourLabel(s.hour);
  const postType = POST_TYPE_OPTIONS.find(
    (p) => p.value === s.postType
  )?.label;
  const objective = OBJECTIVE_OPTIONS.find(
    (o) => o.value === s.objective
  )?.label;
  const angleDef = getAngleByKey(s.angle);
  return `${dow} • ${hour} • ${postType} • ${objective} • ${
    angleDef?.label ?? s.angle
  }`;
}

/* -------------------------
   Main Screen
--------------------------*/
export default function CompareScreen() {
  const scrollRef = useRef<ScrollView | null>(null);

  const [scenarioA, setScenarioA] = useState<ScenarioInput>({
    dow: 1,
    hour: 9,
    postType: "image",
    objective: "awareness",
    angle: "how_to",
  });

  const [scenarioB, setScenarioB] = useState<ScenarioInput>({
    dow: 5,
    hour: 20,
    postType: "reel",
    objective: "engagement",
    angle: "promo",
  });

  const [scoreA, setScoreA] = useState<ScenarioScore | null>(null);
  const [scoreB, setScoreB] = useState<ScenarioScore | null>(null);
  const [loading, setLoading] = useState(false);

  // which scenario's filters are expanded
  const [expanded, setExpanded] = useState<"A" | "B" | null>("A");

  const basicAngles = useMemo(
    () =>
      BASIC_ANGLE_KEYS.map((k) => getAngleByKey(k)).filter(
        (a): a is { key: AngleKey; label: string } => !!a
      ),
    []
  );

  const runComparison = useCallback(async () => {
    try {
      setLoading(true);
      setScoreA(null);
      setScoreB(null);

      const [resA, resB] = await Promise.all([
        supabase.rpc("simulate_post_scenario", {
          p_platform: "facebook" as PlatformEnum,
          p_dow: scenarioA.dow,
          p_hour: scenarioA.hour,
          p_post_type: scenarioA.postType,
          p_objective: scenarioA.objective,
          p_angle: scenarioA.angle,
        }),
        supabase.rpc("simulate_post_scenario", {
          p_platform: "facebook" as PlatformEnum,
          p_dow: scenarioB.dow,
          p_hour: scenarioB.hour,
          p_post_type: scenarioB.postType,
          p_objective: scenarioB.objective,
          p_angle: scenarioB.angle,
        }),
      ]);

      if (resA.error) throw resA.error;
      if (resB.error) throw resB.error;

      const rowA = (resA.data?.[0] || null) as ScenarioScore | null;
      const rowB = (resB.data?.[0] || null) as ScenarioScore | null;

      if (!rowA && !rowB) {
        Alert.alert(
          "No data yet",
          "There is not enough engagement history to simulate these scenarios. Try posting more first."
        );
        return;
      }

      setScoreA(rowA);
      setScoreB(rowB);

      // Scroll to results so it feels responsive
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 150);
    } catch (e: any) {
      console.error("Comparison error", e);
      Alert.alert("Error", e?.message ?? "Failed to run comparison.");
    } finally {
      setLoading(false);
    }
  }, [scenarioA, scenarioB]);

  const maxCombined = useMemo(() => {
    const a = scoreA?.combined_score ?? 0;
    const b = scoreB?.combined_score ?? 0;
    const max = Math.max(a, b);
    return max > 0 ? max : 1;
  }, [scoreA, scoreB]);

  const bestScenarioLabel = useMemo(() => {
    if (!scoreA && !scoreB) return "";
    const a = scoreA?.combined_score ?? 0;
    const b = scoreB?.combined_score ?? 0;
    if (a === 0 && b === 0) return "Both scenarios are currently equal.";
    if (a > b) return "Scenario A is expected to perform better overall.";
    if (b > a) return "Scenario B is expected to perform better overall.";
    return "Both scenarios are expected to perform similarly.";
  }, [scoreA, scoreB]);

  /* -------------------------
     Small helper renderers
  --------------------------*/
  const renderChipRow = (
    options: { value: any; label: string }[],
    selected: any,
    onChange: (v: any) => void
  ) => (
    <View style={styles.chipRowWrap}>
      {options.map((opt) => {
        const active = opt.value === selected;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.9}
          >
            <Text
              style={[styles.chipText, active && styles.chipTextActive]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderAngleRow = (
    selected: AngleKey,
    onChange: (v: AngleKey) => void
  ) => (
    <View style={styles.chipRowWrap}>
      {basicAngles.map((opt) => {
        const active = opt.key === selected;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(opt.key)}
            activeOpacity={0.9}
          >
            <Text
              style={[styles.chipText, active && styles.chipTextActive]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderScenarioCard = (
    label: "A" | "B",
    tint: string,
    scenario: ScenarioInput,
    setScenario: React.Dispatch<React.SetStateAction<ScenarioInput>>
  ) => {
    const isExpanded = expanded === label;

    return (
      <View style={styles.scenarioCard}>
        <TouchableOpacity
          style={styles.scenarioHeaderRow}
          onPress={() =>
            setExpanded((cur) => (cur === label ? null : label))
          }
          activeOpacity={0.9}
        >
          <View style={[styles.scenarioBadge, { backgroundColor: tint }]}>
            <Text style={styles.scenarioBadgeText}>{label}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.scenarioTitle}>Scenario {label}</Text>
            <Text style={styles.scenarioSummary} numberOfLines={2}>
              {scenarioSummary(scenario)}
            </Text>
          </View>
          <FontAwesome
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={12}
            color={MUTED}
          />
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.scenarioBody}>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Day of week</Text>
              {renderChipRow(DOW_OPTIONS, scenario.dow, (v) =>
                setScenario((prev) => ({ ...prev, dow: v }))
              )}
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Hour</Text>
              {renderChipRow(
                HOUR_OPTIONS.map((h) => ({
                  value: h,
                  label: formatHourLabel(h),
                })),
                scenario.hour,
                (v) => setScenario((prev) => ({ ...prev, hour: v }))
              )}
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Post type</Text>
              {renderChipRow(POST_TYPE_OPTIONS, scenario.postType, (v) =>
                setScenario((prev) => ({ ...prev, postType: v }))
              )}
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Objective</Text>
              {renderChipRow(OBJECTIVE_OPTIONS, scenario.objective, (v) =>
                setScenario((prev) => ({ ...prev, objective: v }))
              )}
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Angle</Text>
              {renderAngleRow(scenario.angle, (v) =>
                setScenario((prev) => ({ ...prev, angle: v }))
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.9}
          >
            <FontAwesome name="chevron-left" size={14} color={TINT} />
          </TouchableOpacity>
          <Text style={styles.title}>What-If Comparison</Text>
        </View>

        <Text style={styles.subtitle}>
          Choose two posting scenarios and estimate which one is likely to
          perform better based on your historical patterns.
        </Text>

        {/* Scenario cards */}
        {renderScenarioCard("A", "#111827", scenarioA, setScenarioA)}
        {renderScenarioCard("B", "#4B5563", scenarioB, setScenarioB)}

        {/* Run button */}
        <View style={styles.runRow}>
          <TouchableOpacity
            onPress={runComparison}
            activeOpacity={0.9}
            style={[styles.runBtn, loading && styles.disabled]}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <FontAwesome name="bar-chart" size={16} color="#fff" />
            )}
            <Text style={styles.runBtnText}>
              {loading ? "Calculating…" : "Run Comparison"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Results */}
        {(scoreA || scoreB) && (
          <View style={styles.resultsCard}>
            <Text style={styles.resultsTitle}>Results</Text>

            <View style={styles.resultsRow}>
              {/* Scenario A */}
              <View style={styles.resultsCol}>
                <View style={styles.resultsLabelRow}>
                  <View
                    style={[
                      styles.scenarioBadge,
                      { backgroundColor: "#111827" },
                    ]}
                  >
                    <Text style={styles.scenarioBadgeText}>A</Text>
                  </View>
                  <Text style={styles.resultsScenarioLabel}>
                    Scenario A
                  </Text>
                </View>
                <Text style={styles.resultsMetricLabel}>
                  Time score:{" "}
                  <Text style={styles.resultsMetricValue}>
                    {toPct(scoreA?.time_score ?? null)}
                  </Text>
                </Text>
                <Text style={styles.resultsMetricLabel}>
                  Content score:{" "}
                  <Text style={styles.resultsMetricValue}>
                    {toPct(scoreA?.content_score ?? null)}
                  </Text>
                </Text>
                <Text style={styles.resultsMetricLabel}>
                  Combined:{" "}
                  <Text style={styles.resultsMetricValue}>
                    {toPct(scoreA?.combined_score ?? null)}
                  </Text>
                </Text>
                <View style={styles.barBg}>
                  <View
                    style={[
                      styles.barFillA,
                      {
                        width: `${
                          ((scoreA?.combined_score ?? 0) / maxCombined) *
                          100
                        }%`,
                      },
                    ]}
                  />
                </View>
              </View>

              {/* Scenario B */}
              <View style={styles.resultsCol}>
                <View style={styles.resultsLabelRow}>
                  <View
                    style={[
                      styles.scenarioBadge,
                      { backgroundColor: "#4B5563" },
                    ]}
                  >
                    <Text style={styles.scenarioBadgeText}>B</Text>
                  </View>
                  <Text style={styles.resultsScenarioLabel}>
                    Scenario B
                  </Text>
                </View>
                <Text style={styles.resultsMetricLabel}>
                  Time score:{" "}
                  <Text style={styles.resultsMetricValue}>
                    {toPct(scoreB?.time_score ?? null)}
                  </Text>
                </Text>
                <Text style={styles.resultsMetricLabel}>
                  Content score:{" "}
                  <Text style={styles.resultsMetricValue}>
                    {toPct(scoreB?.content_score ?? null)}
                  </Text>
                </Text>
                <Text style={styles.resultsMetricLabel}>
                  Combined:{" "}
                  <Text style={styles.resultsMetricValue}>
                    {toPct(scoreB?.combined_score ?? null)}
                  </Text>
                </Text>
                <View style={styles.barBg}>
                  <View
                    style={[
                      styles.barFillB,
                      {
                        width: `${
                          ((scoreB?.combined_score ?? 0) / maxCombined) *
                          100
                        }%`,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>

            <Text style={styles.resultsHint}>{bestScenarioLabel}</Text>
          </View>
        )}

        <View style={{ height: FOOTER_SPACER }} />
      </ScrollView>
    </View>
  );
}

/* -------------------------
   Styles
--------------------------*/
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
    marginBottom: 6,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    backgroundColor: "#F9FAFB",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: TEXT,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 12,
    color: MUTED,
  },

  scenarioCard: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  scenarioHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  scenarioBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  scenarioBadgeText: {
    color: "#F9FAFB",
    fontWeight: "800",
    fontSize: 12,
  },
  scenarioTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: TEXT,
  },
  scenarioSummary: {
    fontSize: 11,
    color: MUTED,
    marginTop: 2,
  },
  scenarioBody: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
  },
  fieldBlock: {
    marginTop: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: TEXT,
    marginBottom: 4,
  },

  chipRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F3F4F6",
  },
  chipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
    color: TEXT,
  },
  chipTextActive: {
    color: "#F9FAFB",
  },

  runRow: {
    marginTop: 18,
  },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: "#111827",
  },
  runBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  disabled: {
    opacity: 0.7,
  },

  resultsCard: {
    marginTop: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    padding: 12,
  },
  resultsTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: TEXT,
    marginBottom: 8,
  },
  resultsRow: {
    flexDirection: "row",
    gap: 10,
  },
  resultsCol: {
    flex: 1,
  },
  resultsLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  resultsScenarioLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: TEXT,
  },
  resultsMetricLabel: {
    fontSize: 11,
    color: MUTED,
    marginTop: 2,
  },
  resultsMetricValue: {
    fontWeight: "700",
    color: TEXT,
  },
  barBg: {
    marginTop: 6,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  barFillA: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#111827",
  },
  barFillB: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#4B5563",
  },
  resultsHint: {
    marginTop: 8,
    fontSize: 11,
    color: MUTED,
  },
});
