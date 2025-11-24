// app/(tabs)/create.tsx
import { supabase } from "@/lib/supabase";
import { FontAwesome } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Video } from "expo-av";
import * as ExpoCrypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  RefreshControl,
} from "react-native";

/* -------------------------
   Angles config
--------------------------*/
import {
  ANGLE_CATEGORIES,
  AngleKey,
  getAngleByKey,
  getSuggestedAnglesForIndustry,
} from "@/config/angles";

/* -------------------------
   Config
--------------------------*/
const FUNC_BASE =
  process.env.EXPO_PUBLIC_OAUTH_BASE ||
  "https://lsaicrbtnbufgzxlyash.functions.supabase.co";

/* -------------------------
   Theme helpers
--------------------------*/
const BG = "#F8FAFC";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E5E7EB";
const TINT = "#111827";

// header/footer spacers (safe padding so UI never sits under bars)
const HEADER_SPACER = 140; // room for header
const FOOTER_SPACER = 170; // room for tab bar / action buttons

function zeroPad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function formatDateTime(d: Date) {
  return `${d.getFullYear()}-${zeroPad(d.getMonth() + 1)}-${zeroPad(
    d.getDate()
  )} ${zeroPad(d.getHours())}:${zeroPad(d.getMinutes())}`;
}
function initials(name?: string | null) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || "U";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function fileExtFromUri(uri: string) {
  const q = uri.split("?")[0];
  const m = q.match(/\.(\w+)(?:$|#)/);
  return m ? m[1].toLowerCase() : "jpg";
}
function prettyIndustryLabel(ind?: string | null) {
  if (!ind) return "";
  return ind
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/* -------------------------
   Base64 → Uint8Array
--------------------------*/
function base64ToUint8Array(b64: string) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  let bufferLength = b64.length * 0.75;
  if (b64.endsWith("==")) bufferLength -= 2;
  else if (b64.endsWith("=")) bufferLength -= 1;

  const bytes = new Uint8Array(bufferLength);
  let p = 0;

  for (let i = 0; i < b64.length; i += 4) {
    const enc1 = lookup[b64.charCodeAt(i)];
    const enc2 = lookup[b64.charCodeAt(i + 1)];
    const enc3 = lookup[b64.charCodeAt(i + 2)];
    const enc4 = lookup[b64.charCodeAt(i + 3)];
    const n =
      (enc1 << 18) |
      (enc2 << 12) |
      ((enc3 & 63) << 6) |
      (enc4 & 63);
    if (p < bufferLength) bytes[p++] = (n >> 16) & 255;
    if (p < bufferLength) bytes[p++] = (n >> 8) & 255;
    if (p < bufferLength) bytes[p++] = n & 255;
  }
  return bytes;
}

/* -------------------------
   Upload to Supabase Storage (bucket: media)
--------------------------*/
async function uploadToBucket(
  uid: string,
  localUri: string,
  mimeType?: string | null
) {
  const ext = fileExtFromUri(localUri);
  const fileName = `${await ExpoCrypto.randomUUID()}.${ext}`;
  const path = `${uid}/${fileName}`;
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: "base64" as any,
  });
  const binary = base64ToUint8Array(base64);
  const { error } = await supabase.storage
    .from("media")
    .upload(path, binary, {
      contentType: mimeType || undefined,
      upsert: false,
    });
  if (error) throw error;
  const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
  return { path, publicUrl: pub?.publicUrl || null };
}

/* -------------------------
   Types (schema mirror)
--------------------------*/
type PlatformEnum = "facebook"; // Instagram removed
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

// enums for objective (angle comes from config)
type ObjectiveEnum = "awareness" | "engagement" | "conversion";

type ConnectedMeta = {
  id: string;
  user_id: string;
  platform: PlatformEnum;
  page_id: string | null;
  page_name: string | null;
  ig_user_id: string | null;
  ig_username: string | null;
  access_token: string;
  token_expires_at: string | null;
  is_active: boolean | null;
};

/* -------------------------
   Objective option metadata
--------------------------*/
const OBJECTIVE_OPTIONS: {
  key: ObjectiveEnum;
  label: string;
  subtitle: string;
}[] = [
  {
    key: "awareness",
    label: "Awareness",
    subtitle: "Reach more people / views",
  },
  {
    key: "engagement",
    label: "Engagement",
    subtitle: "Likes, comments, saves",
  },
  {
    key: "conversion",
    label: "Conversion",
    subtitle: "Clicks, inquiries, purchases",
  },
];

/* -------------------------
   Main Screen
--------------------------*/
export default function CreateScreen() {
  // ⬇️ read params from calendar AND drafts
  const params = useLocalSearchParams<{
    mode?: string | string[];
    scheduled_at?: string | string[];
    draft_id?: string | string[];
  }>();

  const draftId = useMemo(() => {
    const raw = params.draft_id;
    const id = Array.isArray(raw) ? raw[0] : raw;
    return typeof id === "string" ? id : null;
  }, [params]);

  const initialScheduledDate = useMemo(() => {
    const rawMode = params.mode;
    const rawSched = params.scheduled_at;

    const mode = Array.isArray(rawMode) ? rawMode[0] : rawMode;
    const schedStr = Array.isArray(rawSched) ? rawSched[0] : rawSched;

    if (mode === "schedule" && typeof schedStr === "string" && !draftId) {
      const d = new Date(schedStr);
      if (!isNaN(d.getTime())) {
        return d;
      }
    }
    return null;
  }, [params, draftId]);

  const [uid, setUid] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectedMeta[]>([]);
  const [loadingConn, setLoadingConn] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // brand industry (from brand_profiles)
  const [industry, setIndustry] = useState<string | null>(null);

  const [caption, setCaption] = useState("");
  const [mediaLocal, setMediaLocal] = useState<
    Array<{
      uri: string;
      type: "image" | "video";
      width?: number;
      height?: number;
      durationMs?: number;
      mimeType?: string;
    }>
  >([]);
  const [croppingIndex, setCroppingIndex] = useState<number | null>(null);

  // 🔵 Track existing media IDs when editing a draft
  const [existingMediaIds, setExistingMediaIds] = useState<string[] | null>(
    null
  );

  // dateTimes start empty; we'll sync from calendar param via effect
  const [dateTimes, setDateTimes] = useState<Date[]>([]);

  // track which calendar param we've explicitly "ignored" (cleared/overridden)
  const schedKey = initialScheduledDate
    ? initialScheduledDate.getTime()
    : null;
  const [ignoredParamKey, setIgnoredParamKey] = useState<number | null>(
    null
  );

  // objective + angle state
  const [objective, setObjective] = useState<ObjectiveEnum>("awareness");
  const [angle, setAngle] = useState<AngleKey>("how_to");

  // angle modal + search
  const [angleModalVisible, setAngleModalVisible] = useState(false);
  const [angleSearch, setAngleSearch] = useState("");

  // Single-video mode toggle
  const [videoPostKind, setVideoPostKind] = useState<"reel" | "video">(
    "reel"
  );

  // Scheduler modal state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const [step, setStep] = useState<"date" | "time">("date"); // Android: two-step

  // Draft loading state
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null);

  // auto-sync calendar param into schedule ONLY when:
  // - there's a valid scheduled_at param
  // - we haven't explicitly ignored that param
  // - there are no schedules currently set
  useEffect(() => {
    if (!initialScheduledDate || schedKey == null) return;
    if (ignoredParamKey === schedKey) return;

    setDateTimes((prev) => {
      if (prev.length > 0) return prev; // user already has schedules; don't override
      return [initialScheduledDate];
    });
  }, [initialScheduledDate, schedKey, ignoredParamKey]);

  const [submitting, setSubmitting] = useState(false);

  /* -------------------------
     Fetch user + connections + brand_profiles.industry
  --------------------------*/
  const loadUserAndMeta = useCallback(async () => {
    try {
      setLoadingConn(true);
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) {
        Alert.alert("Sign in required", "Please log in to create posts.");
        router.replace("/(auth)");
        return;
      }
      setUid(user.id);

      // Connected accounts (include is_active so we can respect active page)
      const { data: conn, error: connErr } = await supabase
        .from("connected_meta_accounts")
        .select(
          "id,user_id,platform,page_id,page_name,ig_user_id,ig_username,access_token,token_expires_at,is_active"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (connErr) throw connErr;
      setConnections((conn || []) as any);

      // Brand profile industry from brand_profiles
      const { data: bp, error: bpErr } = await supabase
        .from("brand_profiles")
        .select("industry")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!bpErr && bp) {
        setIndustry(bp.industry ?? null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingConn(false);
    }
  }, []);

  useEffect(() => {
    loadUserAndMeta();
  }, [loadUserAndMeta]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadUserAndMeta();
    setRefreshing(false);
  }, [loadUserAndMeta]);

  /* -------------------------
     Connection selection (respect active page)
  --------------------------*/
  const activeFB = useMemo(
    () =>
      connections.find(
        (c) => c.platform === "facebook" && !!c.page_id && !!c.is_active
      ),
    [connections]
  );

  const connectedFB = useMemo(
    () =>
      activeFB ||
      connections.find(
        (c) => c.platform === "facebook" && !!c.page_id
      ),
    [activeFB, connections]
  );

  const canCreateAtAll = !!connectedFB;
  const submitPlatforms: PlatformEnum[] = useMemo(
    () => (connectedFB ? ["facebook"] : []),
    [connectedFB]
  );

  const selectedTargets: string[] = useMemo(() => {
    const t: string[] = [];
    if (connectedFB?.page_id) t.push(connectedFB.page_id);
    return t;
  }, [connectedFB]);

  const isSingleVideo = useMemo(
    () => mediaLocal.length === 1 && mediaLocal[0]?.type === "video",
    [mediaLocal]
  );

  // Suggested angles for this industry
  const suggestedAngles = useMemo(
    () => getSuggestedAnglesForIndustry(industry),
    [industry]
  );

  // Filtered categories based on search
  const filteredAngleCategories = useMemo(() => {
    const q = angleSearch.trim().toLowerCase();
    if (!q) return ANGLE_CATEGORIES;

    return ANGLE_CATEGORIES.map((cat) => ({
      ...cat,
      angles: cat.angles.filter(
        (a) =>
          a.label.toLowerCase().includes(q) ||
          a.key.toLowerCase().includes(q)
      ),
    })).filter((cat) => cat.angles.length > 0);
  }, [angleSearch]);

  const selectedAngleDef = useMemo(
    () => getAngleByKey(angle),
    [angle]
  );

  /* -------------------------
     Load draft when draft_id is present
  --------------------------*/
  useEffect(() => {
    if (!uid) return;
    if (!draftId) return;
    if (loadedDraftId === draftId) return;

    (async () => {
      try {
        setLoadingDraft(true);

        const { data: draft, error } = await supabase
          .from("v_scheduled_posts_with_media")
          .select(
            "id, user_id, caption, post_type, status, scheduled_at, media_ids, objective, angle"
          )
          .eq("id", draftId)
          .single();

        if (error) {
          console.error("Error loading draft:", error);
          Alert.alert("Error", "Failed to load draft.");
          return;
        }
        if (!draft || draft.user_id !== uid) {
          Alert.alert("Not found", "Draft not found.");
          return;
        }

        // Clear current state
        setCaption(draft.caption || "");
        setObjective(
          (draft.objective as ObjectiveEnum | null) || "awareness"
        );
        setAngle((draft.angle as AngleKey | null) || "how_to");

        // Schedule
        if (draft.scheduled_at) {
          setDateTimes([new Date(draft.scheduled_at as string)]);
        } else {
          setDateTimes([]);
        }
        if (schedKey != null) setIgnoredParamKey(schedKey);

        // If it's a single video-type draft, set videoPostKind based on post_type
        if (
          draft.post_type === "reel" ||
          draft.post_type === "video"
        ) {
          setVideoPostKind(draft.post_type as "reel" | "video");
        }

        // Media
        const mediaIds: string[] = (draft.media_ids as string[]) || [];
        setExistingMediaIds(mediaIds.length ? mediaIds : []); // 🔵 store existing ids

        if (mediaIds.length) {
          const { data: mediaRows, error: mediaErr } = await supabase
            .from("media_assets")
            .select(
              "id, public_url, width, height, duration_ms, mime_type"
            )
            .in("id", mediaIds);

          if (mediaErr) throw mediaErr;

          const mediaMap = new Map(
            (mediaRows || []).map((m: any) => [m.id, m])
          );

          const newMediaLocal = mediaIds
            .map((mid) => {
              const m = mediaMap.get(mid);
              if (!m || !m.public_url) return null;
              const mime = (m.mime_type || "").toLowerCase();
              const isVideo =
                mime.startsWith("video") ||
                draft.post_type === "video" ||
                draft.post_type === "reel";

              return {
                uri: m.public_url as string,
                type: isVideo ? "video" : "image",
                width: m.width ?? undefined,
                height: m.height ?? undefined,
                durationMs: m.duration_ms ?? undefined,
                mimeType: m.mime_type ?? undefined,
              } as {
                uri: string;
                type: "image" | "video";
                width?: number;
                height?: number;
                durationMs?: number;
                mimeType?: string;
              };
            })
            .filter(Boolean) as typeof mediaLocal;

          setMediaLocal(newMediaLocal);
        } else {
          setMediaLocal([]);
        }

        setLoadedDraftId(draftId);
      } catch (e: any) {
        console.error("Draft load error", e);
        Alert.alert("Error", e?.message ?? "Failed to load draft.");
      } finally {
        setLoadingDraft(false);
      }
    })();
  }, [uid, draftId, loadedDraftId, schedKey, mediaLocal.length]);

  /* -------------------------
     Media Picker
  --------------------------*/
  const pickMedia = useCallback(async () => {
    const { status } =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow gallery access.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 1,
    });
    if (res.canceled) return;
    const mapped = res.assets.map((a) => ({
      uri: a.uri,
      type: a.type?.includes("video") ? "video" : "image",
      width: a.width,
      height: a.height,
      durationMs: a.duration ? Math.round(a.duration * 1000) : undefined,
      mimeType:
        a.mimeType ||
        (a.type?.includes("video") ? "video/mp4" : "image/jpeg"),
    }));
    setMediaLocal((prev) => [...prev, ...mapped]);
    // Newly picked media have no existing IDs yet
    setExistingMediaIds((prev) => {
      const extra = new Array(mapped.length).fill(null);
      return prev ? [...prev, ...extra] : extra;
    });
  }, []);

  /* -------------------------
     Crop presets (images)
  --------------------------*/
  const doCropPreset = useCallback(
    async (ratio: "1:1" | "4:5" | "16:9") => {
      if (croppingIndex == null) return;
      const asset = mediaLocal[croppingIndex];
      if (!asset || asset.type !== "image" || !asset.width || !asset.height)
        return;

      const [rw, rh] =
        ratio === "1:1" ? [1, 1] : ratio === "4:5" ? [4, 5] : [16, 9];
      const targetRatio = rw / rh;

      const srcW = asset.width;
      const srcH = asset.height;
      const srcRatio = srcW / srcH;
      let cropW = 0,
        cropH = 0;
      if (srcRatio > targetRatio) {
        cropH = srcH;
        cropW = Math.round(cropH * targetRatio);
      } else {
        cropW = srcW;
        cropH = Math.round(cropW / targetRatio);
      }
      const originX = Math.round((srcW - cropW) / 2);
      const originY = Math.round((srcH - cropH) / 2);

      const result = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ crop: { originX, originY, width: cropW, height: cropH } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );

      const updated = [...mediaLocal];
      updated[croppingIndex] = {
        ...asset,
        uri: result.uri,
        width: cropW,
        height: cropH,
        mimeType: "image/jpeg",
      };
      setMediaLocal(updated);
      // Cropping means the underlying file changed, so clear existing ID at that index (force re-upload)
      setExistingMediaIds((prev) => {
        if (!prev) return prev;
        const copy = [...prev];
        if (copy[croppingIndex] != null) {
          copy[croppingIndex] = null;
        }
        return copy;
      });
    },
    [croppingIndex, mediaLocal]
  );

  const removeMedia = useCallback(
    (idx: number) => {
      setMediaLocal((prev) => prev.filter((_, i) => i !== idx));
      setExistingMediaIds((prev) =>
        prev ? prev.filter((_, i) => i !== idx) : prev
      );
      if (croppingIndex === idx) setCroppingIndex(null);
    },
    [croppingIndex]
  );

  /* -------------------------
     Scheduler helpers
  --------------------------*/
  const openPicker = (index: number) => {
    const base = dateTimes[index] ?? new Date(Date.now() + 60 * 60 * 1000);
    setTempDate(base);
    setPickerIndex(index);
    if (Platform.OS === "android") setStep("date");
    setPickerVisible(true);
  };

  const addSchedule = () => {
    // user manually adding/overriding schedule for this calendar param
    if (schedKey != null) setIgnoredParamKey(schedKey);
    const dt = new Date(Date.now() + 60 * 60 * 1000);
    setDateTimes((prev) => [...prev, dt]);
    openPicker(dateTimes.length);
  };

  const confirmPickerIOS = () => {
    if (pickerIndex == null) return;
    if (schedKey != null) setIgnoredParamKey(schedKey); // user edited schedule
    const copy = [...dateTimes];
    copy[pickerIndex] = tempDate;
    setDateTimes(copy);
    setPickerVisible(false);
  };

  const onChangeAndroid = (_: any, d?: Date) => {
    if (!d) {
      setPickerVisible(false);
      return;
    }
    if (step === "date") {
      const next = new Date(tempDate);
      next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
      setTempDate(next);
      setStep("time");
    } else {
      const next = new Date(tempDate);
      next.setHours(d.getHours(), d.getMinutes(), 0, 0);
      if (schedKey != null) setIgnoredParamKey(schedKey); // user edited schedule
      if (pickerIndex != null) {
        const copy = [...dateTimes];
        copy[pickerIndex] = next;
        setDateTimes(copy);
      }
      setPickerVisible(false);
      setStep("date");
    }
  };

  const removeSchedule = (i: number) => {
    if (schedKey != null) setIgnoredParamKey(schedKey); // user explicitly cleared this param's schedule
    setDateTimes((prev) => prev.filter((_, idx) => idx !== i));
  };

  /* -------------------------
     Submit
  --------------------------*/
  async function submit(status: PostStatusEnum) {
    try {
      if (!uid) return;
      if (!canCreateAtAll) {
        Alert.alert(
          "Connect required",
          "Connect your Facebook Page first in Profile."
        );
        return;
      }
      if (submitPlatforms.length === 0) {
        Alert.alert(
          "No Facebook Page",
          "A Facebook Page connection is required to post."
        );
        return;
      }
      if (mediaLocal.length === 0) {
        Alert.alert("Add media", "Please select at least one image or video.");
        return;
      }

      setSubmitting(true);

      // Upload / reuse media
      const mediaIds: string[] = [];
      for (let i = 0; i < mediaLocal.length; i++) {
        const m = mediaLocal[i];
        const existingId = existingMediaIds?.[i] ?? null;
        const isRemote =
          m.uri.startsWith("http://") || m.uri.startsWith("https://");

        if (existingId && isRemote) {
          // Draft media already in Supabase; just reuse its ID
          mediaIds.push(existingId);
          continue;
        }

        // New or modified media → upload
        const { path, publicUrl } = await uploadToBucket(
          uid,
          m.uri,
          m.mimeType
        );
        const { data, error } = await supabase
          .from("media_assets")
          .insert({
            user_id: uid,
            storage_path: path,
            public_url: publicUrl,
            width: m.width ?? null,
            height: m.height ?? null,
            duration_ms: m.durationMs ?? null,
            mime_type: m.mimeType ?? null,
          })
          .select("id")
          .single();
        if (error) throw error;
        mediaIds.push(data.id);
      }

      // Determine post type
      const hasVideo = mediaLocal.some((m) => m.type === "video");
      const postType: PostTypeEnum = hasVideo
        ? mediaLocal.length > 1
          ? "carousel"
          : videoPostKind // user chooses "reel" vs "video"
        : mediaLocal.length > 1
        ? "carousel"
        : "image";

      // Schedule list: draft -> single null; scheduled -> one or many
      const scheduleList =
        status === "draft"
          ? [null]
          : dateTimes.length
          ? dateTimes
          : [new Date()];

      for (const when of scheduleList) {
        const { error } = await supabase.rpc("create_post_with_schedules", {
          p_user_id: uid,
          p_caption: caption,
          p_post_type: postType,
          p_media_ids: mediaIds,
          p_platforms: submitPlatforms,
          p_target_ids: selectedTargets,
          p_status: status,
          p_scheduled_at: when,
          // label objective + angle on write
          p_objective: objective,
          p_angle: angle,
        });
        if (error) throw error;
      }

      // Trigger the worker whenever a post is SCHEDULED
      if (status === "scheduled" && FUNC_BASE) {
        fetch(`${FUNC_BASE}/meta_publish_worker`, {
          method: "POST",
        }).catch(() => {});
      }

      // 🔵 AFTER SUCCESS: clear form state but KEEP the angle
      setCaption("");
      setMediaLocal([]);
      setExistingMediaIds(null);
      setDateTimes([]);
      setCroppingIndex(null);
      setVideoPostKind("reel");

      Alert.alert(
        "Success",
        status === "draft"
          ? "Saved to drafts."
          : dateTimes.length > 1
          ? `Scheduled ${dateTimes.length} times.`
          : "Scheduled."
      );
      router.push("/(tabs)/calendar");
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", e?.message ?? "Failed to create post.");
    } finally {
      setSubmitting(false);
    }
  }

  /* -------------------------
     Facebook Preview
  --------------------------*/
  function FBPreview() {
    const name = connectedFB?.page_name || "Facebook Page";
    return (
      <View style={styles.previewCard}>
        <View style={styles.previewHeader}>
          <View style={[styles.avatarSm, { backgroundColor: "#1877F2" }]}>
            <Text style={styles.avatarSmText}>{initials(name)}</Text>
          </View>
          <Text style={styles.previewTitle} numberOfLines={1}>
            {name}
          </Text>
          <FontAwesome
            name="ellipsis-h"
            size={16}
            color={MUTED}
            style={{ marginLeft: "auto" }}
          />
        </View>
        {mediaLocal[0]?.type === "image" ? (
          <Image
            source={{ uri: mediaLocal[0].uri }}
            style={styles.previewMedia}
          />
        ) : (
          <View style={styles.previewMedia}>
            <Video
              source={{ uri: mediaLocal[0].uri }}
              style={{ width: "100%", height: "100%" }}
              useNativeControls={false}
              isMuted
              shouldPlay={false}
              resizeMode="cover"
            />
            <View style={styles.videoOverlay}>
              <FontAwesome name="play" size={28} color="#fff" />
            </View>
          </View>
        )}
        {caption ? (
          <Text style={styles.previewCaption}>{caption}</Text>
        ) : null}
      </View>
    );
  }

  /* -------------------------
     Render
  --------------------------*/
  if (loadingConn && !refreshing) {
    return (
      <View
        style={[
          styles.container,
          { alignItems: "center", justifyContent: "center" },
        ]}
      >
        <ActivityIndicator />
        <Text style={{ marginTop: 8, color: MUTED }}>Loading…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={TINT}
          />
        }
      >
        {/* Top bar: title + drafts + connect warning */}
        <View style={styles.topBar}>
          <Text style={styles.title}>Create</Text>
          <TouchableOpacity
            style={styles.draftsBtn}
            onPress={() => router.push("/post/drafts")}
            activeOpacity={0.9}
          >
            <FontAwesome name="file-text-o" size={12} color={TINT} />
            <Text style={styles.draftsBtnText}>Drafts</Text>
          </TouchableOpacity>
          {!canCreateAtAll && (
            <View style={styles.warnPill}>
              <FontAwesome name="plug" size={12} color="#991B1B" />
              <Text style={styles.warnText}>Connect Facebook</Text>
            </View>
          )}
        </View>

        {loadingDraft && (
          <View style={styles.draftLoadingRow}>
            <ActivityIndicator size="small" color={MUTED} />
            <Text style={styles.draftLoadingText}>Loading draft…</Text>
          </View>
        )}

        {/* Platform info (Facebook only, no toggle) */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Platform</Text>
          <View style={styles.chipsRow}>
            <View
              style={[
                styles.chipBig,
                connectedFB ? styles.chipBigActive : styles.chipDisabled,
              ]}
            >
              <FontAwesome
                name="facebook-square"
                size={16}
                color={connectedFB ? "#fff" : "#1877F2"}
              />
              <Text
                style={[
                  styles.chipBigText,
                  connectedFB && styles.chipBigTextActive,
                ]}
              >
                {connectedFB?.page_name || "Facebook Page"}
              </Text>
            </View>
          </View>
          {!connectedFB && (
            <Text style={{ color: MUTED, fontSize: 12, marginTop: 6 }}>
              Connect your Facebook Page in Profile to start posting.
            </Text>
          )}
        </View>

        {/* Industry hint */}
        {industry && (
          <View style={[styles.section, { marginTop: 6 }]}>
            <Text style={{ fontSize: 11, color: MUTED }}>
              Brand industry detected:{" "}
              <Text style={{ fontWeight: "700", color: TEXT }}>
                {prettyIndustryLabel(industry)}
              </Text>
            </Text>
          </View>
        )}

        {/* Media scroller */}
        <View style={styles.section}>
          {mediaLocal.length === 0 ? (
            <TouchableOpacity
              style={styles.emptyBox}
              onPress={pickMedia}
              activeOpacity={0.9}
            >
              <FontAwesome name="image" size={28} color={MUTED} />
              <Text style={{ color: MUTED, marginTop: 6 }}>
                Tap to pick photos or videos
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <FlatList
                data={mediaLocal}
                keyExtractor={(_, i) => String(i)}
                horizontal
                ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 2 }}
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    onPress={() => {
                      if (item.type === "image") setCroppingIndex(index);
                    }}
                    activeOpacity={0.9}
                    style={styles.mediaThumbWrap}
                  >
                    {item.type === "image" ? (
                      <Image
                        source={{ uri: item.uri }}
                        style={styles.mediaThumb}
                      />
                    ) : (
                      <View style={styles.mediaThumb}>
                        <Video
                          source={{ uri: item.uri }}
                          style={{
                            width: "100%",
                            height: "100%",
                            borderRadius: 12,
                          }}
                          resizeMode="cover"
                          isMuted
                          shouldPlay={false}
                        />
                        <View style={styles.playBadge}>
                          <FontAwesome
                            name="play"
                            color="#fff"
                            size={12}
                          />
                        </View>
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.removeBadge}
                      onPress={() => removeMedia(index)}
                      hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                    >
                      <FontAwesome name="times" color="#fff" size={12} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
              <Text
                style={{
                  color: MUTED,
                  fontSize: 11,
                  marginTop: 6,
                }}
              >
                Tap a photo to crop, or tap the preview below to change media.
              </Text>
            </>
          )}

          {/* Crop presets row */}
          {croppingIndex != null &&
          mediaLocal[croppingIndex]?.type === "image" ? (
            <View style={styles.cropRow}>
              <Text style={styles.subtle}>Crop</Text>
              <TouchableOpacity
                onPress={() => doCropPreset("1:1")}
                style={styles.chipSmall}
              >
                <Text style={styles.chipSmallText}>1:1</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => doCropPreset("4:5")}
                style={styles.chipSmall}
              >
                <Text style={styles.chipSmallText}>4:5</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => doCropPreset("16:9")}
                style={styles.chipSmall}
              >
                <Text style={styles.chipSmallText}>16:9</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCroppingIndex(null)}
                style={[
                  styles.chipSmall,
                  { backgroundColor: "#F3F4F6", borderColor: BORDER },
                ]}
              >
                <Text
                  style={[
                    styles.chipSmallText,
                    { color: TEXT },
                  ]}
                >
                  Done
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* Reel vs Video toggle (only when single video) */}
        {isSingleVideo && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Video format</Text>
            <View style={styles.videoToggleRow}>
              <TouchableOpacity
                style={[
                  styles.videoToggleChip,
                  videoPostKind === "reel" &&
                    styles.videoToggleChipActive,
                ]}
                onPress={() => setVideoPostKind("reel")}
                activeOpacity={0.9}
              >
                <Text
                  style={[
                    styles.videoToggleText,
                    videoPostKind === "reel" &&
                      styles.videoToggleTextActive,
                  ]}
                >
                  Reel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.videoToggleChip,
                  videoPostKind === "video" &&
                    styles.videoToggleChipActive,
                ]}
                onPress={() => setVideoPostKind("video")}
                activeOpacity={0.9}
              >
                <Text
                  style={[
                    styles.videoToggleText,
                    videoPostKind === "video" &&
                      styles.videoToggleTextActive,
                  ]}
                >
                  Video
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>
              Applies when posting a single video. Carousels always use carousel
              format.
            </Text>
          </View>
        )}

        {/* Objective selector */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Objective</Text>
          <View style={styles.objectiveRow}>
            {OBJECTIVE_OPTIONS.map((opt) => {
              const active = objective === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.objectiveChip,
                    active && styles.objectiveChipActive,
                  ]}
                  activeOpacity={0.9}
                  onPress={() => setObjective(opt.key)}
                >
                  <Text
                    style={[
                      styles.objectiveLabel,
                      active && styles.objectiveLabelActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  <Text
                    style={[
                      styles.objectiveSubtitle,
                      active && styles.objectiveSubtitleActive,
                    ]}
                    numberOfLines={2}
                  >
                    {opt.subtitle}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Angle selector – collapsed, opens modal */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Angle</Text>
          <TouchableOpacity
            style={styles.angleSelector}
            onPress={() => {
              setAngleSearch("");
              setAngleModalVisible(true);
            }}
            activeOpacity={0.9}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <FontAwesome
                name="tag"
                size={14}
                color={selectedAngleDef ? TINT : MUTED}
                style={{ marginRight: 8 }}
              />
              {selectedAngleDef ? (
                <Text style={styles.angleSelectorLabel}>
                  {selectedAngleDef.label}
                </Text>
              ) : (
                <Text style={styles.angleSelectorPlaceholder}>
                  Select angle
                </Text>
              )}
            </View>
            <FontAwesome
              name="chevron-right"
              size={12}
              color={MUTED}
            />
          </TouchableOpacity>
          {industry && selectedAngleDef && (
            <Text style={styles.angleSelectorHint}>
              Personalized for{" "}
              <Text style={{ fontWeight: "700" }}>
                {prettyIndustryLabel(industry)}
              </Text>
              .
            </Text>
          )}
        </View>

        {/* Caption */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Caption</Text>
          <View style={styles.captionBox}>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              multiline
              placeholder="Write a caption…"
              placeholderTextColor="#94A3B8"
              style={styles.captionInput}
              maxLength={2200}
            />
            <Text style={styles.counter}>
              {caption.length}/2200
            </Text>
          </View>
        </View>

        {/* Live Preview */}
        {mediaLocal.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Preview</Text>
            <TouchableOpacity activeOpacity={0.9} onPress={pickMedia}>
              <FBPreview />
            </TouchableOpacity>
            <Text style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>
              Tap the preview to change or add media.
            </Text>
          </View>
        ) : null}

        {/* Scheduler */}
        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionLabel}>Schedule</Text>
            <TouchableOpacity
              onPress={addSchedule}
              style={styles.iconBtnLite}
            >
              <FontAwesome name="plus" size={14} color={TINT} />
              <Text style={styles.iconBtnLiteText}>Add</Text>
            </TouchableOpacity>
          </View>

          {dateTimes.length === 0 ? (
            <Text style={{ color: MUTED, marginTop: 6 }}>
              No schedules yet.
            </Text>
          ) : (
            <View style={styles.timeChipWrap}>
              {dateTimes.map((dt, i) => (
                <View key={i} style={styles.timeChip}>
                  <TouchableOpacity
                    onPress={() => openPicker(i)}
                    style={styles.timeChipInner}
                    activeOpacity={0.9}
                  >
                    <FontAwesome
                      name="clock-o"
                      size={12}
                      color="#fff"
                    />
                    <Text style={styles.timeChipText}>
                      {formatDateTime(dt)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => removeSchedule(i)}
                    style={styles.timeChipX}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <FontAwesome
                      name="times"
                      size={10}
                      color="#fff"
                    />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={() => submit("draft")}
            disabled={!canCreateAtAll || submitting}
            style={[
              styles.actionBtn,
              styles.btnGhost,
              (!canCreateAtAll || submitting) && styles.disabled,
            ]}
          >
            <FontAwesome name="save" size={14} color={TINT} />
            <Text style={styles.actionGhostText}>Draft</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => submit("scheduled")}
            disabled={
              !canCreateAtAll ||
              submitPlatforms.length === 0 ||
              mediaLocal.length === 0 ||
              submitting
            }
            style={[
              styles.actionBtn,
              styles.btnPrimary,
              (!canCreateAtAll ||
                submitPlatforms.length === 0 ||
                mediaLocal.length === 0 ||
                submitting) && styles.disabled,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <FontAwesome name="send" size={14} color="#fff" />
            )}
            <Text style={styles.actionPrimaryText}>
              Post / Schedule
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: FOOTER_SPACER }} />
      </ScrollView>

      {/* Scheduler Modal */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPickerVisible(false)}
        />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Pick date & time</Text>
            <TouchableOpacity
              onPress={() => setPickerVisible(false)}
            >
              <FontAwesome name="times" size={16} color={MUTED} />
            </TouchableOpacity>
          </View>

          {Platform.OS === "ios" ? (
            <>
              <DateTimePicker
                mode="datetime"
                display="spinner"
                value={tempDate}
                onChange={(_, d) => d && setTempDate(d)}
                textColor={TEXT as any}
                themeVariant="light"
                style={{ alignSelf: "stretch" }}
              />
              <TouchableOpacity
                onPress={confirmPickerIOS}
                style={[
                  styles.actionBtn,
                  styles.btnPrimary,
                  { marginTop: 10 },
                ]}
              >
                <Text style={styles.actionPrimaryText}>Done</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={{ gap: 12 }}>
                {step === "date" ? (
                  <DateTimePicker
                    mode="date"
                    display="calendar"
                    value={tempDate}
                    onChange={onChangeAndroid}
                  />
                ) : (
                  <DateTimePicker
                    mode="time"
                    display="clock"
                    value={tempDate}
                    onChange={onChangeAndroid}
                  />
                )}
              </View>
              <Text
                style={{
                  color: MUTED,
                  fontSize: 12,
                  marginTop: 10,
                }}
              >
                {step === "date"
                  ? "Pick a date…"
                  : "Now pick a time…"}
              </Text>
            </>
          )}
        </View>
      </Modal>

      {/* Angle Selector Modal */}
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

          {/* Search bar */}
          <View style={[styles.angleSearchRow, { marginTop: 10 }]}>
            <FontAwesome
              name="search"
              size={14}
              color={MUTED}
              style={{ marginRight: 6 }}
            />
            <TextInput
              style={styles.angleSearchInput}
              placeholder="Search angles (e.g. 'testimonial', 'promo')"
              placeholderTextColor="#9CA3AF"
              value={angleSearch}
              onChangeText={setAngleSearch}
              autoCorrect={false}
            />
          </View>

          {/* Suggested angles for this industry (only when no search) */}
          {suggestedAngles.length > 0 && !angleSearch.trim() && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.angleCategoryLabel}>
                Suggested for{" "}
                {prettyIndustryLabel(industry) || "your brand"}
              </Text>
              <Text style={styles.angleCategoryDesc}>
                Based on your brand industry, here are good starting
                angles.
              </Text>
              <View style={styles.angleRow}>
                {suggestedAngles.map((opt) => {
                  const active = angle === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.angleChip,
                        active && styles.angleChipActive,
                      ]}
                      onPress={() => setAngle(opt.key)}
                      activeOpacity={0.9}
                    >
                      <Text
                        style={[
                          styles.angleText,
                          active && styles.angleTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Categories list */}
          <ScrollView
            style={{ marginTop: 12, maxHeight: 280 }}
            nestedScrollEnabled
          >
            {filteredAngleCategories.map((cat) => (
              <View key={cat.id} style={{ marginBottom: 10 }}>
                <Text style={styles.angleCategoryLabel}>{cat.label}</Text>
                {cat.description ? (
                  <Text style={styles.angleCategoryDesc}>
                    {cat.description}
                  </Text>
                ) : null}
                <View style={styles.angleRow}>
                  {cat.angles.map((opt) => {
                    const active = angle === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.angleChip,
                          active && styles.angleChipActive,
                        ]}
                        onPress={() => setAngle(opt.key)}
                        activeOpacity={0.9}
                      >
                        <Text
                          style={[
                            styles.angleText,
                            active && styles.angleTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}

            {filteredAngleCategories.length === 0 && (
              <Text
                style={{ color: MUTED, fontSize: 12, marginTop: 6 }}
              >
                No angles found. Try another keyword.
              </Text>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[
              styles.actionBtn,
              styles.btnPrimary,
              { marginTop: 10 },
            ]}
            onPress={() => setAngleModalVisible(false)}
            activeOpacity={0.9}
          >
            <Text style={styles.actionPrimaryText}>Done</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/* -------------------------
   Styles
--------------------------*/
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: {
    paddingHorizontal: 16,
    paddingTop: HEADER_SPACER,
    paddingBottom: FOOTER_SPACER,
  },

  topBar: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  title: { flex: 1, fontSize: 22, fontWeight: "800", color: TEXT },
  draftsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#EEF2FF",
    marginRight: 8,
  },
  draftsBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: TINT,
  },
  warnPill: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  warnText: { color: "#991B1B", fontSize: 12, fontWeight: "700" },

  draftLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  draftLoadingText: {
    fontSize: 12,
    color: MUTED,
  },

  section: { marginTop: 12 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: TEXT,
    marginBottom: 8,
  },

  chipsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  chipBig: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F8FAFC",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  chipBigActive: { backgroundColor: TINT, borderColor: TINT },
  chipBigText: { fontWeight: "800", color: TEXT, fontSize: 13 },
  chipBigTextActive: { color: "#fff" },
  chipDisabled: { opacity: 0.5 },

  iconBtnLite: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F3F4F6",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  iconBtnLiteText: { fontWeight: "800", color: TINT, fontSize: 12 },

  emptyBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },

  mediaThumbWrap: { position: "relative" },
  mediaThumb: {
    width: 110,
    height: 140,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
  },
  playBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 999,
    padding: 6,
  },
  removeBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 999,
    padding: 6,
  },

  cropRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  subtle: { color: MUTED, fontSize: 12 },
  chipSmall: {
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "#111827",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  chipSmallText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  // Video format toggle
  videoToggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  videoToggleChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  videoToggleChipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  videoToggleText: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT,
  },
  videoToggleTextActive: {
    color: "#F9FAFB",
  },

  // objective chips
  objectiveRow: {
    flexDirection: "row",
    gap: 8,
  },
  objectiveChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F9FAFB",
  },
  objectiveChipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  objectiveLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: TEXT,
    marginBottom: 2,
  },
  objectiveLabelActive: {
    color: "#F9FAFB",
  },
  objectiveSubtitle: {
    fontSize: 11,
    color: MUTED,
  },
  objectiveSubtitleActive: {
    color: "#E5E7EB",
  },

  // angle selector (collapsed)
  angleSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#F9FAFB",
  },
  angleSelectorLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT,
  },
  angleSelectorPlaceholder: {
    fontSize: 13,
    fontWeight: "500",
    color: MUTED,
  },
  angleSelectorHint: {
    marginTop: 4,
    fontSize: 11,
    color: MUTED,
  },

  // angle search + categories
  angleSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#F9FAFB",
  },
  angleSearchInput: {
    flex: 1,
    fontSize: 13,
    color: TEXT,
    paddingVertical: 2,
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

  // angle chips
  angleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  angleChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F3F4F6",
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  angleChipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  angleText: {
    fontSize: 12,
    fontWeight: "700",
    color: TEXT,
  },
  angleTextActive: {
    color: "#F9FAFB",
  },

  captionBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 10,
  },
  captionInput: {
    minHeight: 70,
    textAlignVertical: "top",
    color: TEXT,
  },
  counter: {
    marginTop: 6,
    color: MUTED,
    fontSize: 11,
    textAlign: "right",
  },

  previewCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  previewTitle: { fontWeight: "800", color: TEXT, fontSize: 14 },
  avatarSm: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSmText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  previewMedia: { width: "100%", height: 260, backgroundColor: "#E5E7EB" },
  videoOverlay: {
    position: "absolute",
    top: "45%",
    left: "45%",
    backgroundColor: "rgba(0,0,0,0.4)",
    padding: 10,
    borderRadius: 999,
  },
  previewCaption: { padding: 10, color: TEXT },

  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  timeChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  timeChip: { position: "relative" },
  timeChipInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: TINT,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  timeChipText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  timeChipX: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#111827",
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: "#fff",
  },

  actionRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  btnPrimary: { backgroundColor: "#111827" },
  actionPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  btnGhost: { borderWidth: 1, borderColor: BORDER, backgroundColor: "#fff" },
  actionGhostText: { color: "#111827", fontWeight: "800", fontSize: 14 },
  disabled: { opacity: 0.6 },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)" },
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
    // slightly taller for angle picker
    maxHeight: "80%",
  },
  modalHeader: { flexDirection: "row", alignItems: "center" },
  modalTitle: {
    color: TEXT,
    fontWeight: "800",
    fontSize: 15,
    marginRight: "auto",
  },
});
