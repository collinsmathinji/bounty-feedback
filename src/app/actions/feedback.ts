'use server';

import { createClient } from '@/lib/supabase/server';
import { suggestTags } from '@/lib/auto-tag';

const UNASSIGNED_TAG_SLUG = 'unassigned';

export async function createFeedbackAction(formData: FormData): Promise<
  | { success: true; id: string; customer_email: string | null; subject: string | null; body_text: string; status: string; urgency_score: number | null; created_at: string; tags: { id: string; name: string; slug: string }[] }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const membership = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();
  if (!membership.data?.organization_id) {
    return { success: false, error: 'No organization' };
  }
  const orgId = membership.data.organization_id;

  const customerEmail = (formData.get('customer_email') as string)?.trim() || null;
  const subject = (formData.get('subject') as string)?.trim() || null;
  const bodyText = (formData.get('body_text') as string)?.trim() || '';

  if (!bodyText) return { success: false, error: 'Feedback text is required' };

  const suggested = suggestTags(bodyText);
  const tagRows = await supabase.from('tags').select('id, name, slug').in('name', [...suggested, 'Unassigned']);
  const tagMap = new Map((tagRows.data ?? []).map((t) => [t.name.toLowerCase(), t]));

  const tagIds: string[] = [];
  for (const name of suggested) {
    const t = tagMap.get(name.toLowerCase());
    if (t) tagIds.push(t.id);
  }
  if (!customerEmail) {
    const unassigned = (tagRows.data ?? []).find((t) => t.slug === UNASSIGNED_TAG_SLUG);
    if (unassigned) tagIds.push(unassigned.id);
  }

  const { data: feedback, error: feedbackErr } = await supabase
    .from('feedback')
    .insert({
      organization_id: orgId,
      customer_email: customerEmail,
      subject,
      body_text: bodyText,
      status: 'new',
      source: 'manual',
    })
    .select('id, customer_email, subject, body_text, status, urgency_score, created_at')
    .single();

  if (feedbackErr || !feedback) {
    return { success: false, error: feedbackErr?.message ?? 'Failed to create feedback' };
  }

  if (customerEmail) {
    await supabase.from('customers').upsert(
      { organization_id: orgId, email: customerEmail },
      { onConflict: 'organization_id,email' }
    );
  }

  if (tagIds.length) {
    await supabase.from('feedback_tags').insert(
      tagIds.map((tag_id) => ({ feedback_id: feedback.id, tag_id }))
    );
  }

  const tags = (tagRows.data ?? []).filter((t) => tagIds.includes(t.id));

  return {
    success: true,
    id: feedback.id,
    customer_email: feedback.customer_email,
    subject: feedback.subject,
    body_text: feedback.body_text,
    status: feedback.status,
    urgency_score: feedback.urgency_score,
    created_at: feedback.created_at,
    tags,
  };
}
