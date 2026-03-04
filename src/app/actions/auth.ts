'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const VAMO_DOMAIN = '@vamo.app';

/**
 * Ensure the current user has a profile and is a member of the single Vamo organization.
 * Only @vamo.app emails are allowed; signup is restricted to that domain and this grants access to the one org.
 */
export async function ensureUserOrganization(): Promise<{ organizationId: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'User not found' };
  }
  if (!user.email?.toLowerCase().endsWith(VAMO_DOMAIN)) {
    return { error: `Access restricted to ${VAMO_DOMAIN} addresses only.` };
  }

  const admin = createAdminClient();

  // Keep profile in sync (admin so it always succeeds regardless of RLS)
  await admin.from('profiles').upsert(
    {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  // Resolve the single shared organization:
  // 1) Prefer an explicit ID from env (if you set RESEND_FEEDBACK_ORGANIZATION_ID)
  // 2) Otherwise, use the "Vamo" organization (create it once if missing)
  let organizationId = process.env.RESEND_FEEDBACK_ORGANIZATION_ID ?? null;

  if (!organizationId) {
    const { data: existingOrg } = await admin
      .from('organizations')
      .select('id')
      .eq('name', 'Vamo')
      .limit(1)
      .single();

    if (existingOrg?.id) {
      organizationId = existingOrg.id;
    } else {
      const { data: newOrg, error: orgErr } = await admin
        .from('organizations')
        .insert({ name: 'Vamo' })
        .select('id')
        .single();

      if (orgErr || !newOrg) {
        return { error: orgErr?.message ?? 'Failed to create organization' };
      }

      organizationId = newOrg.id;
    }
  }

  // Ensure this user is an active member of the Vamo organization (admin bypasses RLS)
  const { data: existingMember } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .limit(1)
    .single();

  if (!existingMember?.organization_id) {
    const { error: memberErr } = await admin.from('organization_members').insert({
      organization_id: organizationId,
      user_id: user.id,
      role: 'admin',
      status: 'active',
    });

    if (memberErr) {
      return { error: memberErr.message };
    }
  }

  if (!organizationId) {
    return { error: 'Organization ID could not be resolved' };
  }
  return { organizationId };
}
