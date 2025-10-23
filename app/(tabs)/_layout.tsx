// _layout.tsx
import { Theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import React from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';

export default function TabLayout() {
  const colors = Theme.colors.light;

  return (
    <Tabs
      screenOptions={{
        // ✨ REFINED HEADER WITH SUBTLE IRIDESCENCE
        headerBackground: () => (
          <View style={StyleSheet.absoluteFill}>
            {/* Ultra-frosted glass effect */}
            <BlurView 
              intensity={85} 
              tint="light" 
              style={StyleSheet.absoluteFill} 
            />
            
            {/* Subtle iridescent shimmer at top edge */}
            <LinearGradient
              colors={[
                'rgba(165, 243, 252, 0.15)', // cyan
                'rgba(199, 210, 254, 0.15)', // lilac
                'rgba(251, 207, 232, 0.12)', // rose
                'rgba(209, 250, 229, 0.15)', // mint
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                position: 'absolute',
                top: 0,
                height: 1.5,
                width: '100%',
              }}
            />

            {/* Clean shadow separator */}
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 1,
                backgroundColor: 'rgba(0,0,0,0.04)',
              }}
            />
          </View>
        ),
        headerTitle: () => (
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={{
                width: 120,
                height: 32,
                resizeMode: 'contain',
              }}
            />
          </View>
        ),
        headerTitleAlign: 'center',
        headerShadowVisible: false,
        headerStyle: {
          backgroundColor: 'transparent',
        },
        headerTransparent: true,

        // 🎨 TAB BAR STYLING
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        
        tabBarBackground: () => (
          <View style={{ flex: 1, overflow: 'hidden' }}>
            {/* Base frosted glass layer */}
            <BlurView 
              intensity={95} 
              tint="light" 
              style={StyleSheet.absoluteFill} 
            />

            {/* Iridescent gradient accent line */}
            <LinearGradient
              colors={[
                'rgba(167, 139, 250, 0.25)', // purple
                'rgba(165, 243, 252, 0.20)', // cyan
                'rgba(199, 210, 254, 0.25)', // lilac
                'rgba(251, 207, 232, 0.20)', // rose
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                position: 'absolute',
                top: 0,
                height: 2,
                width: '100%',
              }}
            />

            {/* Subtle inner glow */}
            <LinearGradient
              colors={[
                'rgba(255, 255, 255, 0.15)',
                'rgba(255, 255, 255, 0)',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 0.5 }}
              style={{
                position: 'absolute',
                top: 2,
                height: 32,
                width: '100%',
              }}
            />

            {/* Clean border */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 0.5,
                backgroundColor: 'rgba(0,0,0,0.08)',
              }}
            />
          </View>
        ),

        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: Theme.sizes.tabBarHeight + (Platform.OS === 'ios' ? 20 : 0),
          paddingBottom: Platform.OS === 'ios' ? 20 : 4,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },

        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginTop: 2,
          marginBottom: 2,
          letterSpacing: 0.2,
        },

        tabBarItemStyle: {
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.iconContainer}>
              {focused && (
                <View style={styles.activeIndicator}>
                  <LinearGradient
                    colors={[
                      'rgba(167, 139, 250, 0.12)',
                      'rgba(165, 243, 252, 0.08)',
                    ]}
                    style={styles.activeGradient}
                  />
                </View>
              )}
              <Ionicons
                name={focused ? 'home' : 'home-outline'}
                size={24}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.iconContainer}>
              {focused && (
                <View style={styles.activeIndicator}>
                  <LinearGradient
                    colors={[
                      'rgba(167, 139, 250, 0.12)',
                      'rgba(199, 210, 254, 0.08)',
                    ]}
                    style={styles.activeGradient}
                  />
                </View>
              )}
              <Ionicons
                name={focused ? 'calendar' : 'calendar-outline'}
                size={24}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.iconContainer}>
              {focused && (
                <View style={[styles.activeIndicator, { width: 48, height: 48 }]}>
                  <LinearGradient
                    colors={[
                      'rgba(167, 139, 250, 0.15)',
                      'rgba(165, 243, 252, 0.10)',
                    ]}
                    style={styles.activeGradient}
                  />
                </View>
              )}
              <Ionicons 
                name="add-circle" 
                size={28} 
                color={color} 
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="posts"
        options={{
          title: 'Posts',
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.iconContainer}>
              {focused && (
                <View style={styles.activeIndicator}>
                  <LinearGradient
                    colors={[
                      'rgba(167, 139, 250, 0.12)',
                      'rgba(251, 207, 232, 0.08)',
                    ]}
                    style={styles.activeGradient}
                  />
                </View>
              )}
              <Ionicons
                name={focused ? 'cube' : 'cube-outline'}
                size={24}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.iconContainer}>
              {focused && (
                <View style={styles.activeIndicator}>
                  <LinearGradient
                    colors={[
                      'rgba(167, 139, 250, 0.12)',
                      'rgba(209, 250, 229, 0.08)',
                    ]}
                    style={styles.activeGradient}
                  />
                </View>
              )}
              <Ionicons
                name={focused ? 'person' : 'person-outline'}
                size={24}
                color={color}
              />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activeIndicator: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  activeGradient: {
    flex: 1,
    borderRadius: 22,
  },
});