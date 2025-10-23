import { supabase } from '@/lib/supabase';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Keyboard, Platform, Pressable, Text, TextInput, TouchableWithoutFeedback, View } from 'react-native';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters long';
    }

    // Confirm password validation
    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  async function onSignUp() {
    if (!validateForm()) {
      return;
    }

    console.log('Attempting to sign up with:', { email, passwordLength: password.length });
    
    try {
      const { data, error } = await supabase.auth.signUp({ 
        email, 
        password
      });
      
      if (error) {
        console.error('Sign up error:', error);
        Alert.alert('Sign up failed', error.message);
      } else {
        console.log('Sign up successful:', data);
        console.log('User created:', data.user);
        console.log('Session:', data.session);
        
        if (data.user && !data.session) {
          // User created but needs email confirmation
          Alert.alert(
            'Check your inbox', 
            'We sent you a confirmation email. Please check your email and click the confirmation link to activate your account.'
          );
        } else if (data.session) {
          // User created and signed in immediately
          Alert.alert('Success!', 'Account created successfully. You are now signed in.');
        }
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
          <Text style={{ fontSize: 28, fontWeight: '700' }}>Create account</Text>
          
          <form onSubmit={(e) => { e.preventDefault(); onSignUp(); }}>
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
                  autoComplete="new-password"
                  inputMode="text"
                />
                {errors.password && <Text style={{ color: '#ff4444', fontSize: 12, marginTop: 4 }}>{errors.password}</Text>}
              </View>

              <View>
                <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 8, color: '#333' }}>Confirm Password</Text>
                <TextInput
                  placeholder="Confirm your password"
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    if (errors.confirmPassword) setErrors({...errors, confirmPassword: ''});
                  }}
                  onBlur={() => Keyboard.dismiss()}
                  style={{ 
                    borderWidth: 1, 
                    borderRadius: 12, 
                    padding: 12,
                    borderColor: errors.confirmPassword ? '#ff4444' : '#ddd',
                    backgroundColor: '#fff'
                  }}
                  autoComplete="new-password"
                  inputMode="text"
                />
                {errors.confirmPassword && <Text style={{ color: '#ff4444', fontSize: 12, marginTop: 4 }}>{errors.confirmPassword}</Text>}
              </View>

              <Pressable onPress={onSignUp} style={{ backgroundColor: 'black', padding: 14, borderRadius: 12 }}>
                <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>Sign Up</Text>
              </Pressable>
            </View>
          </form>

          <Text style={{ textAlign: 'center' }}>
            Have an account? <Link href="/(auth)/sign-in">Sign in</Link>
          </Text>
        </View>
      </TouchableWithoutFeedback>
    );
  }

  // For native platforms, use the original structure
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
        <Text style={{ fontSize: 28, fontWeight: '700' }}>Create account</Text>
        
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
            autoComplete="new-password"
            inputMode="text"
          />
          {errors.password && <Text style={{ color: '#ff4444', fontSize: 12, marginTop: 4 }}>{errors.password}</Text>}
        </View>

        <View>
          <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 8, color: '#333' }}>Confirm Password</Text>
          <TextInput
            placeholder="Confirm your password"
            secureTextEntry
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              if (errors.confirmPassword) setErrors({...errors, confirmPassword: ''});
            }}
            onBlur={() => Keyboard.dismiss()}
            style={{ 
              borderWidth: 1, 
              borderRadius: 12, 
              padding: 12,
              borderColor: errors.confirmPassword ? '#ff4444' : '#ddd',
              backgroundColor: '#fff'
            }}
            autoComplete="new-password"
            inputMode="text"
          />
          {errors.confirmPassword && <Text style={{ color: '#ff4444', fontSize: 12, marginTop: 4 }}>{errors.confirmPassword}</Text>}
        </View>

        <Pressable onPress={onSignUp} style={{ backgroundColor: 'black', padding: 14, borderRadius: 12 }}>
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>Sign Up</Text>
        </Pressable>

        <Text style={{ textAlign: 'center' }}>
          Have an account? <Link href="/(auth)/sign-in">Sign in</Link>
        </Text>
      </View>
    </TouchableWithoutFeedback>
  );
}
