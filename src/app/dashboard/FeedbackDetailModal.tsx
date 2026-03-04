'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from '@/lib/types';

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

export function FeedbackDetailModal({
  feedback,
  tags: allTags,
  customers,
  onClose,
  onUpdate,
}: {
  feedback: FeedbackItem;
  tags: Tag[];
  customers: Customer[];
  onClose: () => void;
  onUpdate: (updated: FeedbackItem) => void;
}) {
  const [customerEmail, setCustomerEmail] = useState(feedback.customer_email ?? '');
  const [status, setStatus] = useState(feedback.status);
  const [urgencyScore, setUrgencyScore] = useState<number | ''>(
    feedback.urgency_score ?? ''
  );
  const [tagIds, setTagIds] = useState<string[]>(
    feedback.tags?.map((t) => t.id) ?? []
  );
  const [attachments, setAttachments] = useState<{ url: string; extracted_text: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    setCustomerEmail(feedback.customer_email ?? '');
    setStatus(feedback.status);
    setUrgencyScore(feedback.urgency_score ?? '');
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

  async function handleSave() {
    setSaving(true);
    const uScore = urgencyScore === '' ? null : Number(urgencyScore);
    const { error: updateErr } = await supabase
      .from('feedback')
      .update({
        customer_email: customerEmail || null,
        status,
        urgency_score: uScore,
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
      tags: allTags.filter((t) => tagIds.includes(t.id)),
    });
    onClose();
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
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="customer@example.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Feedback
            </label>
            <p className="text-slate-700 whitespace-pre-wrap border border-slate-200 rounded-lg p-3 bg-slate-50">
              {feedback.body_text}
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
                    <img
                      src={a.url}
                      alt={`Attachment ${i + 1}`}
                      className="max-h-48 w-full object-contain bg-slate-100"
                    />
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
              {allTags.map((t) => (
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
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Status
              </label>
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
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[var(--border)] flex justify-end gap-2">
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
        </div>
      </div>
    </div>
  );
}
