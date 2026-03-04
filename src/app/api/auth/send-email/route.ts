import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

const AUTH_EMAIL_TYPES: Record<string, { subject: string; title: string; bodyIntro: string }> = {
  signup: {
    subject: 'Confirm your email – Customer Feedback Dashboard',
    title: 'Confirm your email',
    bodyIntro: 'Thanks for signing up. Click the button below to confirm your email address and get started.',
  },
  recovery: {
    subject: 'Reset your password – Customer Feedback Dashboard',
    title: 'Reset your password',
    bodyIntro: 'We received a request to reset your password. Click the button below to choose a new password.',
  },
  email_change: {
    subject: 'Confirm your new email – Customer Feedback Dashboard',
    title: 'Confirm your new email',
    bodyIntro: 'Click the button below to confirm your new email address.',
  },
  email_otp: {
    subject: 'Your sign-in code – Customer Feedback Dashboard',
    title: 'Your sign-in code',
    bodyIntro: 'Use the code below to sign in.',
  },
};

function buildVerifyUrl(
  supabaseUrl: string,
  tokenHash: string,
  emailActionType: string,
  redirectTo: string,
  siteUrl: string
): string {
  const redirect = redirectTo || siteUrl;
  const params = new URLSearchParams({
    token: tokenHash,
    type: emailActionType,
    ...(redirect ? { redirect_to: redirect } : {}),
  });
  return `${supabaseUrl.replace(/\/$/, '')}/auth/v1/verify?${params.toString()}`;
}

function getEmailContent(
  actionType: string,
  verifyUrl: string,
  token?: string
): { subject: string; html: string; text: string } {
  const t = AUTH_EMAIL_TYPES[actionType] ?? {
    subject: 'Action required – Customer Feedback Dashboard',
    title: 'Action required',
    bodyIntro: 'Click the link below to continue.',
  };

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e293b;">
  <h1 style="font-size:1.25rem;margin-bottom:16px;">${t.title}</h1>
  <p style="margin-bottom:24px;line-height:1.5;">${t.bodyIntro}</p>
  ${token && actionType === 'email_otp' ? `<p style="font-size:1.5rem;font-weight:600;letter-spacing:0.2em;margin:24px 0;">${token}</p>` : ''}
  <a href="${verifyUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:500;">${actionType === 'email_otp' ? 'Sign in' : 'Confirm'}</a>
  <p style="margin-top:24px;font-size:0.875rem;color:#64748b;">If you didn't request this, you can ignore this email.</p>
</body>
</html>
  `.trim();

  const text = `${t.title}\n\n${t.bodyIntro}\n\n${actionType === 'email_otp' && token ? `Code: ${token}\n\n` : ''}${verifyUrl}`;

  return { subject: t.subject, html, text };
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  const hookSecret = process.env.SEND_EMAIL_HOOK_SECRET;
  const fromAddress = process.env.RESEND_AUTH_FROM ?? 'Customer Feedback Dashboard <onboarding@resend.dev>';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!apiKey || !hookSecret) {
    return NextResponse.json(
      { error: 'RESEND_API_KEY or SEND_EMAIL_HOOK_SECRET not set' },
      { status: 503 }
    );
  }
  if (!supabaseUrl) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_SUPABASE_URL not set' },
      { status: 503 }
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix headers' }, { status: 400 });
  }

  let payload: {
    user: { email?: string; email_new?: string };
    email_data: {
      token: string;
      token_hash: string;
      token_new?: string;
      token_hash_new?: string;
      redirect_to?: string;
      email_action_type: string;
      site_url: string;
    };
  };

  try {
    const secret = hookSecret.replace(/^v1,/, '');
    const wh = new Webhook(secret);
    wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid hook signature' }, { status: 401 });
  }

  const { user, email_data } = payload;
  const actionType = email_data.email_action_type || 'signup';

  const resend = new Resend(apiKey);

  if (actionType === 'email_change' && email_data.token_new != null && email_data.token_hash_new != null) {
    const newEmail = user.email_new ?? user.email;
    const currentEmail = user.email;
    if (newEmail) {
      const verifyUrlNew = buildVerifyUrl(
        supabaseUrl,
        email_data.token_hash,
        'email_change',
        email_data.redirect_to ?? '',
        email_data.site_url ?? ''
      );
      const { subject, html, text } = getEmailContent('email_change', verifyUrlNew);
      const { error } = await resend.emails.send({
        from: fromAddress,
        to: [newEmail],
        subject,
        html,
        text,
      });
      if (error) {
        return NextResponse.json(
          { error: { message: error.message, http_code: 502 } },
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
    if (currentEmail) {
      const verifyUrlCurrent = buildVerifyUrl(
        supabaseUrl,
        email_data.token_hash_new,
        'email_change',
        email_data.redirect_to ?? '',
        email_data.site_url ?? ''
      );
      const { subject, html, text } = getEmailContent('email_change', verifyUrlCurrent);
      const { error } = await resend.emails.send({
        from: fromAddress,
        to: [currentEmail],
        subject: `Confirm current email – Customer Feedback Dashboard`,
        html,
        text,
      });
      if (error) {
        return NextResponse.json(
          { error: { message: error.message, http_code: 502 } },
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  } else {
    const toEmail = user.email_new ?? user.email;
    if (!toEmail) {
      return NextResponse.json(
        { error: { message: 'No recipient email', http_code: 400 } },
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const tokenHash = email_data.token_hash || email_data.token;
    const verifyUrl = buildVerifyUrl(
      supabaseUrl,
      tokenHash,
      actionType,
      email_data.redirect_to ?? '',
      email_data.site_url ?? ''
    );
    const { subject, html, text } = getEmailContent(
      actionType,
      verifyUrl,
      actionType === 'email_otp' ? email_data.token : undefined
    );
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: [toEmail],
      subject,
      html,
      text,
    });
    if (error) {
      return NextResponse.json(
        { error: { message: error.message, http_code: 502 } },
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  return new NextResponse(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
