'use client';

import { useMemo, useState } from 'react';
import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from '@/lib/types';

type FeedbackRow = {
  id: string;
  subject: string | null;
  status: FeedbackStatus;
  created_at: string;
  resolved_at: string | null;
  assigned_to: string | null;
};

type Member = {
  user_id: string;
  label: string;
};

type ReportType = 'deadline_summary' | 'by_manager' | 'by_status' | 'overdue_items';

const REPORT_LABELS: Record<ReportType, string> = {
  deadline_summary: 'Deadline Summary',
  by_manager: 'By Manager',
  by_status: 'By Status',
  overdue_items: 'Overdue Items',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

function daysOpen(createdAt: string, resolvedAt?: string | null): number {
  const end = resolvedAt ? new Date(resolvedAt) : new Date();
  const start = new Date(createdAt);
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

export function ReportsClient({
  initialFeedback,
  members,
}: {
  initialFeedback: FeedbackRow[];
  members: Member[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgoDate = new Date();
  monthAgoDate.setDate(monthAgoDate.getDate() - 30);
  const monthAgo = monthAgoDate.toISOString().slice(0, 10);

  const [reportType, setReportType] = useState<ReportType>('deadline_summary');
  const [fromDate, setFromDate] = useState(monthAgo);
  const [toDate, setToDate] = useState(today);
  const [generated, setGenerated] = useState(false);

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.user_id, m.label])),
    [members]
  );

  const filtered = useMemo(() => {
    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate) : null;
    if (to) to.setHours(23, 59, 59, 999);

    return initialFeedback.filter((f) => {
      const created = new Date(f.created_at);
      if (from && created < from) return false;
      if (to && created > to) return false;
      return true;
    });
  }, [initialFeedback, fromDate, toDate]);

  const summaryStats = useMemo(() => {
    const resolved = filtered.filter((f) => f.status === 'resolved' || f.status === 'reviewed');
    const unresolved = filtered.filter((f) => f.status !== 'resolved' && f.status !== 'reviewed');
    const overdue = unresolved.filter((f) => daysOpen(f.created_at, f.resolved_at) > 7);
    const resolutionDays = resolved.map((f) => daysOpen(f.created_at, f.resolved_at));
    const averageResolutionDays = resolutionDays.length
      ? (resolutionDays.reduce((a, b) => a + b, 0) / resolutionDays.length).toFixed(1)
      : '0.0';

    return {
      total: filtered.length,
      resolved: resolved.length,
      unresolved: unresolved.length,
      overdue: overdue.length,
      averageResolutionDays,
    };
  }, [filtered]);

  const byManager = useMemo(() => {
    const map = new Map<string, { label: string; total: number; resolved: number; overdue: number }>();
    for (const f of filtered) {
      const key = f.assigned_to ?? 'unassigned';
      const label = f.assigned_to ? memberMap.get(f.assigned_to) ?? 'Unknown Member' : 'Unassigned';
      const existing = map.get(key) ?? { label, total: 0, resolved: 0, overdue: 0 };
      existing.total += 1;
      if (f.status === 'resolved' || f.status === 'reviewed') existing.resolved += 1;
      if (f.status !== 'resolved' && f.status !== 'reviewed' && daysOpen(f.created_at) > 7) {
        existing.overdue += 1;
      }
      map.set(key, existing);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [filtered, memberMap]);

  const byStatus = useMemo(() => {
    const counts: Record<FeedbackStatus, number> = {
      new: 0,
      planned: 0,
      in_progress: 0,
      resolved: 0,
      reviewed: 0,
    };
    filtered.forEach((f) => {
      counts[f.status] += 1;
    });
    return (Object.keys(counts) as FeedbackStatus[]).map((status) => ({
      status,
      label: FEEDBACK_STATUS_LABELS[status],
      count: counts[status],
    }));
  }, [filtered]);

  const overdueItems = useMemo(
    () =>
      filtered
        .filter((f) => f.status !== 'resolved' && f.status !== 'reviewed')
        .map((f) => ({ ...f, openDays: daysOpen(f.created_at) }))
        .filter((f) => f.openDays > 7)
        .sort((a, b) => b.openDays - a.openDays),
    [filtered]
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Deadline Reports</h1>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {Object.entries(REPORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setGenerated(true)}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Generate Report
            </button>
          </div>
        </div>
      </div>

      {generated && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          {reportType === 'deadline_summary' && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Deadline Summary</h2>
              <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="text-2xl font-semibold text-slate-900">{summaryStats.total}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Resolved</p>
                  <p className="text-2xl font-semibold text-emerald-600">{summaryStats.resolved}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Unresolved</p>
                  <p className="text-2xl font-semibold text-amber-600">{summaryStats.unresolved}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Overdue (&gt; 7 days)</p>
                  <p className="text-2xl font-semibold text-rose-600">{summaryStats.overdue}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Avg Resolution (days)</p>
                  <p className="text-2xl font-semibold text-slate-900">{summaryStats.averageResolutionDays}</p>
                </div>
              </div>
            </div>
          )}

          {reportType === 'by_manager' && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">By Manager</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600 border-b border-slate-200">
                      <th className="py-2 pr-3">Manager</th>
                      <th className="py-2 pr-3">Total Assigned</th>
                      <th className="py-2 pr-3">Resolved</th>
                      <th className="py-2 pr-3">Overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byManager.map((row) => (
                      <tr key={row.label} className="border-b border-slate-100">
                        <td className="py-2 pr-3">{row.label}</td>
                        <td className="py-2 pr-3">{row.total}</td>
                        <td className="py-2 pr-3">{row.resolved}</td>
                        <td className="py-2 pr-3">{row.overdue}</td>
                      </tr>
                    ))}
                    {byManager.length === 0 && (
                      <tr>
                        <td className="py-3 text-slate-500" colSpan={4}>No records in selected range.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {reportType === 'by_status' && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">By Status</h2>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {byStatus.map((row) => (
                  <div key={row.status} className="rounded-lg border border-slate-200 p-4">
                    <p className="text-sm text-slate-600">{row.label}</p>
                    <p className="text-2xl font-semibold text-slate-900">{row.count}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {reportType === 'overdue_items' && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Overdue Items</h2>
              <p className="mt-1 text-sm text-slate-500">
                Open feedback older than 7 days.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600 border-b border-slate-200">
                      <th className="py-2 pr-3">Subject</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Assigned To</th>
                      <th className="py-2 pr-3">Created</th>
                      <th className="py-2 pr-3">Open Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueItems.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="py-2 pr-3">{item.subject || 'Untitled feedback'}</td>
                        <td className="py-2 pr-3">{FEEDBACK_STATUS_LABELS[item.status]}</td>
                        <td className="py-2 pr-3">
                          {item.assigned_to ? memberMap.get(item.assigned_to) ?? 'Unknown Member' : 'Unassigned'}
                        </td>
                        <td className="py-2 pr-3">{formatDate(item.created_at)}</td>
                        <td className="py-2 pr-3 font-medium text-rose-600">{item.openDays}</td>
                      </tr>
                    ))}
                    {overdueItems.length === 0 && (
                      <tr>
                        <td className="py-3 text-slate-500" colSpan={5}>No overdue items in selected range.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
