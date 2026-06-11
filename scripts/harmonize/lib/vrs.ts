// Minimal GA4GH VRS 2.0 computed-identifier support for SNVs.
// SNVs need no sequence normalization, so VRS ids are deterministic from
// (refgetAccession, interbase start/end, alt) with no SeqRepo dependency.

import { createHash } from 'node:crypto';
import { REFGET_SQ } from './chroms';

function sha512t24u(input: string): string {
	const full = createHash('sha512').update(input, 'utf8').digest();
	return full.subarray(0, 24).toString('base64url');
}

// Canonical JSON: recursively key-sorted, compact separators (JSON.stringify default).
function canon(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return '[' + value.map(canon).join(',') + ']';
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return '{' + keys.map((k) => JSON.stringify(k) + ':' + canon(obj[k])).join(',') + '}';
}

export interface Snv {
	code: number; // chrom code 1..25
	pos: number; // 1-based VCF position
	ref: string;
	alt: string;
}

export interface VrsResult {
	vrsId: string; // ga4gh:VA.<digest>
	digest: string; // 32-char allele digest
	allele: Record<string, unknown>; // full VRS Allele object
}

// VRS 2.0 digest serialization:
//  SequenceLocation -> {end, sequenceReference: <refget SQ>, start, type}
//  Allele -> {location: <SL digest>, state: {sequence, type}, type}
export function snvToVrs(v: Snv): VrsResult | null {
	const sq = REFGET_SQ[v.code];
	if (!sq) return null;
	const start = v.pos - 1; // interbase
	const end = v.pos; // SNV: single base

	const locSer = canon({
		end,
		sequenceReference: { refgetAccession: sq, type: 'SequenceReference' },
		start,
		type: 'SequenceLocation'
	});
	const locDigest = sha512t24u(locSer);

	const alleleSer = canon({
		location: locDigest,
		state: { sequence: v.alt, type: 'LiteralSequenceExpression' },
		type: 'Allele'
	});
	const digest = sha512t24u(alleleSer);

	const allele = {
		id: `ga4gh:VA.${digest}`,
		type: 'Allele',
		digest,
		location: {
			id: `ga4gh:SL.${locDigest}`,
			type: 'SequenceLocation',
			digest: locDigest,
			sequenceReference: { type: 'SequenceReference', refgetAccession: sq },
			start,
			end
		},
		state: { type: 'LiteralSequenceExpression', sequence: v.alt }
	};

	return { vrsId: `ga4gh:VA.${digest}`, digest, allele };
}
