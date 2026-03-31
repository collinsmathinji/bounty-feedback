import { redirect } from 'next/navigation';
import { ensureUserOrganization } from '@/app/actions/auth';
import { createClient } from '@/lib/supabase/server';
import { ReportsClient } from './ReportsClient';

type FeedbackRow = {
  id: string;
  subject: string | null;
  status: 'new' | 'planned' | 'in_progress' | 'resolved' | 'reviewed';
  created_at: string;
  resolved_at: string | null;
  assigned_to: string | null;
};

export default async function ReportsPage() {
  const result = await ensureUserOrganization();
  if ('error' in result) {
    redirect(`/login?error=session&message=${encodeURIComponent(result.error)}`);
  }
  if (result.role === 'member') redirect('/dashboard');

  const orgId = result.organizationId;
  const supabase = await createClient();

  const [feedbackRes, membersRes] = await Promise.all([
    supabase
      .from('feedback')
      .select('id, subject, status, created_at, resolved_at, assigned_to')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('status', 'active'),
  ]);

  const feedback = (feedbackRes.data ?? []) as FeedbackRow[];
  const memberIds = [...new Set((membersRes.data ?? []).map((m) => m.user_id))];

  const { data: profiles } = memberIds.length
    ? await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', memberIds)
    : { data: [] as Array<{ id: string; email: string | null; full_name: string | null }> };

  const members = (profiles ?? []).map((p) => ({
    user_id: p.id,
    label: p.full_name || p.email || p.id,
  }));

  return (
    <ReportsClient initialFeedback={feedback} members={members} />
  );
}
