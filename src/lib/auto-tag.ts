/**
 * Auto-tag feedback from body text (A02).
 * Uses keyword matching and simple sentiment; LLM suggestion when OPENAI_API_KEY is set.
 */

import OpenAI from 'openai';

const TAG_KEYWORDS: Record<string, string[]> = {
  'UI': ['ui', 'interface', 'design', 'layout', 'button', 'click', 'screen', 'page', 'look', 'appearance', 'consistent', 'consistency'],
  'Bug': ['bug', 'broken', 'crash', 'error', 'not working', 'doesn\'t work', 'failed', 'failure', 'issue'],
  'Search Bar': ['search bar', 'search box', 'search field', 'search input', 'search bar is broken'],
  'Search Results': ['search results', 'search result', 'results page', 'search doesn\'t', 'search not'],
  'Filter': ['filter', 'filters', 'filtering', 'filter by', 'filter out'],
  'Sequences': ['sequence', 'sequences', 'sequencing', 'sequence flow'],
  'Inbox': ['inbox', 'inbox is', 'inbox not', 'inbox problem'],
  'Integrations': ['integration', 'integrations', 'integrate', 'api', 'webhook', 'sync', 'connected'],
};

const POSITIVE_WORDS = ['great', 'awesome', 'love', 'excellent', 'thank', 'thanks', 'helpful', 'easy', 'good', 'works well', 'smooth', 'fast', 'perfect'];
const NEGATIVE_WORDS = ['bad', 'terrible', 'frustrated', 'frustrating', 'hate', 'slow', 'confusing', 'broken', 'wrong', 'problem', 'issue', 'disappointed', 'annoying', 'difficult'];

export function suggestTags(bodyText: string): string[] {
  const text = (bodyText || '').toLowerCase();
  const tags = new Set<string>();

  for (const [tagName, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw.toLowerCase()))) {
      tags.add(tagName);
    }
  }

  const positiveCount = POSITIVE_WORDS.filter((w) => text.includes(w)).length;
  const negativeCount = NEGATIVE_WORDS.filter((w) => text.includes(w)).length;
  if (positiveCount > negativeCount && positiveCount > 0) {
    tags.add('Positive Feedback');
  }
  if (negativeCount > positiveCount && negativeCount > 0) {
    tags.add('Negative Feedback');
  }

  return Array.from(tags);
}

/**
 * Suggest tags using an LLM (OpenAI) from email subject + body.
 * Only returns tag names that exist in availableTagNames.
 * Returns null if OPENAI_API_KEY is missing or the LLM call fails (caller should fall back to suggestTags).
 */
export async function suggestTagsWithLLM(
  subject: string | null,
  bodyText: string,
  availableTagNames: string[]
): Promise<string[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || availableTagNames.length === 0) return null;

  const text = [subject, bodyText].filter(Boolean).join('\n\n');
  if (!text.trim()) return null;

  const openai = new OpenAI({ apiKey });
  const tagList = availableTagNames.join(', ');

  const systemPrompt = `You are an assistant that tags customer feedback. You must respond with a JSON object only (no markdown, no code block) with a single key "tags" whose value is an array of tag names.

Rules:
- Only use tag names from this exact list: ${tagList}
- Pick all tags that reasonably apply to the feedback (subject + body). Be inclusive but relevant.
- Return tag names exactly as they appear in the list (case-sensitive).
- If no tags fit, return an empty array: {"tags":[]}
- Do not invent or paraphrase tag names.`;

  const userPrompt = `Feedback to tag:\n\nSubject: ${subject ?? '(none)'}\n\nBody:\n${bodyText.slice(0, 4000)}\n\nReturn JSON with key "tags" (array of tag names from the list).`;

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
    if (!content) return null;

    const parsed = JSON.parse(content) as { tags?: unknown };
    const raw = parsed.tags;
    if (!Array.isArray(raw)) return null;

    const allowedSet = new Set(availableTagNames);
    const suggested = raw
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      .map((s) => s.trim())
      .filter((name) => allowedSet.has(name));
    return [...new Set(suggested)];
  } catch (e) {
    console.error('LLM auto-tag error:', e instanceof Error ? e.message : e);
    return null;
  }
}
