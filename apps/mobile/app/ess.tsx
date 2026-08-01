import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type Home = {
  unreadNotifications: number;
  notifications: { id: string; title: string; body: string }[];
  announcements: { id: string; title: string }[];
};

export default function EssMobile() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [home, setHome] = useState<Home | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.statusCode) setHome(d);
      });
  }, [token]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Self-Service</Text>
      {home && (
        <>
          <Text style={styles.meta}>Unread: {home.unreadNotifications}</Text>
          {home.announcements.map((a) => (
            <View key={a.id} style={styles.card}>
              <Text style={styles.row}>{a.title}</Text>
            </View>
          ))}
          {home.notifications.slice(0, 5).map((n) => (
            <View key={n.id} style={styles.card}>
              <Text style={styles.row}>{n.title}</Text>
              <Text style={styles.meta}>{n.body}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, backgroundColor: '#f3f0e8', flexGrow: 1 },
  back: { color: '#1a6b54', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a6b54', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#d5ebe3' },
  row: { fontWeight: '600', color: '#0c1a16' },
  meta: { marginTop: 4, color: '#0c1a1699', fontSize: 13 },
});
