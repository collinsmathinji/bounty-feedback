import { createClient } from '@/lib/supabase/server';
import { DashboardWithData, type FeedbackItem } from './DashboardWithData';
import { getDefaultFilters } from '@/components/FiltersSidebar';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('status', 'active')
    .limit(1);
  const orgId = memberships?.[0]?.organization_id;
  if (!orgId) {
    return (
      <div className="p-6">
        <p className="text-slate-600">No organization found. Please sign out and sign in again.</p>
      </div>
    );
  }

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

  const defaultFilters = getDefaultFilters();
  defaultFilters.status = 'new';

  return (
    <DashboardWithData
      initialCustomers={customers}
      initialTags={tags}
      initialFeedback={feedbackRows}
      defaultFilters={defaultFilters}
    />
  );
}
