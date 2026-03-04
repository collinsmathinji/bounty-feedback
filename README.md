# Customer Feedback Dashboard

A centralized dashboard to collect, tag, filter, and summarize customer feedback—built with **Next.js** and **Supabase**. Access is restricted to `@vamo.app` users; team admins can invite other members to the organization.

## Features

- **Feedback ingestion**: Add feedback manually (paste text or attach screenshots; OCR extracts text from images). Optionally assign to a customer email; unassigned feedback is tagged for manual assignment.
- **Auto-tagging**: Feedback is tagged by topic (UI, Bug, Search Bar, Search Results, Filter, Sequences, Inbox, Integrations) and sentiment (Positive/Negative). Tags can be edited in the dashboard.
- **Filtering**: Filter by customer, one or more tags, date range, status, and urgency score (1–5). All filters can be combined.
- **Summaries**: Generate feedback summaries for a date range and filters. Top requested actions are prioritized by mention count; export to PDF or CSV.
- **Team settings**: Admins can invite other `@vamo.app` users to the organization with Admin or Member role.

## Tech stack

- **Next.js** (App Router), **TypeScript**, **Tailwind CSS**
- **Supabase**: Postgres, Auth, Storage, Row Level Security (RLS)
- **Tesseract.js** for OCR on uploaded screenshots
- **Resend** for all emails (verification and inbound)

## Setup

1. **Clone and install**

   ```bash
   cd feedback
   npm install
   ```

2. **Supabase project**

   - Create a project at [supabase.com](https://supabase.com).
   - In **SQL Editor**, run the migrations in order:
     - `supabase/migrations/20240304000000_initial_schema.sql`
     - `supabase/migrations/20240304000001_profiles.sql`
   - Create the **Storage** bucket `attachments` (public) if not created by the first migration; add RLS policies so authenticated users can read/write objects under their organization path.

3. **Auth**

   - In Supabase **Authentication > Providers**, enable Email.
   - (Optional) To enforce `@vamo.app` at the database level, add a check or trigger; the app already restricts sign-up to `@vamo.app` on the signup page.

4. **Emails via Resend (verification + inbound)**

   All emails are sent through **Resend** only (no other provider or hook).

   - **Verification emails** (signup, password reset): In Supabase go to **Authentication → SMTP**. Enable custom SMTP and set **Host** `smtp.resend.com`, **Port** `465`, **Username** `resend`, **Password** your Resend API key (`RESEND_API_KEY`), and **Sender** a verified address (e.g. `noreply@farmtrackai.com`). Supabase then sends all auth emails via Resend.
   - **Inbound feedback:** Uses Resend inbound + webhook (see "Email ingestion with Resend" below).

   Enable **Confirm email** under **Auth → Providers → Email** if you want users to verify before signing in.

   (Optional: for custom email templates you can use the Send Email Hook at `/api/auth/send-email` with `SEND_EMAIL_HOOK_SECRET`; otherwise SMTP above is enough.)

5. **Environment**

   ```bash
   cp .env.example .env.local
   ```

   Set:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `RESEND_API_KEY` (for SMTP password in Supabase and for inbound webhook)

6. **Run**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Sign up with a `@vamo.app` email to create your org and start adding feedback.

## Email ingestion with Resend

Inbound emails are ingested via **Resend** (API key + webhook). When an email is received at your Resend inbound address, the webhook creates a feedback entry and processes attachments (OCR for images).

1. **Resend setup**: Sign up at [resend.com](https://resend.com), add an **inbound domain** (e.g. `feedback.farmtrackai.com` or use Resend’s default `*.resend.app`), create an **API key** (`RESEND_API_KEY`), and in **Webhooks** create a webhook with URL `https://farmtrackai.com/api/webhooks/resend` (or your app host) and event **email.received**. Copy the **Signing secret** as `RESEND_WEBHOOK_SECRET`.
2. **Env**: Also set `SUPABASE_SERVICE_ROLE_KEY`. Optional: `RESEND_FEEDBACK_ORGANIZATION_ID` (org UUID for inbound feedback).
3. **Behaviour**: Subject is parsed for a customer email (or feedback is Unassigned). Body becomes feedback text (auto-tagged). Image attachments are uploaded and OCR'd; text is appended to the feedback.

The dashboard "New Feedback" form also supports manual entry and screenshot upload with OCR.

## Deliverable

Record a short walkthrough showing: (1) adding feedback (text + screenshot), (2) filtering and opening a feedback detail to edit tags/customer/status/urgency, and (3) generating a summary and exporting PDF/CSV.
# bounty-feedback
