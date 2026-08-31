# LinkedIn Profile API

An HTTPS API that takes a LinkedIn profile URL and returns the profile as structured JSON, by
talking to LinkedIn's own internal Voyager API rather than to any third-party scraping service.

**Live:** https://linkedin-profile-api-six.vercel.app · **Docs:** [`/docs`](https://linkedin-profile-api-six.vercel.app/docs)

```bash
curl -s -H "x-api-key: $API_KEY" \
  "https://linkedin-profile-api-six.vercel.app/v1/profile?url=https://www.linkedin.com/in/williamhgates" | jq
```

## API

### `GET /v1/profile`

| Parameter  | Required | Notes                                                        |
| ---------- | -------- | ------------------------------------------------------------ |
| `url`      | yes\*    | Any `linkedin.com/in/{username}` URL, with or without scheme |
| `username` | yes\*    | Public identifier, as an alternative to `url`                |
| `refresh`  | no       | `true` bypasses the cache                                    |

\* exactly one of `url` or `username`.

Authenticate with `x-api-key: <key>` (an `Authorization: Bearer <key>` header also works). On this
deployment `/docs` comes with the key filled in, so requests can be sent straight from the page.

The key is never committed. `DOCS_PREFILL_API_KEY=true` tells the server to inject the configured
`API_KEY` into the docs page at runtime, and it is off by default because it makes that key readable
to anyone who can reach `/docs`. It is on here so this stays open to a reader.

```jsonc
{
  "requestedUrl": "https://www.linkedin.com/in/ada-lovelace",
  "publicIdentifier": "ada-lovelace",
  "fetchedAt": "2026-08-30T12:00:00.000Z",
  "source": "voyager-dash",
  "partial": false,
  "degradedFrom": [],
  "profile": {
    "firstName": "Ada",
    "lastName": "Lovelace",
    "fullName": "Ada Lovelace",
    "headline": "Principal Engineer at Analytical Engines",
    "summary": "Building compilers and the people who write them.",
    "industry": "Software Development",
    "location": { "city": "London", "country": "United Kingdom", "full": "London, United Kingdom" },
    "profilePicture": { "small": "https://…", "medium": "…", "large": "…", "original": "…" },
    "backgroundImage": { "original": "https://…" },
    "connections": null,
    "followers": null,
    "openToWork": false,
    "experience": [
      {
        "title": "Principal Engineer",
        "company": "Analytical Engines",
        "companyUrl": "https://www.linkedin.com/company/analytical-engines",
        "companyLogo": "https://…",
        "employmentType": null,
        "location": "London, United Kingdom",
        "startDate": { "month": 3, "year": 2021 },
        "endDate": null,
        "current": true,
        "description": "Compiler design and developer tooling.",
      },
    ],
    "education": [],
    "skills": [],
    "certifications": [],
    "languages": [],
    "projects": [],
    "volunteer": [],
    "publications": [],
    "honors": [],
  },
}
```

Every field is nullable and every section defaults to `[]`, so a sparse profile never breaks the
shape. `source` names which tier answered; `partial` is `true` when the answer came from the
logged-out page and therefore covers less.

`degradedFrom` says why. It is empty when the first tier answered, and otherwise lists each tier
that was tried and the reason it failed, so a thin response explains itself without a trip to the
logs:

```jsonc
{
  "source": "public-html",
  "partial": true,
  "degradedFrom": [
    { "source": "voyager-dash", "reason": "LinkedIn redirected the request to sign-in, so the session has expired" },
    { "source": "voyager-graphql", "reason": "Voyager GraphQL returned an empty profile" },
  ],
}
```

### Other routes

| Route               | Auth | Purpose                                            |
| ------------------- | ---- | -------------------------------------------------- |
| `GET /health`       | no   | Liveness plus whether a LinkedIn session is set up |
| `GET /openapi.json` | no   | OpenAPI 3.1 document generated from the schemas    |
| `GET /docs`         | no   | Scalar API reference                               |
| `GET /`             | no   | Redirects to `/docs`                               |

### Errors

Every error shares one shape: `{ "error": { "code", "message", "requestId" } }`, and every response
carries an `x-request-id` header.

| Status | Code                                      | Meaning                                        |
| ------ | ----------------------------------------- | ---------------------------------------------- |
| 400    | `invalid_profile_url`                     | Not a `/in/` LinkedIn profile URL              |
| 401    | `unauthorized`                            | Missing or wrong API key                       |
| 404    | `profile_not_found`                       | LinkedIn has no such profile                   |
| 429    | `rate_limit_exceeded`                     | Per-caller limit hit; see `retry-after`        |
| 502    | `all_sources_failed` / `upstream_blocked` | LinkedIn refused every source                  |
| 502    | `upstream_unavailable`                    | LinkedIn answered, but not with a usable body  |
| 503    | `session_unavailable` / `not_configured`  | Deployment has no usable session or no API key |

## Approach

LinkedIn's web app is backed by a private JSON API at `/voyager/api/…`. It authenticates purely
from browser cookies, so a server holding a valid `li_at` cookie can call it directly. Two details
make it work:

- Voyager requests are sent with `redirect: 'manual'`. An expired session is answered with a bounce
  to the sign-in page, which otherwise surfaces as an opaque redirect loop instead of an auth error.
- The `csrf-token` header must equal the `JSESSIONID` cookie with its surrounding quotes stripped.
  LinkedIn only checks that the two match, so a synthesised `ajax:…` value is accepted when no real
  one has been captured.
- `x-restli-protocol-version: 2.0.0` is mandatory, and requesting
  `Accept: application/vnd.linkedin.normalized+json+2.1` returns a flat `{ data, included[] }`
  document where every entity is tagged with `$type`. Entities reference each other by URN through
  `*`-prefixed keys (`"*company"`, `"*geo"`), so mapping means indexing `included` by `entityUrn`
  and following those references, which is what `sources/normalized.ts` does.

Three sources sit behind one interface and are tried in order:

1. **`voyager-dash`**: `/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity={id}`
   with `decorationId=…FullProfileWithEntities-67`. The decoration controls how much of the graph
   LinkedIn inlines; with it, positions, education and their companies arrive in one call. This is
   the endpoint that currently answers.
2. **`voyager-graphql`**: `/voyager/api/graphql`. Secondary, and off unless
   `VOYAGER_PROFILE_QUERY_ID` is set. It reads the same normalized documents through identical
   mapping code; no query id that returns a full profile is currently known.
3. **`public-html`**: the logged-out profile page, read through its `application/ld+json` block.
   Works with no session at all and returns less, so responses are flagged `partial`.

The legacy `/voyager/api/identity/profiles/{id}/profileView` endpoint that most write-ups still
recommend now returns **410 Gone**, along with `/identity/profiles/{id}` and its `/skills`
sub-resource. This API does not use them.


A missing profile short-circuits the chain: a 404 is an answer, not a source failure, so later
tiers are not consulted. If every tier fails, the 502 lists what each one said.

## Architecture

```
GET /v1/profile
  └── CachedSource       skips the fetch while a fresh answer is stored
        └── FallbackChain  tries each source in order, aggregates failures
              ├── VoyagerDashSource
              ├── VoyagerGraphQlSource
              └── PublicHtmlSource
```

Everything in that tree implements the same `ProfileSource` interface, so the route holds a single
source and adding a fourth is a new file rather than an edit. Two other seams are
interfaces for the same reason: `HttpClient`, which is what lets the whole stack run in tests with
no network, and `Store`, so the cache can become Redis without touching the caching policy.

```
src/
  core/         domain types, error hierarchy, three interfaces, URL parsing
  profiles/     sources/ holds the three that fetch; cached.ts and fallback.ts compose them
  linkedin/     session resolution and Voyager header derivation
  infra/        fetch client, TTL store, rate limiter, env config
  api/          Hono routes, middleware, zod schemas that also generate the OpenAPI doc
  container.ts  the only place concrete classes are constructed
  index.ts      the app itself, which Vercel imports
  server.ts     Node server for local runs, wrapping the same app
```

Errors are a typed hierarchy off `AppError`; one middleware turns them into status codes, so no
route does its own error formatting. Caching is split deliberately: `infra/store.ts` is _where_
data lives, `profiles/cached.ts` is _when_ to use it, so moving to Redis is a new class in
`infra/`, and changing the caching policy touches only the provider.

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill in API_KEY and LI_AT
pnpm dev                     # http://localhost:3000, docs at /docs
```

`pnpm dev` compiles with `tsc` and runs a plain Node server (`src/server.ts`), reading
`.env.local`, with no Vercel account or CLI needed. `pnpm dev:vercel` runs the same app through
`vercel dev` if you want to exercise the deployed runtime instead.

```bash
pnpm check   # typecheck + lint + tests, all offline
```

### Environment

| Variable                               | Required | Purpose                                           |
| -------------------------------------- | -------- | ------------------------------------------------- |
| `API_KEY`                              | yes      | Key callers must present                          |
| `LI_AT`                                | yes\*    | LinkedIn session cookie                           |
| `DISABLE_AUTH`                         | no       | Local only: skips the API key check               |
| `DOCS_PREFILL_API_KEY`                 | no       | Puts the API key into `/docs` so it is callable   |
| `LI_JSESSIONID`                        | no       | Captured CSRF cookie; generated when absent       |
| `LINKEDIN_EMAIL` / `LINKEDIN_PASSWORD` | no\*     | Fallback login when `LI_AT` is absent or rejected |
| `VOYAGER_PROFILE_QUERY_ID`             | no       | Enables the GraphQL source                        |
| `PROXY_URL`                            | no       | Egress proxy if the host's IP is challenged       |
| `CACHE_TTL_SECONDS`                    | no       | Default `3600`                                    |
| `PARTIAL_CACHE_TTL_SECONDS`            | no       | Default `60`; lifetime of degraded answers        |
| `RATE_LIMIT_PER_MINUTE`                | no       | Default `30`                                      |
| `HTTP_TIMEOUT_MS`                      | no       | Default `15000`                                   |

\* without either the cookie or credentials, only the `public-html` tier can answer.

### Getting `LI_AT`

Log in to LinkedIn in a browser, open DevTools → Application → Cookies → `https://www.linkedin.com`,
and copy the value of `li_at`. Set it with `vercel env add LI_AT`. Use a throwaway account (see
limitations).

### Getting `VOYAGER_PROFILE_QUERY_ID`

Optional. Open a profile while logged in, filter the DevTools Network tab for `voyager/api/graphql`,
and copy the `queryId` from a request whose response carries that person's positions. Registered ids
rotate with each LinkedIn release, which is why this is configuration rather than code.

### Deploying

```bash
vercel link
vercel env add API_KEY production
vercel env add LI_AT production
vercel deploy --prod
```

## Known limitations

- **Terms of service.** Automated access breaks LinkedIn's user agreement and can get an account
  restricted. Use a throwaway account, not one that matters.
- **Sessions do not last.** LinkedIn revokes `li_at` under scripted volume. Every Voyager endpoint
  then answers `302` with a `Location` equal to the request URL, and that response carries
  `Set-Cookie: li_at=<9 chars>`, which is LinkedIn clearing the cookie. No cool-off brings it back;
  the fix is to capture a fresh one.
- **Credential login is recovery, not a supported path.** It works, and it is what recovered the
  session after LinkedIn revoked the cookie mid-test, but LinkedIn challenges it. Once it answers
  `303` to `/checkpoint/challenge`, every retry gets the same challenge until a human clears it in a
  browser, so `LinkedInSessions` retires the login route after one challenge instead of
  resubmitting. Do not set `LINKEDIN_EMAIL`/`LINKEDIN_PASSWORD` in production, where every cold
  start would attempt a login.
- **The GraphQL tier is off by default.** No query id that returns a full profile is currently
  known, so it ships unconfigured. `voyager-dash` is the primary source and does not depend on it.
- **IP reputation.** LinkedIn challenges known datacenter ranges, and Vercel is one. Caching and the
  fallback tier absorb some of that; `PROXY_URL` is the real mitigation.
- **Partial fallback data.** The logged-out page carries no skills, certifications or endorsement
  counts, and LinkedIn masks the headline, so `partial: true` responses are genuinely thinner.
- **Decoration ids rotate.** `FullProfileWithEntities-67` is versioned, and the dash source needs the
  new value once LinkedIn bumps it.
- **Rate limiting is per-instance.** `FixedWindowRateLimiter` counts in memory and serverless
  instances do not share it, so the limit is approximate under concurrency. Backing it with the
  `Store` port instead would fix that.
- **Personal profiles only.** Company and school URLs are rejected rather than half-supported.
