import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '../lib/api';

type CompanyDetails = {
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
};

export default function Home() {
  const { token, roles: rolesParam } = useLocalSearchParams<{ token: string; roles?: string }>();
  const roles = (rolesParam ?? '').split(',').filter(Boolean);
  const isManager = roles.some((r) => ['CEO', 'HR', 'MANAGER', 'FINANCE'].includes(r));
  const [company, setCompany] = useState<CompanyDetails | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    api<CompanyDetails>('/company/details', token)
      .then(setCompany)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [token]);

  function go(pathname: string) {
    router.push({ pathname, params: { token, roles: rolesParam ?? '' } });
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.brand}>EITF</Text>
      <Text style={styles.title}>Mobile Hub</Text>
      <Text style={styles.meta}>Roles: {roles.join(', ') || '—'}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {company ? (
        <View style={styles.card}>
          <Text style={styles.name}>{company.name}</Text>
          <Text style={styles.meta}>
            {[company.city, company.state].filter(Boolean).join(', ') || 'Address pending'}
          </Text>
        </View>
      ) : (
        !error && <Text style={styles.meta}>Loading…</Text>
      )}

      <Text style={styles.section}>Employee</Text>
      <LinkRow label="Mark Attendance" onPress={() => go('/attendance')} />
      <LinkRow label="Leave" onPress={() => go('/leave')} />
      <LinkRow label="Payslips" onPress={() => go('/payslips')} />
      <LinkRow label="Documents" onPress={() => go('/documents')} />
      <LinkRow label="Notifications" onPress={() => go('/notifications')} />
      <LinkRow label="Self-Service" onPress={() => go('/ess')} />
      <LinkRow label="Profile" onPress={() => go('/profile')} />

      {isManager && (
        <>
          <Text style={styles.section}>Manager</Text>
          <LinkRow label="Approvals" onPress={() => go('/approvals')} />
          <LinkRow label="Team Attendance" onPress={() => go('/team-attendance')} />
          <LinkRow label="Team Reports" onPress={() => go('/manager-reports')} />
        </>
      )}

      <Pressable style={styles.link} onPress={() => router.replace('/')}>
        <Text style={styles.linkText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.link} onPress={onPress}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, paddingBottom: 48, backgroundColor: '#f3f0e8' },
  brand: { fontSize: 28, fontWeight: '700', color: '#1a6b54' },
  title: { fontSize: 18, marginTop: 8, marginBottom: 8, color: '#0c1a16' },
  section: { marginTop: 20, marginBottom: 4, fontWeight: '700', color: '#1a6b54' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d5ebe3',
    marginBottom: 8,
  },
  name: { fontSize: 16, fontWeight: '600', color: '#0c1a16' },
  meta: { marginTop: 6, color: '#0c1a1699', fontSize: 13 },
  error: { color: '#b91c1c', marginBottom: 8 },
  link: { marginTop: 12 },
  linkText: { color: '#1a6b54', textDecorationLine: 'underline', fontSize: 16 },
});
