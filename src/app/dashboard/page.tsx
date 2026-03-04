import { createClient } from '@/lib/supabase/server';
import { ensureUserOrganization } from '@/app/actions/auth';
import { DashboardWithData, type FeedbackItem } from './DashboardWithData';

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
  const supabase = await createClient();

  const [customersRes, tagsRes, feedbackRes] = await Promise.all([
    supabase.from('customers').select('id, email, display_name').eq('organization_id', orgId).order('email'),
    supabase.from('tags').select('id, name, slug').order('slug'),
    supabase
      .from('feedback')
      .select(`
        id, customer_email, subject, body_text, status, urgency_score, created_at,
        feedback_tags ( tag_id, tags ( id, name, slug ) )
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const customers = customersRes.data ?? [];
  const tags = tagsRes.data ?? [];
  const feedbackRows: FeedbackItem[] = (feedbackRes.data ?? []).map((f: any) => ({
    ...f,
    tags:
      (f.feedback_tags as { tags: { id: string; name: string; slug: string } }[] | null)
        ?.map((ft) => ft.tags)
        .filter(Boolean) ?? [],
  }));

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
      initialCustomers={customers}
      initialTags={tags}
      initialFeedback={feedbackRows}
      defaultFilters={defaultFilters}
    />
  );
}
