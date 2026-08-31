import { describe, expect, it } from 'vitest';
import { InvalidProfileUrlError } from '../src/core/errors.js';
import { fromPublicIdentifier, parseProfileUrl } from '../src/core/profile-url.js';

describe('parseProfileUrl', () => {
  it.each([
    ['https://www.linkedin.com/in/ada-lovelace', 'ada-lovelace'],
    ['https://www.linkedin.com/in/ada-lovelace/', 'ada-lovelace'],
    ['http://linkedin.com/in/ada-lovelace?trk=nav', 'ada-lovelace'],
    ['linkedin.com/in/ada-lovelace', 'ada-lovelace'],
    ['https://in.linkedin.com/in/ada-lovelace', 'ada-lovelace'],
    ['https://www.linkedin.com/mwlite/in/ada-lovelace', 'ada-lovelace'],
    ['https://www.linkedin.com/in/ada-lovelace/details/experience/', 'ada-lovelace'],
  ])('extracts the public identifier from %s', (input, expected) => {
    expect(parseProfileUrl(input).publicIdentifier).toBe(expected);
  });

  it('canonicalises the URL', () => {
    expect(parseProfileUrl('linkedin.com/in/ada-lovelace/').canonicalUrl).toBe(
      'https://www.linkedin.com/in/ada-lovelace',
    );
  });

  it.each([
    '',
    'https://example.com/in/ada-lovelace',
    'https://www.linkedin.com/company/analytical-engines',
    'https://www.linkedin.com/in/',
    'not a url at all',
  ])('rejects %s', (input) => {
    expect(() => parseProfileUrl(input)).toThrow(InvalidProfileUrlError);
  });

  it('rejects a linkedin lookalike host', () => {
    expect(() => parseProfileUrl('https://linkedin.com.evil.test/in/ada')).toThrow(
      InvalidProfileUrlError,
    );
  });
});

describe('fromPublicIdentifier', () => {
  it('accepts a bare username', () => {
    expect(fromPublicIdentifier('ada-lovelace').publicIdentifier).toBe('ada-lovelace');
  });

  it('rejects a username containing a path separator', () => {
    expect(() => fromPublicIdentifier('ada/lovelace')).toThrow(InvalidProfileUrlError);
  });
});
