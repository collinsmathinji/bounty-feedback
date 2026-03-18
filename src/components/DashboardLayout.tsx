'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const adminNav = [
  { href: '/dashboard', label: 'Feedback' },
  { href: '/summary', label: 'Feedback Summary' },
  { href: '/dashboard/team', label: 'Team' },
];
const managerNav = [
  { href: '/dashboard', label: 'Feedback' },
  { href: '/summary', label: 'Feedback Summary' },
];
const memberNav = [{ href: '/dashboard', label: 'Feedback' }];

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

export default function DashboardLayout({
  children,
  userRole = 'manager',
}: {
  children: React.ReactNode;
  userRole?: 'admin' | 'manager' | 'member';
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const nav =
    userRole === 'admin'
      ? adminNav
      : userRole === 'member'
        ? memberNav
        : managerNav;

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/');
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const sidebar = (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-[var(--sidebar-bg)] flex flex-col shadow-[var(--shadow-sm)] h-full">
      <div className="p-5 border-b border-slate-200">
        <h2 className="font-semibold text-slate-900 tracking-tight">Customer Feedback</h2>
        <p className="text-xs text-slate-500 mt-0.5">Vamo</p>
      </div>
      <nav className="p-3 flex-1">
        {nav.map(({ href, label }: { href: string; label: string }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setSidebarOpen(false)}
            className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              pathname === href
                ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-3 border-t border-slate-200">
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors disabled:opacity-80 disabled:cursor-not-allowed min-h-[40px]"
        >
          {signingOut ? (
            <>
              <SpinnerIcon className="animate-spin h-4 w-4 text-slate-500 shrink-0" />
              <span>Signing out…</span>
            </>
          ) : (
            'Sign out'
          )}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen flex bg-[var(--background)]">
      {/* Desktop sidebar: always visible on lg+ */}
      <div className="hidden lg:block lg:w-64 lg:shrink-0">{sidebar}</div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-y-0 left-0 z-50 w-64 lg:hidden">{sidebar}</div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-auto bg-[var(--background)]">
        {/* Mobile top bar with menu button */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-semibold text-slate-900">Customer Feedback</span>
        </div>
        {children}
      </div>
    </div>
  );
}
