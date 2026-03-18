'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from '@/lib/types';
import {
  FEEDBACK_PROCESSING_PLACEHOLDER,
  OCR_FALLBACK_MESSAGE,
} from '@/lib/constants';

type Tag = { id: string; name: string; slug: string };
type Customer = { id: string; email: string; display_name: string | null };
type Department = { id: string; name: string };
type Member = { user_id: string; email: string; full_name: string | null };
type CustomerMessageRow = {
  id: string;
  body: string;
  created_at: string;
  sent_via: string;
};
type FeedbackItem = {
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

export function FeedbackDetailModal({
  feedback,
  tags: allTags,
  customers,
  departments,
  members,
  userRole,
  readOnly = false,
  onClose,
  onUpdate,
}: {
  feedback: FeedbackItem;
  tags: Tag[];
  customers: Customer[];
  departments: Department[];
  members: Member[];
  userRole: 'admin' | 'manager' | 'member';
  readOnly?: boolean;
  onClose: () => void;
  onUpdate: (updated: FeedbackItem) => void;
}) {
  const [customerEmail, setCustomerEmail] = useState(feedback.customer_email ?? '');
  const [status, setStatus] = useState(feedback.status);
  const [urgencyScore, setUrgencyScore] = useState<number | ''>(
    feedback.urgency_score ?? ''
  );
  const [departmentId, setDepartmentId] = useState<string>(feedback.department_id ?? '');
  const [assignedTo, setAssignedTo] = useState<string>(feedback.assigned_to ?? '');
  const [tagIds, setTagIds] = useState<string[]>(
    feedback.tags?.map((t) => t.id) ?? []
  );
  const [attachments, setAttachments] = useState<{ url: string; extracted_text: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<CustomerMessageRow[]>([]);
  const supabase = createClient();

  useEffect(() => {
    setCustomerEmail(feedback.customer_email ?? '');
    setStatus(feedback.status);
    setUrgencyScore(feedback.urgency_score ?? '');
    setDepartmentId(feedback.department_id ?? '');
    setAssignedTo(feedback.assigned_to ?? '');
    setTagIds(feedback.tags?.map((t) => t.id) ?? []);
  }, [feedback]);

  useEffect(() => {
    async function loadAttachments() {
      const client = createClient();
      const { data } = await client
        .from('feedback_attachments')
        .select('storage_path, extracted_text')
        .eq('feedback_id', feedback.id);
      if (!data?.length) {
        setAttachments([]);
        return;
      }
      const urls: { url: string; extracted_text: string | null }[] = [];
      for (const row of data) {
        const { data: urlData } = client.storage
          .from('attachments')
          .getPublicUrl(row.storage_path);
        urls.push({ url: urlData.publicUrl, extracted_text: row.extracted_text });
      }
      setAttachments(urls);
    }
    loadAttachments();
  }, [feedback.id]);

  useEffect(() => {
    async function loadMessages() {
      const client = createClient();
      const { data } = await client
        .from('customer_messages')
        .select('id, body, created_at, sent_via')
        .eq('feedback_id', feedback.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setMessages((data as CustomerMessageRow[] | null) ?? []);
    }
    loadMessages();
  }, [feedback.id]);

  async function handleSave() {
    setSaving(true);
    const uScore = urgencyScore === '' ? null : Number(urgencyScore);
    const { error: updateErr } = await supabase
      .from('feedback')
      .update({
        customer_email: customerEmail || null,
        status,
        urgency_score: uScore,
        department_id: departmentId || null,
        assigned_to: assignedTo || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', feedback.id);

    if (updateErr) {
      setSaving(false);
      return;
    }

    await supabase.from('feedback_tags').delete().eq('feedback_id', feedback.id);
    if (tagIds.length) {
      await supabase.from('feedback_tags').insert(
        tagIds.map((tag_id) => ({ feedback_id: feedback.id, tag_id }))
      );
    }

    setSaving(false);
    onUpdate({
      ...feedback,
      customer_email: customerEmail || null,
      status,
      urgency_score: uScore,
      department_id: departmentId || null,
      assigned_to: assignedTo || null,
      tags: allTags.filter((t) => tagIds.includes(t.id)),
    });
    onClose();
  }

  async function sendCustomerUpdate(markResolved: boolean) {
    const text = messageText.trim();
    if (!text) return;
    setSendingMessage(true);
    try {
      const res = await fetch('/api/customer-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackId: feedback.id,
          body: text,
          sendEmail: true,
          markResolved,
        }),
      });
      if (!res.ok) return;
      setMessageText('');
      const client = createClient();
      const { data } = await client
        .from('customer_messages')
        .select('id, body, created_at, sent_via')
        .eq('feedback_id', feedback.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setMessages((data as CustomerMessageRow[] | null) ?? []);
    } finally {
      setSendingMessage(false);
    }
  }

  function toggleTag(id: string) {
    setTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const statusOptions = (
    Object.entries(FEEDBACK_STATUS_LABELS) as [FeedbackStatus, string][]
  ).map(([value, label]) => ({ value, label }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-slate-900 truncate">
            {feedback.subject || 'Feedback details'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 text-slate-500"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Customer Email
            </label>
            {readOnly ? (
              <p className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700">
                {customerEmail || '—'}
              </p>
            ) : (
              <>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  list="customer-email-suggestions"
                />
                <datalist id="customer-email-suggestions">
                  {customers.map((c) => (
                    <option key={c.id} value={c.email} />
                  ))}
                </datalist>
              </>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Feedback
            </label>
            <p className="text-slate-700 whitespace-pre-wrap border border-slate-200 rounded-lg p-3 bg-slate-50">
              {feedback.body_text === FEEDBACK_PROCESSING_PLACEHOLDER
                ? OCR_FALLBACK_MESSAGE
                : feedback.body_text}
            </p>
          </div>
          {attachments.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Attached screenshot(s)
              </label>
              <div className="space-y-2">
                {attachments.map((a, i) => (
                  <div key={i} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="relative w-full bg-slate-100" style={{ height: 192 }}>
                      <Image
                        src={a.url}
                        alt={`Attachment ${i + 1}`}
                        fill
                        className="object-contain"
                        sizes="(max-width: 768px) 100vw, 768px"
                      />
                    </div>
                    {a.extracted_text && (
                      <p className="p-2 text-xs text-slate-600 bg-slate-50 border-t">
                        Extracted text: {a.extracted_text.slice(0, 200)}
                        {a.extracted_text.length > 200 ? '…' : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5">
              {readOnly
                ? (feedback.tags?.length ? (
                    feedback.tags.map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-slate-100 border border-slate-200 text-slate-600"
                      >
                        {t.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 text-sm">—</span>
                  ))
                : allTags.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border ${
                        tagIds.includes(t.id)
                          ? 'bg-blue-100 border-blue-300 text-blue-800'
                          : 'bg-slate-100 border-slate-200 text-slate-600'
                      }`}
                    >
                      {t.name}
                      {tagIds.includes(t.id) ? ' ×' : ''}
                    </button>
                  ))}
            </div>
          </div>
          <div className="flex gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Urgency Score
              </label>
              {readOnly ? (
                <p className="text-slate-800 font-medium">
                  {urgencyScore === '' ? '—' : `${urgencyScore}/5`}
                </p>
              ) : (
                <>
                  <span className="text-slate-800 font-medium">
                    {urgencyScore === '' ? '—' : `${urgencyScore}/5`}
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={urgencyScore === '' ? 3 : urgencyScore}
                    onChange={(e) => setUrgencyScore(Number(e.target.value))}
                    className="block w-32 mt-1"
                  />
                </>
              )}
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Status
              </label>
              {readOnly ? (
                <p className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700">
                  {statusOptions.find((o) => o.value === status)?.label ?? status}
                </p>
              ) : (
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  {statusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Department
              </label>
              {readOnly ? (
                <p className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700">
                  {departmentId ? departments.find((d) => d.id === departmentId)?.name : '—'}
                </p>
              ) : (
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="">Unassigned</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Assigned to
              </label>
              {readOnly ? (
                <p className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700">
                  {assignedTo ? members.find((m) => m.user_id === assignedTo)?.full_name || members.find((m) => m.user_id === assignedTo)?.email : '—'}
                </p>
              ) : (
                <>
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.full_name || m.email || m.user_id}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    Push this issue to a team member.
                  </p>
                </>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Customer communication
            </label>
            <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
              {!readOnly && (
                <div className="p-3 space-y-2 bg-slate-50 border-b">
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    rows={3}
                    placeholder="Write an update to the customer…"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  />
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => sendCustomerUpdate(false)}
                      disabled={sendingMessage || !messageText.trim()}
                      className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 text-sm"
                    >
                      {sendingMessage ? 'Sending…' : 'Send update'}
                    </button>
                    <button
                      type="button"
                      onClick={() => sendCustomerUpdate(true)}
                      disabled={sendingMessage || !messageText.trim()}
                      className="px-3 py-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] disabled:opacity-50 text-sm"
                    >
                      {sendingMessage ? 'Sending…' : 'Send + mark resolved'}
                    </button>
                  </div>
                  {!feedback.customer_email && (
                    <p className="text-xs text-slate-500">
                      No customer email is set; the update will be saved here but cannot be emailed.
                    </p>
                  )}
                </div>
              )}
              <div className="p-3 space-y-2">
                {messages.length === 0 ? (
                  <p className="text-sm text-slate-500">No messages yet.</p>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className="text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-900 font-medium">
                          Update
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(m.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-700 whitespace-pre-wrap">{m.body}</p>
                      <p className="mt-1 text-xs text-slate-500">Sent via: {m.sent_via}</p>
                      <div className="h-px bg-slate-100 my-3" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[var(--border)] flex justify-end gap-2">
          {readOnly ? (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
            >
              Close
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
