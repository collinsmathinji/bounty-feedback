import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ensureUserOrganization } from '@/app/actions/auth';
import DashboardLayout from '@/components/DashboardLayout';

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const result = await ensureUserOrganization();
  if ('error' in result) redirect('/login');

  return <DashboardLayout>{children}</DashboardLayout>;
}
