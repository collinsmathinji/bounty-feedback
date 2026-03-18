'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateMemberRole } from '@/app/actions/team';

type Row = {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'manager';
  status: string;
};

export function TeamMembersTable({ initialRows }: { initialRows: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRoleChange(memberId: string, newRole: 'admin' | 'manager') {
    setUpdatingId(memberId);
    setError(null);
    const result = await updateMemberRole(memberId, newRole);
    setUpdatingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.id === memberId ? { ...r, role: newRole } : r))
    );
    router.refresh();
  }

  return (
    <>
      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-700 text-sm border-b border-slate-200">
          {error}
        </div>
      )}
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-4 py-3 text-sm font-medium text-slate-700">Email</th>
            <th className="px-4 py-3 text-sm font-medium text-slate-700">Name</th>
            <th className="px-4 py-3 text-sm font-medium text-slate-700">Role</th>
            <th className="px-4 py-3 text-sm font-medium text-slate-700">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50">
              <td className="px-4 py-3 text-sm text-slate-900">{row.email}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{row.full_name ?? '—'}</td>
              <td className="px-4 py-3">
                <select
                  value={row.role}
                  onChange={(e) => handleRoleChange(row.id, e.target.value as 'admin' | 'manager')}
                  disabled={updatingId === row.id}
                  className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white disabled:opacity-50"
                >
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                </select>
                {updatingId === row.id && (
                  <span className="ml-2 text-xs text-slate-500">Saving…</span>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600 capitalize">{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
