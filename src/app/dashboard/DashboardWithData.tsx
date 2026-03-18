'use client';

import { useMemo, useState } from 'react';
import { FiltersSidebar, type FilterState } from '@/components/FiltersSidebar';
import { FeedbackList } from './FeedbackList';
import { FeedbackDetailModal } from './FeedbackDetailModal';
import { format } from 'date-fns';

type Tag = { id: string; name: string; slug: string };
type Customer = { id: string; email: string; display_name: string | null };
type Department = { id: string; name: string };
export type Member = { user_id: string; email: string; full_name: string | null };
export type FeedbackItem = {
  id: string;
  customer_email: string | null;
  subject: string | null;
  body_text: string;
  status: string;
  urgency_score: number | null;
  created_at: string;
  department_id?: string | null;
  resolved_at?: string | null;
  assigned_to?: string | null;
  tags?: Tag[];
};

export function DashboardWithData({
  initialCustomers,
  initialTags,
  initialDepartments,
  initialMembers,
  initialFeedback,
  defaultFilters,
  userRole,
  isMemberPortal = false,
}: {
  initialCustomers: Customer[];
  initialTags: Tag[];
  initialDepartments: Department[];
  initialMembers: Member[];
  initialFeedback: FeedbackItem[];
  defaultFilters: FilterState;
  userRole: 'admin' | 'manager' | 'member';
  isMemberPortal?: boolean;
}) {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false);
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>(initialFeedback);

  const filtered = useMemo(() => {
    if (isMemberPortal) return feedbackList;
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
  }, [feedbackList, filters, initialCustomers, isMemberPortal]);

  const selected = selectedId ? feedbackList.find((f) => f.id === selectedId) : null;

  function handleFeedbackUpdated(updated: FeedbackItem) {
    setFeedbackList((prev) =>
      prev.map((f) => (f.id === updated.id ? updated : f))
    );
    setSelectedId(null);
  }

  const activeFilterCount =
    (filters.tagIds.length ? 1 : 0) +
    (filters.urgencyScores.length ? 1 : 0) +
    (filters.customerId ? 1 : 0);

  return (
    <>
      <div className="flex flex-1 min-h-0 min-w-0">
        {/* Filters: only for admins */}
        {!isMemberPortal && (
          <>
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
                <div
                  className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                  onClick={() => setFiltersDrawerOpen(false)}
                  aria-hidden
                />
                <div className="fixed inset-y-0 left-0 z-50 w-[min(320px,85vw)] max-w-full bg-white shadow-xl overflow-y-auto lg:hidden">
                  <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h2 className="font-semibold text-slate-900">Filters</h2>
                    <button
                      type="button"
                      onClick={() => setFiltersDrawerOpen(false)}
                      className="p-2 rounded-lg text-slate-600 hover:bg-slate-100"
                      aria-label="Close filters"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="p-4">
                    <FiltersSidebar
                      filters={filters}
                      onFiltersChange={setFilters}
                      customers={initialCustomers}
                      tags={initialTags}
                      embedded
                    />
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <header className="flex flex-wrap items-center gap-3 justify-between px-4 sm:px-6 lg:px-8 py-4 sm:py-5 bg-white border-b border-slate-200 shrink-0 shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-3 min-w-0">
              {!isMemberPortal && (
                <button
                  type="button"
                  onClick={() => setFiltersDrawerOpen(true)}
                  className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
                >
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3 7.586V4z" />
                  </svg>
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="bg-blue-500 text-white text-xs font-medium rounded-full w-5 h-5 flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              )}
              <h1 className="text-lg sm:text-xl font-semibold text-slate-900 tracking-tight truncate">
                {isMemberPortal ? 'Feedback assigned to you' : 'Customer Feedback'}
              </h1>
            </div>
          </header>
          <div className="flex-1 overflow-auto p-4 sm:p-6 min-w-0">
            <div className="bg-white rounded-xl border border-slate-200 shadow-[var(--shadow-sm)] overflow-hidden min-h-[280px]">
              <FeedbackList
                feedback={filtered}
                customers={initialCustomers}
                members={initialMembers}
                onSelect={setSelectedId}
                formatDate={(d) => format(new Date(d), 'MMM d, yyyy')}
              />
            </div>
          </div>
          <footer className="px-4 sm:px-6 lg:px-8 py-3 bg-white border-t border-slate-200 text-slate-500 text-sm">
            Showing {filtered.length} feedback {filtered.length === 1 ? 'entry' : 'entries'}.
          </footer>
        </div>
      </div>
      {selected && (
        <FeedbackDetailModal
          feedback={selected}
          tags={initialTags}
          customers={initialCustomers}
          departments={initialDepartments}
          members={initialMembers}
          userRole={userRole}
          readOnly={isMemberPortal}
          onClose={() => setSelectedId(null)}
          onUpdate={handleFeedbackUpdated}
        />
      )}
    </>
  );
}
