export const ALLELE_COUNT_REPORTING_THRESHOLD = 5;

export function alleleFrequencyUpperBound(an: number | null | undefined, threshold = ALLELE_COUNT_REPORTING_THRESHOLD): number | null {
	if (an == null || an <= 0) return null;
	return Math.min(1, threshold / an);
}

export function isAlleleCountMasked(ac: number | null | undefined, threshold = ALLELE_COUNT_REPORTING_THRESHOLD): boolean {
	return ac == null || ac < threshold;
}

export function isGenotypeMasked(
	nHetero: number | null | undefined,
	nHomo: number | null | undefined,
	nHomoRef: number | null | undefined,
	threshold = ALLELE_COUNT_REPORTING_THRESHOLD
): boolean {
	if (nHetero == null || nHomo == null || nHomoRef == null) return false;
	return nHetero < threshold || nHomo < threshold || nHomoRef < threshold;
}

export function publicFrequencyValues(f: {
	ac: number;
	an: number;
	af: number;
	n_homo?: number | null;
	n_hetero?: number | null;
	n_homo_ref?: number | null;
}) {
	const acMasked = isAlleleCountMasked(f.ac);
	const genotypeMasked = isGenotypeMasked(f.n_hetero, f.n_homo, f.n_homo_ref);
	return {
		acMasked,
		publicAc: acMasked ? null : f.ac,
		publicAf: acMasked ? null : f.af,
		acUpperBound: acMasked ? ALLELE_COUNT_REPORTING_THRESHOLD : null,
		afUpperBound: acMasked ? alleleFrequencyUpperBound(f.an) : null,
		genotypeMasked,
		publicNHetero: genotypeMasked ? null : (f.n_hetero ?? null),
		publicNHomo: genotypeMasked ? null : (f.n_homo ?? null),
		publicNHomoRef: genotypeMasked ? null : (f.n_homo_ref ?? null)
	};
}

export function publicFrequencySql(threshold = ALLELE_COUNT_REPORTING_THRESHOLD): string {
	return `
		ac_masked = CASE WHEN ac < ${threshold} THEN 1 ELSE 0 END,
		public_ac = CASE WHEN ac >= ${threshold} THEN ac ELSE NULL END,
		public_af = CASE WHEN ac >= ${threshold} THEN af ELSE NULL END,
		ac_upper_bound = CASE WHEN ac < ${threshold} THEN ${threshold} ELSE NULL END,
		af_upper_bound = CASE WHEN ac < ${threshold} AND an > 0 THEN MIN(1.0, ${threshold}.0 / an) ELSE NULL END,
		genotype_masked = CASE WHEN n_hetero IS NOT NULL AND n_homo IS NOT NULL AND n_homo_ref IS NOT NULL AND (n_hetero < ${threshold} OR n_homo < ${threshold} OR n_homo_ref < ${threshold}) THEN 1 ELSE 0 END,
		public_n_hetero = CASE WHEN n_hetero IS NOT NULL AND n_homo IS NOT NULL AND n_homo_ref IS NOT NULL AND (n_hetero < ${threshold} OR n_homo < ${threshold} OR n_homo_ref < ${threshold}) THEN NULL ELSE n_hetero END,
		public_n_homo = CASE WHEN n_hetero IS NOT NULL AND n_homo IS NOT NULL AND n_homo_ref IS NOT NULL AND (n_hetero < ${threshold} OR n_homo < ${threshold} OR n_homo_ref < ${threshold}) THEN NULL ELSE n_homo END,
		public_n_homo_ref = CASE WHEN n_hetero IS NOT NULL AND n_homo IS NOT NULL AND n_homo_ref IS NOT NULL AND (n_hetero < ${threshold} OR n_homo < ${threshold} OR n_homo_ref < ${threshold}) THEN NULL ELSE n_homo_ref END
	`;
}
