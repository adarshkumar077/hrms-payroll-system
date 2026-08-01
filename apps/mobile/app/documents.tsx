import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type Doc = {
  id: string;
  fileName: string;
  documentType: { name: string };
};

export default function DocumentsScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/me/documents`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? 'Failed');
        setDocs(data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [token]);

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>My Documents</Text>
      <Text style={styles.hint}>View only — HR uploads documents</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={docs}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.hint}>No documents</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.documentType.name}</Text>
            <Text style={styles.file}>{item.fileName}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64, backgroundColor: '#f3f0e8' },
  back: { color: '#1a6b54', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '600', color: '#0c1a16' },
  hint: { color: '#0c1a1699', marginVertical: 8, fontSize: 13 },
  error: { color: '#b91c1c' },
  row: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#d5ebe3',
  },
  name: { fontWeight: '600', color: '#0c1a16' },
  file: { color: '#0c1a1699', marginTop: 4, fontSize: 12 },
});
