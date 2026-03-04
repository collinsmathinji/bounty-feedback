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
  await ensureUserOrganization();
  return <DashboardLayout>{children}</DashboardLayout>;
}
