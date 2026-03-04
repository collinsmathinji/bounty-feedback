'use client';

import { useMemo, useState } from 'react';
import { FiltersSidebar, getDefaultFilters, type FilterState } from '@/components/FiltersSidebar';
import { FeedbackList } from './FeedbackList';
import { FeedbackDetailModal } from './FeedbackDetailModal';
import { NewFeedbackModal } from './NewFeedbackModal';
import { format } from 'date-fns';

type Tag = { id: string; name: string; slug: string };
type Customer = { id: string; email: string; display_name: string | null };
type FeedbackItem = {
  id: string;
  customer_email: string | null;
  subject: string | null;
  body_text: string;
  status: string;
  urgency_score: number | null;
  created_at: string;
  tags?: Tag[];
};

export function DashboardWithData({
  initialCustomers,
  initialTags,
  initialFeedback,
  defaultFilters,
}: {
  initialCustomers: Customer[];
  initialTags: Tag[];
  initialFeedback: FeedbackItem[];
  defaultFilters: FilterState;
}) {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newFeedbackOpen, setNewFeedbackOpen] = useState(false);
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>(initialFeedback);

  const filtered = useMemo(() => {
    let list = feedbackList;
    const from = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const to = filters.dateTo ? new Date(filters.dateTo) : null;
    if (from) list = list.filter((f) => new Date(f.created_at) >= from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      list = list.filter((f) => new Date(f.created_at) <= end);
    }
    if (filters.customerId) {
      const cust = initialCustomers.find((c) => c.id === filters.customerId);
      if (cust) list = list.filter((f) => f.customer_email === cust.email);
    }
    if (filters.tagIds.length)
      list = list.filter((f) =>
        f.tags?.some((t) => filters.tagIds.includes(t.id))
      );
    if (filters.status)
      list = list.filter((f) => f.status === filters.status);
    if (filters.urgencyScores.length)
      list = list.filter(
        (f) => f.urgency_score != null && filters.urgencyScores.includes(f.urgency_score)
      );
    return list;
  }, [feedbackList, filters, initialCustomers]);

  const selected = selectedId ? feedbackList.find((f) => f.id === selectedId) : null;

  function handleFeedbackCreated(item: FeedbackItem) {
    setFeedbackList((prev) => [item, ...prev]);
    setNewFeedbackOpen(false);
  }

  function handleFeedbackUpdated(updated: FeedbackItem) {
    setFeedbackList((prev) =>
      prev.map((f) => (f.id === updated.id ? updated : f))
    );
    setSelectedId(null);
  }

  return (
    <>
      <div className="flex flex-1 min-h-0">
        <FiltersSidebar
          filters={filters}
          onFiltersChange={setFilters}
          customers={initialCustomers}
          tags={initialTags}
        />
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] shrink-0">
            <h1 className="text-xl font-semibold text-slate-900">
              Customer Feedback Dashboard
            </h1>
            <button
              type="button"
              onClick={() => setNewFeedbackOpen(true)}
              className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary-hover)] flex items-center gap-2"
            >
              <span className="text-lg leading-none">+</span> New Feedback
            </button>
          </header>
          <div className="flex-1 overflow-auto">
            <FeedbackList
              feedback={filtered}
              customers={initialCustomers}
              onSelect={setSelectedId}
              formatDate={(d) => format(new Date(d), 'MMM d, yyyy')}
            />
          </div>
          <p className="px-6 py-2 text-slate-500 text-sm border-t border-[var(--border)]">
            Showing {filtered.length} feedback entries.
          </p>
        </div>
      </div>
      {selected && (
        <FeedbackDetailModal
          feedback={selected}
          tags={initialTags}
          customers={initialCustomers}
          onClose={() => setSelectedId(null)}
          onUpdate={handleFeedbackUpdated}
        />
      )}
      {newFeedbackOpen && (
        <NewFeedbackModal
          tags={initialTags}
          customers={initialCustomers}
          onClose={() => setNewFeedbackOpen(false)}
          onCreated={handleFeedbackCreated}
        />
      )}
    </>
  );
}
