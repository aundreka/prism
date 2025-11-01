import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';

export default function Home() {
  const kpis = [
    { label: 'Total Followers', value: '48,920', delta: '+2.1%' },
    { label: 'Engagement Rate', value: '4.8%', delta: '+0.3%' },
    { label: 'Avg Reach/Post', value: '12,450', delta: '+7.9%' },
    { label: 'Posts (This Week)', value: '9', delta: '+2' },
  ];

  const platforms = [
    {
      name: 'Instagram',
      color: '#E1306C',
      followers: '18,240',
      growth: '+1.8%',
      posts: 3,
      er: '6.1%',
      metrics: { Likes: 3920, Comments: 421, Shares: 188, Saves: 532 },
    },
    {
      name: 'Facebook',
      color: '#1877F2',
      followers: '12,705',
      growth: '+0.9%',
      posts: 2,
      er: '3.4%',
      metrics: { Reactions: 2311, Comments: 312, Shares: 204 },
    },
    {
      name: 'TikTok',
      color: '#000000',
      followers: '9,860',
      growth: '+3.2%',
      posts: 2,
      er: '8.0%',
      metrics: { Hearts: 5140, Comments: 600, Saves: 410, Shares: 320 },
    },
    {
      name: 'X (Twitter)',
      color: '#1DA1F2',
      followers: '5,210',
      growth: '+1.1%',
      posts: 1,
      er: '2.6%',
      metrics: { Likes: 420, Replies: 95, Retweets: 150 },
    },
    {
      name: 'YouTube',
      color: '#FF0000',
      followers: '3,905',
      growth: '+0.6%',
      posts: 1,
      er: '5.3%',
      metrics: { Views: 18420, Likes: 1030, Comments: 142 },
    },
  ];

  const recentPosts = [
    {
      id: 'p1',
      platform: 'Instagram',
      date: '2025-10-22',
      status: 'Published',
      caption: 'Behind-the-scenes from the product shoot 📸',
      reach: 14210,
      likes: 1820,
      comments: 210,
      saves: 130,
    },
    {
      id: 'p2',
      platform: 'TikTok',
      date: '2025-10-23',
      status: 'Published',
      caption: '30-sec tip: Lighting hacks that level up your shots ✨',
      reach: 20120,
      likes: 3560,
      comments: 420,
      saves: 260,
    },
    {
      id: 'p3',
      platform: 'Facebook',
      date: '2025-10-24',
      status: 'Scheduled',
      caption: 'Weekend drop: Limited bundle with freebies 🎁',
    },
    {
      id: 'p4',
      platform: 'YouTube',
      date: '2025-10-25',
      status: 'Scheduled',
      caption: 'Vlog #12: Rebranding journey & lessons learned',
    },
    {
      id: 'p5',
      platform: 'X (Twitter)',
      date: '2025-10-26',
      status: 'Draft',
      caption: 'Poll: Which colorway should we drop next?',
    },
  ];

  const scheduledByDate = {
    '2025-10-24': ['Facebook', 'Instagram'],
    '2025-10-25': ['YouTube'],
    '2025-10-27': ['Instagram', 'TikTok', 'X (Twitter)'],
  };

  const week = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1 - day);
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, []);

  const todayKey = new Date().toISOString().slice(0, 10);
  const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const dayLabel = (d) => d.toLocaleDateString(undefined, { weekday: 'short' });
  const barWidthPct = (val, max) => `${Math.max(6, Math.min(100, (val / max) * 100))}%`;

  const perf = useMemo(() => {
    const published = recentPosts.filter((r) => r.status === 'Published');
    if (published.length === 0) return [];
    const maxEng = Math.max(...published.map((p) => p.likes + p.comments + (p.saves || 0)));
    return published
      .map((p) => ({
        id: p.id,
        label: `${p.platform} • ${p.caption.slice(0, 24)}${p.caption.length > 24 ? '…' : ''}`,
        value: p.likes + p.comments + (p.saves || 0),
        max: maxEng || 1,
      }))
      .sort((a, b) => b.value - a.value);
  }, [recentPosts]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 80, paddingTop: 110 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Creator Dashboard</Text>
        <Text style={styles.subtitle}>
          {new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
      </View>

      {/* Week Calendar */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>This Week</Text>
          <Text style={styles.cardHint}>
            {fmt(week[0])} – {fmt(week[6])}
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
          {week.map((d) => {
            const key = d.toISOString().slice(0, 10);
            const isToday = key === todayKey;
            const scheduled = scheduledByDate[key] || [];
            return (
              <View
                key={key}
                style={[
                  styles.dayCell,
                  isToday && styles.dayToday,
                  { marginRight: 10, width: 70 },
                ]}
              >
                <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
                  {dayLabel(d)}
                </Text>
                <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>
                  {d.getDate()}
                </Text>
                <View style={styles.dotRow}>
                  {scheduled.slice(0, 3).map((_, i) => (
                    <View key={i} style={styles.dot} />
                  ))}
                  {scheduled.length > 3 && (
                    <Text style={styles.plusMore}>+{scheduled.length - 3}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* KPIs */}
      <View style={styles.kpiRow}>
        {kpis.map((k) => (
          <View key={k.label} style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{k.value}</Text>
            <Text style={styles.kpiLabel}>{k.label}</Text>
            <Text style={styles.kpiDelta}>{k.delta}</Text>
          </View>
        ))}
      </View>

      {/* Platforms */}
      <Text style={styles.sectionTitle}>Platform Analytics</Text>
      {platforms.map((p) => (
        <View key={p.name} style={styles.platformCard}>
          <View style={styles.rowBetween}>
            <View style={styles.row}>
              <View style={[styles.badge, { backgroundColor: p.color }]} />
              <Text style={styles.platformName}>{p.name}</Text>
            </View>
            <Text style={styles.growth}>{p.growth}</Text>
          </View>
          <Text style={styles.statLabel}>Followers</Text>
          <Text style={styles.statValue}>{p.followers}</Text>
        </View>
      ))}

      {/* Performance */}
      <Text style={styles.sectionTitle}>Top Posts</Text>
      <View style={styles.card}>
        {perf.map((it, idx) => (
          <View key={it.id} style={{ marginBottom: 10 }}>
            <Text style={styles.perfLabel}>
              {idx + 1}. {it.label}
            </Text>
            <View style={styles.perfTrack}>
              <View style={[styles.perfFill, { width: barWidthPct(it.value, it.max) }]} />
            </View>
          </View>
        ))}
      </View>

      {/* Recent Posts */}
      <Text style={styles.sectionTitle}>Recent Posts</Text>
      {recentPosts.map((p) => (
        <TouchableOpacity key={p.id} style={styles.postCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.postPlatform}>{p.platform}</Text>
            <View
              style={[
                styles.statusPill,
                p.status === 'Published'
                  ? styles.pillPublished
                  : p.status === 'Scheduled'
                  ? styles.pillScheduled
                  : styles.pillDraft,
              ]}
            >
              <Text style={styles.pillText}>{p.status}</Text>
            </View>
          </View>
          <Text style={styles.postCaption}>{p.caption}</Text>
          <Text style={styles.postDate}>{new Date(p.date).toLocaleDateString()}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { paddingHorizontal: 16, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  subtitle: { color: '#6B7280', fontSize: 13 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardHint: { color: '#6B7280', fontSize: 12 },

  dayCell: {
    alignItems: 'center',
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  dayToday: { backgroundColor: '#E0F2FE', borderColor: '#38BDF8' },
  dayLabel: { fontSize: 11, color: '#6B7280' },
  dayLabelToday: { color: '#0369A1' },
  dayNumber: { fontSize: 18, fontWeight: '700', color: '#111827' },
  dayNumberToday: { color: '#0284C7' },
  dotRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 6, backgroundColor: '#38BDF8' },
  plusMore: { fontSize: 10, color: '#0369A1' },

  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginHorizontal: 16 },
  kpiCard: {
    width: '47.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  kpiValue: { fontSize: 18, fontWeight: '800', color: '#111827' },
  kpiLabel: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  kpiDelta: { color: '#16A34A', fontWeight: '700', marginTop: 4 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginHorizontal: 16, marginVertical: 8 },

  platformCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  badge: { width: 10, height: 10, borderRadius: 10 },
  platformName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  growth: { color: '#16A34A', fontWeight: '700', fontSize: 12 },
  statLabel: { color: '#6B7280', fontSize: 12, marginTop: 8 },
  statValue: { color: '#111827', fontSize: 16, fontWeight: '700' },

  perfLabel: { fontSize: 13, color: '#111827', marginBottom: 4 },
  perfTrack: { height: 8, backgroundColor: '#E5E7EB', borderRadius: 8 },
  perfFill: { height: 8, backgroundColor: '#38BDF8', borderRadius: 8 },

  postCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  postPlatform: { fontWeight: '700', fontSize: 14, color: '#111827' },
  postCaption: { marginTop: 4, color: '#374151', fontSize: 13 },
  postDate: { marginTop: 4, color: '#6B7280', fontSize: 12 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: '700' },
  pillPublished: { backgroundColor: '#DCFCE7', borderColor: '#16A34A', borderWidth: 1 },
  pillScheduled: { backgroundColor: '#DBEAFE', borderColor: '#2563EB', borderWidth: 1 },
  pillDraft: { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB', borderWidth: 1 },
});
