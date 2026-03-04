'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Ensure the current user has a profile and an organization (create org and add themselves as admin if not).
 * Call this after auth on dashboard load.
 */
export async function ensureUserOrganization(): Promise<{ organizationId: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email?.endsWith('@vamo.app')) {
    return { error: 'Access restricted to @vamo.app' };
  }

  await supabase.from('profiles').upsert(
    {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  const { data: existing } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .single();

  if (existing?.organization_id) {
    return { organizationId: existing.organization_id };
  }

  const { data: invite } = await supabase
    .from('invites')
    .select('organization_id, role')
    .eq('email', user.email?.toLowerCase())
    .gte('expires_at', new Date().toISOString())
    .limit(1)
    .single();

  if (invite?.organization_id) {
    await supabase.from('organization_members').insert({
      organization_id: invite.organization_id,
      user_id: user.id,
      role: invite.role,
      status: 'active',
    });
    await supabase.from('invites').delete().eq('email', user.email!);
    return { organizationId: invite.organization_id };
  }

  const { data: newOrg, error: orgErr } = await supabase
    .from('organizations')
    .insert({ name: 'Vamo' })
    .select('id')
    .single();

  if (orgErr || !newOrg) {
    return { error: orgErr?.message ?? 'Failed to create organization' };
  }

  const { error: memberErr } = await supabase.from('organization_members').insert({
    organization_id: newOrg.id,
    user_id: user.id,
    role: 'admin',
    status: 'active',
  });

  if (memberErr) {
    return { error: memberErr.message };
  }

  return { organizationId: newOrg.id };
}
