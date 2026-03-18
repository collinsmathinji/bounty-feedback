'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Update an organization member's role. Only org admins can do this (enforced by RLS).
 */
export async function updateMemberRole(
  memberId: string,
  newRole: 'admin' | 'manager'
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('organization_members')
    .update({ role: newRole })
    .eq('id', memberId);

  if (error) return { error: error.message };
  return {};
}
