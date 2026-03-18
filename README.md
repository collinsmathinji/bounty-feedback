# Customer Feedback Dashboard

A centralized dashboard to collect, tag, filter, and summarize customer feedback—built with **Next.js** and **Supabase**. Access is restricted to `@vamo.app` users.

## Features

- **Feedback ingestion**: Add feedback manually (paste text or attach screenshots; OCR extracts text from images). Optionally assign to a customer email; unassigned feedback is tagged for manual assignment.
- **Auto-tagging**: Feedback is tagged by topic (UI, Bug, Search Bar, Search Results, Filter, Sequences, Inbox, Integrations) and sentiment (Positive/Negative). Tags can be edited in the dashboard.
- **Filtering**: Filter by customer, one or more tags, date range, status, and urgency score (1–5). All filters can be combined.
- **Summaries**: Generate descriptive AI feedback summaries for a date range and filters. Summaries include **Critical themes** (description, mentions, sentiment, priority), **Additional observations**, and **Recommended actions**; export to PDF or CSV.
- **Roles**: **Admin** (oversee everything, manage team and roles) and **Manager** (handle feedback, assign to departments, communicate with customers). See [Users and roles](#users-and-roles) below.

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
     - (and any later migrations in that folder, e.g. `20240304000004_departments_roles_messages.sql` for departments, roles, and customer messages)
   - Create the **Storage** bucket `attachments` (public) if not created by the first migration; add RLS policies so authenticated users can read/write objects under their organization path.

3. **Auth**

   - In Supabase **Authentication > Providers**, enable Email.
   - (Optional) To enforce `@vamo.app` at the database level, add a check or trigger; the app already restricts sign-up to `@vamo.app` on the signup page.

4. **Emails via Resend (verification + inbound)**

   All emails are sent through **Resend** only (no other provider or hook).

   - **Verification emails** (signup, password reset) so they appear in Resend’s **Sending** tab: In Supabase go to **Authentication → SMTP**. Enable **Custom SMTP** and set **Host** `smtp.resend.com`, **Port** `465`, **Username** `resend`, **Password** to your Resend API key (`RESEND_API_KEY`), and **Sender** to a verified Resend address (e.g. `noreply@yourdomain.com`). Save. Supabase will send all auth emails (signup confirmation, password reset) through Resend, and they will show under **Resend Dashboard → Emails / Sending**.
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
   - `SUPABASE_SERVICE_ROLE_KEY` (required for adding new users to the team on signup/login; get it from Supabase **Settings → API**)
   - `RESEND_API_KEY` (for SMTP password in Supabase and for inbound webhook)
   - **Production only:** `NEXT_PUBLIC_APP_URL` to your app URL (e.g. `https://your-domain.com`) so verification emails link to your site instead of localhost. In Supabase **Authentication → URL Configuration → Redirect URLs**, add:
     - `http://localhost:3000/auth/callback` (dev)
     - `https://your-domain.com/auth/callback` (production)

6. **Run**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Sign up with a `@vamo.app` email to create your org and start adding feedback.

## Users and roles

- **Creating users**: New users sign up at **/signup** using a **@vamo.app** email address. Only that domain is allowed.
- **First user** in the organization becomes **Admin**; every subsequent sign-up is added as **Manager**.
- **Changing roles**: Admins can open **Team** in the sidebar (Dashboard → Team), see all organization members, and change any member’s role between **Admin** and **Manager**.
- **Admin**: Full access; can manage the team and change roles. **Manager**: Can manage feedback, assign complaints to departments, and send customer updates; cannot manage team or roles.

## Email ingestion with use of Resend

Inbound emails are ingested via **Resend** (API key + webhook). When an email is received at your Resend inbound address, the webhook creates a feedback entry and processes attachments (OCR for images).

1. **Resend setup**: Sign up at [resend.com](https://resend.com), add an **inbound domain** (e.g. `feedback.farmtrackai.com` or use Resend’s default `*.resend.app`), create an **API key** (`RESEND_API_KEY`), and in **Webhooks** create a webhook with URL `https://farmtrackai.com/api/webhooks/resend` (or your app host) and event **email.received**. Copy the **Signing secret** as `RESEND_WEBHOOK_SECRET`.
2. **Env**: Also set `SUPABASE_SERVICE_ROLE_KEY`. Optional: `RESEND_FEEDBACK_ORGANIZATION_ID` (org UUID for inbound feedback).
3. **Behaviour**:
   - **Customer**: Put the customer email in the **Subject** line (e.g. subject `user@example.com`) or in the body on its own line as `Customer: user@example.com`. If neither is present, feedback is Unassigned.
   - **Tags**: In the body, add a line starting with `Tags:` followed by comma-separated tag names, e.g. `Tags: UI, bug, negative`. These tags are applied to the feedback; unknown tag names are created. If no `Tags:` line is present, feedback is auto-tagged from content.
   - Body text (after stripping `Customer:` and `Tags:` lines) is stored as feedback and auto-tagged when no explicit tags are given. Image attachments are uploaded and OCR'd; extracted text is appended to the feedback.

The dashboard "New Feedback" form also supports manual entry and screenshot upload with OCR.

## Deliverable

Record a short walkthrough showing: (1) adding feedback (text + screenshot), (2) filtering and opening a feedback detail to edit tags/customer/status/urgency, and (3) generating a summary and exporting PDF/CSV.
# bounty-feedback
