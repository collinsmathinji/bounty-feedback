'use client';

type Tag = { id: string; name: string; slug: string };
type Customer = { id: string; email: string; display_name: string | null };
type Item = {
  id: string;
  customer_email: string | null;
  subject: string | null;
  body_text: string;
  status: string;
  urgency_score: number | null;
  created_at: string;
  tags?: Tag[];
};

export function FeedbackList({
  feedback,
  customers,
  onSelect,
  formatDate,
}: {
  feedback: Item[];
  customers: Customer[];
  onSelect: (id: string) => void;
  formatDate: (d: string) => string;
}) {
  function displayCustomer(email: string | null) {
    if (!email) return 'Unassigned';
    const c = customers.find((x) => x.email === email);
    return c?.display_name || email;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-slate-50">
            <th className="text-left py-3 px-4 font-medium text-slate-700">Customer</th>
            <th className="text-left py-3 px-4 font-medium text-slate-700">Feedback Preview</th>
            <th className="text-left py-3 px-4 font-medium text-slate-700">Status</th>
            <th className="text-left py-3 px-4 font-medium text-slate-700">Urgency</th>
            <th className="text-left py-3 px-4 font-medium text-slate-700">Tags</th>
            <th className="text-left py-3 px-4 font-medium text-slate-700">Date</th>
          </tr>
        </thead>
        <tbody>
          {feedback.map((f) => (
            <tr
              key={f.id}
              onClick={() => onSelect(f.id)}
              className="border-b border-[var(--border)] hover:bg-slate-50 cursor-pointer"
            >
              <td className="py-3 px-4 text-slate-800">
                {displayCustomer(f.customer_email)}
              </td>
              <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                {f.subject || f.body_text?.slice(0, 80) || '—'}
              </td>
              <td className="py-3 px-4">
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    f.status === 'new'
                      ? 'bg-blue-100 text-blue-800'
                      : f.status === 'reviewed' || f.status === 'resolved'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {f.status.replace('_', ' ')}
                </span>
              </td>
              <td className="py-3 px-4">
                <UrgencyDots value={f.urgency_score ?? 0} />
              </td>
              <td className="py-3 px-4">
                <div className="flex flex-wrap gap-1">
                  {f.tags?.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex px-2 py-0.5 rounded-full text-xs bg-slate-200 text-slate-700"
                    >
                      {t.name}
                    </span>
                  ))}
                  {(!f.tags || f.tags.length === 0) && (
                    <span className="text-slate-400">—</span>
                  )}
                </div>
              </td>
              <td className="py-3 px-4 text-slate-600">{formatDate(f.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {feedback.length === 0 && (
        <div className="py-12 text-center text-slate-500">
          No feedback matches the current filters.
        </div>
      )}
    </div>
  );
}

function UrgencyDots({ value }: { value: number }) {
  const max = 5;
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full ${
            i < value
              ? value <= 2
                ? 'bg-green-500'
                : value <= 4
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              : 'bg-slate-200'
          }`}
        />
      ))}
    </div>
  );
}
