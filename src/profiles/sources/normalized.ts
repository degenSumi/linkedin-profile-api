import { ProfileNotFoundError } from '../../core/errors.js';
import type {
  Certification,
  Education,
  Experience,
  Honor,
  Language,
  PartialDate,
  Profile,
  Project,
  Publication,
  Skill,
  VolunteerRole,
} from '../../core/types.js';
import { integer, isNamed, list, partialDate, pick, record, text, vectorImage } from './mapping.js';

/**
 * Maps Voyager's normalized `{ data, included }` documents, used by both the dash REST
 * endpoint and GraphQL. Every entity is flattened into `included` and tagged with `$type`,
 * and entities reference each other by URN through `*`-prefixed keys — so mapping means
 * indexing `included` by `entityUrn` and following those references.
 */

const TYPE = {
  profile: 'com.linkedin.voyager.dash.identity.profile.Profile',
  position: 'com.linkedin.voyager.dash.identity.profile.Position',
  education: 'com.linkedin.voyager.dash.identity.profile.Education',
  skill: 'com.linkedin.voyager.dash.identity.profile.Skill',
  certification: 'com.linkedin.voyager.dash.identity.profile.Certification',
  language: 'com.linkedin.voyager.dash.identity.profile.Language',
  project: 'com.linkedin.voyager.dash.identity.profile.Project',
  volunteer: 'com.linkedin.voyager.dash.identity.profile.VolunteerExperience',
  publication: 'com.linkedin.voyager.dash.identity.profile.Publication',
  honor: 'com.linkedin.voyager.dash.identity.profile.Honor',
} as const;

type Entity = Record<string, unknown>;

class EntityIndex {
  private readonly byUrn = new Map<string, Entity>();
  private readonly byType = new Map<string, Entity[]>();

  constructor(included: readonly unknown[]) {
    for (const raw of included) {
      const entity = record(raw);
      if (!entity) {
        continue;
      }
      const urn = text(entity['entityUrn']);
      if (urn) {
        this.byUrn.set(urn, entity);
      }
      const type = text(entity['$type']);
      if (type) {
        this.byType.set(type, [...(this.byType.get(type) ?? []), entity]);
      }
    }
  }

  ofType(type: string): readonly Entity[] {
    return this.byType.get(type) ?? [];
  }

  /** Follows a `*`-prefixed reference key, e.g. `*company` on a Position. */
  follow(entity: Entity, key: string): Entity | null {
    const urn = text(entity[key]);
    return urn ? (this.byUrn.get(urn) ?? null) : null;
  }
}

export function mapNormalizedProfile(payload: unknown): Profile {
  const index = new EntityIndex(list(pick(payload, 'included')));
  const profile = index.ofType(TYPE.profile)[0];
  if (!profile) {
    throw new ProfileNotFoundError('Voyager response contained no profile entity');
  }

  const firstName = text(profile['firstName']);
  const lastName = text(profile['lastName']);
  const geo = index.follow(record(profile['geoLocation']) ?? {}, '*geo');
  const city = text(geo?.['defaultLocalizedName']);
  const country = text(pick(profile, 'location', 'countryCode'));
  const industry = index.follow(profile, 'industryUrn');

  return {
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(' ') || null,
    headline: text(profile['headline']),
    summary: text(profile['summary']),
    industry: text(industry?.['name']),
    location: { city, country, full: city ?? country },
    profilePicture: vectorImage(
      pick(profile, 'profilePicture', 'displayImageReference', 'vectorImage'),
    ),
    backgroundImage: {
      original: vectorImage(
        pick(profile, 'backgroundPicture', 'displayImageReference', 'vectorImage'),
      ).original,
    },
    connections: integer(pick(profile, 'connections', 'paging', 'total')),
    followers: integer(pick(profile, 'followingState', 'followerCount')),
    openToWork: Boolean(profile['openToWork']),
    experience: index.ofType(TYPE.position).map((raw) => toExperience(raw, index)),
    education: index.ofType(TYPE.education).map((raw) => toEducation(raw, index)),
    skills: index.ofType(TYPE.skill).map(toSkill).filter(isNamed),
    certifications: index.ofType(TYPE.certification).map(toCertification),
    languages: index.ofType(TYPE.language).map(toLanguage).filter(isNamed),
    projects: index.ofType(TYPE.project).map(toProject),
    volunteer: index.ofType(TYPE.volunteer).map(toVolunteerRole),
    publications: index.ofType(TYPE.publication).map(toPublication),
    honors: index.ofType(TYPE.honor).map(toHonor),
  };
}

function toExperience(raw: Entity, index: EntityIndex): Experience {
  const range = dateRange(raw);
  const company = index.follow(raw, '*company');

  return {
    title: text(raw['title']),
    company: text(raw['companyName']) ?? text(company?.['name']),
    companyUrl: text(company?.['url']),
    companyLogo: vectorImage(pick(company, 'logo', 'vectorImage')).original,
    employmentType: text(raw['employmentTypeUrn']),
    location: text(raw['locationName']),
    startDate: range.start,
    endDate: range.end,
    current: range.end === null,
    description: text(raw['description']),
  };
}

function toEducation(raw: Entity, index: EntityIndex): Education {
  const range = dateRange(raw);
  const school = index.follow(raw, '*school');

  return {
    school: text(raw['schoolName']) ?? text(school?.['name']),
    degree: text(raw['degreeName']),
    fieldOfStudy: text(raw['fieldOfStudy']),
    startDate: range.start,
    endDate: range.end,
    grade: text(raw['grade']),
    activities: text(raw['activities']),
    description: text(raw['description']),
    schoolLogo: vectorImage(pick(school, 'logo', 'vectorImage')).original,
  };
}

function toSkill(raw: Entity): Skill {
  return { name: text(raw['name']) ?? '', endorsements: integer(raw['endorsementCount']) };
}

function toCertification(raw: Entity): Certification {
  const range = dateRange(raw);

  return {
    name: text(raw['name']),
    authority: text(raw['authority']),
    licenseNumber: text(raw['licenseNumber']),
    url: text(raw['url']),
    issuedDate: range.start,
    expiryDate: range.end,
  };
}

function toLanguage(raw: Entity): Language {
  return { name: text(raw['name']) ?? '', proficiency: text(raw['proficiency']) };
}

function toProject(raw: Entity): Project {
  const range = dateRange(raw);

  return {
    name: text(raw['title']),
    description: text(raw['description']),
    url: text(raw['url']),
    startDate: range.start,
    endDate: range.end,
  };
}

function toVolunteerRole(raw: Entity): VolunteerRole {
  const range = dateRange(raw);

  return {
    role: text(raw['role']),
    organization: text(raw['companyName']),
    cause: text(raw['cause']),
    startDate: range.start,
    endDate: range.end,
    description: text(raw['description']),
  };
}

function toPublication(raw: Entity): Publication {
  return {
    name: text(raw['name']),
    publisher: text(raw['publisher']),
    date: partialDate(raw['publishedOn']),
    url: text(raw['url']),
    description: text(raw['description']),
  };
}

function toHonor(raw: Entity): Honor {
  return {
    title: text(raw['title']),
    issuer: text(raw['issuer']),
    date: partialDate(raw['issuedOn']),
    description: text(raw['description']),
  };
}

function dateRange(raw: unknown): { start: PartialDate | null; end: PartialDate | null } {
  return {
    start: partialDate(pick(raw, 'dateRange', 'start')),
    end: partialDate(pick(raw, 'dateRange', 'end')),
  };
}
