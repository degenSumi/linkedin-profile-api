import type { SourceFailure } from './errors.js';

export interface PartialDate {
  readonly month: number | null;
  readonly year: number | null;
}

export interface Location {
  readonly city: string | null;
  readonly country: string | null;
  readonly full: string | null;
}

export interface ImageSet {
  readonly small: string | null;
  readonly medium: string | null;
  readonly large: string | null;
  readonly original: string | null;
}

export interface Experience {
  readonly title: string | null;
  readonly company: string | null;
  readonly companyUrl: string | null;
  readonly companyLogo: string | null;
  readonly employmentType: string | null;
  readonly location: string | null;
  readonly startDate: PartialDate | null;
  readonly endDate: PartialDate | null;
  readonly current: boolean;
  readonly description: string | null;
}

export interface Education {
  readonly school: string | null;
  readonly degree: string | null;
  readonly fieldOfStudy: string | null;
  readonly startDate: PartialDate | null;
  readonly endDate: PartialDate | null;
  readonly grade: string | null;
  readonly activities: string | null;
  readonly description: string | null;
  readonly schoolLogo: string | null;
}

export interface Skill {
  readonly name: string;
  readonly endorsements: number | null;
}

export interface Certification {
  readonly name: string | null;
  readonly authority: string | null;
  readonly licenseNumber: string | null;
  readonly url: string | null;
  readonly issuedDate: PartialDate | null;
  readonly expiryDate: PartialDate | null;
}

export interface Language {
  readonly name: string;
  readonly proficiency: string | null;
}

export interface Project {
  readonly name: string | null;
  readonly description: string | null;
  readonly url: string | null;
  readonly startDate: PartialDate | null;
  readonly endDate: PartialDate | null;
}

export interface VolunteerRole {
  readonly role: string | null;
  readonly organization: string | null;
  readonly cause: string | null;
  readonly startDate: PartialDate | null;
  readonly endDate: PartialDate | null;
  readonly description: string | null;
}

export interface Publication {
  readonly name: string | null;
  readonly publisher: string | null;
  readonly date: PartialDate | null;
  readonly url: string | null;
  readonly description: string | null;
}

export interface Honor {
  readonly title: string | null;
  readonly issuer: string | null;
  readonly date: PartialDate | null;
  readonly description: string | null;
}

export interface Profile {
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly fullName: string | null;
  readonly headline: string | null;
  readonly summary: string | null;
  readonly industry: string | null;
  readonly location: Location;
  readonly profilePicture: ImageSet;
  readonly backgroundImage: { readonly original: string | null };
  readonly connections: number | null;
  readonly followers: number | null;
  readonly openToWork: boolean;
  readonly experience: readonly Experience[];
  readonly education: readonly Education[];
  readonly skills: readonly Skill[];
  readonly certifications: readonly Certification[];
  readonly languages: readonly Language[];
  readonly projects: readonly Project[];
  readonly volunteer: readonly VolunteerRole[];
  readonly publications: readonly Publication[];
  readonly honors: readonly Honor[];
}

export type ProfileSourceName = 'voyager-dash' | 'voyager-graphql' | 'public-html';

export interface ProfileResult {
  readonly profile: Profile;
  readonly source: ProfileSourceName;
  readonly partial: boolean;
  readonly fetchedAt: string;
  /** Sources that were tried and failed before the one that answered. */
  readonly degradedFrom?: readonly SourceFailure[];
}
