import { z } from 'zod';
import { ConfigurationError } from '../core/errors.js';

// An unset variable and one set to an empty string mean the same thing to an operator,
// so blanks are treated as absent rather than failing validation.
const optional = () =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional(),
  );

const schema = z.object({
  API_KEY: optional(),
  LI_AT: optional(),
  LI_JSESSIONID: optional(),
  // A whole Cookie header copied from a signed-in browser. LinkedIn revokes sessions that
  // arrive with li_at alone, so sending the set it issued is what makes one last.
  LI_COOKIE: optional(),
  LINKEDIN_EMAIL: optional(),
  LINKEDIN_PASSWORD: optional(),
  VOYAGER_PROFILE_QUERY_ID: optional(),
  PROXY_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.url().optional(),
  ),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  PARTIAL_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  // Explicit opt-out for local runs. A missing API_KEY must fail closed instead,
  // so a deployment cannot end up unauthenticated by forgetting a variable.
  DISABLE_AUTH: z
    .string()
    .optional()
    .transform((value) => value?.trim().toLowerCase() === 'true'),
  // Puts the API key into the docs page so a reader can call the endpoint from there.
  // Off by default: it makes the key readable to anyone who can reach /docs.
  DOCS_PREFILL_API_KEY: z
    .string()
    .optional()
    .transform((value) => value?.trim().toLowerCase() === 'true'),
});

export type Config = Readonly<z.infer<typeof schema>>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigurationError(`Invalid environment configuration: ${issues}`);
  }
  return Object.freeze(parsed.data);
}

export function hasCookieSession(config: Config): boolean {
  return Boolean(config.LI_COOKIE ?? config.LI_AT);
}

export function hasCredentials(config: Config): boolean {
  return Boolean(config.LINKEDIN_EMAIL && config.LINKEDIN_PASSWORD);
}
