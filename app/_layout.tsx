import '@/lib/polyfills';
import { AuthProvider } from '@/contexts/AuthContext';
import { Stack } from 'expo-router';
import * as WebBrowser from "expo-web-browser";
WebBrowser.maybeCompleteAuthSession();


export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
