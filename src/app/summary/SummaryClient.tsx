'use client';

import { useState, useCallback } from 'react';
import { FiltersSidebar, getDefaultFilters, type FilterState } from '@/components/FiltersSidebar';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';

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
    criticalThemes: Array<{
      title: string;
      description: string;
      mentions: number;
      sentiment: string;
      priority: string;
    }>;
    additionalObservations: string;
    recommendedActions: string[];
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
      ['Critical Themes'],
      ...summary.criticalThemes.flatMap((t) => [
        [t.title, t.description, `${t.mentions} mentions`, t.sentiment, t.priority],
      ]),
      [],
      ['Additional Observations', summary.additionalObservations],
      [],
      ['Recommended Actions'],
      ...summary.recommendedActions.map((a) => [a]),
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
    if (!summary) return;
    const dateRange = `${filters.dateFrom || '…'} – ${filters.dateTo || '…'}`;
    const margin = 20;
    const pageWidth = 210;
    const maxWidth = pageWidth - margin * 2;
    const lineHeight = 6;
    const doc = new jsPDF({ format: 'a4', unit: 'mm' });
    let y = 20;

    function addText(text: string, fontSize: number, bold = false): void {
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(text, maxWidth);
      for (const line of lines) {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.text(line, margin, y);
        y += lineHeight;
      }
    }

    addText('Feedback Summary', 18, true);
    y += 4;
    addText(`Date range: ${dateRange}`, 11);
    addText(`Total feedback: ${summary.totalFeedback}`, 11);
    y += 6;
    addText('Critical Themes', 12, true);
    y += 2;
    for (const t of summary.criticalThemes) {
      addText(`${t.title} (${t.mentions} mention${t.mentions !== 1 ? 's' : ''}, ${t.sentiment}, ${t.priority})`, 10);
      addText(t.description, 9);
      y += 2;
    }
    y += 4;
    addText('Additional Observations', 12, true);
    y += 2;
    addText(summary.additionalObservations, 10);
    y += 6;
    addText('Recommended Actions', 12, true);
    y += 2;
    for (const a of summary.recommendedActions) {
      addText(`• ${a}`, 10);
    }
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated ${format(new Date(), 'PPpp')}`, margin, y);
    doc.setTextColor(0, 0, 0);

    doc.save(`feedback-summary-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
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
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-slate-800">
                AI Feedback Summary: {dateLabel}
              </h2>
              <p className="text-slate-600">
                Total feedback in range: <strong>{summary.totalFeedback}</strong>
              </p>

              <section>
                <h3 className="font-semibold text-slate-800 mb-3">Critical Themes</h3>
                <ul className="space-y-4">
                  {summary.criticalThemes.map((theme, i) => (
                    <li key={i} className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                      <div className="font-medium text-slate-800">{theme.title}</div>
                      <p className="text-slate-600 text-sm mt-1">{theme.description}</p>
                      <div className="flex flex-wrap gap-2 mt-2 text-xs">
                        <span className="text-slate-500">Mentions: {theme.mentions} customer{theme.mentions !== 1 ? 's' : ''}</span>
                        <span className="text-slate-500">Sentiment: {theme.sentiment}</span>
                        <span className="text-slate-500">Priority: {theme.priority}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="font-semibold text-slate-800 mb-2">Additional Observations</h3>
                <p className="text-slate-600">{summary.additionalObservations}</p>
              </section>

              <section>
                <h3 className="font-semibold text-slate-800 mb-2">Recommended Actions</h3>
                <ul className="list-disc list-inside space-y-1 text-slate-700">
                  {summary.recommendedActions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </section>
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
