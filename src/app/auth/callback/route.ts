import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Handles the auth callback after email confirmation or OAuth.
 * Exchanges the code for a session and redirects to dashboard (or ?next=).
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/dashboard';

  const redirectTo = new URL(next, requestUrl.origin);

  if (code) {
    const response = NextResponse.redirect(redirectTo);
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(
            cookiesToSet: {
              name: string;
              value: string;
              options?: Parameters<typeof response.cookies.set>[2];
            }[]
          ) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      redirectTo.pathname = '/login';
      redirectTo.searchParams.set('error', 'session');
      redirectTo.searchParams.set('message', error.message);
      return NextResponse.redirect(redirectTo);
    }
    return response;
  }

  // No code: redirect to login (e.g. user opened callback URL by mistake)
  redirectTo.pathname = '/login';
  return NextResponse.redirect(redirectTo);
}
