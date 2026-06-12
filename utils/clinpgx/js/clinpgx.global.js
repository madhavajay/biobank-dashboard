(function (global) {
	'use strict';

	const DEFAULT_ENDPOINT = 'https://api.clinpgx.org/v1';
	const DEFAULT_SITE = 'https://www.clinpgx.org';

	class ClinpgxError extends Error {
		constructor(message, details) {
			super(message);
			this.name = 'ClinpgxError';
			this.details = details;
		}
	}

	class ClinpgxClient {
		constructor(options = {}) {
			this.endpoint = (options.endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, '');
			this.site = (options.site || DEFAULT_SITE).replace(/\/+$/, '');
			this.fetch = options.fetch || global.fetch?.bind(global);
			if (!this.fetch) throw new ClinpgxError('No fetch implementation available');
		}

		normalizeVariant(input) {
			const raw = String(input ?? '').trim();
			if (!raw) throw new ClinpgxError('Variant query is empty');
			if (/^PA\d+$/i.test(raw)) return { id: raw.toUpperCase(), rsid: null };
			if (/^\d+$/.test(raw)) return { id: null, rsid: `rs${raw}` };
			if (/^rs\d+$/i.test(raw)) return { id: null, rsid: raw.toLowerCase() };
			throw new ClinpgxError(`Could not parse ClinPGx variant identifier: ${raw}`);
		}

		normalizeGene(input) {
			const symbol = String(input ?? '').trim();
			if (!symbol) throw new ClinpgxError('Gene query is empty');
			return symbol.toUpperCase();
		}

		async request(path, params = {}) {
			const url = new URL(`${this.endpoint}/${path.replace(/^\/+/, '')}`);
			for (const [key, value] of Object.entries(params)) {
				if (value != null && value !== '') url.searchParams.set(key, String(value));
			}
			const res = await this.fetch(url);
			const json = await res.json().catch(() => null);
			if (!res.ok || json?.status === 'fail') {
				const errors = json?.data?.errors ?? json?.errors ?? [];
				const message = errors.map((e) => e.message).filter(Boolean).join('; ') || `ClinPGx request failed with HTTP ${res.status}`;
				throw new ClinpgxError(message, json);
			}
			return json?.data;
		}

		async requestOrEmptyArray(path, params = {}) {
			try {
				const data = await this.request(path, params);
				return Array.isArray(data) ? data : data ? [data] : [];
			} catch (err) {
				if (err instanceof ClinpgxError && /No results matching criteria/i.test(err.message)) return [];
				throw err;
			}
		}

		async queryVariant(input, options = {}) {
			const parsed = this.normalizeVariant(input);
			const view = options.view || 'max';
			const data = parsed.id
				? await this.request(`data/variant/${parsed.id}`, { view })
				: (await this.requestOrEmptyArray('data/variant', { name: parsed.rsid, view }))[0];
			return data ? normalizeVariantRow(data, this.site) : null;
		}

		async queryGene(input, options = {}) {
			const symbol = this.normalizeGene(input);
			const view = options.view || 'base';
			const data = (await this.requestOrEmptyArray('data/gene', { symbol, view }))[0];
			return data ? normalizeGeneRow(data, this.site) : null;
		}

		async queryClinicalAnnotationsByVariant(input, options = {}) {
			const parsed = this.normalizeVariant(input);
			const rsid = parsed.rsid || (await this.queryVariant(parsed.id, { view: 'base' }))?.symbol;
			if (!rsid) return [];
			const rows = await this.requestOrEmptyArray('data/clinicalAnnotation', {
				'location.fingerprint': rsid,
				view: options.view || 'base'
			});
			return normalizeAnnotationRows(rows, this.site, options.maxRows);
		}

		async queryClinicalAnnotationsByGene(input, options = {}) {
			const symbol = this.normalizeGene(input);
			const rows = await this.requestOrEmptyArray('data/clinicalAnnotation', {
				'location.genes.symbol': symbol,
				view: options.view || 'base'
			});
			return normalizeAnnotationRows(rows, this.site, options.maxRows);
		}

		async queryVariantPage(input, options = {}) {
			const variant = await this.queryVariant(input, { view: options.variantView || 'max' });
			const annotations = variant
				? await this.queryClinicalAnnotationsByVariant(variant.rsid || variant.id, {
						view: options.annotationView || 'base',
						maxRows: options.maxAnnotations
					})
				: [];
			return { type: 'variant', query: String(input ?? '').trim(), variant, annotations, url: variant?.url || null };
		}

		async queryGenePage(input, options = {}) {
			const gene = await this.queryGene(input, { view: options.geneView || 'base' });
			const annotations = gene
				? await this.queryClinicalAnnotationsByGene(gene.symbol, {
						view: options.annotationView || 'base',
						maxRows: options.maxAnnotations
					})
				: [];
			return { type: 'gene', query: String(input ?? '').trim(), gene, annotations, url: gene?.url || null };
		}
	}

	function normalizeVariantRow(raw, site = DEFAULT_SITE) {
		const locations = (raw.locations || []).map(normalizeLocation);
		const relatedGenes = (raw.relatedGenes || []).map((g) => ({ id: g.id, symbol: g.symbol, name: g.name || '' }));
		const crossReferences = (raw.crossReferences || []).map((x) => ({
			resource: x.resource,
			resourceId: x.resourceId,
			name: x.name || '',
			url: x._url || ''
		}));
		return {
			id: raw.id,
			symbol: raw.symbol || raw.name || '',
			rsid: raw.symbol && /^rs\d+$/i.test(raw.symbol) ? raw.symbol : '',
			name: raw.name || raw.symbol || '',
			type: raw.type || '',
			changeClassification: raw.changeClassification || '',
			clinicalSignificance: raw.clinicalSignificance || '',
			ampTier: raw.ampTier || '',
			rare: Boolean(raw.rare),
			raritySource: raw.raritySource || '',
			obsolete: Boolean(raw.obsolete),
			lastUpdatedFromDbsnp: raw.lastUpdatedFromDbsnp || '',
			locations,
			grch38Location: locations.find((l) => l.assembly === 'GRCh38') || null,
			relatedGenes,
			crossReferences,
			url: raw.id ? `${site}/variant/${raw.id}` : '',
			raw
		};
	}

	function normalizeGeneRow(raw, site = DEFAULT_SITE) {
		return {
			id: raw.id,
			symbol: raw.symbol || '',
			name: raw.name || '',
			alleleType: raw.alleleType || '',
			buildVersion: raw.buildVersion || '',
			chromosome: raw.chr?.name || '',
			start38: raw.chrStartPosB38 ?? null,
			stop38: raw.chrStopPosB38 ?? null,
			start37: raw.chrStartPosB37 ?? null,
			stop37: raw.chrStopPosB37 ?? null,
			strand: raw.strand || '',
			cpicGene: Boolean(raw.cpicGene),
			pharmVarGene: Boolean(raw.pharmVarGene),
			vipTier: raw.vipTier || '',
			url: raw.id ? `${site}/gene/${raw.id}` : '',
			raw
		};
	}

	function normalizeClinicalAnnotationRow(raw, site = DEFAULT_SITE) {
		return {
			id: raw.id,
			accessionId: raw.accessionId || '',
			name: raw.name || '',
			level: raw.levelOfEvidence?.term || '',
			types: raw.types || [],
			score: raw.score ?? null,
			pediatric: Boolean(raw.pediatric),
			location: {
				displayName: raw.location?.displayName || '',
				rsid: raw.location?.rsid || '',
				type: raw.location?.type || '',
				chromosomeName: raw.location?.chromosomeName || '',
				position: raw.location?.gpPosition ?? null,
				genes: (raw.location?.genes || []).map((g) => ({ id: g.id, symbol: g.symbol, name: g.name || '' }))
			},
			chemicals: (raw.relatedChemicals || []).map((c) => ({ id: c.id, name: c.name || '' })),
			diseases: (raw.relatedDiseases || []).map((d) => ({ id: d.id, name: d.name || '' })),
			guidelines: (raw.relatedGuidelines || []).map((g) => ({ id: g.id, name: g.name || '' })),
			labels: (raw.relatedLabels || []).map((l) => ({ id: l.id, name: l.name || '' })),
			allelePhenotypes: (raw.allelePhenotypes || []).map((p) => ({
				allele: p.allele || '',
				phenotype: p.phenotype || '',
				limitedEvidence: Boolean(p.limitedEvidence)
			})),
			url: raw.accessionId ? `${site}/clinicalAnnotation/${raw.accessionId}` : '',
			raw
		};
	}

	function normalizeAnnotationRows(rows, site, maxRows) {
		const normalized = rows.map((row) => normalizeClinicalAnnotationRow(row, site));
		return Number.isFinite(maxRows) ? normalized.slice(0, Math.max(0, Number(maxRows))) : normalized;
	}

	function normalizeLocation(location) {
		return {
			id: location.id,
			assembly: location.assembly || '',
			begin: location.begin ?? null,
			end: location.end ?? null,
			referenceAllele: location.referenceAllele || '',
			variantAlleles: location.variantAlleles || [],
			variantHgvs: location.variantHgvs || [],
			referenceHgvs: location.referenceHgvs || '',
			sequenceName: location.sequence?.name || '',
			sequenceResourceId: location.sequence?.resourceId || '',
			source: location.source || '',
			type: location.type || ''
		};
	}

	global.Clinpgx = {
		ClinpgxClient,
		ClinpgxError,
		normalizeVariantRow,
		normalizeGeneRow,
		normalizeClinicalAnnotationRow
	};
})(globalThis);
