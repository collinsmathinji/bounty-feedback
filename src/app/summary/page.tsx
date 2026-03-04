import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SummaryClient } from './SummaryClient';

export default async function SummaryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('status', 'active')
    .limit(1);
  const orgId = memberships?.[0]?.organization_id;
  if (!orgId) redirect('/login');

  const [customersRes, tagsRes, feedbackRes] = await Promise.all([
    supabase.from('customers').select('id, email, display_name').eq('organization_id', orgId).order('email'),
    supabase.from('tags').select('id, name, slug').order('slug'),
    supabase.from('feedback').select('customer_email').eq('organization_id', orgId),
  ]);
  const customersFromTable = customersRes.data ?? [];
  const tags = tagsRes.data ?? [];
  const feedbackData = feedbackRes.data ?? [];
  const existingEmails = new Set((customersFromTable as { email?: string }[]).map((c) => c.email?.toLowerCase()));
  const mergedCustomers = [...customersFromTable];
  feedbackData.forEach((f: { customer_email?: string | null }) => {
    const email = f.customer_email?.trim();
    if (!email || existingEmails.has(email.toLowerCase())) return;
    mergedCustomers.push({ id: `email:${email}`, email, display_name: null });
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
    <SummaryClient
      initialCustomers={mergedCustomers}
      initialTags={tags}
      defaultFilters={defaultFilters}
    />
  );
}
