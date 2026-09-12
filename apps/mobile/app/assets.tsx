import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { API_URL } from '../lib/api';

type Alloc = { id: string; asset: { assetTag: string; name: string; type: string } };

export default function AssetsMobile() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [items, setItems] = useState<Alloc[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/me/assets`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setItems(d);
      });
  }, [token]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>My Assets</Text>
      {items.map((a) => (
        <View key={a.id} style={styles.card}>
          <Text style={styles.row}>
            {a.asset.assetTag} · {a.asset.name}
          </Text>
          <Text style={styles.meta}>{a.asset.type}</Text>
        </View>
      ))}
      {items.length === 0 && <Text style={styles.meta}>No allocated assets</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, backgroundColor: '#f3f0e8', flexGrow: 1 },
  back: { color: '#1a6b54', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a6b54', marginBottom: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#d5ebe3',
  },
  row: { fontWeight: '600', color: '#0c1a16' },
  meta: { marginTop: 4, color: '#0c1a1699', fontSize: 13 },
});
