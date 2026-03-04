import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { createAdminClient } from '@/lib/supabase/admin';
import { suggestTags } from '@/lib/auto-tag';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RESEND_API_BASE = 'https://api.resend.com';
const UNASSIGNED_TAG_SLUG = 'unassigned';
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCustomerFromSubject(subject: string | null): string | null {
  if (!subject?.trim()) return null;
  const trimmed = subject.trim();
  const match = trimmed.match(EMAIL_REGEX);
  if (match) return match[0].toLowerCase();
  if (EMAIL_REGEX.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

async function runOCR(buffer: Buffer, contentType: string): Promise<string | null> {
  const isImage = contentType.startsWith('image/');
  if (!isImage) return null;
  try {
    const Tesseract = (await import('tesseract.js')).default;
    const { data } = await Tesseract.recognize(buffer, 'eng');
    return data?.text?.trim() || null;
  } catch {
    return null;
  }
}

async function getReceivedEmail(apiKey: string, emailId: string) {
  const res = await fetch(`${RESEND_API_BASE}/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Resend API ${res.status}`);
  }
  return res.json() as Promise<{
    subject?: string | null;
    text?: string | null;
    html?: string | null;
  }>;
}

async function listReceivedAttachments(apiKey: string, emailId: string) {
  const res = await fetch(
    `${RESEND_API_BASE}/emails/receiving/${emailId}/attachments`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Resend attachments API ${res.status}`);
  }
  const data = (await res.json()) as {
    data?: Array<{
      id: string;
      filename?: string;
      content_type?: string;
      download_url?: string;
    }>;
  };
  return data.data ?? [];
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) {
    return NextResponse.json(
      { error: 'Resend not configured (RESEND_API_KEY / RESEND_WEBHOOK_SECRET)' },
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

  let event: { type: string; data?: { email_id?: string } };
  try {
    const wh = new Webhook(webhookSecret);
    wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
    event = JSON.parse(rawBody) as { type: string; data?: { email_id?: string } };
  } catch {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
  }

  if (event.type !== 'email.received' || !event.data?.email_id) {
    return NextResponse.json({ ok: true });
  }

  const emailId = event.data.email_id;

  let email: { subject?: string | null; text?: string | null; html?: string | null };
  try {
    email = await getReceivedEmail(apiKey, emailId);
  } catch (e) {
    console.error('Resend get email error:', e);
    return NextResponse.json({ error: 'Failed to fetch email' }, { status: 502 });
  }

  const bodyText = (email.text || stripHtml(email.html || '')).trim();
  if (!bodyText) {
    return NextResponse.json({ error: 'Email has no text content' }, { status: 400 });
  }

  const customerEmail = extractCustomerFromSubject(email.subject ?? null);
  const subject = (email.subject ?? '').trim() || null;

  const supabase = createAdminClient();
  let orgId = process.env.RESEND_FEEDBACK_ORGANIZATION_ID ?? null;
  if (!orgId) {
    const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
    orgId = orgs?.[0]?.id ?? null;
  }
  if (!orgId) {
    return NextResponse.json(
      { error: 'No organization (set RESEND_FEEDBACK_ORGANIZATION_ID or create an org)' },
      { status: 503 }
    );
  }

  const suggested = suggestTags(bodyText);
  const { data: tagRows } = await supabase
    .from('tags')
    .select('id, name, slug')
    .in('name', [...suggested, 'Unassigned']);
  const tagMap = new Map((tagRows ?? []).map((t) => [t.name.toLowerCase(), t]));

  const tagIds: string[] = [];
  for (const name of suggested) {
    const t = tagMap.get(name.toLowerCase());
    if (t) tagIds.push(t.id);
  }
  if (!customerEmail) {
    const unassigned = (tagRows ?? []).find((t) => t.slug === UNASSIGNED_TAG_SLUG);
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
      source: 'email',
    })
    .select('id')
    .single();

  if (feedbackErr || !feedback) {
    console.error('Feedback insert error:', feedbackErr);
    return NextResponse.json(
      { error: feedbackErr?.message ?? 'Failed to create feedback' },
      { status: 500 }
    );
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

  let appendedBody = bodyText;
  let attachments: Array<{ id: string; filename?: string; content_type?: string; download_url?: string }> = [];
  try {
    attachments = await listReceivedAttachments(apiKey, emailId);
  } catch (e) {
    console.error('Resend list attachments error:', e);
  }

  const imageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

  for (const att of attachments) {
    if (!att.download_url) continue;
    let buffer: Buffer;
    try {
      const res = await fetch(att.download_url);
      if (!res.ok) continue;
      buffer = Buffer.from(await res.arrayBuffer());
    } catch {
      continue;
    }

    const contentType = (att.content_type || 'application/octet-stream').toLowerCase();
    const ext = att.filename?.split('.').pop() || (contentType.includes('png') ? 'png' : 'jpg');
    const storagePath = `${orgId}/${feedback.id}/${Date.now()}-${att.id}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('attachments')
      .upload(storagePath, buffer, {
        contentType: att.content_type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadErr) continue;

    let extractedText: string | null = null;
    if (imageTypes.some((t) => contentType.startsWith(t))) {
      extractedText = await runOCR(buffer, contentType);
      if (extractedText) appendedBody += `\n\n[From screenshot: ${att.filename ?? 'image'}]\n${extractedText}`;
    }

    await supabase.from('feedback_attachments').insert({
      feedback_id: feedback.id,
      storage_path: storagePath,
      extracted_text: extractedText,
    });
  }

  if (appendedBody !== bodyText) {
    await supabase
      .from('feedback')
      .update({ body_text: appendedBody })
      .eq('id', feedback.id);
  }

  return NextResponse.json({
    ok: true,
    feedback_id: feedback.id,
    customer_email: customerEmail,
    attachments_processed: attachments.length,
  });
}
