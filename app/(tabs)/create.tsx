// app/(tabs)/create.tsx
import { supabase } from "@/lib/supabase";
import { FontAwesome } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Video } from "expo-av";
import * as ExpoCrypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
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
} from "react-native";

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
const HEADER_SPACER = 72;  // room for header
const FOOTER_SPACER = 120; // room for tab bar / action buttons

function zeroPad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function formatDateTime(d: Date) {
  return `${d.getFullYear()}-${zeroPad(d.getMonth()+1)}-${zeroPad(d.getDate())} ${zeroPad(d.getHours())}:${zeroPad(d.getMinutes())}`;
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

/* -------------------------
   Base64 → Uint8Array
--------------------------*/
function base64ToUint8Array(b64: string) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
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
    const n = (enc1 << 18) | (enc2 << 12) | ((enc3 & 63) << 6) | (enc4 & 63);
    if (p < bufferLength) bytes[p++] = (n >> 16) & 255;
    if (p < bufferLength) bytes[p++] = (n >> 8) & 255;
    if (p < bufferLength) bytes[p++] = n & 255;
  }
  return bytes;
}

/* -------------------------
   Upload to Supabase Storage (bucket: media)
--------------------------*/
async function uploadToBucket(uid: string, localUri: string, mimeType?: string | null) {
  const ext = fileExtFromUri(localUri);
  const fileName = `${await ExpoCrypto.randomUUID()}.${ext}`;
  const path = `${uid}/${fileName}`;
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: "base64" as any });
  const binary = base64ToUint8Array(base64);
  const { error } = await supabase.storage.from("media").upload(path, binary, {
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
type PlatformEnum = "facebook" | "instagram";
type PostTypeEnum = "image" | "video" | "reel" | "story" | "carousel" | "link";
type PostStatusEnum = "draft" | "scheduled" | "posting" | "posted" | "failed" | "canceled";

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
};

/* -------------------------
   Main Screen
--------------------------*/
export default function CreateScreen() {
  const [uid, setUid] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectedMeta[]>([]);
  const [loadingConn, setLoadingConn] = useState(true);

  const [caption, setCaption] = useState("");
  const [mediaLocal, setMediaLocal] = useState<Array<{
    uri: string; type: "image" | "video"; width?: number; height?: number; durationMs?: number; mimeType?: string;
  }>>([]);
  const [croppingIndex, setCroppingIndex] = useState<number | null>(null);

  const [platformFB, setPlatformFB] = useState(false);
  const [platformIG, setPlatformIG] = useState(false);

  const [dateTimes, setDateTimes] = useState<Date[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Scheduler modal state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const [step, setStep] = useState<"date" | "time">("date"); // Android: two-step

  // Fetch user + connections
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        if (!user) { Alert.alert("Sign in required", "Please log in to create posts."); router.replace("/(auth)"); return; }
        setUid(user.id);
        setLoadingConn(true);
        const { data: conn, error } = await supabase
          .from("connected_meta_accounts")
          .select("id,user_id,platform,page_id,page_name,ig_user_id,ig_username,access_token,token_expires_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        setConnections((conn || []) as any);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingConn(false);
      }
    })();
  }, []);

  const connectedFB = useMemo(() => connections.find((c) => c.platform === "facebook" && c.page_id), [connections]);
  const connectedIG = useMemo(() => connections.find((c) => c.platform === "instagram" && c.ig_user_id), [connections]);

  const canCreateAtAll = !!(connectedFB || connectedIG);
  const submitPlatforms: PlatformEnum[] = useMemo(() => {
    const arr: PlatformEnum[] = [];
    if (platformFB && connectedFB) arr.push("facebook");
    if (platformIG && connectedIG) arr.push("instagram");
    return arr;
  }, [platformFB, connectedFB, platformIG, connectedIG]);

  const selectedTargets: string[] = useMemo(() => {
    const t: string[] = [];
    if (platformFB && connectedFB?.page_id) t.push(connectedFB.page_id);
    if (platformIG && connectedIG?.ig_user_id) t.push(connectedIG.ig_user_id);
    return t;
  }, [platformFB, connectedFB, platformIG, connectedIG]);

  /* -------------------------
     Media Picker
  --------------------------*/
  const pickMedia = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission needed", "Please allow gallery access."); return; }
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
      mimeType: a.mimeType || (a.type?.includes("video") ? "video/mp4" : "image/jpeg"),
    }));
    setMediaLocal((prev) => [...prev, ...mapped]);
  }, []);

  /* -------------------------
     Crop presets (images)
  --------------------------*/
  const doCropPreset = useCallback(
    async (ratio: "1:1" | "4:5" | "16:9") => {
      if (croppingIndex == null) return;
      const asset = mediaLocal[croppingIndex];
      if (!asset || asset.type !== "image" || !asset.width || !asset.height) return;

      const [rw, rh] = ratio === "1:1" ? [1,1] : ratio === "4:5" ? [4,5] : [16,9];
      const targetRatio = rw / rh;

      const srcW = asset.width; const srcH = asset.height; const srcRatio = srcW / srcH;
      let cropW = 0, cropH = 0;
      if (srcRatio > targetRatio) { cropH = srcH; cropW = Math.round(cropH * targetRatio); }
      else { cropW = srcW; cropH = Math.round(cropW / targetRatio); }
      const originX = Math.round((srcW - cropW) / 2);
      const originY = Math.round((srcH - cropH) / 2);

      const result = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ crop: { originX, originY, width: cropW, height: cropH } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );

      const updated = [...mediaLocal];
      updated[croppingIndex] = { ...asset, uri: result.uri, width: cropW, height: cropH, mimeType: "image/jpeg" };
      setMediaLocal(updated);
    },
    [croppingIndex, mediaLocal]
  );

  const removeMedia = useCallback((idx: number) => {
    setMediaLocal((prev) => prev.filter((_, i) => i !== idx));
    if (croppingIndex === idx) setCroppingIndex(null);
  }, [croppingIndex]);

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
    const dt = new Date(Date.now() + 60 * 60 * 1000);
    setDateTimes((prev) => [...prev, dt]);
    openPicker(dateTimes.length);
  };
  const confirmPickerIOS = () => {
    if (pickerIndex == null) return;
    const copy = [...dateTimes];
    copy[pickerIndex] = tempDate;
    setDateTimes(copy);
    setPickerVisible(false);
  };
  const onChangeAndroid = (_: any, d?: Date) => {
    if (!d) { setPickerVisible(false); return; }
    if (step === "date") {
      const next = new Date(tempDate);
      next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
      setTempDate(next);
      setStep("time");
    } else {
      const next = new Date(tempDate);
      next.setHours(d.getHours(), d.getMinutes(), 0, 0);
      if (pickerIndex != null) {
        const copy = [...dateTimes];
        copy[pickerIndex] = next;
        setDateTimes(copy);
      }
      setPickerVisible(false);
      setStep("date");
    }
  };
  const removeSchedule = (i: number) => setDateTimes((prev) => prev.filter((_, idx) => idx !== i));

  /* -------------------------
     Submit
  --------------------------*/
  async function submit(status: PostStatusEnum) {
    try {
      if (!uid) return;
      if (!canCreateAtAll) { Alert.alert("Connect required", "Connect Facebook or Instagram first."); return; }
      if (submitPlatforms.length === 0) { Alert.alert("Pick a platform", "Choose Facebook, Instagram, or both."); return; }
      if (mediaLocal.length === 0) { Alert.alert("Add media", "Please select at least one image or video."); return; }

      setSubmitting(true);

      // Upload media
      const mediaIds: string[] = [];
      for (const m of mediaLocal) {
        const { path, publicUrl } = await uploadToBucket(uid, m.uri, m.mimeType);
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
        ? mediaLocal.length > 1 ? "carousel" : "video"
        : mediaLocal.length > 1 ? "carousel" : "image";

      // Schedule list: draft -> single null; scheduled -> one or many
      const scheduleList = status === "draft" ? [null] : (dateTimes.length ? dateTimes : [new Date()]);

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
        });
        if (error) throw error;
      }

      // 🔔 Trigger the worker immediately whenever a post is SCHEDULED
      if (status === "scheduled" && FUNC_BASE) {
        // fire-and-forget
        fetch(`${FUNC_BASE}/meta_publish_worker`, { method: "POST" }).catch(() => {});
      }

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
     Previews
  --------------------------*/
  function IGPreview() {
    const h = connectedIG?.ig_username ? `@${connectedIG.ig_username}` : "@instagram_user";
    return (
      <View style={styles.previewCard}>
        <View style={styles.previewHeader}>
          <View style={styles.avatarSm}><Text style={styles.avatarSmText}>{initials(connectedIG?.ig_username || "IG")}</Text></View>
          <Text style={styles.previewTitle} numberOfLines={1}>{h}</Text>
          <FontAwesome name="ellipsis-h" size={16} color={MUTED} style={{ marginLeft: "auto" }} />
        </View>
        {mediaLocal[0]?.type === "image" ? (
          <Image source={{ uri: mediaLocal[0].uri }} style={styles.previewMedia} />
        ) : (
          <View style={styles.previewMedia}>
            <Video source={{ uri: mediaLocal[0].uri }} style={{ width:"100%", height:"100%" }} useNativeControls={false} isMuted shouldPlay={false} resizeMode="cover" />
            <View style={styles.videoOverlay}><FontAwesome name="play" size={28} color="#fff" /></View>
          </View>
        )}
        {caption ? <Text style={styles.previewCaption}>{caption}</Text> : null}
      </View>
    );
  }
  function FBPreview() {
    const name = connectedFB?.page_name || "Facebook Page";
    return (
      <View style={styles.previewCard}>
        <View style={styles.previewHeader}>
          <View style={[styles.avatarSm, { backgroundColor: "#1877F2" }]}><Text style={styles.avatarSmText}>{initials(name)}</Text></View>
          <Text style={styles.previewTitle} numberOfLines={1}>{name}</Text>
          <FontAwesome name="ellipsis-h" size={16} color={MUTED} style={{ marginLeft: "auto" }} />
        </View>
        {mediaLocal[0]?.type === "image" ? (
          <Image source={{ uri: mediaLocal[0].uri }} style={styles.previewMedia} />
        ) : (
          <View style={styles.previewMedia}>
            <Video source={{ uri: mediaLocal[0].uri }} style={{ width:"100%", height:"100%" }} useNativeControls={false} isMuted shouldPlay={false} resizeMode="cover" />
            <View style={styles.videoOverlay}><FontAwesome name="play" size={28} color="#fff" /></View>
          </View>
        )}
        {caption ? <Text style={styles.previewCaption}>{caption}</Text> : null}
      </View>
    );
  }

  const previewTabs = useMemo(() => {
    const tabs: Array<{ key: PlatformEnum; label: string; shown: boolean }> = [
      { key: "instagram", label: "Instagram", shown: platformIG },
      { key: "facebook", label: "Facebook", shown: platformFB },
    ];
    const has = tabs.filter((t) => t.shown);
    return has.length ? has : [{ key: "instagram", label: "Instagram", shown: true }];
  }, [platformIG, platformFB]);

  /* -------------------------
     Render
  --------------------------*/
  if (loadingConn) {
    return (
      <View style={[styles.container, { alignItems:"center", justifyContent:"center" }]}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8, color: MUTED }}>Loading…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Top bar: title + connect warning */}
        <View style={styles.topBar}>
          <Text style={styles.title}>Create</Text>
          {!canCreateAtAll && (
            <View style={styles.warnPill}>
              <FontAwesome name="plug" size={12} color="#991B1B" />
              <Text style={styles.warnText}>Connect Meta</Text>
            </View>
          )}
        </View>

        {/* Platform chips */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Platforms</Text>
          <View style={styles.chipsRow}>
            <TouchableOpacity
              disabled={!connectedIG}
              onPress={() => setPlatformIG((v) => !v)}
              style={[styles.chipBig, platformIG && styles.chipBigActive, !connectedIG && styles.chipDisabled]}
            >
              <FontAwesome name="instagram" size={16} color={platformIG ? "#fff" : connectedIG ? "#C13584" : "#9CA3AF"} />
              <Text style={[styles.chipBigText, platformIG && styles.chipBigTextActive]}>IG</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!connectedFB}
              onPress={() => setPlatformFB((v) => !v)}
              style={[styles.chipBig, platformFB && styles.chipBigActive, !connectedFB && styles.chipDisabled]}
            >
              <FontAwesome name="facebook-square" size={16} color={platformFB ? "#fff" : connectedFB ? "#1877F2" : "#9CA3AF"} />
              <Text style={[styles.chipBigText, platformFB && styles.chipBigTextActive]}>FB</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={pickMedia} style={[styles.iconBtnLite]}>
              <FontAwesome name="image" size={16} color={TINT} />
              <Text style={styles.iconBtnLiteText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Media scroller */}
        <View style={styles.section}>
          {mediaLocal.length === 0 ? (
            <View style={styles.emptyBox}>
              <FontAwesome name="image" size={28} color={MUTED} />
              <Text style={{ color: MUTED, marginTop: 6 }}>Pick photos or videos</Text>
            </View>
          ) : (
            <FlatList
              data={mediaLocal}
              keyExtractor={(_, i) => String(i)}
              horizontal
              ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 2 }}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  onPress={() => { if (item.type === "image") setCroppingIndex(index); }}
                  activeOpacity={0.9}
                  style={styles.mediaThumbWrap}
                >
                  {item.type === "image" ? (
                    <Image source={{ uri: item.uri }} style={styles.mediaThumb} />
                  ) : (
                    <View style={styles.mediaThumb}>
                      <Video source={{ uri: item.uri }} style={{ width:"100%", height:"100%", borderRadius: 12 }} resizeMode="cover" isMuted shouldPlay={false} />
                      <View style={styles.playBadge}><FontAwesome name="play" color="#fff" size={12} /></View>
                    </View>
                  )}
                  <TouchableOpacity style={styles.removeBadge} onPress={() => removeMedia(index)} hitSlop={{ top:10, right:10, bottom:10, left:10 }}>
                    <FontAwesome name="times" color="#fff" size={12} />
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
          )}

          {/* Crop presets row */}
          {croppingIndex != null && mediaLocal[croppingIndex]?.type === "image" ? (
            <View style={styles.cropRow}>
              <Text style={styles.subtle}>Crop</Text>
              <TouchableOpacity onPress={() => doCropPreset("1:1")} style={styles.chipSmall}><Text style={styles.chipSmallText}>1:1</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => doCropPreset("4:5")} style={styles.chipSmall}><Text style={styles.chipSmallText}>4:5</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => doCropPreset("16:9")} style={styles.chipSmall}><Text style={styles.chipSmallText}>16:9</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setCroppingIndex(null)} style={[styles.chipSmall, { backgroundColor:"#F3F4F6", borderColor:BORDER }]}><Text style={[styles.chipSmallText, { color: TEXT }]}>Done</Text></TouchableOpacity>
            </View>
          ) : null}
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
            <Text style={styles.counter}>{caption.length}/2200</Text>
          </View>
        </View>

        {/* Live Preview */}
        {mediaLocal.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.previewTabs}>
              {previewTabs.map((t) => (
                <View key={t.key} style={styles.tabPill}><Text style={styles.tabText}>{t.label}</Text></View>
              ))}
            </View>
            {platformIG ? <IGPreview /> : platformFB ? <FBPreview /> : <IGPreview />}
          </View>
        ) : null}

        {/* Scheduler */}
        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionLabel}>Schedule</Text>
            <TouchableOpacity onPress={addSchedule} style={styles.iconBtnLite}>
              <FontAwesome name="plus" size={14} color={TINT} />
              <Text style={styles.iconBtnLiteText}>Add</Text>
            </TouchableOpacity>
          </View>

          {dateTimes.length === 0 ? (
            <Text style={{ color: MUTED, marginTop: 6 }}>No schedules yet.</Text>
          ) : (
            <View style={styles.timeChipWrap}>
              {dateTimes.map((dt, i) => (
                <View key={i} style={styles.timeChip}>
                  <TouchableOpacity onPress={() => openPicker(i)} style={styles.timeChipInner} activeOpacity={0.9}>
                    <FontAwesome name="clock-o" size={12} color="#fff" />
                    <Text style={styles.timeChipText}>{formatDateTime(dt)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeSchedule(i)} style={styles.timeChipX} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                    <FontAwesome name="times" size={10} color="#fff" />
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
            style={[styles.actionBtn, styles.btnGhost, (!canCreateAtAll || submitting) && styles.disabled]}
          >
            <FontAwesome name="save" size={14} color={TINT} />
            <Text style={styles.actionGhostText}>Draft</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => submit("scheduled")}
            disabled={!canCreateAtAll || submitPlatforms.length === 0 || mediaLocal.length === 0 || submitting}
            style={[styles.actionBtn, styles.btnPrimary, (!canCreateAtAll || submitPlatforms.length === 0 || mediaLocal.length === 0 || submitting) && styles.disabled]}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <FontAwesome name="send" size={14} color="#fff" />}
            <Text style={styles.actionPrimaryText}>Post / Schedule</Text>
          </TouchableOpacity>
        </View>

        {/* bottom spacer so last buttons never hide behind footer */}
        <View style={{ height: FOOTER_SPACER }} />
      </ScrollView>

      {/* Scheduler Modal */}
      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerVisible(false)} />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Pick date & time</Text>
            <TouchableOpacity onPress={() => setPickerVisible(false)}><FontAwesome name="times" size={16} color={MUTED} /></TouchableOpacity>
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
                style={{ alignSelf:"stretch" }}
              />
              <TouchableOpacity onPress={confirmPickerIOS} style={[styles.actionBtn, styles.btnPrimary, { marginTop: 10 }]}>
                <Text style={styles.actionPrimaryText}>Done</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={{ gap: 12 }}>
                {step === "date" ? (
                  <DateTimePicker mode="date" display="calendar" value={tempDate} onChange={onChangeAndroid} />
                ) : (
                  <DateTimePicker mode="time" display="clock" value={tempDate} onChange={onChangeAndroid} />
                )}
              </View>
              <Text style={{ color: MUTED, fontSize: 12, marginTop: 10 }}>
                {step === "date" ? "Pick a date…" : "Now pick a time…"}
              </Text>
            </>
          )}
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
    paddingTop: HEADER_SPACER,   // TOP SAFE SPACE
    paddingBottom: FOOTER_SPACER // BOTTOM SAFE SPACE
  },

  topBar: { flexDirection:"row", alignItems:"center", marginBottom: 6 },
  title: { fontSize: 22, fontWeight: "800", color: TEXT },
  warnPill: {
    marginLeft: "auto",
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

  section: { marginTop: 12 },
  sectionLabel: { fontSize: 13, fontWeight: "800", color: TEXT, marginBottom: 8 },

  chipsRow: { flexDirection: "row", alignItems:"center", gap: 10 },
  chipBig: {
    flexDirection:"row", alignItems:"center", gap: 6,
    borderWidth: 1, borderColor: BORDER, backgroundColor:"#F8FAFC",
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
  },
  chipBigActive: { backgroundColor: TINT, borderColor: TINT },
  chipBigText: { fontWeight:"800", color: TEXT, fontSize: 13 },
  chipBigTextActive: { color:"#fff" },
  chipDisabled: { opacity: 0.5 },

  iconBtnLite: {
    marginLeft: "auto",
    flexDirection:"row", alignItems:"center", gap: 6,
    backgroundColor: "#F3F4F6",
    paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: 10, borderWidth: 1, borderColor: BORDER,
  },
  iconBtnLiteText: { fontWeight:"800", color: TINT, fontSize: 12 },

  emptyBox: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 12,
    padding: 24, alignItems: "center", justifyContent: "center",
  },

  mediaThumbWrap: { position: "relative" },
  mediaThumb: { width: 110, height: 140, borderRadius: 12, backgroundColor: "#E5E7EB" },
  playBadge: { position: "absolute", right: 8, bottom: 8, backgroundColor:"rgba(0,0,0,0.6)", borderRadius: 999, padding: 6 },
  removeBadge: { position: "absolute", top: -6, right: -6, backgroundColor:"rgba(0,0,0,0.7)", borderRadius: 999, padding: 6 },

  cropRow: { flexDirection:"row", alignItems:"center", gap: 8, marginTop: 10 },
  subtle: { color: MUTED, fontSize: 12 },
  chipSmall: { borderWidth:1, borderColor:"transparent", backgroundColor:"#111827", paddingVertical:6, paddingHorizontal:10, borderRadius:999 },
  chipSmallText: { color:"#fff", fontWeight:"800", fontSize:12 },

  captionBox: { borderWidth:1, borderColor:BORDER, borderRadius:12, padding: 10 },
  captionInput: { minHeight: 70, textAlignVertical: "top", color: TEXT },
  counter: { marginTop: 6, color: MUTED, fontSize: 11, textAlign: "right" },

  previewTabs: { flexDirection:"row", gap: 8, marginBottom: 8 },
  tabPill: { backgroundColor:"#F3F4F6", borderWidth:1, borderColor:BORDER, borderRadius:999, paddingVertical:6, paddingHorizontal:10 },
  tabText: { fontWeight:"800", color: TEXT, fontSize: 12 },

  previewCard: { borderWidth:1, borderColor:BORDER, borderRadius:14, overflow:"hidden", backgroundColor:"#fff" },
  previewHeader: { flexDirection:"row", alignItems:"center", gap: 8, padding: 10, borderBottomWidth:1, borderBottomColor:BORDER },
  previewTitle: { fontWeight:"800", color: TEXT, fontSize: 14 },
  avatarSm: { width: 28, height: 28, borderRadius:14, backgroundColor: "#111827", alignItems:"center", justifyContent:"center" },
  avatarSmText: { color:"#fff", fontWeight:"800", fontSize: 12 },
  previewMedia: { width:"100%", height:260, backgroundColor:"#E5E7EB" },
  videoOverlay: { position:"absolute", top:"45%", left:"45%", backgroundColor:"rgba(0,0,0,0.4)", padding:10, borderRadius:999 },
  previewCaption: { padding: 10, color: TEXT },

  rowBetween: { flexDirection:"row", alignItems:"center", justifyContent:"space-between" },

  timeChipWrap: { flexDirection:"row", flexWrap:"wrap", gap: 8, marginTop: 8 },
  timeChip: { position:"relative" },
  timeChipInner: { flexDirection:"row", alignItems:"center", gap:6, backgroundColor: TINT, paddingVertical:8, paddingHorizontal:12, borderRadius: 999 },
  timeChipText: { color:"#fff", fontWeight:"800", fontSize: 12 },
  timeChipX: { position:"absolute", top:-6, right:-6, backgroundColor:"#111827", borderRadius:999, padding:4, borderWidth:1, borderColor:"#fff" },

  actionRow: { flexDirection:"row", gap: 10, marginTop: 16 },
  actionBtn: { flex:1, borderRadius: 12, paddingVertical: 12, alignItems:"center", justifyContent:"center", flexDirection:"row", gap:8 },
  btnPrimary: { backgroundColor: "#111827" },
  actionPrimaryText: { color:"#fff", fontWeight:"800", fontSize: 14 },
  btnGhost: { borderWidth: 1, borderColor: BORDER, backgroundColor:"#fff" },
  actionGhostText: { color:"#111827", fontWeight:"800", fontSize: 14 },
  disabled: { opacity: 0.6 },

  // Modal
  modalBackdrop: { flex:1, backgroundColor:"rgba(0,0,0,0.25)" },
  modalCard: {
    position:"absolute", left:16, right:16, bottom: 24,
    backgroundColor:"#fff", borderRadius: 16, borderWidth:1, borderColor:BORDER,
    padding: 12, shadowColor:"#000", shadowOpacity:0.08, shadowOffset:{width:0, height:6}, shadowRadius:12, elevation:3
  },
  modalHeader: { flexDirection:"row", alignItems:"center" },
  modalTitle: { color: TEXT, fontWeight:"800", fontSize: 15, marginRight: "auto" },
});
