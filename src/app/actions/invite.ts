'use server';

import { createClient } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';

export async function inviteMemberAction(params: {
  organizationId: string;
  email: string;
  role: 'admin' | 'member';
}): Promise<
  | { success: true; invite: { id: string; email: string; role: string; expires_at: string } }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { organizationId, email, role } = params;
  if (!email.toLowerCase().endsWith('@vamo.app')) {
    return { success: false, error: 'Only @vamo.app addresses can be invited.' };
  }

  const memberCheck = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .single();
  if (!memberCheck.data) {
    return { success: false, error: 'Only admins can invite members.' };
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { data: invite, error } = await supabase
    .from('invites')
    .upsert(
      {
        organization_id: organizationId,
        email: email.toLowerCase(),
        role,
        token,
        expires_at: expiresAt.toISOString(),
        invited_by: user.id,
      },
      { onConflict: 'organization_id,email' }
    )
    .select('id, email, role, expires_at')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, invite };
}
