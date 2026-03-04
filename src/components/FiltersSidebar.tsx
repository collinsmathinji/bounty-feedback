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

  return (
    <div className="w-64 shrink-0 border-r border-[var(--border)] bg-white p-4 space-y-5">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Date Range</label>
        <div className="flex gap-2 items-center">
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => update({ dateFrom: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md"
          />
          <span className="text-slate-400">–</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => update({ dateTo: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Customer</label>
        <select
          value={filters.customerId}
          onChange={(e) => update({ customerId: e.target.value })}
          className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md"
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
        <label className="block text-sm font-medium text-slate-700 mb-1">Tags</label>
        <input
          type="text"
          value={filters.tagSearch}
          onChange={(e) => update({ tagSearch: e.target.value })}
          placeholder="Search our tags"
          className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md mb-2"
        />
        <div className="flex flex-wrap gap-1.5">
          {filteredTags.slice(0, 12).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTag(t.id)}
              className={`px-2.5 py-1 text-xs rounded-full border ${
                filters.tagIds.includes(t.id)
                  ? 'bg-blue-100 border-blue-300 text-blue-800'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
        <select
          value={filters.status}
          onChange={(e) => update({ status: e.target.value })}
          className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Urgency Score</label>
        <div className="flex flex-wrap gap-2">
          {URGENCY_CHECKS.map((s) => (
            <label key={s} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={filters.urgencyScores.includes(s)}
                onChange={() => toggleUrgency(s)}
                className="rounded border-slate-300"
              />
              {s}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
