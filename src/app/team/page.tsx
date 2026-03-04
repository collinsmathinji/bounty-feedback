import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TeamClient } from './TeamClient';

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();
  if (!membership?.organization_id) redirect('/login');

  const orgId = membership.organization_id;
  const isAdmin = membership.role === 'admin';

  const [membersRes, invitesRes] = await Promise.all([
    supabase
      .from('organization_members')
      .select('id, user_id, role, status')
      .eq('organization_id', orgId)
      .order('created_at'),
    isAdmin
      ? supabase.from('invites').select('id, email, role, expires_at').eq('organization_id', orgId)
      : { data: [] as { id: string; email: string; role: string; expires_at: string }[] },
  ]);

  const members = membersRes.data ?? [];
  const userIds = members.map((m) => m.user_id).filter(Boolean);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .in('id', userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const membersWithProfile = members.map((m) => ({
    ...m,
    email: profileMap.get(m.user_id)?.email ?? '—',
    full_name: profileMap.get(m.user_id)?.full_name ?? null,
  }));

  const invites = invitesRes.data ?? [];

  return (
    <TeamClient
      members={membersWithProfile}
      invites={invites}
      isAdmin={isAdmin}
      organizationId={orgId}
    />
  );
}
