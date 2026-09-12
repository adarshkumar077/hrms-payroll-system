import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '../lib/api';

type Task = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  dueAt?: string | null;
  description?: string | null;
};

export default function CrmTasksScreen() {
  const { token, roles: rolesParam } = useLocalSearchParams<{ token: string; roles?: string }>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [comment, setComment] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');

  function load() {
    if (!token) return;
    api<Task[]>('/crm/tasks', token)
      .then(setTasks)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(load, [token]);

  async function markDone(id: string) {
    if (!token) return;
    try {
      await api(`/crm/tasks/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'COMPLETED' }),
      });
      Alert.alert('Done', 'Task marked completed');
      load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Update failed');
    }
  }

  async function addComment(id: string) {
    if (!token || !comment.trim()) return;
    try {
      await api(`/crm/tasks/${id}/comments`, token, {
        method: 'POST',
        body: JSON.stringify({ body: comment.trim() }),
      });
      setComment('');
      setSelected(null);
      Alert.alert('Saved', 'Comment added');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Comment failed');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>CRM Tasks</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {tasks.map((t) => (
        <View key={t.id} style={styles.card}>
          <Text style={styles.taskTitle}>{t.title}</Text>
          <Text style={styles.meta}>
            {t.status} · {t.priority ?? 'NORMAL'}
          </Text>
          {t.description ? <Text style={styles.desc}>{t.description}</Text> : null}
          {t.status !== 'COMPLETED' && (
            <Pressable style={styles.btn} onPress={() => markDone(t.id)}>
              <Text style={styles.btnText}>Mark completed</Text>
            </Pressable>
          )}
          <Pressable style={styles.link} onPress={() => setSelected(selected === t.id ? null : t.id)}>
            <Text style={styles.linkText}>Add comment</Text>
          </Pressable>
          {selected === t.id && (
            <>
              <TextInput
                style={styles.input}
                value={comment}
                onChangeText={setComment}
                placeholder="Progress update…"
                multiline
              />
              <Pressable style={styles.btn} onPress={() => addComment(t.id)}>
                <Text style={styles.btnText}>Save comment</Text>
              </Pressable>
            </>
          )}
        </View>
      ))}
      {!tasks.length && !error && <Text style={styles.meta}>No tasks assigned.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  back: { color: '#1a6b54', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a6b54', marginBottom: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e8f0ec',
  },
  taskTitle: { fontSize: 16, fontWeight: '600' },
  meta: { color: '#666', marginTop: 4, fontSize: 13 },
  desc: { marginTop: 6, color: '#333' },
  btn: {
    marginTop: 10,
    backgroundColor: '#1a6b54',
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600' },
  link: { marginTop: 8 },
  linkText: { color: '#1a6b54' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  error: { color: '#b00020', marginBottom: 8 },
});
