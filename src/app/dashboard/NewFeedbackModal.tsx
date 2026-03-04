'use client';

import { useState, useRef } from 'react';
import { createFeedbackAction } from '@/app/actions/feedback';
import { createClient } from '@/lib/supabase/client';
import { suggestTags } from '@/lib/auto-tag';

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

export function NewFeedbackModal({
  tags: allTags,
  customers,
  onClose,
  onCreated,
}: {
  tags: Tag[];
  customers: Customer[];
  onClose: () => void;
  onCreated: (item: FeedbackItem) => void;
}) {
  const [customerEmail, setCustomerEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const suggestedTagNames = bodyText ? suggestTags(bodyText) : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const formData = new FormData();
    formData.set('customer_email', customerEmail);
    formData.set('subject', subject);
    formData.set('body_text', bodyText);

    const result = await createFeedbackAction(formData);
    if (!result.success) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    let combinedBody = result.body_text;
    if (file) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('status', 'active')
        .single();
      if (membership?.organization_id) {
        const ext = file.name.split('.').pop() || 'png';
        const path = `${membership.organization_id}/${result.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('attachments')
          .upload(path, file, { contentType: file.type, upsert: false });

        if (!uploadErr) {
          const ocrText = await runOCR(file);
          await supabase.from('feedback_attachments').insert({
            feedback_id: result.id,
            storage_path: path,
            extracted_text: ocrText || null,
          });
          if (ocrText) combinedBody = `${result.body_text}\n\n[From screenshot]: ${ocrText}`;
        }
      }
    }

    if (combinedBody !== result.body_text) {
      await supabase
        .from('feedback')
        .update({ body_text: combinedBody })
        .eq('id', result.id);
    }

    onCreated({
      id: result.id,
      customer_email: result.customer_email,
      subject: result.subject,
      body_text: combinedBody,
      status: result.status,
      urgency_score: result.urgency_score,
      created_at: result.created_at,
      tags: result.tags,
    });
    setSubmitting(false);
    onClose();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
    } else {
      setFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-slate-900">New Feedback</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 text-slate-500"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Customer Email (subject / who this is from)
            </label>
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="customer@example.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
            <p className="mt-1 text-xs text-slate-500">
              Leave empty to mark as Unassigned for manual assignment later.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Subject / Summary
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief summary of the feedback"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Feedback (paste text or add screenshot; we’ll read text from the image)
            </label>
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Paste feedback text here…"
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              required
            />
            {suggestedTagNames.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Suggested tags: {suggestedTagNames.join(', ')}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Attach screenshot (optional)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onFileChange}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700"
            />
            {previewUrl && (
              <div className="mt-2 rounded-lg border border-slate-200 overflow-hidden max-h-40">
                <img src={previewUrl} alt="Preview" className="w-full h-auto object-contain" />
              </div>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save feedback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

async function runOCR(file: File): Promise<string | null> {
  try {
    const Tesseract = (await import('tesseract.js')).default;
    const { data } = await Tesseract.recognize(file, 'eng');
    return data?.text?.trim() || null;
  } catch {
    return null;
  }
}
