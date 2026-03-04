import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type SummaryFilters = {
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  tagIds?: string[];
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Summary generation is not configured (OPENAI_API_KEY)' },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const membership = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();
  if (!membership.data?.organization_id) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 });
  }
  const orgId = membership.data.organization_id;

  let body: SummaryFilters = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { dateFrom, dateTo, customerId, tagIds } = body;

  let query = supabase
    .from('feedback')
    .select('id, subject, body_text, customer_email, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (dateFrom) {
    query = query.gte('created_at', `${dateFrom}T00:00:00.000Z`);
  }
  if (dateTo) {
    query = query.lte('created_at', `${dateTo}T23:59:59.999Z`);
  }
  if (customerId) {
    const { data: cust } = await supabase
      .from('customers')
      .select('email')
      .eq('id', customerId)
      .single();
    if (cust?.email) {
      query = query.eq('customer_email', cust.email);
    }
  }
  if (tagIds?.length) {
    const { data: linkRows } = await supabase
      .from('feedback_tags')
      .select('feedback_id')
      .in('tag_id', tagIds);
    const feedbackIds = [...new Set((linkRows ?? []).map((r) => r.feedback_id))];
    if (feedbackIds.length === 0) {
      return NextResponse.json({
        totalFeedback: 0,
        topTags: [],
        topRequestedActions: [],
        otherTrends: 'No feedback in the selected range.',
      });
    }
    query = query.in('id', feedbackIds);
  }

  const { data: feedbackList, error: feedbackError } = await query;
  if (feedbackError) {
    return NextResponse.json(
      { error: feedbackError.message },
      { status: 500 }
    );
  }

  const items = feedbackList ?? [];
  const totalFeedback = items.length;

  if (totalFeedback === 0) {
    return NextResponse.json({
      totalFeedback: 0,
      topTags: [],
      topRequestedActions: [],
      otherTrends: 'No feedback in the selected range.',
    });
  }

  const feedbackBlob = items
    .map(
      (f) =>
        `- [${f.created_at?.slice(0, 10)}] ${f.subject ?? '(no subject)'}\n  ${(f.body_text ?? '').slice(0, 500)}`
    )
    .join('\n\n');

  const openai = new OpenAI({ apiKey });
  const systemPrompt = `You are an assistant that summarizes customer feedback. Given a list of feedback items, respond with a JSON object only (no markdown, no code block), with these exact keys:
- "totalFeedback": number (count of items; use the number provided).
- "topRequestedActions": array of { "text": string (short action request, e.g. "Add dark mode"), "mentions": number (how many feedback items mentioned this) }. List 3–7 top requested actions, ordered by mentions descending.
- "otherTrends": string (one short paragraph describing other themes, sentiment, or trends).`;

  const userPrompt = `Total feedback items: ${totalFeedback}\n\nFeedback:\n${feedbackBlob}\n\nReturn the JSON summary.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('Empty response from ChatGPT');
    }

    const parsed = JSON.parse(content) as {
      totalFeedback?: number;
      topRequestedActions?: { text: string; mentions: number }[];
      otherTrends?: string;
    };

    const topRequestedActions = Array.isArray(parsed.topRequestedActions)
      ? parsed.topRequestedActions.slice(0, 10)
      : [];
    const otherTrends =
      typeof parsed.otherTrends === 'string'
        ? parsed.otherTrends
        : 'No additional trends identified.';

    return NextResponse.json({
      totalFeedback: typeof parsed.totalFeedback === 'number' ? parsed.totalFeedback : totalFeedback,
      topTags: [], // SummaryClient doesn't require this for display; could be derived from tags if needed
      topRequestedActions,
      otherTrends,
    });
  } catch (e) {
    console.error('Summary generation error:', e);
    const message = e instanceof Error ? e.message : 'Summary generation failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
