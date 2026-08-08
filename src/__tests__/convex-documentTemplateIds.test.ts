/**
 * Tests for convex/lib/documentTemplateIds.ts — the canonical catalog template
 * ids shared by the client document catalog and the Convex backend.
 */

import { describe, it, expect } from '@jest/globals';
import {
  CATALOG_TEMPLATE_IDS,
  HIRING_PACKET_TEMPLATE_IDS,
  HIRING_PACKET_MANDATORY_IDS,
  isCatalogTemplateId,
  personalFileCategory,
  personalFileCategoryForBlueprint,
} from '../../convex/lib/documentTemplateIds';

describe('catalog template ids', () => {
  it('defines a non-empty catalog', () => {
    expect(CATALOG_TEMPLATE_IDS.length).toBeGreaterThan(0);
  });

  it('lists only unique ids', () => {
    expect(new Set(CATALOG_TEMPLATE_IDS).size).toBe(CATALOG_TEMPLATE_IDS.length);
  });

  it('contains the expected key templates', () => {
    expect(CATALOG_TEMPLATE_IDS).toEqual(
      expect.arrayContaining([
        'employment-contract',
        'offer-letter',
        'nda',
        'pdpa-consent',
        'biometric-consent',
        'employment-order',
        'termination-order',
      ]),
    );
  });

  it('hiring packet templates are all part of the catalog', () => {
    for (const id of HIRING_PACKET_TEMPLATE_IDS) {
      expect(CATALOG_TEMPLATE_IDS).toContain(id);
    }
  });

  it('mandatory templates are all part of the hiring packet', () => {
    for (const id of HIRING_PACKET_MANDATORY_IDS) {
      expect(HIRING_PACKET_TEMPLATE_IDS).toContain(id);
    }
  });

  it('includes the mandatory contract/order/consent trio', () => {
    expect(HIRING_PACKET_MANDATORY_IDS).toEqual(
      expect.arrayContaining(['employment-contract', 'employment-order', 'pdpa-consent']),
    );
  });
});

describe('isCatalogTemplateId', () => {
  it('returns true for known ids', () => {
    expect(isCatalogTemplateId('employment-contract')).toBe(true);
    expect(isCatalogTemplateId('salary-certificate')).toBe(true);
  });

  it('returns false for unknown or empty ids', () => {
    expect(isCatalogTemplateId('nonexistent-template')).toBe(false);
    expect(isCatalogTemplateId('')).toBe(false);
    expect(isCatalogTemplateId('employment-contract ')).toBe(false);
  });

  it('narrows the type so a match is a CatalogTemplateId', () => {
    const ids: string[] = ['employment-contract', 'junk'];
    const known = ids.filter((id) => isCatalogTemplateId(id));
    expect(known).toEqual(['employment-contract']);
  });
});

describe('personalFileCategory', () => {
  it('files contracts under contract', () => {
    expect(personalFileCategory('employment-contract')).toBe('contract');
    expect(personalFileCategory('nda')).toBe('contract');
    expect(personalFileCategory('material-responsibility')).toBe('contract');
    expect(personalFileCategory('offer-letter')).toBe('contract');
  });

  it('files certificates under certificate', () => {
    expect(personalFileCategory('employment-verification')).toBe('certificate');
    expect(personalFileCategory('salary-certificate')).toBe('certificate');
  });

  it('files everything else under other', () => {
    expect(personalFileCategory('biometric-consent')).toBe('other');
    expect(personalFileCategory('job-description')).toBe('other');
    expect(personalFileCategory('unknown-id')).toBe('other');
  });
});

describe('personalFileCategoryForBlueprint', () => {
  it('files hiring blueprints under contract', () => {
    expect(personalFileCategoryForBlueprint('hiring')).toBe('contract');
  });

  it('files certificate blueprints under certificate', () => {
    expect(personalFileCategoryForBlueprint('certificate')).toBe('certificate');
  });

  it('files everything else under other', () => {
    expect(personalFileCategoryForBlueprint('consent')).toBe('other');
    expect(personalFileCategoryForBlueprint('order')).toBe('other');
    expect(personalFileCategoryForBlueprint('other')).toBe('other');
  });
});
