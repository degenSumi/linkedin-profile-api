import { describe, expect, it } from 'vitest';
import dashProfile from './fixtures/dash-profile.json' with { type: 'json' };
import { mapNormalizedProfile } from '../src/profiles/sources/normalized.js';
import { findPerson, mapPerson } from '../src/profiles/sources/public-html.js';

describe('mapNormalizedProfile', () => {
  const profile = mapNormalizedProfile(dashProfile);

  it('maps identity fields', () => {
    expect(profile.fullName).toBe('Bill Gates');
    expect(profile.headline).toContain('Gates Foundation');
    expect(profile.summary).toBeTruthy();
  });

  it('resolves the location through the referenced Geo entity', () => {
    expect(profile.location.city).toBeTruthy();
    expect(profile.location.country).toBe('US');
  });

  it('resolves the industry through its URN', () => {
    expect(profile.industry).toBeTruthy();
  });

  it('builds profile image URLs by size from the vector artifacts', () => {
    expect(profile.profilePicture.original).toMatch(/^https:\/\/media\.licdn\.com\//);
    expect(profile.profilePicture.small).toMatch(/^https:\/\/media\.licdn\.com\//);
  });

  it('resolves each position company through its reference', () => {
    const [first] = profile.experience;
    expect(profile.experience).toHaveLength(2);
    expect(first?.company).toBeTruthy();
    expect(first?.companyUrl).toMatch(/linkedin\.com\/company\//);
    expect(first?.companyLogo).toMatch(/^https:\/\/media\.licdn\.com\//);
    expect(first?.startDate?.year).toBeGreaterThan(1900);
  });

  it('marks a position with no end date as current', () => {
    expect(profile.experience.every((role) => role.current === (role.endDate === null))).toBe(true);
  });

  it('resolves the education school through its reference', () => {
    const [education] = profile.education;
    expect(education?.school).toBeTruthy();
    expect(education?.schoolLogo).toMatch(/^https:\/\/media\.licdn\.com\//);
  });

  it('returns an empty profile shape rather than throwing on a sparse payload', () => {
    const sparse = mapNormalizedProfile({
      included: [{ $type: 'com.linkedin.voyager.dash.identity.profile.Profile', firstName: 'Ada' }],
    });
    expect(sparse.fullName).toBe('Ada');
    expect(sparse.experience).toEqual([]);
    expect(sparse.profilePicture.original).toBeNull();
    expect(sparse.location).toEqual({ city: null, country: null, full: null });
  });

  it('maps the optional sections when the decoration includes them', () => {
    const rich = mapNormalizedProfile({
      included: [
        { $type: 'com.linkedin.voyager.dash.identity.profile.Profile', firstName: 'Ada' },
        { $type: 'com.linkedin.voyager.dash.identity.profile.Skill', name: 'TypeScript' },
        { $type: 'com.linkedin.voyager.dash.identity.profile.Language', name: 'English' },
        {
          $type: 'com.linkedin.voyager.dash.identity.profile.Certification',
          name: 'AWS',
          authority: 'Amazon',
        },
        { $type: 'com.linkedin.voyager.dash.identity.profile.Project', title: 'Engine' },
        { $type: 'com.linkedin.voyager.dash.identity.profile.Honor', title: 'First Programmer' },
      ],
    });

    expect(rich.skills).toEqual([{ name: 'TypeScript', endorsements: null }]);
    expect(rich.languages).toEqual([{ name: 'English', proficiency: null }]);
    expect(rich.certifications[0]).toMatchObject({ name: 'AWS', authority: 'Amazon' });
    expect(rich.projects[0]).toMatchObject({ name: 'Engine' });
    expect(rich.honors[0]).toMatchObject({ title: 'First Programmer' });
  });

  it('reports a payload with no profile entity as not found', () => {
    expect(() => mapNormalizedProfile({ included: [] })).toThrow();
  });
});

const PUBLIC_HTML = `
<html><head>
<meta property="og:image" content="https://media.licdn.com/dms/image/og/ada.jpg" />
<script type="application/ld+json">
{"@context":"http://schema.org","@graph":[
  {"@type":"WebPage","url":"https://www.linkedin.com/in/ada-lovelace"},
  {"@type":"Person","name":"Ada Lovelace","jobTitle":["Principal Engineer"],
   "description":"Building compilers.",
   "address":{"@type":"PostalAddress","addressLocality":"London","addressCountry":"GB"},
   "image":{"@type":"ImageObject","contentUrl":"https://media.licdn.com/dms/image/ld/ada.jpg"},
   "worksFor":[{"@type":"Organization","name":"Analytical Engines","url":"https://www.linkedin.com/company/analytical-engines",
     "member":[{"description":"Principal Engineer","startDate":"2021-03"}]}],
   "alumniOf":[{"@type":"Organization","name":"University of London",
     "member":[{"startDate":"2013","endDate":"2017"}]}],
   "knowsLanguage":[{"@type":"Language","name":"English"}]}
]}
</script>
</head><body></body></html>`;

describe('public HTML fallback', () => {
  it('extracts the Person node from JSON-LD', () => {
    expect(findPerson(PUBLIC_HTML)?.['name']).toBe('Ada Lovelace');
  });

  it('maps the Person node into the response shape', () => {
    const profile = mapPerson(findPerson(PUBLIC_HTML) ?? {}, PUBLIC_HTML);

    expect(profile.firstName).toBe('Ada');
    expect(profile.lastName).toBe('Lovelace');
    expect(profile.headline).toBe('Principal Engineer');
    expect(profile.location).toEqual({ city: 'London', country: 'GB', full: 'London' });
    expect(profile.profilePicture.original).toBe('https://media.licdn.com/dms/image/ld/ada.jpg');
    expect(profile.experience[0]).toMatchObject({ company: 'Analytical Engines', current: true });
    expect(profile.education[0]?.endDate).toEqual({ month: null, year: 2017 });
    expect(profile.languages).toEqual([{ name: 'English', proficiency: null }]);
  });

  it('returns null when the page carries no profile data', () => {
    expect(findPerson('<html><body>auth wall</body></html>')).toBeNull();
  });
});
