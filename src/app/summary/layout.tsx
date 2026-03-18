import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ensureUserOrganization } from '@/app/actions/auth';
import DashboardLayout from '@/components/DashboardLayout';

export default async function SummaryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!user.email?.toLowerCase().endsWith('@vamo.app')) redirect('/login?error=vamo-only');
  const orgResult = await ensureUserOrganization();
  if ('error' in orgResult) redirect('/login');
  if (orgResult.role === 'member') redirect('/dashboard');
  return <DashboardLayout userRole={orgResult.role}>{children}</DashboardLayout>;
}
