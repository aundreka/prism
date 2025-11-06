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

// If you use Expo, set this to your scheme + path in app.json/app.config.js
// e.g., "prism://auth/callback"
const EMAIL_REDIRECT_TO =
  Platform.select({
    web: `${window.location.origin}/auth/callback`,
    default: 'prism://auth/callback',
  }) || 'prism://auth/callback';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const validateEmail = (val: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    if (!email) newErrors.email = 'Email is required';
    else if (!validateEmail(email)) newErrors.email = 'Enter a valid email';

    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 6)
      newErrors.password = 'At least 6 characters';

    if (!confirmPassword) newErrors.confirmPassword = 'Please confirm password';
    else if (password !== confirmPassword)
      newErrors.confirmPassword = 'Passwords do not match';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  async function onSignUp() {
    if (!validateForm()) return;
    setSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Ensures your app receives the verified session/JWT after clicking the email link
          emailRedirectTo: EMAIL_REDIRECT_TO,
          // Minimal user metadata you can read from JWT if needed for RLS guards later
          data: {
            app_role: 'user',
          },
        },
      });

      if (error) {
        // Common Supabase messages
        if (error.message.toLowerCase().includes('user already registered')) {
          Alert.alert(
            'Already registered',
            'That email is already in use. Try signing in instead.'
          );
          setSubmitting(false);
          return;
        }

        Alert.alert('Sign up failed', error.message);
        setSubmitting(false);
        return;
      }

      // If email confirmation is required, Supabase returns user without session
      if (data.user && !data.session) {
        Alert.alert(
          'Check your inbox',
          'We sent a confirmation link to your email. Verify to activate your account.'
        );
        // Optionally take them to "check email" screen
        return;
      }

      // If the project allows auto-confirm (dev) you'll get a session right away
      if (data.session) {
        Alert.alert('Success', 'Account created. You are now signed in.');
        router.replace('/(tabs)');
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
          autoComplete="new-password"
          inputMode="text"
        />
        {!!errors.password && (
          <Text style={{ color: '#ff4444', fontSize: 12, marginTop: 4 }}>
            {errors.password}
          </Text>
        )}
      </View>

      <View>
        <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 8, color: '#333' }}>
          Confirm Password
        </Text>
        <TextInput
          placeholder="Confirm your password"
          secureTextEntry
          value={confirmPassword}
          onChangeText={(t) => {
            setConfirmPassword(t);
            if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
          }}
          onBlur={() => Keyboard.dismiss()}
          style={{
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            borderColor: errors.confirmPassword ? '#ff4444' : '#ddd',
            backgroundColor: '#fff',
          }}
          autoComplete="new-password"
          inputMode="text"
        />
        {!!errors.confirmPassword && (
          <Text style={{ color: '#ff4444', fontSize: 12, marginTop: 4 }}>
            {errors.confirmPassword}
          </Text>
        )}
      </View>

      <Pressable
        disabled={submitting}
        onPress={onSignUp}
        style={{
          opacity: submitting ? 0.7 : 1,
          backgroundColor: 'black',
          padding: 14,
          borderRadius: 12,
        }}
      >
        <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>
          {submitting ? 'Creating…' : 'Sign Up'}
        </Text>
      </Pressable>
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
          <Text style={{ fontSize: 28, fontWeight: '700' }}>Create account</Text>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSignUp();
            }}
          >
            {FormBody}
          </form>
          <Text style={{ textAlign: 'center' }}>
            Have an account? <Link href="/(auth)/sign-in">Sign in</Link>
          </Text>
        </View>
      </TouchableWithoutFeedback>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
        <Text style={{ fontSize: 28, fontWeight: '700' }}>Create account</Text>
        {FormBody}
        <Text style={{ textAlign: 'center' }}>
          Have an account? <Link href="/(auth)/sign-in">Sign in</Link>
        </Text>
      </View>
    </TouchableWithoutFeedback>
  );
}
