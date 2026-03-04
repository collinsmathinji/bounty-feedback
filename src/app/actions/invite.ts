'use server';

import { createClient } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';
import { Resend } from 'resend';

const INVITE_EMAIL = {
  subject: "You're invited to the team – Customer Feedback Dashboard",
  title: "You're invited",
  bodyIntro: "You've been invited to join the Customer Feedback Dashboard team. Sign up with your @vamo.app email to get started.",
  cta: 'Accept invite',
};

function getInviteEmailContent(inviteUrl: string): { subject: string; html: string; text: string } {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e293b;">
  <h1 style="font-size:1.25rem;margin-bottom:16px;">${INVITE_EMAIL.title}</h1>
  <p style="margin-bottom:24px;line-height:1.5;">${INVITE_EMAIL.bodyIntro}</p>
  <a href="${inviteUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:500;">${INVITE_EMAIL.cta}</a>
  <p style="margin-top:24px;font-size:0.875rem;color:#64748b;">If you didn't expect this invite, you can ignore this email.</p>
</body>
</html>
  `.trim();
  const text = `${INVITE_EMAIL.title}\n\n${INVITE_EMAIL.bodyIntro}\n\n${inviteUrl}`;
  return { subject: INVITE_EMAIL.subject, html, text };
}

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
  const emailLower = email.trim().toLowerCase();
  if (!emailLower.endsWith('@vamo.app')) {
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
        email: emailLower,
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
  if (!invite) return { success: false, error: 'Failed to create invite' };

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_AUTH_FROM ?? process.env.RESEND_FROM ?? 'Customer Feedback Dashboard <onboarding@resend.dev>';
  if (!apiKey) {
    return { success: false, error: 'Email not configured (RESEND_API_KEY). Invite was created but no email was sent.' };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const inviteUrl = `${baseUrl.replace(/\/$/, '')}/signup?invite=${token}`;
  const { subject, html, text } = getInviteEmailContent(inviteUrl);

  const resend = new Resend(apiKey);
  const { error: sendErr } = await resend.emails.send({
    from: fromAddress,
    to: [invite.email],
    subject,
    html,
    text,
  });

  if (sendErr) {
    return { success: false, error: sendErr.message || 'Failed to send invitation email.' };
  }

  return { success: true, invite };
}
