'use client';

import { useState, useCallback } from 'react';
import { FiltersSidebar, getDefaultFilters, type FilterState } from '@/components/FiltersSidebar';
import { format } from 'date-fns';

type Customer = { id: string; email: string; display_name: string | null };
type Tag = { id: string; name: string; slug: string };

export function SummaryClient({
  initialCustomers,
  initialTags,
  defaultFilters,
}: {
  initialCustomers: Customer[];
  initialTags: Tag[];
  defaultFilters: FilterState;
}) {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [summary, setSummary] = useState<{
    totalFeedback: number;
    topTags: [string, number][];
    topRequestedActions: { text: string; mentions: number }[];
    otherTrends: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          customerId: filters.customerId || undefined,
          tagIds: filters.tagIds.length ? filters.tagIds : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const data = await res.json();
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load summary');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  function exportCSV() {
    if (!summary) return;
    const rows = [
      ['Feedback Summary', format(new Date(), 'yyyy-MM-dd')],
      ['Total feedback in range', summary.totalFeedback],
      [],
      ['Top requested actions'],
      ...summary.topRequestedActions.map((a) => [a.text, `${a.mentions} mentions`]),
      [],
      ['Other trends', summary.otherTrends],
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feedback-summary-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !summary) return;
    const dateRange = `${filters.dateFrom || '…'} – ${filters.dateTo || '…'}`;
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>Feedback Summary</title></head><body style="font-family:sans-serif;padding:2rem;">
        <h1>Feedback Summary</h1>
        <p><strong>Date range:</strong> ${dateRange}</p>
        <p><strong>Total feedback:</strong> ${summary.totalFeedback}</p>
        <h2>Top requested actions</h2>
        <ul>
          ${summary.topRequestedActions.map((a) => `<li>${a.text} (${a.mentions} mentions)</li>`).join('')}
        </ul>
        <h2>Other trends</h2>
        <p>${summary.otherTrends}</p>
        <p style="margin-top:2rem;color:#666;">Generated ${format(new Date(), 'PPpp')}</p>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
    printWindow.close();
  }

  const dateLabel =
    filters.dateFrom && filters.dateTo
      ? `${format(new Date(filters.dateFrom), 'MMM d')} – ${format(new Date(filters.dateTo), 'MMM d, yyyy')}`
      : 'Selected range';

  return (
    <div className="flex flex-1 min-h-0">
      <FiltersSidebar
        filters={filters}
        onFiltersChange={setFilters}
        customers={initialCustomers}
        tags={initialTags}
      />
      <div className="flex-1 flex flex-col min-w-0 bg-white overflow-auto">
        <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] shrink-0">
          <h1 className="text-xl font-semibold text-slate-900">Feedback Summary</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportPDF}
              disabled={!summary}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 text-sm"
            >
              Export PDF
            </button>
            <button
              type="button"
              onClick={exportCSV}
              disabled={!summary}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 text-sm"
            >
              Export CSV
            </button>
          </div>
        </header>
        <div className="flex-1 p-6">
          <div className="mb-4">
            <button
              type="button"
              onClick={fetchSummary}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {loading ? 'Generating…' : 'Generate AI summary'}
            </button>
          </div>
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          {summary && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-800">
                AI Feedback Summary: {dateLabel}
              </h2>
              <p className="text-slate-600">
                Total feedback in range: <strong>{summary.totalFeedback}</strong>
              </p>
              <div>
                <h3 className="font-medium text-slate-800 mb-2">Top requested actions</h3>
                <ul className="list-disc list-inside space-y-1 text-slate-700">
                  {summary.topRequestedActions.map((a, i) => (
                    <li key={i}>
                      {a.text} ({a.mentions} mention{a.mentions !== 1 ? 's' : ''})
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-slate-800 mb-2">Other feedback trends</h3>
                <p className="text-slate-600">{summary.otherTrends}</p>
              </div>
            </div>
          )}
          {!summary && !loading && (
            <p className="text-slate-500">
              Set your filters and click &quot;Generate AI summary&quot; to see prioritized feedback for the selected range.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
