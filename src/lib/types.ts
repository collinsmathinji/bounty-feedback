export type FeedbackStatus =
  | 'new'
  | 'planned'
  | 'in_progress'
  | 'resolved'
  | 'reviewed';

export interface Tag {
  id: string;
  name: string;
  slug: string;
}

export interface Customer {
  id: string;
  organization_id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

export interface FeedbackAttachment {
  id: string;
  feedback_id: string;
  storage_path: string;
  extracted_text: string | null;
  created_at: string;
}

export interface FeedbackRow {
  id: string;
  organization_id: string;
  customer_email: string | null;
  subject: string | null;
  body_text: string;
  status: FeedbackStatus;
  urgency_score: number | null;
  source: 'email' | 'manual';
  created_at: string;
  updated_at: string;
  tags?: Tag[];
  attachments?: FeedbackAttachment[];
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'admin' | 'member';
  status: 'active' | 'pending';
  invited_by: string | null;
  invited_at: string | null;
  created_at: string;
  email?: string;
  full_name?: string;
}

export interface Invite {
  id: string;
  organization_id: string;
  email: string;
  role: 'admin' | 'member';
  token: string;
  expires_at: string;
  invited_by: string | null;
  created_at: string;
}

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'New',
  planned: 'Planned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  reviewed: 'Reviewed',
};

export const URGENCY_LEVELS = [1, 2, 3, 4, 5] as const;
