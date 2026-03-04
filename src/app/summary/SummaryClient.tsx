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
  const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false);
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

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function exportPDF() {
    if (!summary) return;
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) {
      // Popup likely blocked; offer instructions
      if (typeof window !== 'undefined' && window.isSecureContext) {
        const printContent = document.createElement('div');
        printContent.id = 'summary-print-content';
        printContent.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;padding:2rem;font-family:sans-serif;background:white;';
        const dateRange = `${filters.dateFrom || '…'} – ${filters.dateTo || '…'}`;
        printContent.innerHTML = `
          <h1>Feedback Summary</h1>
          <p><strong>Date range:</strong> ${escapeHtml(dateRange)}</p>
          <p><strong>Total feedback:</strong> ${summary.totalFeedback}</p>
          <h2>Top requested actions</h2>
          <ul>${summary.topRequestedActions.map((a) => `<li>${escapeHtml(a.text)} (${a.mentions} mentions)</li>`).join('')}</ul>
          <h2>Other trends</h2>
          <p>${escapeHtml(summary.otherTrends)}</p>
          <p style="margin-top:2rem;color:#666;">Generated ${escapeHtml(format(new Date(), 'PPpp'))}</p>
        `;
        document.body.appendChild(printContent);
        window.print();
        document.body.removeChild(printContent);
      }
      return;
    }
    const dateRange = `${filters.dateFrom || '…'} – ${filters.dateTo || '…'}`;
    const topActionsHtml = summary.topRequestedActions
      .map((a) => `<li>${escapeHtml(a.text)} (${a.mentions} mentions)</li>`)
      .join('');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>Feedback Summary</title>
      <style>body{font-family:system-ui,sans-serif;padding:2rem;max-width:60rem;margin:0 auto;} h1{font-size:1.5rem;} h2{font-size:1.15rem;margin-top:1.5rem;} p,li{line-height:1.5;} .muted{color:#666;margin-top:2rem;font-size:0.875rem;}</style>
      </head><body>
        <h1>Feedback Summary</h1>
        <p><strong>Date range:</strong> ${escapeHtml(dateRange)}</p>
        <p><strong>Total feedback:</strong> ${summary.totalFeedback}</p>
        <h2>Top requested actions</h2>
        <ul>${topActionsHtml}</ul>
        <h2>Other trends</h2>
        <p>${escapeHtml(summary.otherTrends)}</p>
        <p class="muted">Generated ${escapeHtml(format(new Date(), 'PPpp'))}. Use the browser menu to Print → Save as PDF, then close this tab.</p>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    // Delay print so the document is fully rendered; window is left open so user can Save as PDF from print dialog
    setTimeout(() => {
      try {
        printWindow.print();
      } catch {
        // ignore if window was closed
      }
    }, 250);
  }

  const dateLabel =
    filters.dateFrom && filters.dateTo
      ? `${format(new Date(filters.dateFrom), 'MMM d')} – ${format(new Date(filters.dateTo), 'MMM d, yyyy')}`
      : 'Selected range';

  return (
    <div className="flex flex-1 min-h-0 min-w-0">
      <div className="hidden lg:block lg:shrink-0">
        <FiltersSidebar
          filters={filters}
          onFiltersChange={setFilters}
          customers={initialCustomers}
          tags={initialTags}
        />
      </div>
      {filtersDrawerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setFiltersDrawerOpen(false)} aria-hidden />
          <div className="fixed inset-y-0 left-0 z-50 w-[min(320px,85vw)] max-w-full bg-white shadow-xl overflow-y-auto lg:hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h2 className="font-semibold text-slate-900">Filters</h2>
              <button type="button" onClick={() => setFiltersDrawerOpen(false)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Close filters">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4">
              <FiltersSidebar filters={filters} onFiltersChange={setFilters} customers={initialCustomers} tags={initialTags} embedded />
            </div>
          </div>
        </>
      )}
      <div className="flex-1 flex flex-col min-w-0 bg-white overflow-auto">
        <header className="flex flex-wrap items-center gap-3 justify-between px-4 sm:px-6 lg:px-8 py-4 border-b border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => setFiltersDrawerOpen(true)}
            className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3 7.586V4z" /></svg>
            Filters
          </button>
          <h1 className="text-lg sm:text-xl font-semibold text-slate-900 flex-1">Feedback Summary</h1>
          <div className="flex gap-2 shrink-0">
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
        <div className="flex-1 p-4 sm:p-6">
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
