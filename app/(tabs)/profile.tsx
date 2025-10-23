import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Keyboard, Pressable, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';

export default function Profile() {
  const { session } = useAuth();

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        Alert.alert('Error', 'Failed to sign out. Please try again.');
      } else {
        router.replace('/(auth)');
      }
    } catch (err) {
      console.error('Sign out error:', err);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    }
  };

  const confirmSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: handleSignOut },
      ]
    );
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {session?.user?.email?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
          
          <Text style={styles.emailText}>{session?.user?.email}</Text>
          <Text style={styles.welcomeText}>Welcome back!</Text>
        </View>

        <View style={styles.actionsSection}>
          <Pressable style={styles.signOutButton} onPress={confirmSignOut}>
            <Text style={styles.signOutButtonText}>Sign out</Text>
          </Pressable>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  avatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#666',
  },
  emailText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  actionsSection: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  signOutButton: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    borderColor: '#ddd',
  },
  signOutButtonText: {
    fontSize: 16,
    color: '#333',
  },
});
