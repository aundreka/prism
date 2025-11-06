import { supabase } from '@/lib/supabase';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const validateEmail = (val: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    if (!email) newErrors.email = 'Email is required';
    else if (!validateEmail(email)) newErrors.email = 'Enter a valid email';
    if (!password) newErrors.password = 'Password is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  async function onEmailPassword() {
    if (!validateForm()) return;
    setSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        const msg = error.message.toLowerCase();

        if (msg.includes('email not confirmed')) {
          Alert.alert(
            'Email not confirmed',
            'Please confirm your email before signing in.'
          );
        } else if (msg.includes('invalid login credentials')) {
          Alert.alert(
            'Invalid credentials',
            'Incorrect email or password.'
          );
        } else {
          Alert.alert('Sign in failed', error.message);
        }

        setSubmitting(false);
        return;
      }

      if (data.session) {
        // RLS policies in your DB use auth.uid(); signed-in session is enough.
        router.replace('/(tabs)');
      } else {
        // Very rare: no error but no session
        Alert.alert('Sign in failed', 'No active session returned.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  }

  const FormBody = (
    <View style={{ gap: 16 }}>
      <View>
        <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 8, color: '#333' }}>
          Email
        </Text>
        <TextInput
          placeholder="Enter your email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            if (errors.email) setErrors({ ...errors, email: '' });
          }}
          onBlur={() => Keyboard.dismiss()}
          style={{
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            borderColor: errors.email ? '#ff4444' : '#ddd',
            backgroundColor: '#fff',
          }}
          autoComplete="email"
          inputMode="email"
        />
        {!!errors.email && (
          <Text style={{ color: '#ff4444', fontSize: 12, marginTop: 4 }}>
            {errors.email}
          </Text>
        )}
      </View>

      <View>
        <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 8, color: '#333' }}>
          Password
        </Text>
        <TextInput
          placeholder="Enter your password"
          secureTextEntry
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            if (errors.password) setErrors({ ...errors, password: '' });
          }}
          onBlur={() => Keyboard.dismiss()}
          style={{
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            borderColor: errors.password ? '#ff4444' : '#ddd',
            backgroundColor: '#fff',
          }}
          autoComplete="current-password"
          inputMode="text"
        />
        {!!errors.password && (
          <Text style={{ color: '#ff4444', fontSize: 12, marginTop: 4 }}>
            {errors.password}
          </Text>
        )}
      </View>

      <Pressable
        disabled={submitting}
        onPress={onEmailPassword}
        style={{
          opacity: submitting ? 0.7 : 1,
          backgroundColor: 'black',
          padding: 14,
          borderRadius: 12,
        }}
      >
        <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>
          {submitting ? 'Signing in…' : 'Sign In'}
        </Text>
      </Pressable>
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
          <Text style={{ fontSize: 28, fontWeight: '700' }}>Welcome back</Text>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onEmailPassword();
            }}
          >
            {FormBody}
          </form>
          <Text style={{ textAlign: 'center' }}>
            Don&apos;t have an account? <Link href="/(auth)/sign-up">Register here</Link>
          </Text>
        </View>
      </TouchableWithoutFeedback>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
        <Text style={{ fontSize: 28, fontWeight: '700' }}>Welcome back</Text>
        {FormBody}
        <Text style={{ textAlign: 'center' }}>
          Don&apos;t have an account? <Link href="/(auth)/sign-up">Register here</Link>
        </Text>
      </View>
    </TouchableWithoutFeedback>
  );
}
