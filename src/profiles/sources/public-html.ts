import {
  ProfileNotFoundError,
  UpstreamBlockedError,
  UpstreamUnavailableError,
} from '../../core/errors.js';
import type { HttpClient, ProfileSource } from '../../core/ports.js';
import type { ProfileRef } from '../../core/profile-url.js';
import type { Education, Experience, Profile, ProfileResult } from '../../core/types.js';
import { publicPageHeaders } from '../../linkedin/headers.js';
import { list, pick, record, text } from './mapping.js';

const JSON_LD = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;

export class PublicHtmlSource implements ProfileSource {
  readonly name = 'public-html';

  constructor(private readonly http: HttpClient) {}

  async fetch(ref: ProfileRef): Promise<ProfileResult> {
    const response = await this.http.send({
      url: ref.canonicalUrl,
      headers: publicPageHeaders(),
    });

    if (response.status === 404 || response.status === 410) {
      throw new ProfileNotFoundError(`No LinkedIn profile at /in/${ref.publicIdentifier}`);
    }
    if (response.status === 403 || response.status === 999) {
      throw new UpstreamBlockedError(
        `LinkedIn blocked the public profile page (HTTP ${response.status})`,
      );
    }
    if (response.status !== 200) {
      throw new UpstreamUnavailableError(`Public profile page returned HTTP ${response.status}`);
    }

    const person = findPerson(response.body);
    if (!person) {
      throw new UpstreamBlockedError(
        'Public profile page contained no profile data, so LinkedIn served an auth wall',
      );
    }

    return {
      profile: mapPerson(person, response.body),
      source: 'public-html',
      partial: true,
      fetchedAt: new Date().toISOString(),
    };
  }
}

export function findPerson(html: string): Record<string, unknown> | null {
  for (const match of html.matchAll(JSON_LD)) {
    const raw = match[1];
    if (!raw) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(decodeEntities(raw));
    } catch {
      continue;
    }

    const graph = list(pick(parsed, '@graph'));
    const person = graph.find((node) => pick(node, '@type') === 'Person');
    if (person) {
      return record(person);
    }
  }

  return null;
}

export function mapPerson(person: Record<string, unknown>, html = ''): Profile {
  const fullName = text(person['name']);
  const [firstName = null, ...rest] = fullName ? fullName.split(' ') : [];
  const locality = text(pick(person, 'address', 'addressLocality'));
  const country = text(pick(person, 'address', 'addressCountry'));
  const image = text(pick(person, 'image', 'contentUrl')) ?? metaContent(html, 'og:image');

  return {
    firstName,
    lastName: rest.length > 0 ? rest.join(' ') : null,
    fullName,
    headline: headlineOf(person) ?? metaContent(html, 'og:title'),
    summary: text(person['description']),
    industry: null,
    // addressLocality is already a full location string here, and addressCountry
    // is an ISO code, so joining the two would just repeat the country.
    location: { city: locality, country, full: locality ?? country },
    profilePicture: { small: null, medium: null, large: null, original: image },
    backgroundImage: { original: null },
    connections: null,
    followers: null,
    openToWork: false,
    experience: list(person['worksFor']).map(toExperience),
    education: list(person['alumniOf']).map(toEducation),
    skills: [],
    certifications: [],
    languages: list(person['knowsLanguage'])
      .map((language) => ({ name: text(pick(language, 'name')) ?? '', proficiency: null }))
      .filter((language) => language.name.length > 0),
    projects: [],
    volunteer: [],
    publications: [],
    honors: [],
  };
}

function headlineOf(person: Record<string, unknown>): string | null {
  const jobTitle = person['jobTitle'];
  if (Array.isArray(jobTitle)) {
    const titles = jobTitle.map(text).filter((title): title is string => title !== null);
    return titles.length > 0 ? titles.join(', ') : null;
  }
  return text(jobTitle);
}

function toExperience(raw: unknown): Experience {
  const member = list(pick(raw, 'member'))[0];

  return {
    title: text(pick(member, 'description')),
    company: text(pick(raw, 'name')),
    companyUrl: text(pick(raw, 'url')),
    companyLogo: null,
    employmentType: null,
    location: text(pick(raw, 'location')),
    startDate: yearOf(pick(member, 'startDate')),
    endDate: yearOf(pick(member, 'endDate')),
    current: yearOf(pick(member, 'endDate')) === null,
    description: null,
  };
}

function toEducation(raw: unknown): Education {
  const member = list(pick(raw, 'member'))[0];

  return {
    school: text(pick(raw, 'name')),
    degree: null,
    fieldOfStudy: null,
    startDate: yearOf(pick(member, 'startDate')),
    endDate: yearOf(pick(member, 'endDate')),
    grade: null,
    activities: null,
    description: null,
    schoolLogo: null,
  };
}

function yearOf(raw: unknown): { month: null; year: number } | null {
  const value = text(raw);
  const year = value ? Number.parseInt(value.slice(0, 4), 10) : Number.NaN;
  return Number.isFinite(year) ? { month: null, year } : null;
}

function metaContent(html: string, property: string): string | null {
  const pattern = new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`, 'i');
  const content = pattern.exec(html)?.[1];
  return content ? text(decodeEntities(content)) : null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
