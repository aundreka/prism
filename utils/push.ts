// utils/push.ts
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { supabase } from "@/lib/supabase";

export async function registerPushToken() {
  if (!Device.isDevice) return;

  // iOS foreground handling (optional but nice)
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  // Permissions
  const cur = await Notifications.getPermissionsAsync();
  let status = cur.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") return;

  // Get token
  const { data: expoData } = await Notifications.getExpoPushTokenAsync();
  const token = expoData.data;

  // Save once (use upsert)
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return;

  // optional: make (user_id, expo_push_token) unique in DB
  await supabase.from("user_devices").upsert(
    { user_id: data.user.id, expo_push_token: token },
    { onConflict: "user_id,expo_push_token" as any }
  );
}
