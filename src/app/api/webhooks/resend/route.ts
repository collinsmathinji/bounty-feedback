import { after } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { createAdminClient } from '@/lib/supabase/admin';
import { suggestTags, suggestTagsWithLLM } from '@/lib/auto-tag';
import {
  FEEDBACK_PROCESSING_PLACEHOLDER as PROCESSING_PLACEHOLDER,
  OCR_FALLBACK_MESSAGE,
} from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RESEND_API_BASE = 'https://api.resend.com';
const UNASSIGNED_TAG_SLUG = 'unassigned';
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/** Stop waiting for OCR after this; show image + fallback message. */
const OCR_TIMEOUT_MS = 45_000;

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

/** Extract customer email from body line like "Customer: user@example.com" or "Customer:user@example.com". */
function extractCustomerFromBody(body: string): string | null {
  if (!body?.trim()) return null;
  const line = body.split(/\r?\n/).find((l) => /^\s*Customer\s*:\s*/i.test(l.trim()));
  if (!line) return null;
  const afterLabel = line.replace(/^\s*Customer\s*:\s*/i, '').trim();
  const match = afterLabel.match(EMAIL_REGEX);
  return match ? match[0].toLowerCase() : null;
}

/** Extract email from Resend "from" field: "Name <user@example.com>" or plain "user@example.com". */
function extractEmailFromFrom(from: string | null | undefined): string | null {
  if (!from?.trim()) return null;
  const trimmed = from.trim();
  const angle = trimmed.match(/<([^>]+)>/);
  if (angle) {
    const addr = angle[1].trim();
    return EMAIL_REGEX.test(addr) ? addr.toLowerCase() : null;
  }
  return EMAIL_REGEX.test(trimmed) ? trimmed.toLowerCase() : null;
}

/** Remove Customer: and Tags: metadata lines so stored body_text is clean (tags come from LLM only). */
function stripMetadataLines(body: string): string {
  if (!body?.trim()) return body;
  return body
    .split(/\r?\n/)
    .filter((l) => !/^\s*Customer\s*:\s*/i.test(l.trim()) && !/^\s*Tags\s*:\s*/i.test(l.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
        from?: string | null;
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
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Resend not configured (RESEND_API_KEY)' },
      { status: 503 }
    );
  }

  // Do feedback creation in the request so it always completes; only OCR/attachments in background (Vercel kills after 60s)
  let email: { subject?: string | null; text?: string | null; html?: string | null; from?: string | null };
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

  // Customer: body "Customer: ..." > subject > sender (from). Sender is used so most feedback is auto-assigned.
  const customerEmail =
    extractCustomerFromBody(bodyText) ??
    extractCustomerFromSubject(email.subject ?? null) ??
    extractEmailFromFrom(email.from);

  bodyText = stripMetadataLines(bodyText);

  const subject = (email.subject ?? '').trim() || null;

  let attachments: Array<{ id: string; filename?: string; content_type?: string; download_url?: string }> = [];
  try {
    attachments = await listReceivedAttachments(apiKey, emailId);
  } catch (e) {
    console.error('Resend list attachments error:', e);
  }

  if (!bodyText && attachments.length > 0) {
    bodyText = PROCESSING_PLACEHOLDER;
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

  // All emails are tagged via LLM only (no explicit Tags: in body). Fall back to keyword-based if LLM unavailable.
  const tagIds: string[] = [];
  const { data: allTagRows } = await supabase.from('tags').select('id, name, slug');
  const tagRows = allTagRows ?? [];
  const allTagNames = tagRows
    .filter((t) => t.slug !== UNASSIGNED_TAG_SLUG)
    .map((t) => t.name);
  let suggested: string[] =
    (await suggestTagsWithLLM(subject, bodyText, allTagNames)) ?? [];
  if (suggested.length === 0) {
    suggested = suggestTags(bodyText);
  }
  const tagMap = new Map(tagRows.map((t) => [t.name.toLowerCase(), t]));
  for (const name of suggested) {
    const t = tagMap.get(name.toLowerCase());
    if (t) tagIds.push(t.id);
  }
  if (!customerEmail) {
    const unassigned = tagRows.find((t) => t.slug === UNASSIGNED_TAG_SLUG);
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

  const feedbackId = feedback.id;
  after(async () => {
    try {
      await processAttachmentsAndOcr(emailId, feedbackId);
    } catch (e) {
      console.error('Resend webhook background error:', { emailId, feedbackId, error: e });
    }
  });

  return NextResponse.json({
    ok: true,
    feedback_id: feedback.id,
    customer_email: customerEmail,
    attachments_queued: attachments.length,
  });
}

async function processAttachmentsAndOcr(emailId: string, feedbackId: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from('feedback')
    .select('organization_id, body_text')
    .eq('id', feedbackId)
    .single();
  if (!row) return;

  const orgId = row.organization_id;
  const initialBody = row.body_text ?? '';
  const wasProcessingPlaceholder = initialBody.trim() === PROCESSING_PLACEHOLDER;
  let bodyText = wasProcessingPlaceholder ? '' : initialBody.trim();

  let attachments: Array<{ id: string; filename?: string; content_type?: string; download_url?: string }> = [];
  try {
    attachments = await listReceivedAttachments(apiKey, emailId);
  } catch {
    return;
  }
  if (attachments.length === 0) return;

  const imageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
  const hasImages = attachments.some((a) =>
    imageTypes.some((t) => (a.content_type ?? '').toLowerCase().startsWith(t))
  );
  const ocrWorker = hasImages ? await createOCRWorker() : null;

  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
  }, OCR_TIMEOUT_MS);

  try {
    for (const att of attachments) {
      if (!att.download_url) continue;
      const buffer = await fetchAttachmentBuffer(att.download_url, apiKey);
      if (!buffer?.length) continue;

      const contentType = (att.content_type || 'application/octet-stream').toLowerCase();
      const ext = att.filename?.split('.').pop() || (contentType.includes('png') ? 'png' : 'jpg');
      const storagePath = `${orgId}/${feedbackId}/${Date.now()}-${att.id}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('attachments')
        .upload(storagePath, buffer, {
          contentType: att.content_type || 'application/octet-stream',
          upsert: false,
        });
      if (uploadErr) continue;

      let extractedText: string | null = null;
      if (!timedOut && ocrWorker && imageTypes.some((t) => contentType.startsWith(t))) {
        extractedText = await runOCR(ocrWorker, buffer, contentType);
        if (extractedText) {
          bodyText += (bodyText ? '\n\n' : '') + `[Screenshot: ${att.filename ?? 'image'}]\n${extractedText}`;
        }
      }

      await supabase.from('feedback_attachments').insert({
        feedback_id: feedbackId,
        storage_path: storagePath,
        extracted_text: extractedText,
      });
    }

    const useFallback = timedOut || (wasProcessingPlaceholder && !bodyText);
    const finalBody = useFallback ? OCR_FALLBACK_MESSAGE : bodyText || initialBody;
    if (finalBody !== initialBody) {
      await supabase.from('feedback').update({ body_text: finalBody }).eq('id', feedbackId);
    }
  } finally {
    clearTimeout(timeoutId);
    if (ocrWorker) await ocrWorker.terminate();
  }
}
