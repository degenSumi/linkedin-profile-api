import { SessionUnavailableError } from '../core/errors.js';
import type { HttpClient } from '../core/ports.js';
import { buildCookieHeader, csrfTokenFrom, parseSetCookie, USER_AGENT } from './headers.js';
import type { LinkedInSession } from './headers.js';

export type { LinkedInSession };

// /uas/login and /login are now JS-rendered and carry no form; this checkpoint page
// still serves the classic server-rendered one with the CSRF fields.
const LOGIN_PAGE = 'https://www.linkedin.com/checkpoint/rm/sign-in-another-account';
const LOGIN_SUBMIT = 'https://www.linkedin.com/checkpoint/lg/login-submit';

export interface LinkedInCredentials {
  readonly liAt?: string | undefined;
  readonly jsessionId?: string | undefined;
  readonly email?: string | undefined;
  readonly password?: string | undefined;
}

/**
 * Resolves a Voyager session from the configured cookie, falling back to a login
 * when there is no cookie or the cookie has been rejected. The resolved session is
 * held for the life of the instance, which on serverless means the warm container.
 */
export class LinkedInSessions {
  private session: LinkedInSession | null = null;
  private cookieRejected = false;
  private loginChallenge: string | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly credentials: LinkedInCredentials,
  ) {}

  async get(): Promise<LinkedInSession> {
    this.session ??= await this.resolve();
    return this.session;
  }

  /** Called by a provider when LinkedIn rejects the session, so the next attempt re-resolves. */
  invalidate(): void {
    if (this.session && !this.cookieRejected) {
      this.cookieRejected = true;
    }
    this.session = null;
  }

  private resolve(): Promise<LinkedInSession> {
    const { liAt, jsessionId, email, password } = this.credentials;

    if (liAt && !this.cookieRejected) {
      return Promise.resolve(fromCookie(liAt, jsessionId));
    }
    // Re-submitting credentials against a live challenge is what escalates it: LinkedIn
    // counts the attempts. One challenge ends the login route for this instance, and the
    // operator refreshes LI_AT instead.
    if (this.loginChallenge) {
      throw new SessionUnavailableError(
        `LinkedIn ${this.loginChallenge} and the login will not be retried, so refresh LI_AT`,
      );
    }
    if (email && password) {
      return this.login(email, password);
    }

    throw new SessionUnavailableError(
      this.cookieRejected
        ? 'LinkedIn rejected the configured cookie and no credentials are available to recover'
        : 'No LinkedIn credentials are configured on this deployment',
    );
  }

  private async login(email: string, password: string): Promise<LinkedInSession> {
    const page = await this.http.send({ url: LOGIN_PAGE, headers: { 'user-agent': USER_AGENT } });
    const seed = parseSetCookie(page.setCookie);
    const csrfParam = hiddenInput(page.body, 'loginCsrfParam');
    const csrfToken = hiddenInput(page.body, 'csrfToken');
    const jsessionId = seed['JSESSIONID'];

    if (!csrfParam || !jsessionId) {
      throw new SessionUnavailableError('LinkedIn login page did not return a CSRF challenge');
    }

    const submit = await this.http.send({
      url: LOGIN_SUBMIT,
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: buildCookieHeader(seed),
        'user-agent': USER_AGENT,
      },
      body: new URLSearchParams({
        session_key: email,
        session_password: password,
        loginCsrfParam: csrfParam,
        ...(csrfToken ? { csrfToken } : {}),
      }).toString(),
    });

    const liAt = parseSetCookie(submit.setCookie)['li_at'];
    if (!liAt) {
      // The redirect target carries a single-use challenge token, so only its path is kept.
      const target = submit.headers['location'];
      this.loginChallenge = target?.includes('/checkpoint/challenge')
        ? 'challenged the login with a security checkpoint'
        : `refused the login (HTTP ${submit.status})`;
      throw new SessionUnavailableError(`LinkedIn ${this.loginChallenge}`);
    }

    return {
      cookie: buildCookieHeader({ li_at: liAt, JSESSIONID: jsessionId }),
      csrfToken: csrfTokenFrom(jsessionId),
    };
  }
}

// LinkedIn only checks that csrf-token matches the JSESSIONID cookie, so an arbitrary
// value is accepted when the deployment has no captured one.
function fromCookie(liAt: string, jsessionId?: string): LinkedInSession {
  const csrfToken = csrfTokenFrom(jsessionId ?? `ajax:${randomDigits(19)}`);
  return {
    cookie: buildCookieHeader({ li_at: liAt, JSESSIONID: `"${csrfToken}"` }),
    csrfToken,
  };
}

// Attribute order varies between LinkedIn's rendered forms, so match either arrangement.
function hiddenInput(html: string, name: string): string | undefined {
  return (
    new RegExp(`name="${name}"[^>]*?value="([^"]*)"`).exec(html)?.[1] ??
    new RegExp(`value="([^"]*)"[^>]*?name="${name}"`).exec(html)?.[1]
  );
}

function randomDigits(length: number): string {
  let digits = '';
  while (digits.length < length) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  return digits;
}
