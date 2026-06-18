import { json, error } from '@sveltejs/kit';
import { buildVrsAllele } from '$lib/server/db/queries';
import { CODE_CHROM } from '$lib/server/db/chroms';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const db = locals.db;
	if (!db) throw error(500, 'PostgreSQL connection unavailable');
	const digest = params.digest.replace(/^ga4gh:VA\./, '');
	const v = await db
		.prepare('SELECT id, chrom, pos, ref, alt, rsid, vrs_digest FROM variants WHERE vrs_digest=? LIMIT 1')
		.bind(digest)
		.first<any>();
	if (!v) throw error(404, 'VRS allele not found');
	const allele = buildVrsAllele({ chrom: v.chrom, pos: v.pos, alt: v.alt, vrsDigest: v.vrs_digest });
	return json({
		...allele,
		expression: { hgvs: `${CODE_CHROM[v.chrom]}:${v.pos}${v.ref}>${v.alt}`, gnomad: `${CODE_CHROM[v.chrom]}-${v.pos}-${v.ref}-${v.alt}` },
		rsid: v.rsid ? `rs${v.rsid}` : null
	});
};
