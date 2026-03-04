'use client';

import { useState } from 'react';
import { inviteMemberAction } from '@/app/actions/invite';

type Member = {
  id: string;
  user_id: string;
  role: string;
  status: string;
  email: string;
  full_name: string | null;
};
type Invite = { id: string; email: string; role: string; expires_at: string };

export function TeamClient({
  members,
  invites,
  isAdmin,
  organizationId,
}: {
  members: Member[];
  invites: Invite[];
  isAdmin: boolean;
  organizationId: string;
}) {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [invitesList, setInvitesList] = useState<Invite[]>(invites);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!inviteEmail.trim()) return;
    if (!inviteEmail.toLowerCase().endsWith('@vamo.app')) {
      setError('Only @vamo.app email addresses can be invited.');
      return;
    }
    setSubmitting(true);
    const result = await inviteMemberAction({
      organizationId,
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
    });
    setSubmitting(false);
    if (result.success && result.invite) {
      setInvitesList((prev) => [result.invite!, ...prev]);
      setShowInvite(false);
      setInviteEmail('');
      setInviteRole('member');
    } else {
      setError(result.error ?? 'Failed to send invite');
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Team Settings</h1>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary-hover)] flex items-center gap-2"
          >
            <span className="text-lg">+</span> Invite Member
          </button>
        )}
      </header>

      <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-slate-50">
              <th className="text-left py-3 px-4 font-medium text-slate-700">Name</th>
              <th className="text-left py-3 px-4 font-medium text-slate-700">Email</th>
              <th className="text-left py-3 px-4 font-medium text-slate-700">Role</th>
              <th className="text-left py-3 px-4 font-medium text-slate-700">Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-[var(--border)]">
                <td className="py-3 px-4 text-slate-800">
                  {m.full_name || '—'}
                </td>
                <td className="py-3 px-4 text-slate-600">{m.email}</td>
                <td className="py-3 px-4 capitalize">{m.role}</td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      m.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {m.status === 'active' ? 'Active' : 'Pending'}
                  </span>
                </td>
              </tr>
            ))}
            {invitesList.map((inv) => (
              <tr key={inv.id} className="border-b border-[var(--border)] bg-slate-50/50">
                <td className="py-3 px-4 text-slate-500">—</td>
                <td className="py-3 px-4 text-slate-600">{inv.email}</td>
                <td className="py-3 px-4 capitalize">{inv.role}</td>
                <td className="py-3 px-4">
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    Pending
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div
            className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Invite Member</h2>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@vamo.app"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setShowInvite(false); setError(null); }}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
                >
                  {submitting ? 'Sending…' : 'Send invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
