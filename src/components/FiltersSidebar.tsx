'use client';

import { useCallback } from 'react';

export interface FilterState {
  dateFrom: string;
  dateTo: string;
  customerId: string;
  tagIds: string[];
  status: string;
  urgencyScores: number[];
  tagSearch: string;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'reviewed', label: 'Reviewed' },
];

const URGENCY_CHECKS = [1, 2, 3, 4, 5];

interface FiltersSidebarProps {
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  customers: { id: string; email: string; display_name: string | null }[];
  tags: { id: string; name: string; slug: string }[];
  /** When true, used inside a drawer (no fixed width wrapper) */
  embedded?: boolean;
}

export function getDefaultFilters(): FilterState {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  return {
    dateFrom: weekAgo.toISOString().slice(0, 10),
    dateTo: now.toISOString().slice(0, 10),
    customerId: '',
    tagIds: [],
    status: 'new',
    urgencyScores: [],
    tagSearch: '',
  };
}

export function FiltersSidebar({
  filters,
  onFiltersChange,
  customers,
  tags,
  embedded = false,
}: FiltersSidebarProps) {
  const update = useCallback(
    (patch: Partial<FilterState>) => {
      onFiltersChange({ ...filters, ...patch });
    },
    [filters, onFiltersChange]
  );

  const toggleTag = (tagId: string) => {
    const next = filters.tagIds.includes(tagId)
      ? filters.tagIds.filter((id) => id !== tagId)
      : [...filters.tagIds, tagId];
    update({ tagIds: next });
  };

  const toggleUrgency = (score: number) => {
    const next = filters.urgencyScores.includes(score)
      ? filters.urgencyScores.filter((s) => s !== score)
      : [...filters.urgencyScores, score];
    update({ urgencyScores: next });
  };

  const filteredTags = filters.tagSearch
    ? tags.filter(
        (t) =>
          t.name.toLowerCase().includes(filters.tagSearch.toLowerCase()) ||
          t.slug.toLowerCase().includes(filters.tagSearch.toLowerCase())
      )
    : tags;

  const inputClass =
    'w-full min-w-0 px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  return (
    <div
      className={
        embedded
          ? 'w-full p-1 space-y-6'
          : 'w-[22rem] min-w-[22rem] shrink-0 border-r border-slate-200 bg-white shadow-[var(--shadow-sm)] flex flex-col min-h-0 overflow-y-auto'
      }
    >
      <div className="p-5 space-y-7 flex-1">
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Date range
        </label>
        <div className="flex flex-col gap-2">
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => update({ dateFrom: e.target.value })}
            className={inputClass}
          />
          <span className="text-slate-400 text-xs">to</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => update({ dateTo: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Customer
        </label>
        <select
          value={filters.customerId}
          onChange={(e) => update({ customerId: e.target.value })}
          className={inputClass}
        >
          <option value="">All customers</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.display_name || c.email}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Tags
        </label>
        <input
          type="text"
          value={filters.tagSearch}
          onChange={(e) => update({ tagSearch: e.target.value })}
          placeholder="Search tags…"
          className={`${inputClass} mb-3`}
        />
        <div className="flex flex-wrap gap-2">
          {filteredTags.slice(0, 24).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTag(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                filters.tagIds.includes(t.id)
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Status
        </label>
        <select
          value={filters.status}
          onChange={(e) => update({ status: e.target.value })}
          className={inputClass}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Urgency
        </label>
        <div className="flex items-center gap-1.5" title="Click to filter by urgency (same as table)">
          {URGENCY_CHECKS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleUrgency(s)}
              className={`flex items-center justify-center w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                filters.urgencyScores.includes(s)
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}
