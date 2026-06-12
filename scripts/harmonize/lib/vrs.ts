// Minimal GA4GH VRS 2.0 computed-identifier support for SNVs.
// SNVs need no sequence normalization, so VRS ids are deterministic from
// (refgetAccession, interbase start/end, alt) with no SeqRepo dependency.

import { createHash } from 'node:crypto';
import { REFGET_SQ } from './chroms';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function sha512t24u(input: string): string {
	const full = createHash('sha512').update(input, 'utf8').digest();
	return full.subarray(0, 24).toString('base64url');
}

// RFC 8785 / JCS canonicalization for JSON-compatible values.
// VRS digest input should be pure JSON: no undefined, non-finite numbers, symbols, etc.
export function jcsCanonicalize(value: JsonValue): string {
	if (value === null) return 'null';
	if (typeof value === 'string') return JSON.stringify(value);
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new TypeError('JCS cannot canonicalize non-finite numbers');
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) return '[' + value.map(jcsCanonicalize).join(',') + ']';
	if (typeof value !== 'object') throw new TypeError(`JCS cannot canonicalize ${typeof value}`);
	const obj = value as Record<string, JsonValue>;
	const keys = Object.keys(obj).sort();
	return '{' + keys.map((k) => JSON.stringify(k) + ':' + jcsCanonicalize(obj[k])).join(',') + '}';
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

	const locSer = jcsCanonicalize({
		end,
		sequenceReference: { refgetAccession: sq, type: 'SequenceReference' },
		start,
		type: 'SequenceLocation'
	});
	const locDigest = sha512t24u(locSer);

	const alleleSer = jcsCanonicalize({
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
