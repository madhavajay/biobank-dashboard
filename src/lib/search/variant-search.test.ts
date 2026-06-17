import { describe, expect, test } from 'bun:test';
import {
	isIncompleteVariantSearchQuery,
	normalizeVariantSearchInput,
	parseVariantSearchTerm,
	rowMatchesRsidToken,
	rowMatchesLocusToken,
	rowMatchesGeneToken,
	rowMatchesSearchToken,
	looksLikeGeneSymbol
} from './variant-search';

describe('normalizeVariantSearchInput', () => {
	test('collapses chr + space + position', () => {
		expect(normalizeVariantSearchInput('chr1 63000000')).toBe('chr1:63000000');
		expect(normalizeVariantSearchInput('1 1000000')).toBe('1:1000000');
	});

	test('strips thousands separators', () => {
		expect(normalizeVariantSearchInput('chr1:44,903,787')).toBe('chr1:44903787');
	});

	test('rsID shorthand without s', () => {
		expect(normalizeVariantSearchInput('r1050828')).toBe('rs1050828');
		expect(normalizeVariantSearchInput('R105')).toBe('rs105');
	});
});

describe('isIncompleteVariantSearchQuery', () => {
	test('defers ambiguous prefixes', () => {
		expect(isIncompleteVariantSearchQuery('chr')).toBe(true);
		expect(isIncompleteVariantSearchQuery('chr1:')).toBe(true);
		expect(isIncompleteVariantSearchQuery('1:')).toBe(true);
	});

	test('allows single-letter and short prefix searches', () => {
		expect(isIncompleteVariantSearchQuery('rs')).toBe(false);
		expect(isIncompleteVariantSearchQuery('rs1')).toBe(false);
		expect(isIncompleteVariantSearchQuery('L')).toBe(false);
		expect(isIncompleteVariantSearchQuery('l')).toBe(false);
		expect(isIncompleteVariantSearchQuery('5')).toBe(false);
		expect(isIncompleteVariantSearchQuery('chr1-63')).toBe(false);
		expect(isIncompleteVariantSearchQuery('BRCA1')).toBe(false);
		expect(normalizeVariantSearchInput('brca1')).toBe('brca1');
		expect(isIncompleteVariantSearchQuery('brca1')).toBe(false);
		expect(isIncompleteVariantSearchQuery('rs1050828')).toBe(false);
		expect(isIncompleteVariantSearchQuery('r1050828')).toBe(false);
	});
});

describe('parseVariantSearchTerm', () => {
	test('rsID prefix and exact', () => {
		expect(parseVariantSearchTerm('rs12345678')?.sql).toBe('v.rsid=?');
		expect(parseVariantSearchTerm('rs105')?.sql).toBe('CAST(v.rsid AS TEXT) LIKE ?');
		expect(parseVariantSearchTerm('rs')?.sql).toBe('v.rsid IS NOT NULL');
		expect(parseVariantSearchTerm('RS12345678')?.sql).toBe('v.rsid=?');
		expect(parseVariantSearchTerm('r1050828')?.sql).toBe('CAST(v.rsid AS TEXT) LIKE ?');
	});

	test('locus forms', () => {
		expect(parseVariantSearchTerm('chr1-63')?.sql).toContain('LIKE');
		expect(parseVariantSearchTerm('chr7')?.sql).toContain('v.chrom=?');
		expect(parseVariantSearchTerm('1:1000000-1100000')?.sql).toContain('pos>=');
	});

	test('short numeric matches chromosome, id, or rsID prefix', () => {
		const sql = parseVariantSearchTerm('5')?.sql ?? '';
		expect(sql).toContain('v.chrom=?');
		expect(sql).toContain('CAST(v.rsid AS TEXT) LIKE ?');
	});

	test('HGVS with gene prefix', () => {
		expect(parseVariantSearchTerm('BRCA1:p.Arg124His')?.sql).toBe('v.hgvs_consequence=?');
		expect(parseVariantSearchTerm('p.Arg124His')?.sql).toBe('v.hgvs_consequence=?');
	});

	test('does not treat rs as gene', () => {
		expect(looksLikeGeneSymbol('rs')).toBe(false);
		expect(looksLikeGeneSymbol('rs1')).toBe(false);
		expect(looksLikeGeneSymbol('L')).toBe(true);
		expect(looksLikeGeneSymbol('brca1')).toBe(true);
	});
});

describe('rowMatchesRsidToken', () => {
	const row = { id: 42, rsid: 1050828 };

	test('prefix and exact rsID', () => {
		expect(rowMatchesRsidToken(row, 'rs1050828')).toBe(true);
		expect(rowMatchesRsidToken(row, 'rs105')).toBe(true);
		expect(rowMatchesRsidToken(row, 'rs1')).toBe(true);
		expect(rowMatchesRsidToken(row, 'rs999')).toBe(false);
		expect(rowMatchesRsidToken(row, 'r1050828')).toBe(true);
	});
});

describe('rowMatchesLocusToken', () => {
	const row = { chrom: 1, pos: 63000000 };

	test('position prefix on chromosome', () => {
		expect(rowMatchesLocusToken(row, 'chr1-63')).toBe(true);
		expect(rowMatchesLocusToken(row, 'chr1:63000000')).toBe(true);
	});
});

describe('rowMatchesGeneToken', () => {
	const row = {
		genes: [{ symbol: 'BRCA1', ensemblId: 'ENSG00000012048' }]
	};

	test('gene prefix and single-letter match', () => {
		expect(rowMatchesGeneToken(row, 'BRCA')).toBe(true);
		expect(rowMatchesGeneToken(row, 'B')).toBe(true);
		expect(rowMatchesGeneToken(row, 'b')).toBe(true);
		expect(rowMatchesGeneToken(row, 'brca1')).toBe(true);
		expect(rowMatchesGeneToken(row, 'rs')).toBe(false);
	});
});

describe('rowMatchesSearchToken', () => {
	const row = {
		id: 42,
		chrom: 17,
		chromName: '17',
		pos: 43078520,
		ref: 'G',
		alt: 'A',
		rsid: 1050828,
		vrsDigest: 'abc123',
		hgvsConsequence: 'p.Arg124His',
		genes: [{ symbol: 'BRCA1', ensemblId: 'ENSG00000012048' }]
	};

	test('case-insensitive fuzzy matching', () => {
		expect(rowMatchesSearchToken(row, 'brca')).toBe(true);
		expect(rowMatchesSearchToken(row, 'arg124')).toBe(true);
		expect(rowMatchesSearchToken(row, '430785')).toBe(true);
	});
});
