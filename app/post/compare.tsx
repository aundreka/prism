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
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

/* -------------------------
   Angles config
--------------------------*/
import {
  ANGLE_CATEGORIES,
  getAngleByKey,
  AngleKey,
} from "@/config/angles";

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
   Types
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

const POST_TYPE_OPTIONS: { value: PostTypeEnum; label: string }[] = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "reel", label: "Reel" },
  { value: "carousel", label: "Carousel" },
  { value: "story", label: "Story" },
  { value: "link", label: "Link" },
];

const OBJECTIVE_OPTIONS: { value: ObjectiveEnum; label: string }[] = [
  { value: "awareness", label: "Awareness" },
  { value: "engagement", label: "Engagement" },
  { value: "conversion", label: "Conversion" },
];

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

  // time picker state
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [timePickerScenario, setTimePickerScenario] = useState<
    "A" | "B" | null
  >(null);
  const [tempTime, setTempTime] = useState<Date>(new Date());

  // angle modal state
  const [angleModalVisible, setAngleModalVisible] = useState(false);
  const [angleModalScenario, setAngleModalScenario] = useState<
    "A" | "B" | null
  >(null);

  const allAngles = useMemo(
    () =>
      ANGLE_CATEGORIES.flatMap((cat) =>
        cat.angles.map((a) => ({
          ...a,
          category: cat.label,
        }))
      ),
    []
  );

  const openTimePicker = (label: "A" | "B", s: ScenarioInput) => {
    const d = new Date();
    d.setHours(s.hour, 0, 0, 0);
    setTempTime(d);
    setTimePickerScenario(label);
    setTimePickerVisible(true);
  };

  const applyTimePicker = (d: Date) => {
    const hour = d.getHours();
    if (timePickerScenario === "A") {
      setScenarioA((prev) => ({ ...prev, hour }));
    } else if (timePickerScenario === "B") {
      setScenarioB((prev) => ({ ...prev, hour }));
    }
    setTimePickerVisible(false);
    setTimePickerScenario(null);
  };

  const onTimeChange = (_: any, d?: Date) => {
    if (!d) {
      if (Platform.OS !== "ios") {
        setTimePickerVisible(false);
        setTimePickerScenario(null);
      }
      return;
    }
    setTempTime(d);
    if (Platform.OS === "android") {
      applyTimePicker(d);
    }
  };

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
          "There is not enough engagement history to simulate these scenarios."
        );
        return;
      }

      setScoreA(rowA);
      setScoreB(rowB);

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

  const openAngleModal = (label: "A" | "B") => {
    setAngleModalScenario(label);
    setAngleModalVisible(true);
  };

  const applyAngle = (key: AngleKey) => {
    if (angleModalScenario === "A") {
      setScenarioA((prev) => ({ ...prev, angle: key }));
    } else if (angleModalScenario === "B") {
      setScenarioB((prev) => ({ ...prev, angle: key }));
    }
    setAngleModalVisible(false);
    setAngleModalScenario(null);
  };

  const renderSelectorRow = (
    label: string,
    value: string,
    onPress: () => void
  ) => (
    <TouchableOpacity
      style={styles.selectorRow}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <Text style={styles.selectorLabel}>{label}</Text>
      <View style={styles.selectorValueWrap}>
        <Text
          style={styles.selectorValue}
          numberOfLines={1}
        >
          {value}
        </Text>
        <FontAwesome name="chevron-right" size={12} color={MUTED} />
      </View>
    </TouchableOpacity>
  );

  const renderScenarioCard = (
    label: "A" | "B",
    tint: string,
    scenario: ScenarioInput,
    setScenario: React.Dispatch<React.SetStateAction<ScenarioInput>>
  ) => {
    const isExpanded = expanded === label;
    const angleDef = getAngleByKey(scenario.angle);

    const postTypeLabel =
      POST_TYPE_OPTIONS.find((p) => p.value === scenario.postType)
        ?.label ?? scenario.postType;

    const objectiveLabel =
      OBJECTIVE_OPTIONS.find((o) => o.value === scenario.objective)
        ?.label ?? scenario.objective;

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
              {renderSelectorRow(
                "Time",
                formatHourLabel(scenario.hour),
                () => openTimePicker(label, scenario)
              )}
            </View>

            <View style={styles.fieldBlock}>
              {renderSelectorRow("Post type", postTypeLabel, () => {
                const idx = POST_TYPE_OPTIONS.findIndex(
                  (p) => p.value === scenario.postType
                );
                const next =
                  POST_TYPE_OPTIONS[
                    (idx + 1 + POST_TYPE_OPTIONS.length) %
                      POST_TYPE_OPTIONS.length
                  ];
                setScenario((prev) => ({
                  ...prev,
                  postType: next.value,
                }));
              })}
            </View>

            <View style={styles.fieldBlock}>
              {renderSelectorRow("Objective", objectiveLabel, () => {
                const idx = OBJECTIVE_OPTIONS.findIndex(
                  (o) => o.value === scenario.objective
                );
                const next =
                  OBJECTIVE_OPTIONS[
                    (idx + 1 + OBJECTIVE_OPTIONS.length) %
                      OBJECTIVE_OPTIONS.length
                  ];
                setScenario((prev) => ({
                  ...prev,
                  objective: next.value,
                }));
              })}
            </View>

            <View style={styles.fieldBlock}>
              {renderSelectorRow(
                "Angle",
                angleDef?.label ?? scenario.angle,
                () => openAngleModal(label)
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
          Compare two posting scenarios based on your learned time patterns and
          content performance.
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

      {/* Time Picker Modal */}
      <Modal
        visible={timePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTimePickerVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setTimePickerVisible(false)}
        />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Pick time</Text>
            <TouchableOpacity
              onPress={() => setTimePickerVisible(false)}
            >
              <FontAwesome name="times" size={16} color={MUTED} />
            </TouchableOpacity>
          </View>

          <DateTimePicker
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "clock"}
            value={tempTime}
            onChange={onTimeChange}
          />

          {Platform.OS === "ios" && (
            <TouchableOpacity
              onPress={() => applyTimePicker(tempTime)}
              style={[styles.runBtn, { marginTop: 10 }]}
              activeOpacity={0.9}
            >
              <Text style={styles.runBtnText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>
      </Modal>

      {/* Angle Selector Modal (ALL angles) */}
      <Modal
        visible={angleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAngleModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setAngleModalVisible(false)}
        />
        <View style={[styles.modalCard, styles.angleModalCard]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select angle</Text>
            <TouchableOpacity
              onPress={() => setAngleModalVisible(false)}
            >
              <FontAwesome name="times" size={16} color={MUTED} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ marginTop: 10, maxHeight: 320 }}
            nestedScrollEnabled
          >
            {ANGLE_CATEGORIES.map((cat) => (
              <View key={cat.id} style={{ marginBottom: 10 }}>
                <Text style={styles.angleCategoryLabel}>
                  {cat.label}
                </Text>
                {cat.description ? (
                  <Text style={styles.angleCategoryDesc}>
                    {cat.description}
                  </Text>
                ) : null}
                {cat.angles.map((a) => (
                  <TouchableOpacity
                    key={a.key}
                    style={styles.angleRowItem}
                    onPress={() => applyAngle(a.key)}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.angleLabel}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
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

  selectorRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: "space-between",
  },
  selectorLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: TEXT,
  },
  selectorValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "70%",
    gap: 6,
  },
  selectorValue: {
    fontSize: 11,
    color: MUTED,
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

  // Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  modalCard: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
  },
  angleModalCard: {
    maxHeight: "75%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  modalTitle: {
    color: TEXT,
    fontWeight: "800",
    fontSize: 15,
    marginRight: "auto",
  },

  angleCategoryLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: TEXT,
    marginBottom: 2,
  },
  angleCategoryDesc: {
    fontSize: 11,
    color: MUTED,
    marginBottom: 4,
  },
  angleRowItem: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#F9FAFB",
    marginBottom: 4,
  },
  angleLabel: {
    fontSize: 12,
    color: TEXT,
    fontWeight: "600",
  },
});
