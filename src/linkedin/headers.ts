export interface LinkedInSession {
  readonly cookie: string;
  readonly csrfToken: string;
}

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Voyager validates the csrf-token header against the JSESSIONID cookie, quotes stripped.
export function csrfTokenFrom(jsessionId: string): string {
  return jsessionId.replace(/"/g, '');
}

export function buildCookieHeader(cookies: Readonly<Record<string, string>>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

export function parseSetCookie(setCookie: readonly string[]): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const entry of setCookie) {
    const [pair] = entry.split(';');
    const separator = pair?.indexOf('=') ?? -1;
    if (!pair || separator <= 0) {
      continue;
    }
    cookies[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim();
  }
  return cookies;
}

export function voyagerHeaders(
  session: LinkedInSession,
  accept = 'application/vnd.linkedin.normalized+json+2.1',
): Record<string, string> {
  return {
    accept,
    'accept-language': 'en-US,en;q=0.9',
    'csrf-token': session.csrfToken,
    'x-restli-protocol-version': '2.0.0',
    'x-li-lang': 'en_US',
    cookie: session.cookie,
    referer: 'https://www.linkedin.com/feed/',
    'user-agent': USER_AGENT,
  };
}

export function publicPageHeaders(): Record<string, string> {
  return {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent': USER_AGENT,
  };
}
