/**
 * Auto-tag feedback from body text (A02).
 * Uses keyword matching and simple sentiment; can be extended with AI later.
 */

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
