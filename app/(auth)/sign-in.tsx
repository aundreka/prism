import { supabase } from '@/lib/supabase';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Keyboard, Platform, Pressable, Text, TextInput, TouchableWithoutFeedback, View } from 'react-native';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    // Email validation
    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Password validation
    if (!password) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  async function onEmailPassword() {
    if (!validateForm()) {
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('Sign in error:', error);
        
        // Handle specific error messages
        if (error.message.includes('Email not confirmed')) {
          Alert.alert(
            'Email not confirmed', 
            'Please check your email and click the confirmation link before signing in.'
          );
        } else if (error.message.includes('Invalid login credentials')) {
          Alert.alert('Sign in failed', 'Invalid email or password. Please check your credentials and try again.');
        } else {
          Alert.alert('Sign in failed', error.message);
        }
      } else {
        // Successful sign in - redirect to tabs
        router.replace('/(tabs)');
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    }
  }

  // For web, use a proper form structure
  if (Platform.OS === 'web') {
    return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
          <Text style={{ fontSize: 28, fontWeight: '700' }}>Welcome back</Text>

          <form onSubmit={(e) => { e.preventDefault(); onEmailPassword(); }}>
            <View style={{ gap: 16 }}>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 8, color: '#333' }}>Email</Text>
                <TextInput
                  placeholder="Enter your email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (errors.email) setErrors({...errors, email: ''});
                  }}
                  onBlur={() => Keyboard.dismiss()}
                  style={{ 
                    borderWidth: 1, 
                    borderRadius: 12, 
                    padding: 12,
                    borderColor: errors.email ? '#ff4444' : '#ddd',
                    backgroundColor: '#fff'
                  }}
                  autoComplete="email"
                  inputMode="email"
                />
                {errors.email && <Text style={{ color: '#ff4444', fontSize: 12, marginTop: 4 }}>{errors.email}</Text>}
              </View>
              
              <View>
                <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 8, color: '#333' }}>Password</Text>
                <TextInput
                  placeholder="Enter your password"
                  secureTextEntry
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errors.password) setErrors({...errors, password: ''});
                  }}
                  onBlur={() => Keyboard.dismiss()}
                  style={{ 
                    borderWidth: 1, 
                    borderRadius: 12, 
                    padding: 12,
                    borderColor: errors.password ? '#ff4444' : '#ddd',
                    backgroundColor: '#fff'
                  }}
                  autoComplete="current-password"
                  inputMode="text"
                />
                {errors.password && <Text style={{ color: '#ff4444', fontSize: 12, marginTop: 4 }}>{errors.password}</Text>}
              </View>

              <Pressable onPress={onEmailPassword} style={{ backgroundColor: 'black', padding: 14, borderRadius: 12 }}>
                <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>Sign In</Text>
              </Pressable>
            </View>
          </form>

          <Text style={{ textAlign: 'center' }}>
            Don't have an account? <Link href="/(auth)/sign-up">Register here</Link>
          </Text>
        </View>
      </TouchableWithoutFeedback>
    );
  }

  // For native platforms, use the original structure
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
        <Text style={{ fontSize: 28, fontWeight: '700' }}>Welcome back</Text>

        <View>
          <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 8, color: '#333' }}>Email</Text>
          <TextInput
            placeholder="Enter your email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (errors.email) setErrors({...errors, email: ''});
            }}
            onBlur={() => Keyboard.dismiss()}
            style={{ 
              borderWidth: 1, 
              borderRadius: 12, 
              padding: 12,
              borderColor: errors.email ? '#ff4444' : '#ddd',
              backgroundColor: '#fff'
            }}
            autoComplete="email"
            inputMode="email"
          />
          {errors.email && <Text style={{ color: '#ff4444', fontSize: 12, marginTop: 4 }}>{errors.email}</Text>}
        </View>
        
        <View>
          <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 8, color: '#333' }}>Password</Text>
          <TextInput
            placeholder="Enter your password"
            secureTextEntry
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (errors.password) setErrors({...errors, password: ''});
            }}
            onBlur={() => Keyboard.dismiss()}
            style={{ 
              borderWidth: 1, 
              borderRadius: 12, 
              padding: 12,
              borderColor: errors.password ? '#ff4444' : '#ddd',
              backgroundColor: '#fff'
            }}
            autoComplete="current-password"
            inputMode="text"
          />
          {errors.password && <Text style={{ color: '#ff4444', fontSize: 12, marginTop: 4 }}>{errors.password}</Text>}
        </View>

        <Pressable onPress={onEmailPassword} style={{ backgroundColor: 'black', padding: 14, borderRadius: 12 }}>
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>Sign In</Text>
        </Pressable>

        <Text style={{ textAlign: 'center' }}>
          Don't have an account? <Link href="/(auth)/sign-up">Register here</Link>
        </Text>
      </View>
    </TouchableWithoutFeedback>
  );
}
