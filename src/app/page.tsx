import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <div className="text-center space-y-6">
        <h1 className="text-3xl font-bold text-slate-900">
          Customer Feedback Dashboard
        </h1>
        <p className="text-slate-600 max-w-md">
          Centralize feedback, filter by customer and tags, and generate AI summaries to shape your roadmap.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="px-5 py-2.5 rounded-lg bg-slate-200 text-slate-800 font-medium hover:bg-slate-300"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="px-5 py-2.5 rounded-lg bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary-hover)]"
          >
            Sign up
          </Link>
        </div>
        <p className="text-sm text-slate-500">
          Sign up is restricted to @vamo.app email addresses.
        </p>
      </div>
    </div>
  );
}
