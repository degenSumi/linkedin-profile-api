import { z } from '@hono/zod-openapi';
import type { ProfileRef } from '../core/profile-url.js';
import type { ProfileResult } from '../core/types.js';

const PartialDate = z
  .object({
    month: z.number().int().nullable(),
    year: z.number().int().nullable(),
  })
  .nullable();

const ImageSet = z.object({
  small: z.string().nullable(),
  medium: z.string().nullable(),
  large: z.string().nullable(),
  original: z.string().nullable(),
});

const Experience = z.object({
  title: z.string().nullable(),
  company: z.string().nullable(),
  companyUrl: z.string().nullable(),
  companyLogo: z.string().nullable(),
  employmentType: z.string().nullable(),
  location: z.string().nullable(),
  startDate: PartialDate,
  endDate: PartialDate,
  current: z.boolean(),
  description: z.string().nullable(),
});

const Education = z.object({
  school: z.string().nullable(),
  degree: z.string().nullable(),
  fieldOfStudy: z.string().nullable(),
  startDate: PartialDate,
  endDate: PartialDate,
  grade: z.string().nullable(),
  activities: z.string().nullable(),
  description: z.string().nullable(),
  schoolLogo: z.string().nullable(),
});

const Skill = z.object({ name: z.string(), endorsements: z.number().int().nullable() });

const Certification = z.object({
  name: z.string().nullable(),
  authority: z.string().nullable(),
  licenseNumber: z.string().nullable(),
  url: z.string().nullable(),
  issuedDate: PartialDate,
  expiryDate: PartialDate,
});

const Language = z.object({ name: z.string(), proficiency: z.string().nullable() });

const Project = z.object({
  name: z.string().nullable(),
  description: z.string().nullable(),
  url: z.string().nullable(),
  startDate: PartialDate,
  endDate: PartialDate,
});

const VolunteerRole = z.object({
  role: z.string().nullable(),
  organization: z.string().nullable(),
  cause: z.string().nullable(),
  startDate: PartialDate,
  endDate: PartialDate,
  description: z.string().nullable(),
});

const Publication = z.object({
  name: z.string().nullable(),
  publisher: z.string().nullable(),
  date: PartialDate,
  url: z.string().nullable(),
  description: z.string().nullable(),
});

const Honor = z.object({
  title: z.string().nullable(),
  issuer: z.string().nullable(),
  date: PartialDate,
  description: z.string().nullable(),
});

export const ProfileSchema = z.object({
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  fullName: z.string().nullable(),
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  industry: z.string().nullable(),
  location: z.object({
    city: z.string().nullable(),
    country: z.string().nullable(),
    full: z.string().nullable(),
  }),
  profilePicture: ImageSet,
  backgroundImage: z.object({ original: z.string().nullable() }),
  connections: z.number().int().nullable(),
  followers: z.number().int().nullable(),
  openToWork: z.boolean(),
  experience: z.array(Experience),
  education: z.array(Education),
  skills: z.array(Skill),
  certifications: z.array(Certification),
  languages: z.array(Language),
  projects: z.array(Project),
  volunteer: z.array(VolunteerRole),
  publications: z.array(Publication),
  honors: z.array(Honor),
});

const SourceFailure = z.object({
  source: z.string(),
  reason: z.string(),
});

export const ProfileResponseSchema = z
  .object({
    requestedUrl: z.string(),
    publicIdentifier: z.string(),
    fetchedAt: z.string(),
    source: z.enum(['voyager-dash', 'voyager-graphql', 'public-html']),
    partial: z.boolean(),
    degradedFrom: z.array(SourceFailure).openapi({
      description:
        'Sources tried before the one that answered, with the reason each failed. Empty when the primary source served the request.',
    }),
    profile: ProfileSchema,
  })
  .openapi('ProfileResponse');

export const ErrorResponseSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      requestId: z.string(),
    }),
  })
  .openapi('ErrorResponse');

export const ProfileQuerySchema = z.object({
  url: z.string().optional().openapi({ example: 'https://www.linkedin.com/in/williamhgates' }),
  username: z.string().optional().openapi({ example: 'williamhgates' }),
  refresh: z.enum(['true', 'false']).optional(),
});

export const HealthResponseSchema = z
  .object({
    status: z.literal('ok'),
    authRequired: z.boolean(),
    sessionConfigured: z.boolean(),
    sources: z.array(z.string()),
  })
  .openapi('HealthResponse');

export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;

export function toProfileResponse(ref: ProfileRef, result: ProfileResult): ProfileResponse {
  return {
    requestedUrl: ref.canonicalUrl,
    publicIdentifier: ref.publicIdentifier,
    fetchedAt: result.fetchedAt,
    source: result.source,
    partial: result.partial,
    degradedFrom: [...(result.degradedFrom ?? [])],
    profile: {
      ...result.profile,
      experience: [...result.profile.experience],
      education: [...result.profile.education],
      skills: [...result.profile.skills],
      certifications: [...result.profile.certifications],
      languages: [...result.profile.languages],
      projects: [...result.profile.projects],
      volunteer: [...result.profile.volunteer],
      publications: [...result.profile.publications],
      honors: [...result.profile.honors],
    },
  };
}
