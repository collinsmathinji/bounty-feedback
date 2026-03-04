'use client';

import { useState } from 'react';
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  const sidebar = (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-[var(--sidebar-bg)] flex flex-col shadow-[var(--shadow-sm)] h-full">
      <div className="p-5 border-b border-slate-200">
        <h2 className="font-semibold text-slate-900 tracking-tight">Feedback Dashboard</h2>
        <p className="text-xs text-slate-500 mt-0.5">Vamo</p>
      </div>
      <nav className="p-3 flex-1">
        {nav.map(({ href, label }) => (
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
          className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          Sign out
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
          <span className="font-semibold text-slate-900">Feedback Dashboard</span>
        </div>
        {children}
      </div>
    </div>
  );
}
