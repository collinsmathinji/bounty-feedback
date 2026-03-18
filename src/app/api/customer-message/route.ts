import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Resend } from 'resend';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        feedbackId?: string;
        body?: string;
        sendEmail?: boolean;
        markResolved?: boolean;
        customerEmail?: string;
      }
    | null;
  const feedbackId = body?.feedbackId?.trim();
  const message = body?.body?.trim();
  const sendEmail = Boolean(body?.sendEmail);
  const markResolved = Boolean(body?.markResolved);
  const customerEmailFromClient = body?.customerEmail?.trim() || null;

  if (!feedbackId || !message) {
    return NextResponse.json({ error: 'Missing feedbackId or body' }, { status: 400 });
  }

  const { data: feedback, error: fbErr } = await supabase
    .from('feedback')
    .select('id, customer_email, status')
    .eq('id', feedbackId)
    .single();

  if (fbErr || !feedback) {
    return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
  }

  // If the UI provided a customer email (possibly newly edited), persist it
  // so future messages also have a destination.
  if (customerEmailFromClient && customerEmailFromClient !== feedback.customer_email) {
    const { error: emailUpdateErr } = await supabase
      .from('feedback')
      .update({ customer_email: customerEmailFromClient, updated_at: new Date().toISOString() })
      .eq('id', feedbackId);
    if (!emailUpdateErr) {
      feedback.customer_email = customerEmailFromClient;
    }
  }

  let sentVia: 'manual' | 'email' = 'manual';
  let emailError: string | null = null;
  if (sendEmail) {
    if (!feedback.customer_email) {
      return NextResponse.json({ error: 'No customer email set for this feedback.' }, { status: 400 });
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Email sending is not configured (missing RESEND_API_KEY).' },
        { status: 500 }
      );
    }
    const resend = new Resend(apiKey);
    const from = process.env.RESEND_FROM || 'noreply@vamo.app';
    try {
      await resend.emails.send({
        from,
        to: feedback.customer_email,
        subject: 'Customer Feedback Update',
        text: message,
      });
      sentVia = 'email';
    } catch (e) {
      emailError = e instanceof Error ? e.message : 'Failed to send email.';
      sentVia = 'manual';
    }
  }

  const { error: msgErr } = await supabase.from('customer_messages').insert({
    feedback_id: feedbackId,
    created_by: user.id,
    body: message,
    sent_via: sentVia,
  });

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  if (markResolved) {
    await supabase
      .from('feedback')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', feedbackId);
  }

  return NextResponse.json({ ok: true, sent_via: sentVia, email_error: emailError });
}

