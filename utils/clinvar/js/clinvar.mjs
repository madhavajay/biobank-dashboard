// @ts-nocheck
const DEFAULT_ENDPOINT = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const DEFAULT_SITE = 'https://www.ncbi.nlm.nih.gov/clinvar';

export class ClinvarError extends Error {
	constructor(message, details) {
		super(message);
		this.name = 'ClinvarError';
		this.details = details;
	}
}

export class ClinvarClient {
	constructor(options = {}) {
		this.endpoint = (options.endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, '');
		this.site = (options.site || DEFAULT_SITE).replace(/\/+$/, '');
		this.tool = options.tool || 'biobank-dashboard';
		this.email = options.email || '';
		this.fetch = options.fetch || globalThis.fetch?.bind(globalThis);
		if (!this.fetch) throw new ClinvarError('No fetch implementation available');
	}

	normalizeVariant(input) {
		if (typeof input === 'object' && input !== null) {
			const { chrom, pos, ref, alt, rsid } = input;
			return {
				chrom: chrom == null ? '' : String(chrom).replace(/^chr/i, ''),
				pos: pos == null ? null : Number(pos),
				ref: ref || '',
				alt: alt || '',
				rsid: normalizeRsid(rsid)
			};
		}
		const raw = String(input ?? '').trim();
		if (!raw) throw new ClinvarError('ClinVar query is empty');
		if (/^\d+$/.test(raw) || /^rs\d+$/i.test(raw)) return { chrom: '', pos: null, ref: '', alt: '', rsid: normalizeRsid(raw) };
		const normalized = raw.replace(/^chr/i, '').replace(/:/g, '-').replace(/>/g, '-').replace(/\s+/g, '');
		const parts = normalized.split('-');
		if (parts.length >= 2 && parts[0] && /^\d+$/.test(parts[1])) {
			return { chrom: parts[0], pos: Number(parts[1]), ref: parts[2] || '', alt: parts[3] || '', rsid: '' };
		}
		throw new ClinvarError(`Could not parse ClinVar variant identifier: ${raw}`);
	}

	async request(path, params = {}) {
		const url = new URL(`${this.endpoint}/${path.replace(/^\/+/, '')}`);
		for (const [key, value] of Object.entries({
			retmode: 'json',
			tool: this.tool,
			email: this.email,
			...params
		})) {
			if (value != null && value !== '') url.searchParams.set(key, String(value));
		}
		const res = await this.fetch(url);
		const json = await res.json().catch(() => null);
		if (!res.ok) throw new ClinvarError(`ClinVar request failed with HTTP ${res.status}`, json);
		if (json?.error) throw new ClinvarError(json.error, json);
		return json;
	}

	async search(input, options = {}) {
		const parsed = this.normalizeVariant(input);
		const terms = [];
		if (parsed.rsid) terms.push(`${parsed.rsid}[RS]`);
		if (parsed.chrom && parsed.pos) terms.push(`${parsed.chrom}[chr] AND ${parsed.pos}:${parsed.pos}[base position]`);
		if (!terms.length) throw new ClinvarError('ClinVar query must include an rsID or genomic coordinate');

		const ids = [];
		const seen = new Set();
		for (const term of terms) {
			const json = await this.request('esearch.fcgi', {
				db: 'clinvar',
				term,
				retmax: options.retmax ?? 20
			});
			for (const id of json?.esearchresult?.idlist || []) {
				if (seen.has(id)) continue;
				seen.add(id);
				ids.push(id);
			}
		}
		return ids;
	}

	async summary(ids) {
		const idList = [...new Set((ids || []).map(String).filter(Boolean))];
		if (!idList.length) return [];
		const json = await this.request('esummary.fcgi', {
			db: 'clinvar',
			id: idList.join(',')
		});
		const result = json?.result || {};
		const order = result.uids || idList;
		return order.map((id) => result[id]).filter(Boolean);
	}

	async queryVariant(input, options = {}) {
		const parsed = this.normalizeVariant(input);
		const ids = await this.search(parsed, options);
		const rows = await this.summary(ids);
		return normalizeSummaryRows(rows, {
			site: this.site,
			parsed,
			maxRows: options.maxRows ?? options.retmax ?? 20
		});
	}
}

export function normalizeSummaryRows(rows, options = {}) {
	const parsed = options.parsed || {};
	const normalized = rows.map((row) => normalizeSummaryRow(row, options.site || DEFAULT_SITE, parsed));
	const filtered = parsed.chrom || parsed.pos || parsed.ref || parsed.alt ? normalized.filter((row) => row.matchesQuery || row.rsidMatches) : normalized;
	const sorted = filtered.sort((a, b) => Number(b.exactScore || 0) - Number(a.exactScore || 0));
	return Number.isFinite(options.maxRows) ? sorted.slice(0, Math.max(0, Number(options.maxRows))) : sorted;
}

export function normalizeSummaryRow(raw, site = DEFAULT_SITE, parsed = {}) {
	const variationSet = raw.variation_set || [];
	const bestMeasure = pickMeasure(variationSet, parsed);
	const loc = pickLocation(bestMeasure?.variation_loc || [], parsed);
	const xrefs = bestMeasure?.variation_xrefs || [];
	const rsid = xrefs.find((x) => x.db_source === 'dbSNP')?.db_id || '';
	const clinvarIds = xrefs.filter((x) => x.db_source === 'ClinVar').map((x) => x.db_id);
	const canonical = bestMeasure?.canonical_spdi || '';
	const allele = alleleFromSpdi(canonical) || alleleFromParsed(parsed);
	const classification =
		raw.germline_classification?.description ||
		raw.clinical_impact_classification?.description ||
		raw.oncogenicity_classification?.description ||
		'';
	const exactScore = exactMatchScore({ raw, measure: bestMeasure, loc, rsid }, parsed);
	return {
		id: raw.uid || raw.accession?.replace(/^VCV0*/, '') || clinvarIds[0] || '',
		accession: raw.accession || '',
		accessionVersion: raw.accession_version || '',
		title: raw.title || bestMeasure?.variation_name || '',
		gene: raw.gene_sort || (raw.genes || []).map((gene) => gene.symbol).filter(Boolean).join(', '),
		location: loc ? `${loc.chr}:${Number(loc.display_start || loc.start).toLocaleString()}` : raw.chr_sort || '',
		allele,
		significance: classification,
		reviewStatus: raw.germline_classification?.review_status || '',
		rsid: rsid ? `rs${String(rsid).replace(/^rs/i, '')}` : '',
		url: raw.uid ? `${site}/variation/${raw.uid}/` : raw.accession ? `${site}/variation/${raw.accession.replace(/^VCV0*/, '')}/` : '',
		matchesQuery: exactScore > 0,
		rsidMatches: parsed.rsid ? xrefs.some((x) => x.db_source === 'dbSNP' && `rs${x.db_id}`.toLowerCase() === parsed.rsid.toLowerCase()) : false,
		exactScore,
		raw
	};
}

function pickMeasure(measures, parsed) {
	if (!measures.length) return null;
	return (
		measures.find((measure) => measureMatches(measure, parsed, true)) ||
		measures.find((measure) => measureMatches(measure, parsed, false)) ||
		measures[0]
	);
}

function measureMatches(measure, parsed, requireAllele) {
	const loc = pickLocation(measure.variation_loc || [], parsed);
	if (!loc) return false;
	const canonicalAllele = alleleFromSpdi(measure.canonical_spdi || '');
	const alleleMatch = !requireAllele || !parsed.ref || !parsed.alt || canonicalAllele === alleleFromParsed(parsed);
	const rsidMatch = !parsed.rsid || (measure.variation_xrefs || []).some((x) => x.db_source === 'dbSNP' && `rs${x.db_id}`.toLowerCase() === parsed.rsid.toLowerCase());
	return alleleMatch && rsidMatch;
}

function pickLocation(locations, parsed) {
	const current = locations.filter((loc) => loc.assembly_name === 'GRCh38' || loc.status === 'current');
	if (!parsed.chrom || !parsed.pos) return current[0] || locations[0] || null;
	return (
		current.find((loc) => String(loc.chr).replace(/^chr/i, '') === String(parsed.chrom).replace(/^chr/i, '') && Number(loc.display_start || loc.start) === Number(parsed.pos)) ||
		locations.find((loc) => String(loc.chr).replace(/^chr/i, '') === String(parsed.chrom).replace(/^chr/i, '') && Number(loc.display_start || loc.start) === Number(parsed.pos)) ||
		null
	);
}

function exactMatchScore({ raw, measure, loc, rsid }, parsed) {
	let score = 0;
	if (parsed.rsid && rsid && parsed.rsid.toLowerCase() === `rs${String(rsid).replace(/^rs/i, '')}`.toLowerCase()) score += 2;
	if (parsed.chrom && loc && String(loc.chr).replace(/^chr/i, '') === String(parsed.chrom).replace(/^chr/i, '')) score += 1;
	if (parsed.pos && loc && Number(loc.display_start || loc.start) === Number(parsed.pos)) score += 2;
	if (parsed.ref && parsed.alt && alleleFromSpdi(measure?.canonical_spdi || '') === alleleFromParsed(parsed)) score += 2;
	if (raw.obj_type === 'single nucleotide variant') score += 1;
	return score;
}

function alleleFromSpdi(spdi) {
	const parts = String(spdi || '').split(':');
	if (parts.length < 4) return '';
	return `${parts[2]}>${parts[3]}`;
}

function alleleFromParsed(parsed) {
	return parsed.ref && parsed.alt ? `${parsed.ref}>${parsed.alt}` : '';
}

function normalizeRsid(value) {
	const raw = String(value ?? '').trim();
	if (!raw) return '';
	const digits = raw.replace(/^rs/i, '');
	return /^\d+$/.test(digits) ? `rs${digits}` : raw.toLowerCase();
}

export default {
	ClinvarClient,
	ClinvarError,
	normalizeSummaryRows,
	normalizeSummaryRow
};
