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

/** Remove email-client image placeholders like [image: (uuid).png] or [image: filename] so body_text shows real content + OCR. */
function stripImagePlaceholders(text: string): string {
  if (!text) return '';
  return text
    .replace(/\[image:\s*[^\]]*\]/gi, '')
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

interface OCRWorker {
  recognize(image: Buffer): Promise<{ data?: { text?: string } }>;
  terminate(): Promise<unknown>;
}

async function createOCRWorker(): Promise<OCRWorker> {
  const Tesseract = (await import('tesseract.js')).default;
  return Tesseract.createWorker('eng', 1, {});
}

async function runOCR(
  worker: OCRWorker,
  buffer: Buffer,
  contentType: string
): Promise<string | null> {
  const isImage = contentType.startsWith('image/');
  if (!isImage || !buffer?.length) return null;
  try {
    const { data } = await worker.recognize(buffer);
    return data?.text?.trim() || null;
  } catch (e) {
    console.error('OCR error:', e instanceof Error ? e.message : e);
    return null;
  }
}

const RECEIVING_FETCH_RETRIES = 3;
const RECEIVING_FETCH_DELAY_MS = 2000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getReceivedEmail(apiKey: string, emailId: string) {
  let lastStatus = 0;
  let lastBody = '';
  for (let attempt = 1; attempt <= RECEIVING_FETCH_RETRIES; attempt++) {
    const res = await fetch(`${RESEND_API_BASE}/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    lastStatus = res.status;
    lastBody = await res.text();
    if (res.ok) {
      return JSON.parse(lastBody) as {
        subject?: string | null;
        text?: string | null;
        html?: string | null;
      };
    }
    const retryable = res.status === 404 || (res.status >= 500 && res.status < 600);
    if (!retryable || attempt === RECEIVING_FETCH_RETRIES) {
      throw new Error(lastBody || `Resend API ${res.status}`);
    }
    await sleep(RECEIVING_FETCH_DELAY_MS * attempt);
  }
  throw new Error(lastBody || `Resend API ${lastStatus}`);
}

async function fetchAttachmentBuffer(
  downloadUrl: string,
  apiKey: string
): Promise<Buffer | null> {
  try {
    const res = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function listReceivedAttachments(apiKey: string, emailId: string) {
  const maxAttempts = 3;
  const delayMs = 2000;
  let lastErr = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(
      `${RESEND_API_BASE}/emails/receiving/${emailId}/attachments`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    const body = await res.text();
    if (res.ok) {
      const data = JSON.parse(body) as {
        data?: Array<{
          id: string;
          filename?: string;
          content_type?: string;
          download_url?: string;
        }>;
      };
      return data.data ?? [];
    }
    lastErr = body || `Resend attachments API ${res.status}`;
    const retryable = res.status === 404 || (res.status >= 500 && res.status < 600);
    if (!retryable || attempt === maxAttempts) {
      throw new Error(lastErr);
    }
    await sleep(delayMs * attempt);
  }
  throw new Error(lastErr || 'Resend attachments API failed');
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
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Resend get email error:', { emailId, message: msg });
    return NextResponse.json(
      { error: 'Failed to fetch email', detail: msg },
      { status: 502 }
    );
  }

  const rawEmailBody = (email.text || stripHtml(email.html || '')).trim();
  let bodyText = stripImagePlaceholders(rawEmailBody);

  const customerEmail = extractCustomerFromSubject(email.subject ?? null);
  const subject = (email.subject ?? '').trim() || null;

  let attachments: Array<{ id: string; filename?: string; content_type?: string; download_url?: string }> = [];
  try {
    attachments = await listReceivedAttachments(apiKey, emailId);
  } catch (e) {
    console.error('Resend list attachments error:', e);
  }

  const imageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

  // A01.4: Accept email with only screenshots (no body) – build body from OCR
  let ocrWorker: OCRWorker | null = null;
  if (!bodyText && attachments.length > 0) {
    ocrWorker = await createOCRWorker();
    const ocrParts: string[] = [];
    for (const att of attachments) {
      if (!att.download_url) continue;
      const buffer = await fetchAttachmentBuffer(att.download_url, apiKey);
      if (!buffer?.length) continue;
      const contentType = (att.content_type || 'application/octet-stream').toLowerCase();
      if (imageTypes.some((t) => contentType.startsWith(t))) {
        const extracted = await runOCR(ocrWorker, buffer, contentType);
        if (extracted) {
          ocrParts.push(`[Screenshot: ${att.filename ?? 'image'}]\n${extracted}`);
        }
      }
    }
    await ocrWorker.terminate();
    ocrWorker = null;
    bodyText = ocrParts.length > 0
      ? ocrParts.join('\n\n')
      : '(Feedback received with attachments; no text could be extracted from images.)';
  }

  if (!bodyText) {
    return NextResponse.json(
      { error: 'Email has no text content or image attachments to extract text from' },
      { status: 400 }
    );
  }

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

  const hasImageAttachments = attachments.some((att) => {
    const ct = (att.content_type || '').toLowerCase();
    return imageTypes.some((t) => ct.startsWith(t));
  });
  const attachmentOcrWorker = hasImageAttachments ? await createOCRWorker() : null;

  for (const att of attachments) {
    if (!att.download_url) continue;
    const buffer = await fetchAttachmentBuffer(att.download_url, apiKey);
    if (!buffer?.length) continue;

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
    if (attachmentOcrWorker && imageTypes.some((t) => contentType.startsWith(t))) {
      extractedText = await runOCR(attachmentOcrWorker, buffer, contentType);
      if (extractedText) {
        appendedBody += `\n\n[Screenshot: ${att.filename ?? 'image'}]\n${extractedText}`;
      }
    }

    await supabase.from('feedback_attachments').insert({
      feedback_id: feedback.id,
      storage_path: storagePath,
      extracted_text: extractedText,
    });
  }

  if (attachmentOcrWorker) await attachmentOcrWorker.terminate();

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
