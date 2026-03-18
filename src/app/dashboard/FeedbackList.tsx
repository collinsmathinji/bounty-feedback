'use client';

type Tag = { id: string; name: string; slug: string };
type Customer = { id: string; email: string; display_name: string | null };
type Member = { user_id: string; email: string; full_name: string | null };
type Item = {
  id: string;
  customer_email: string | null;
  subject: string | null;
  body_text: string;
  status: string;
  urgency_score: number | null;
  created_at: string;
  assigned_to?: string | null;
  tags?: Tag[];
};

export function FeedbackList({
  feedback,
  customers,
  members,
  onSelect,
  formatDate,
}: {
  feedback: Item[];
  customers: Customer[];
  members: Member[];
  onSelect: (id: string) => void;
  formatDate: (d: string) => string;
}) {
  function displayCustomer(email: string | null) {
    if (!email) return 'Unassigned';
    const c = customers.find((x) => x.email === email);
    return c?.display_name || email;
  }
  function displayAssignee(userId: string | null | undefined) {
    if (!userId) return '—';
    const m = members.find((x) => x.user_id === userId);
    return m ? (m.full_name || m.email) : '—';
  }

  return (
    <div className="overflow-x-auto -mx-px">
      <table className="w-full text-sm min-w-[520px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80">
            <th className="text-left py-3 sm:py-3.5 px-3 sm:px-5 font-semibold text-slate-600 uppercase tracking-wider text-xs">
              Customer
            </th>
            <th className="text-left py-3 sm:py-3.5 px-3 sm:px-5 font-semibold text-slate-600 uppercase tracking-wider text-xs">
              Feedback
            </th>
            <th className="text-left py-3 sm:py-3.5 px-3 sm:px-5 font-semibold text-slate-600 uppercase tracking-wider text-xs">
              Status
            </th>
            <th className="text-left py-3 sm:py-3.5 px-3 sm:px-5 font-semibold text-slate-600 uppercase tracking-wider text-xs hidden md:table-cell">
              Urgency
            </th>
            <th className="text-left py-3 sm:py-3.5 px-3 sm:px-5 font-semibold text-slate-600 uppercase tracking-wider text-xs hidden lg:table-cell">
              Tags
            </th>
            <th className="text-left py-3 sm:py-3.5 px-3 sm:px-5 font-semibold text-slate-600 uppercase tracking-wider text-xs hidden md:table-cell">
              Assigned to
            </th>
            <th className="text-left py-3 sm:py-3.5 px-3 sm:px-5 font-semibold text-slate-600 uppercase tracking-wider text-xs">
              Date
            </th>
          </tr>
        </thead>
        <tbody>
          {feedback.map((f) => (
            <tr
              key={f.id}
              onClick={() => onSelect(f.id)}
              className="border-b border-slate-100 hover:bg-blue-50/50 cursor-pointer transition-colors"
            >
              <td className="py-3 sm:py-4 px-3 sm:px-5 text-slate-800 font-medium max-w-[120px] sm:max-w-none truncate">
                {displayCustomer(f.customer_email)}
              </td>
              <td className="py-3 sm:py-4 px-3 sm:px-5 text-slate-600 min-w-0 max-w-[180px] sm:max-w-sm truncate">
                {f.subject || f.body_text?.slice(0, 80) || '—'}
              </td>
              <td className="py-3 sm:py-4 px-3 sm:px-5">
                <StatusPill status={f.status} />
              </td>
              <td className="py-3 sm:py-4 px-3 sm:px-5 hidden md:table-cell">
                <UrgencyDots value={f.urgency_score ?? 0} />
              </td>
              <td className="py-3 sm:py-4 px-3 sm:px-5 hidden lg:table-cell">
                <div className="flex flex-wrap gap-1.5">
                  {f.tags?.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600"
                    >
                      {t.name}
                    </span>
                  ))}
                  {(!f.tags || f.tags.length === 0) && (
                    <span className="text-slate-400 text-xs">—</span>
                  )}
                </div>
              </td>
              <td className="py-3 sm:py-4 px-3 sm:px-5 hidden md:table-cell text-slate-600 max-w-[120px] truncate">
                {displayAssignee(f.assigned_to)}
              </td>
              <td className="py-3 sm:py-4 px-3 sm:px-5 text-slate-500 text-xs tabular-nums whitespace-nowrap">
                {formatDate(f.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {feedback.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-slate-500 font-medium">No feedback matches the current filters.</p>
          <p className="text-slate-400 text-sm mt-1">Try adjusting date range or tags.</p>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = status.replace('_', ' ');
  const style =
    status === 'new'
      ? 'bg-blue-100 text-blue-800'
      : status === 'reviewed' || status === 'resolved'
        ? 'bg-emerald-100 text-emerald-800'
        : status === 'in_progress' || status === 'planned'
          ? 'bg-amber-100 text-amber-800'
          : 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}

function UrgencyDots({ value }: { value: number }) {
  const max = 5;
  return (
    <div className="flex gap-1" title={`${value}/5`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`w-2.5 h-2.5 rounded-full transition-colors ${
            i < value
              ? value <= 2
                ? 'bg-emerald-500'
                : value <= 4
                  ? 'bg-amber-500'
                  : 'bg-red-500'
              : 'bg-slate-200'
          }`}
        />
      ))}
    </div>
  );
}
