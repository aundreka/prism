import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';

export default function OAuthReturn() {
  useEffect(() => {
    const url = Linking.useURL(); // current link (optional)
    // Supabase SDK v2 handles session via its redirect; nothing else needed here.
    // We can just bounce to tabs; _layout will also redirect if session exists.
    const t = setTimeout(() => router.replace('/(tabs)'), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}
