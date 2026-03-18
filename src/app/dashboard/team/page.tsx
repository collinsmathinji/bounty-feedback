import { redirect } from 'next/navigation';
import { ensureUserOrganization } from '@/app/actions/auth';
import { createClient } from '@/lib/supabase/server';
import { TeamMembersTable } from './TeamMembersTable';

export default async function TeamPage() {
  const result = await ensureUserOrganization();
  if ('error' in result) {
    redirect(`/login?error=session&message=${encodeURIComponent(result.error)}`);
  }
  if (result.role !== 'admin') redirect('/dashboard');

  const orgId = result.organizationId;
  const supabase = await createClient();

  const { data: members } = await supabase
    .from('organization_members')
    .select('id, user_id, role, status, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (!members?.length) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-900">Team</h1>
        <p className="mt-2 text-slate-600">No members yet.</p>
      </div>
    );
  }

  const userIds = members.map((m) => m.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .in('id', userIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, { email: p.email ?? '', full_name: p.full_name }])
  );

  const rows = members.map((m) => ({
    id: m.id,
    user_id: m.user_id,
    email: profileMap.get(m.user_id)?.email ?? '(no email)',
    full_name: profileMap.get(m.user_id)?.full_name ?? null,
    role: m.role as 'admin' | 'manager',
    status: m.status,
  }));

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-semibold text-slate-900">Team</h1>
      <p className="mt-1 text-sm text-slate-600">
        Manage roles for your organization. New users sign up at the app; you can change their role here.
      </p>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white overflow-hidden">
        <TeamMembersTable initialRows={rows} />
      </div>
      <div className="mt-6 p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700">
        <p className="font-medium">How to add new users</p>
        <ul className="mt-2 list-disc list-inside space-y-1">
          <li>New users must sign up at <strong>/signup</strong> with a <strong>@vamo.app</strong> email.</li>
          <li>The first user in the org becomes <strong>Admin</strong>; everyone else starts as <strong>Manager</strong>.</li>
          <li>Use this page to change a member&apos;s role (Admin or Manager) after they sign up.</li>
        </ul>
      </div>
    </div>
  );
}
