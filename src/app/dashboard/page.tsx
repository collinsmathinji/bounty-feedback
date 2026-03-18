import { createClient } from '@/lib/supabase/server';
import { ensureUserOrganization } from '@/app/actions/auth';
import { DashboardWithData, type FeedbackItem } from './DashboardWithData';

type FeedbackTagJoin = { tags: { id: string; name: string; slug: string } | null };
type FeedbackRowWithTags = Omit<FeedbackItem, 'tags'> & {
  feedback_tags: FeedbackTagJoin[] | null;
};

export default async function DashboardPage() {
  const result = await ensureUserOrganization();
  if ('error' in result) {
    return (
      <div className="p-6">
        <p className="text-slate-600">No organization found. {result.error}</p>
        <p className="mt-2 text-sm text-slate-500">Try signing out and signing in again.</p>
      </div>
    );
  }
  const orgId = result.organizationId;
  const userRole = result.role;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? null;

  const isMemberPortal = userRole === 'member';

  const feedbackQuery = supabase
    .from('feedback')
    .select(`
        id, customer_email, subject, body_text, status, urgency_score, created_at, department_id, resolved_at, assigned_to,
        feedback_tags ( tag_id, tags ( id, name, slug ) )
      `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (isMemberPortal && currentUserId) {
    feedbackQuery.eq('assigned_to', currentUserId);
  }

  const [customersRes, tagsRes, departmentsRes, membersRes, feedbackRes] = await Promise.all([
    supabase.from('customers').select('id, email, display_name').eq('organization_id', orgId).order('email'),
    supabase.from('tags').select('id, name, slug').order('slug'),
    supabase.from('departments').select('id, name').eq('organization_id', orgId).order('name'),
    supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('status', 'active'),
    feedbackQuery,
  ]);

  const customersFromTable = customersRes.data ?? [];
  const tags = tagsRes.data ?? [];
  const departments = departmentsRes.data ?? [];
  const memberUserIds = [...new Set((membersRes.data ?? []).map((m: { user_id: string }) => m.user_id))];
  const { data: profilesForMembers } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .in('id', memberUserIds);
  const members = (profilesForMembers ?? []).map((p: { id: string; email: string | null; full_name: string | null }) => ({
    user_id: p.id,
    email: p.email ?? '',
    full_name: p.full_name,
  }));

  const feedbackData = (feedbackRes.data ?? []) as FeedbackRowWithTags[];
  const feedbackRows: FeedbackItem[] = feedbackData.map((f) => ({
    id: f.id,
    customer_email: f.customer_email,
    subject: f.subject,
    body_text: f.body_text,
    status: f.status,
    urgency_score: f.urgency_score,
    created_at: f.created_at,
    department_id: f.department_id ?? null,
    resolved_at: f.resolved_at ?? null,
    assigned_to: (f as { assigned_to?: string | null }).assigned_to ?? null,
    tags: (f.feedback_tags ?? [])
      .map((ft) => ft.tags)
      .filter((t): t is { id: string; name: string; slug: string } => Boolean(t)),
  }));

  // Include customer emails that appear in feedback but may not be in customers table yet
  const existingEmails = new Set((customersFromTable as { email?: string }[]).map((c) => c.email?.toLowerCase()));
  const mergedCustomers = [...customersFromTable];
  feedbackData.forEach((f: { customer_email?: string | null }) => {
    const email = f.customer_email?.trim();
    if (!email || existingEmails.has(email.toLowerCase())) return;
    mergedCustomers.push({
      id: `email:${email}`,
      email,
      display_name: null,
    });
    existingEmails.add(email.toLowerCase());
  });
  mergedCustomers.sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''));

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const defaultFilters = {
    dateFrom: weekAgo.toISOString().slice(0, 10),
    dateTo: now.toISOString().slice(0, 10),
    customerId: '',
    tagIds: [] as string[],
    status: 'new',
    urgencyScores: [] as number[],
    tagSearch: '',
  };

  return (
    <DashboardWithData
      initialCustomers={mergedCustomers}
      initialTags={tags}
      initialDepartments={departments}
      initialMembers={members}
      initialFeedback={feedbackRows}
      defaultFilters={defaultFilters}
      userRole={userRole}
      isMemberPortal={isMemberPortal}
    />
  );
}
