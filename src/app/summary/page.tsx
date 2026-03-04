import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SummaryClient } from './SummaryClient';
import { getDefaultFilters } from '@/components/FiltersSidebar';

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

  const [customersRes, tagsRes] = await Promise.all([
    supabase.from('customers').select('id, email, display_name').eq('organization_id', orgId).order('email'),
    supabase.from('tags').select('id, name, slug').order('slug'),
  ]);
  const customers = customersRes.data ?? [];
  const tags = tagsRes.data ?? [];
  const defaultFilters = getDefaultFilters();

  return (
    <SummaryClient
      initialCustomers={customers}
      initialTags={tags}
      defaultFilters={defaultFilters}
    />
  );
}
