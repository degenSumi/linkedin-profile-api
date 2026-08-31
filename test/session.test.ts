import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequest, HttpResponse } from '../src/core/ports.js';
import { LinkedInSessions } from '../src/linkedin/session.js';

const LOGIN_FORM =
  '<form><input name="loginCsrfParam" value="csrf-1" /><input name="csrfToken" value="ajax:1" /></form>';

class StubHttp implements HttpClient {
  submits = 0;

  constructor(private readonly loginOutcome: Partial<HttpResponse>) {}

  send(request: HttpRequest): Promise<HttpResponse> {
    if (request.method === 'POST') {
      this.submits += 1;
      return Promise.resolve(response(this.loginOutcome));
    }
    return Promise.resolve(
      response({ body: LOGIN_FORM, setCookie: ['JSESSIONID="ajax:9876"; Path=/'] }),
    );
  }
}

function response(overrides: Partial<HttpResponse>): HttpResponse {
  return { status: 200, headers: {}, setCookie: [], body: '', ...overrides };
}

const credentials = { email: 'someone@example.com', password: 'secret' };

describe('LinkedInSessions', () => {
  it('logs in when no cookie is configured', async () => {
    const http = new StubHttp({ status: 303, setCookie: ['li_at=issued-token; Path=/'] });

    const session = await new LinkedInSessions(http, credentials).get();

    expect(session.cookie).toContain('li_at=issued-token');
    expect(session.csrfToken).toBe('ajax:9876');
  });

  it('stops submitting credentials once LinkedIn raises a checkpoint', async () => {
    const http = new StubHttp({
      status: 303,
      headers: { location: 'https://www.linkedin.com/checkpoint/challenge/AgH-token?ut=abc' },
    });
    const sessions = new LinkedInSessions(http, credentials);

    await expect(sessions.get()).rejects.toThrow('security checkpoint');
    await expect(sessions.get()).rejects.toThrow('refresh LI_AT');
    expect(http.submits).toBe(1);
  });

  it('keeps the challenge token out of the error', async () => {
    const http = new StubHttp({
      status: 303,
      headers: { location: 'https://www.linkedin.com/checkpoint/challenge/AgH-secret-token?ut=x' },
    });

    await expect(new LinkedInSessions(http, credentials).get()).rejects.toThrow(
      /^LinkedIn challenged the login with a security checkpoint$/,
    );
  });

  it('falls back to the login after the configured cookie is rejected', async () => {
    const http = new StubHttp({ status: 303, setCookie: ['li_at=recovered; Path=/'] });
    const sessions = new LinkedInSessions(http, { ...credentials, liAt: 'stale' });

    expect((await sessions.get()).cookie).toContain('li_at=stale');
    sessions.invalidate();
    expect((await sessions.get()).cookie).toContain('li_at=recovered');
  });
});

describe('LinkedInSessions with a full cookie header', () => {
  const header = 'bcookie="v=2&abc"; li_at=token; JSESSIONID="ajax:5551234"; lidc="b=OB1"';

  it('sends the header untouched and reads the csrf token out of it', async () => {
    const http = new StubHttp({});

    const session = await new LinkedInSessions(http, { cookieHeader: header }).get();

    expect(session.cookie).toBe(header);
    expect(session.csrfToken).toBe('ajax:5551234');
  });

  it('is preferred over a bare li_at', async () => {
    const http = new StubHttp({});

    const session = await new LinkedInSessions(http, { cookieHeader: header, liAt: 'bare' }).get();

    expect(session.cookie).toBe(header);
  });

  it('rejects a header with no JSESSIONID to send', async () => {
    const http = new StubHttp({});

    await expect(
      new LinkedInSessions(http, { cookieHeader: 'li_at=token' }).get(),
    ).rejects.toThrow('no JSESSIONID');
  });
});
