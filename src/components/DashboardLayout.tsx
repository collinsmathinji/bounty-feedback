'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const nav = [
  { href: '/dashboard', label: 'Feedback' },
  { href: '/summary', label: 'Feedback Summary' },
  { href: '/team', label: 'Team Settings' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex bg-[var(--background)]">
      <aside className="w-64 shrink-0 border-r border-[var(--border)] bg-white flex flex-col">
        <div className="p-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-slate-800">Feedback Dashboard</h2>
        </div>
        <nav className="p-2 flex-1">
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`block px-3 py-2 rounded-lg text-sm font-medium ${
                pathname === href
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-2 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={signOut}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        {children}
      </div>
    </div>
  );
}
