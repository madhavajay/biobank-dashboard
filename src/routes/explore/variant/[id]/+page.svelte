<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { lang, tr } from '$lib/i18n';
	import { publicVariantPathToken } from '$lib/variant-id';
	import { Code } from '@lucide/svelte';
	import { GnomadClient, type GnomadRow } from '../../../../../utils/gnomad/js/gnomad.mjs';
	import { ClinpgxClient, type ClinpgxClinicalAnnotation, type ClinpgxVariant } from '../../../../../utils/clinpgx/js/clinpgx.mjs';
	import { ClinvarClient } from '../../../../../utils/clinvar/js/clinvar.mjs';

	let { data } = $props();

	interface ClinVarTableRow {
		id: string;
		gene: string;
		location: string;
		allele: string;
		significance: string;
		reviewStatus?: string;
		title?: string;
		url?: string;
		raw: unknown;
	}
	interface ClinpgxPageResult {
		variant: ClinpgxVariant | null;
		annotations: ClinpgxClinicalAnnotation[];
		url: string | null;
	}
	interface LookupCacheEnvelope<T> {
		savedAt: number;
		value: T;
	}
	interface PageTenant {
		slug?: string;
		name?: string;
		scope?: string | null;
	}
	interface PageAnalytics {
		hostname?: string;
		siteDomain?: string;
	}
	interface AncestryFrequencyRow {
		source: string;
		label: string;
		detail: string;
		af: number;
		ac: number;
		an: number;
		icon?: string;
		marker?: 'source' | 'closest';
		comparison?: {
			direction: 'up' | 'down';
			baselineAf: number;
			baselineLabel: string;
		};
	}
	interface PopulationFrequencyRow {
		source: string;
		label: string;
		detail: string;
		af: number;
		ac: number;
		an: number;
		nHetero: number | null;
		nHomo: number | null;
		nHomoRef: number | null;
		icon?: string;
		comparison?: {
			direction: 'up' | 'down';
			baselineAf: number;
			baselineLabel: string;
		};
	}
	type PopulationMetricSortCol = 'af' | 'ac' | 'an' | 'nHomo';
	type PopulationSortCol = PopulationMetricSortCol | '';
	type AncestryMetricSortCol = 'af' | 'ac' | 'an';
	type AncestrySortCol = AncestryMetricSortCol | '';
	type ClinvarSortCol = 'id' | 'gene' | 'location' | 'allele' | 'significance' | 'reviewStatus';
	const v = $derived(data.variant);
	const tenantData = $derived((page.data.tenant ?? {}) as PageTenant);
	const analyticsData = $derived((page.data.analytics ?? null) as PageAnalytics | null);
	const title = $derived(`chr${v.chromName}-${v.pos}-${v.ref}-${v.alt}`);
	const plainTitle = $derived(title);
	const geneSymbols = $derived([...new Set(v.genes.map((gene) => gene.symbol))]);
	const geneSummary = $derived(geneSymbols.length ? geneSymbols.join(', ') : 'No overlapping gene');
	const rsidSummary = $derived(v.rsid ? `rs${v.rsid}` : '');
	const dbsnpIconUrl = 'https://cdn.prod.website-files.com/655652030bc38be4c2060cf0/658085aa72ba0dc4455e0b53_dbSNP_Logo.png';
	const variantCacheId = $derived(`${v.chromName}-${v.pos}-${v.ref}-${v.alt}${v.rsid ? `-rs${v.rsid}` : ''}`);
	const gnomadUrl = $derived(`https://gnomad.broadinstitute.org/variant/${v.chromName}-${v.pos}-${v.ref}-${v.alt}?dataset=gnomad_r4`);
	const apiUrl = $derived(`/api/variants/${publicVariantPathToken(v)}${data.forceTenant ? `?tenant=${data.forceTenant}` : ''}`);
	const vrsJson = $derived(data.vrs ? JSON.stringify(data.vrs, null, 2) : '');
	const clinvarSearchTerm = $derived(v.rsid ? `rs${v.rsid}` : `chr${v.chromName}:${v.pos} ${v.ref}>${v.alt}`);
	const clinvarSearchUrl = $derived(`https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(clinvarSearchTerm)}`);
	const clinpgxLevelInfoUrl = 'https://www.clinpgx.org/page/clinAnnLevels';
	const maxAf = $derived(v.frequencies.length ? Math.max(...v.frequencies.map((f) => f.af)) : 0);
	let copiedVrs = $state(false);
	let clinvarRows = $state<ClinVarTableRow[]>([]);
	let clinvarStatus = $state<'idle' | 'loading' | 'loaded' | 'error'>('idle');
	let clinvarError = $state('');
	let gnomadRow = $state<GnomadRow | null>(null);
	let gnomadStatus = $state<'idle' | 'loading' | 'loaded' | 'error'>('idle');
	let gnomadError = $state('');
	let clinpgxPage = $state<ClinpgxPageResult | null>(null);
	let clinpgxStatus = $state<'idle' | 'loading' | 'loaded' | 'error'>('idle');
	let clinpgxError = $state('');
	let populationSortCol = $state<PopulationSortCol>('');
	let populationSortDir = $state<'asc' | 'desc'>('desc');
	let ancestrySortCol = $state<AncestrySortCol>('');
	let ancestrySortDir = $state<'asc' | 'desc'>('desc');
	let clinvarSortCol = $state<ClinvarSortCol>('significance');
	let clinvarSortDir = $state<'asc' | 'desc'>('desc');
	let disabledClinvarSignificance = $state<string[]>([]);
	let disabledClinvarReviewStatus = $state<string[]>([]);
	let disabledClinpgxLevels = $state<string[]>([]);
	const gnomadPopulations = $derived(gnomadRow?.populations ?? []);
	const clinpgxRows = $derived(clinpgxPage?.annotations ?? []);
	const clinpgxVariant = $derived(clinpgxPage?.variant ?? null);
	const clinpgxLocation = $derived(clinpgxVariant?.grch38Location ?? null);
	const gnomadAncestryPopulationIds = new Set(['afr', 'ami', 'amr', 'asj', 'eas', 'fin', 'mid', 'nfe', 'sas']);
	const externalLookupCachePrefix = 'biobank-dashboard:variant-external:v3';
	const externalLookupCacheTtlMs = 1000 * 60 * 60 * 24 * 7;
	const externalLookupStaleTtlMs = 1000 * 60 * 60 * 24 * 90;
	const primaryFrequency = $derived(v.frequencies[0] ?? null);

	const fmtAf = (af: number) => (af >= 0.0001 || af === 0 ? af.toFixed(6) : af.toExponential(2));
	const fmt = (n: number | null | undefined) => (n == null ? '-' : n.toLocaleString());
	const joinNames = (items: { name: string }[]) => (items.length ? items.map((item) => item.name).join(', ') : '-');
	const truncateText = (value: string, length = 180) => (value.length > length ? `${value.slice(0, length - 1)}...` : value);
	const normalizeComparator = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
	const titleCaseWords = (value: string) =>
		value.replace(/\b([a-z])([a-z]*)\b/gi, (_match, first: string, rest: string) => `${first.toUpperCase()}${rest.toLowerCase()}`);
	const clinvarSignificanceParts = (value: string) => [
		...new Set(
			value
				.split(/[\/,;|]+/)
				.map((part) => part.trim())
				.filter(Boolean)
		)
	];
	const clinvarDisplaySignificanceParts = (value: string) => {
		const parts = clinvarSignificanceParts(value);
		return parts.length ? parts : ['Unspecified'];
	};
	const clinvarDisplayReviewStatus = (value: string | undefined) => value?.trim() || 'Unspecified';
	const clinvarReviewStatusParts = (value: string | undefined) => [clinvarDisplayReviewStatus(value)];
	const clinvarReviewStatusLabel = (value: string) => titleCaseWords(value);
	const clinvarReviewStatusClass = (value: string) => {
		const text = value.toLowerCase();
		if (text.includes('practice guideline') || text.includes('expert panel')) {
			return 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200';
		}
		if (text.includes('multiple submitters') && text.includes('no conflicts')) {
			return 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/70 dark:bg-green-950/40 dark:text-green-300';
		}
		if (text.includes('reviewed by professional society')) {
			return 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/70 dark:bg-teal-950/40 dark:text-teal-300';
		}
		if (text.includes('criteria provided') && text.includes('single submitter')) {
			return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-300';
		}
		if (text.includes('conflict')) {
			return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300';
		}
		if (text.includes('no assertion') || text.includes('no criteria') || text.includes('not provided') || text.includes('unspecified')) {
			return 'border-border bg-muted/50 text-muted-foreground';
		}
		return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300';
	};
	const clinpgxDisplayLevel = (value: string | undefined) => value?.trim().toUpperCase() || 'Unspecified';
	const clinpgxLevelColor = (value: string) => {
		const level = clinpgxDisplayLevel(value);
		if (level.startsWith('1')) return '#0abc72';
		if (level.startsWith('2')) return '#2a74df';
		if (level.startsWith('3')) return '#ffc107';
		if (level.startsWith('4')) return '#c53b3b';
		return '#64748b';
	};
	const clinpgxLevelStyle = (value: string) => {
		const color = clinpgxLevelColor(value);
		const textColor = color === '#ffc107' ? '#1f2937' : '#ffffff';
		return `background-color:${color};border-color:${color};color:${textColor}`;
	};
	const clinvarSignificanceRank = (value: string) => {
		const text = value.toLowerCase();
		if (text.includes('pathogenic')) return text.includes('likely') ? 4 : 5;
		if (text.includes('risk allele')) return 3;
		if (text.includes('uncertain') || text.includes('conflicting') || text.includes('vus')) return 2;
		if (text.includes('benign') || text.includes('protective')) return 1;
		return 0;
	};
	const clinvarSignificanceClass = (value: string) => {
		const text = value.toLowerCase();
		if (text.includes('pathogenic')) {
			return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300';
		}
		if (text.includes('risk allele')) {
			return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/70 dark:bg-orange-950/40 dark:text-orange-300';
		}
		if (text.includes('uncertain') || text.includes('conflicting') || text.includes('vus')) {
			return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300';
		}
		if (text.includes('benign') || text.includes('protective')) {
			return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300';
		}
		if (text.includes('drug') || text.includes('response') || text.includes('pharmacogen')) {
			return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-300';
		}
		return 'border-border bg-muted/50 text-muted-foreground';
	};
	const clinvarRowSignificanceRank = (row: ClinVarTableRow) => Math.max(...clinvarDisplaySignificanceParts(row.significance).map(clinvarSignificanceRank));
	const afBarWidth = (af: number) => Math.min(100, Math.max(0, af * 100));
	const gnomadPopulationLabel = (id: string) =>
		(
			{
				afr: 'African/African American',
				ami: 'Amish',
				amr: 'Admixed American',
				asj: 'Ashkenazi Jewish',
				eas: 'East Asian',
				fin: 'Finnish',
				mid: 'Middle Eastern',
				nfe: 'Non-Finnish European',
				oth: 'Other',
				sas: 'South Asian',
				remaining: 'Remaining'
			} as Record<string, string>
		)[id] ?? id.toUpperCase();
	const clinpgxSearchHref = (query: string) => `https://www.clinpgx.org/search?query=${encodeURIComponent(query)}`;
	const clinvarHref = (id: string) => (/^\d+$/.test(id) ? `https://www.ncbi.nlm.nih.gov/clinvar/variation/${id}/` : `https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(id)}`);
	const clinpgxOpenUrl = $derived(clinpgxPage?.url || (v.rsid ? clinpgxSearchHref(`rs${v.rsid}`) : 'https://www.clinpgx.org'));
	const geneHref = (symbol: string) => {
		const sp = new URLSearchParams({ gene: symbol });
		if (data.forceTenant) sp.set('tenant', data.forceTenant);
		return `/explore?${sp.toString()}`;
	};
	const localComparatorForAncestry = (id: string) => {
		if (v.frequencies.length === 1) return v.frequencies[0];
		const ancestryLabel = normalizeComparator(gnomadPopulationLabel(id));
		return (
			v.frequencies.find((f) => normalizeComparator(f.population) === ancestryLabel || normalizeComparator(f.cohortLabel) === ancestryLabel) ??
			null
		);
	};
	const clinvarSignificanceOptions = $derived.by(() => {
		const options = new Set<string>();
		for (const row of clinvarRows) {
			for (const part of clinvarDisplaySignificanceParts(row.significance)) options.add(part);
		}
		return [...options].sort((a, b) => {
			const rankDiff = clinvarSignificanceRank(b) - clinvarSignificanceRank(a);
			return rankDiff || a.localeCompare(b);
		});
	});
	const clinvarReviewStatusOptions = $derived.by(() => {
		const options = new Set<string>();
		for (const row of clinvarRows) options.add(clinvarDisplayReviewStatus(row.reviewStatus));
		return [...options].sort((a, b) => a.localeCompare(b));
	});
	const filteredClinvarRows = $derived.by(() => {
		return clinvarRows.filter((row) => {
			const significanceVisible =
				!disabledClinvarSignificance.length ||
				clinvarDisplaySignificanceParts(row.significance).some((part) => !disabledClinvarSignificance.includes(part));
			const reviewStatusVisible =
				!disabledClinvarReviewStatus.length || !disabledClinvarReviewStatus.includes(clinvarDisplayReviewStatus(row.reviewStatus));
			return significanceVisible && reviewStatusVisible;
		});
	});
	const sortedClinvarRows = $derived.by(() => {
		return [...filteredClinvarRows].sort((a, b) => {
			let diff = 0;
			if (clinvarSortCol === 'significance') {
				diff = clinvarRowSignificanceRank(a) - clinvarRowSignificanceRank(b);
				if (diff === 0) diff = a.significance.localeCompare(b.significance);
			} else if (clinvarSortCol === 'id') {
				const aId = Number(a.id);
				const bId = Number(b.id);
				diff = Number.isFinite(aId) && Number.isFinite(bId) ? aId - bId : a.id.localeCompare(b.id);
			} else if (clinvarSortCol === 'reviewStatus') {
				diff = String(a.reviewStatus ?? '').localeCompare(String(b.reviewStatus ?? ''));
			} else {
				diff = String(a[clinvarSortCol] ?? '').localeCompare(String(b[clinvarSortCol] ?? ''));
			}
			if (diff !== 0) return clinvarSortDir === 'asc' ? diff : -diff;
			return a.id.localeCompare(b.id);
		});
	});
	const clinvarFilterSummary = $derived(
		disabledClinvarSignificance.length
			? `${clinvarSignificanceOptions.length - disabledClinvarSignificance.length}/${clinvarSignificanceOptions.length}`
			: 'All'
	);
	const clinvarReviewStatusFilterSummary = $derived(
		disabledClinvarReviewStatus.length
			? `${clinvarReviewStatusOptions.length - disabledClinvarReviewStatus.length}/${clinvarReviewStatusOptions.length}`
			: 'All'
	);
	const clinpgxLevelOptions = $derived.by(() => {
		const options = new Set<string>();
		for (const row of clinpgxRows) options.add(clinpgxDisplayLevel(row.level));
		return [...options].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	});
	const filteredClinpgxRows = $derived.by(() => {
		if (!disabledClinpgxLevels.length) return clinpgxRows;
		return clinpgxRows.filter((row) => !disabledClinpgxLevels.includes(clinpgxDisplayLevel(row.level)));
	});
	const clinpgxLevelFilterSummary = $derived(
		disabledClinpgxLevels.length ? `${clinpgxLevelOptions.length - disabledClinpgxLevels.length}/${clinpgxLevelOptions.length}` : 'All'
	);
	const gnomadTotalFrequency = $derived.by(() => {
		if (!gnomadRow) return null;
		const summaries = [gnomadRow.summary.exome, gnomadRow.summary.genome].filter((summary) => summary !== null);
		if (!summaries.length) return null;
		const ac = summaries.reduce((sum, summary) => sum + summary.ac, 0);
		const an = summaries.reduce((sum, summary) => sum + summary.an, 0);
		const nHomo = summaries.reduce((sum, summary) => sum + summary.homozygoteCount, 0);
		const filters = [...new Set(summaries.flatMap((summary) => summary.filters))].filter(Boolean);
		const discrepant =
			gnomadRow.summary.exome && gnomadRow.summary.genome
				? Math.abs(gnomadRow.summary.exome.af - gnomadRow.summary.genome.af) >= 0.01
				: false;
		const detail = ['Exomes + genomes', discrepant ? 'Discrepant frequencies' : '', filters.length ? filters.join(', ') : '']
			.filter(Boolean)
			.join(' · ');
		return {
			source: 'gnomAD',
			label: 'Total',
			detail,
			af: an ? ac / an : 0,
			ac,
			an,
			nHetero: null,
			nHomo,
			nHomoRef: null,
			icon: '/icons/gnomad.png'
		};
	});
	const populationFrequencyRows = $derived.by(() => {
		const rows: PopulationFrequencyRow[] = v.frequencies.map((f) => ({
			source: f.biobankSlug,
			label: f.population,
			detail: `${f.cohortLabel} · ${f.countryCode}`,
			af: f.af,
			ac: f.ac,
			an: f.an,
			nHetero: f.nHetero,
			nHomo: f.nHomo,
			nHomoRef: f.nHomoRef
		}));
		if (gnomadTotalFrequency) {
			const difference = primaryFrequency ? gnomadTotalFrequency.af - primaryFrequency.af : 0;
			rows.push({
				...gnomadTotalFrequency,
				comparison:
					primaryFrequency && Math.abs(difference) > 1e-12
						? {
								direction: difference > 0 ? 'up' : 'down',
								baselineAf: primaryFrequency.af,
								baselineLabel: `${primaryFrequency.biobankSlug} ${primaryFrequency.population}`
							}
						: undefined
			});
		}
		return rows;
	});
	const sortedPopulationFrequencyRows = $derived.by(() => {
		const sortCol = populationSortCol;
		if (!sortCol) return populationFrequencyRows;
		return [...populationFrequencyRows].sort((a, b) => {
			const col: PopulationMetricSortCol = sortCol;
			const aValue = a[col] ?? Number.NEGATIVE_INFINITY;
			const bValue = b[col] ?? Number.NEGATIVE_INFINITY;
			const diff = aValue - bValue;
			if (diff !== 0) return populationSortDir === 'asc' ? diff : -diff;
			return `${a.source} ${a.label}`.localeCompare(`${b.source} ${b.label}`);
		});
	});
	const populationSortIndicator = (col: PopulationMetricSortCol) => (populationSortCol === col ? (populationSortDir === 'asc' ? '▲' : '▼') : '↕');
	const ancestryFrequencyRows = $derived.by(() => {
		const rows: AncestryFrequencyRow[] = v.frequencies.map((f) => ({
			source: f.biobankSlug,
			label: f.population,
			detail: `${f.cohortLabel} · ${f.countryCode}`,
			af: f.af,
			ac: f.ac,
			an: f.an,
			marker: 'source'
		}));
			const gnomadByAncestry = new Map<string, { ac: number; an: number; sources: Set<string> }>();
			for (const pop of gnomadPopulations) {
				if (!gnomadAncestryPopulationIds.has(pop.id)) continue;
				const current = gnomadByAncestry.get(pop.id) ?? { ac: 0, an: 0, sources: new Set<string>() };
				current.ac += pop.ac;
				current.an += pop.an;
				current.sources.add(pop.sequencingType);
				gnomadByAncestry.set(pop.id, current);
			}
			const gnomadRows: AncestryFrequencyRow[] = [];
			for (const [id, value] of gnomadByAncestry) {
				const baseline = localComparatorForAncestry(id);
				const gnomadAf = value.an ? value.ac / value.an : 0;
				const difference = baseline ? gnomadAf - baseline.af : 0;
				gnomadRows.push({
					source: 'gnomAD',
					label: gnomadPopulationLabel(id),
					detail: value.sources.size ? [...value.sources].join(' + ') : id,
					af: gnomadAf,
					ac: value.ac,
					an: value.an,
					icon: '/icons/gnomad.png',
				comparison:
					baseline && Math.abs(difference) > 1e-12
						? {
								direction: difference > 0 ? 'up' : 'down',
								baselineAf: baseline.af,
								baselineLabel: `${baseline.biobankSlug} ${baseline.population}`
							}
						: undefined
			});
		}
		if (primaryFrequency && gnomadRows.length) {
			const closest = gnomadRows.reduce((best, row) =>
				Math.abs(row.af - primaryFrequency.af) < Math.abs(best.af - primaryFrequency.af) ? row : best
			);
			closest.marker = 'closest';
		}
		rows.push(...gnomadRows);
		return rows;
	});
	const sortedAncestryFrequencyRows = $derived.by(() => {
		const sortCol = ancestrySortCol;
		if (!sortCol) return ancestryFrequencyRows;
		return [...ancestryFrequencyRows].sort((a, b) => {
			const col: AncestryMetricSortCol = sortCol;
			const diff = a[col] - b[col];
			if (diff !== 0) return ancestrySortDir === 'asc' ? diff : -diff;
			return `${a.source} ${a.label}`.localeCompare(`${b.source} ${b.label}`);
		});
	});
	const ancestrySortIndicator = (col: AncestryMetricSortCol) => (ancestrySortCol === col ? (ancestrySortDir === 'asc' ? '▲' : '▼') : '↕');
	const ancestryRowClass = (row: AncestryFrequencyRow) =>
		[
			'border-t',
			row.marker === 'source' ? 'bg-sky-50/80 dark:bg-sky-950/30' : '',
			row.marker === 'closest' ? 'bg-amber-50/90 dark:bg-amber-950/30' : ''
		]
			.filter(Boolean)
			.join(' ');
	const ancestryMarkerClass = (row: AncestryFrequencyRow) =>
		row.marker === 'source'
			? 'rounded border border-sky-200 bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200'
			: 'rounded border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200';
	const ancestryMarkerLabel = (row: AncestryFrequencyRow) => (row.marker === 'source' ? 'Current biobank' : 'Closest gnomAD');

	function setPopulationSort(col: PopulationMetricSortCol) {
		if (populationSortCol === col) {
			populationSortDir = populationSortDir === 'asc' ? 'desc' : 'asc';
		} else {
			populationSortCol = col;
			populationSortDir = 'desc';
		}
	}

	function setAncestrySort(col: AncestryMetricSortCol) {
		if (ancestrySortCol === col) {
			ancestrySortDir = ancestrySortDir === 'asc' ? 'desc' : 'asc';
		} else {
			ancestrySortCol = col;
			ancestrySortDir = 'desc';
		}
	}

	function setClinvarSort(col: ClinvarSortCol) {
		if (clinvarSortCol === col) {
			clinvarSortDir = clinvarSortDir === 'asc' ? 'desc' : 'asc';
		} else {
			clinvarSortCol = col;
			clinvarSortDir = col === 'significance' ? 'desc' : 'asc';
		}
	}

	function clinvarSortIndicator(col: ClinvarSortCol) {
		return clinvarSortCol === col ? (clinvarSortDir === 'asc' ? '▲' : '▼') : '↕';
	}

	function clinvarSignificanceEnabled(value: string) {
		return !disabledClinvarSignificance.includes(value);
	}

	function toggleClinvarSignificance(value: string) {
		disabledClinvarSignificance = disabledClinvarSignificance.includes(value)
			? disabledClinvarSignificance.filter((item) => item !== value)
			: [...disabledClinvarSignificance, value];
	}

	function showAllClinvarSignificance() {
		disabledClinvarSignificance = [];
	}

	function hideAllClinvarSignificance() {
		disabledClinvarSignificance = [...clinvarSignificanceOptions];
	}

	function clinvarReviewStatusEnabled(value: string) {
		return !disabledClinvarReviewStatus.includes(value);
	}

	function toggleClinvarReviewStatus(value: string) {
		disabledClinvarReviewStatus = disabledClinvarReviewStatus.includes(value)
			? disabledClinvarReviewStatus.filter((item) => item !== value)
			: [...disabledClinvarReviewStatus, value];
	}

	function showAllClinvarReviewStatus() {
		disabledClinvarReviewStatus = [];
	}

	function hideAllClinvarReviewStatus() {
		disabledClinvarReviewStatus = [...clinvarReviewStatusOptions];
	}

	function clinpgxLevelEnabled(value: string) {
		return !disabledClinpgxLevels.includes(value);
	}

	function toggleClinpgxLevel(value: string) {
		disabledClinpgxLevels = disabledClinpgxLevels.includes(value)
			? disabledClinpgxLevels.filter((item) => item !== value)
			: [...disabledClinpgxLevels, value];
	}

	function showAllClinpgxLevels() {
		disabledClinpgxLevels = [];
	}

	function hideAllClinpgxLevels() {
		disabledClinpgxLevels = [...clinpgxLevelOptions];
	}

	function lookupCacheKey(kind: 'clinvar' | 'clinpgx' | 'gnomad') {
		return `${externalLookupCachePrefix}:${kind}:${variantCacheId}`;
	}

	function readLookupCache<T>(kind: 'clinvar' | 'clinpgx' | 'gnomad', maxAgeMs = externalLookupCacheTtlMs) {
		try {
			const raw = localStorage.getItem(lookupCacheKey(kind));
			if (!raw) return undefined;
			const envelope = JSON.parse(raw) as LookupCacheEnvelope<T>;
			if (!envelope || typeof envelope.savedAt !== 'number') return undefined;
			if (Date.now() - envelope.savedAt > maxAgeMs) return undefined;
			return envelope.value;
		} catch {
			return undefined;
		}
	}

	function writeLookupCache<T>(kind: 'clinvar' | 'clinpgx' | 'gnomad', value: T) {
		try {
			const envelope: LookupCacheEnvelope<T> = { savedAt: Date.now(), value };
			localStorage.setItem(lookupCacheKey(kind), JSON.stringify(envelope));
		} catch {
			// Browser storage can be disabled or full; external lookup should still work.
		}
	}

	function sendAnalyticsEvent(eventName: string, properties: Record<string, unknown>) {
		if (!analyticsData) return;

		let attempts = 0;
		const send = () => {
			if (window.rybbit?.event) {
				window.rybbit.event(eventName, properties);
			} else if (++attempts < 20) {
				window.setTimeout(send, 250);
			}
		};
		send();
	}

	function trackVariantView() {
		if (!analyticsData) return;

		sendAnalyticsEvent('variant_view', {
			tenant_slug: tenantData.slug ?? data.forceTenant ?? 'unknown',
			tenant_name: tenantData.name ?? data.tenantName,
			tenant_scope: tenantData.scope ?? 'global',
			real_hostname: analyticsData.hostname ?? window.location.hostname,
			pathname: window.location.pathname,
			querystring: window.location.search,
			variant_id: v.id,
			variant_label: title,
			chrom: v.chromName,
			position: v.pos,
			ref: v.ref,
			alt: v.alt,
			rsid: v.rsid ? `rs${v.rsid}` : '',
			vrs_id: v.vrsDigest ? `ga4gh:VA.${v.vrsDigest}` : '',
			gene_symbols: v.genes.map((gene) => gene.symbol).join(','),
			frequency_count: v.frequencies.length,
			biobanks: [...new Set(v.frequencies.map((f) => f.biobankSlug))].join(','),
			populations: [...new Set(v.frequencies.map((f) => f.population))].join(','),
			max_af: maxAf,
			source: 'variant_detail'
		});
	}

	async function copyVrsAllele() {
		if (!vrsJson) return;
		await navigator.clipboard?.writeText(vrsJson);
		copiedVrs = true;
		setTimeout(() => (copiedVrs = false), 1200);
	}

	async function loadClinvar() {
		const cached = readLookupCache<ClinVarTableRow[]>('clinvar');
		if (cached !== undefined) {
			clinvarRows = cached;
			clinvarStatus = 'loaded';
			return;
		}
		const stale = readLookupCache<ClinVarTableRow[]>('clinvar', externalLookupStaleTtlMs);
		clinvarStatus = 'loading';
		clinvarError = '';
		try {
			const client = new ClinvarClient();
			const seen = new Set<string>();
			const query = {
				chrom: v.chromName,
				pos: v.pos,
				ref: v.ref,
				alt: v.alt,
				rsid: v.rsid ? `rs${v.rsid}` : ''
			};
			const rows: ClinVarTableRow[] = [];
			for (const row of await client.queryVariant(query, { retmax: 20, maxRows: 10 })) {
				const id = String(row.id || row.accession || `${v.chromName}-${v.pos}-${v.ref}-${v.alt}`);
				if (seen.has(id)) continue;
				seen.add(id);
				rows.push({
					id,
					gene: row.gene || v.genes[0]?.symbol || '',
					location: row.location || `${v.chromName}:${v.pos}`,
					allele: row.allele || `${v.ref}>${v.alt}`,
					significance: row.significance || '',
					reviewStatus: row.reviewStatus,
					title: row.title,
					url: row.url,
					raw: row.raw
				});
			}
			clinvarRows = rows;
			writeLookupCache('clinvar', rows);
			clinvarStatus = 'loaded';
		} catch (err) {
			if (stale !== undefined) {
				clinvarRows = stale;
				clinvarError = '';
				clinvarStatus = 'loaded';
				return;
			}
			clinvarRows = [];
			clinvarError = err instanceof Error ? err.message : 'ClinVar lookup failed';
			clinvarStatus = 'error';
		}
	}

	async function loadGnomad() {
		const cached = readLookupCache<GnomadRow | null>('gnomad');
		if (cached !== undefined) {
			gnomadRow = cached;
			gnomadStatus = 'loaded';
			return;
		}
		const stale = readLookupCache<GnomadRow | null>('gnomad', externalLookupStaleTtlMs);
		gnomadStatus = 'loading';
		gnomadError = '';
		try {
			const client = new GnomadClient();
			gnomadRow = await client.queryVariant({
				chrom: v.chromName,
				pos: v.pos,
				ref: v.ref,
				alt: v.alt
			});
			writeLookupCache('gnomad', gnomadRow);
			gnomadStatus = 'loaded';
		} catch (err) {
			if (stale !== undefined) {
				gnomadRow = stale;
				gnomadError = '';
				gnomadStatus = 'loaded';
				return;
			}
			gnomadRow = null;
			gnomadError = err instanceof Error ? err.message : 'gnomAD lookup failed';
			gnomadStatus = 'error';
		}
	}

	async function loadClinpgx() {
		if (!v.rsid) {
			clinpgxPage = null;
			clinpgxStatus = 'loaded';
			return;
		}
		const cached = readLookupCache<ClinpgxPageResult | null>('clinpgx');
		if (cached !== undefined) {
			clinpgxPage = cached;
			clinpgxStatus = 'loaded';
			return;
		}
		const stale = readLookupCache<ClinpgxPageResult | null>('clinpgx', externalLookupStaleTtlMs);
		clinpgxStatus = 'loading';
		clinpgxError = '';
		try {
			const client = new ClinpgxClient();
			clinpgxPage = await client.queryVariantPage(`rs${v.rsid}`);
			writeLookupCache('clinpgx', clinpgxPage);
			clinpgxStatus = 'loaded';
		} catch (err) {
			if (stale !== undefined) {
				clinpgxPage = stale;
				clinpgxError = '';
				clinpgxStatus = 'loaded';
				return;
			}
			clinpgxPage = null;
			clinpgxError = err instanceof Error ? err.message : 'ClinPGx lookup failed';
			clinpgxStatus = 'error';
		}
	}

	onMount(() => {
		trackVariantView();
		void loadClinvar();
		void loadGnomad();
		void loadClinpgx();

		const closeFilterMenus = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			for (const details of document.querySelectorAll<HTMLDetailsElement>('details[data-external-filter-menu]')) {
				if (!details.contains(target)) details.open = false;
			}
		};
		const closeFilterMenusOnEscape = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			for (const details of document.querySelectorAll<HTMLDetailsElement>('details[data-external-filter-menu]')) {
				details.open = false;
			}
		};
		document.addEventListener('pointerdown', closeFilterMenus, true);
		document.addEventListener('keydown', closeFilterMenusOnEscape);
		return () => {
			document.removeEventListener('pointerdown', closeFilterMenus, true);
			document.removeEventListener('keydown', closeFilterMenusOnEscape);
		};
	});
</script>

<svelte:head>
	<title>{plainTitle} · {data.tenantName}</title>
</svelte:head>

<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
	<div>
		<a href="/explore{data.forceTenant ? `?tenant=${data.forceTenant}` : ''}" class="mb-2 inline-flex text-sm text-muted-foreground hover:text-primary hover:underline">
			← {tr($lang, 'explore')}
			</a>
			<h1 class="font-mono text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				Variant detail · GRCh38 ·
				<span class="font-medium text-foreground">{geneSummary}</span>
				{#if rsidSummary}
					· <span class="font-mono font-medium text-foreground">{rsidSummary}</span>
				{/if}
			</p>
		</div>
	<div class="flex flex-wrap gap-2 text-sm">
		{#if v.rsid}
			<a class="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 hover:bg-muted" href={`https://www.ncbi.nlm.nih.gov/snp/rs${v.rsid}`} target="_blank" rel="noreferrer">
				<img src={dbsnpIconUrl} alt="" class="h-4 w-auto invert dark:invert-0" />
				<span>dbSNP rs{v.rsid}</span>
			</a>
		{/if}
		<a class="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 hover:bg-muted" href={gnomadUrl} target="_blank" rel="noopener">
			<img src="/icons/gnomad.png" alt="" class="size-4 opacity-75" />
			<span>gnomAD</span>
		</a>
		<a class="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 hover:bg-muted" href={clinvarSearchUrl} target="_blank" rel="noreferrer">
			<img src="/icons/clinvar.svg" alt="" class="h-4 w-auto" />
			<span>ClinVar</span>
		</a>
		{#if v.rsid}
			<a class="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 hover:bg-muted" href={clinpgxSearchHref(`rs${v.rsid}`)} target="_blank" rel="noreferrer">
				<img src="/icons/clinpgx.svg" alt="" class="size-4" />
				<span>ClinPGx</span>
			</a>
		{/if}
		<a class="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 hover:bg-muted" href={apiUrl}>
			<Code class="size-4" strokeWidth={1.8} />
			<span>API JSON</span>
		</a>
	</div>
</div>

	<section class="card-surface mb-5 overflow-hidden">
	<div class="border-b px-4 py-3">
		<h2 class="text-base font-semibold">Population Frequencies</h2>
	</div>
		<div class="relative overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
					<tr>
							<th class="px-3 py-2 font-medium">Biobank</th>
							<th class="px-3 py-2 font-medium">{tr($lang, 'colPopulation')}</th>
							<th class="px-3 py-2 font-medium"><span class="sr-only">Frequency bar</span></th>
							<th class="px-3 py-2 text-right font-medium">
								<button onclick={() => setPopulationSort('af')} class="inline-flex cursor-pointer items-center justify-end gap-1 uppercase hover:text-foreground" title="Sort by alternate allele frequency">
									<span>AF</span>
									<span class="text-[9px]">{populationSortIndicator('af')}</span>
								</button>
							</th>
							<th class="px-3 py-2 text-right font-medium">
								<button onclick={() => setPopulationSort('ac')} class="inline-flex cursor-pointer items-center justify-end gap-1 uppercase hover:text-foreground" title="Sort by alternate allele count">
									<span>AC</span>
									<span class="text-[9px]">{populationSortIndicator('ac')}</span>
								</button>
							</th>
							<th class="px-3 py-2 text-right font-medium">
								<button onclick={() => setPopulationSort('an')} class="inline-flex cursor-pointer items-center justify-end gap-1 uppercase hover:text-foreground" title="Sort by allele number">
									<span>AN</span>
									<span class="text-[9px]">{populationSortIndicator('an')}</span>
								</button>
							</th>
							<th class="px-3 py-2 text-right font-medium">HET</th>
							<th class="px-3 py-2 text-right font-medium">
								<button onclick={() => setPopulationSort('nHomo')} class="inline-flex cursor-pointer items-center justify-end gap-1 uppercase hover:text-foreground" title="Sort by homozygote alternate count">
									<span>HOM_ALT</span>
									<span class="text-[9px]">{populationSortIndicator('nHomo')}</span>
								</button>
							</th>
							<th class="px-3 py-2 text-right font-medium">HOM_REF</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedPopulationFrequencyRows as row}
							<tr class="border-t">
								<td class="whitespace-nowrap px-3 py-2 font-medium">
									<span class="inline-flex items-center gap-1.5">
										{#if row.icon}
											<img src={row.icon} alt="" class="size-3.5 opacity-70" />
										{/if}
										<span>{row.source}</span>
									</span>
								</td>
								<td class="px-3 py-2">
									<div>{row.label}</div>
									<div class="text-xs text-muted-foreground">{row.detail}</div>
								</td>
								<td class="min-w-28 px-3 py-2">
									<span class="af-track block h-2 cursor-help overflow-hidden rounded-full" title={`${row.label} · alt allele freq ${fmtAf(row.af)} · AC ${row.ac}/${row.an}`}>
										<span class="af-fill block h-full rounded-full" style={`width:${afBarWidth(row.af)}%`}></span>
									</span>
								</td>
								<td class="px-3 py-2 text-right font-mono text-xs">
									<span class="inline-flex items-center justify-end gap-1">
										<span>{fmtAf(row.af)}</span>
										{#if row.comparison}
											<span
												class={row.comparison.direction === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
												title={`${row.comparison.direction === 'up' ? 'Higher' : 'Lower'} than ${row.comparison.baselineLabel} (${fmtAf(row.comparison.baselineAf)})`}
												aria-label={`${row.comparison.direction === 'up' ? 'Higher' : 'Lower'} than ${row.comparison.baselineLabel}`}
											>
												{row.comparison.direction === 'up' ? '↑' : '↓'}
											</span>
										{/if}
									</span>
								</td>
								<td class="px-3 py-2 text-right font-mono text-xs">{fmt(row.ac)}</td>
								<td class="px-3 py-2 text-right font-mono text-xs">{fmt(row.an)}</td>
								<td class="px-3 py-2 text-right font-mono text-xs">{fmt(row.nHetero)}</td>
								<td class="px-3 py-2 text-right font-mono text-xs">{fmt(row.nHomo)}</td>
								<td class="px-3 py-2 text-right font-mono text-xs">{fmt(row.nHomoRef)}</td>
							</tr>
						{/each}
					</tbody>
		</table>
	</div>
	</section>

	<section class="card-surface relative z-[80] mb-5 overflow-visible">
		<div class="relative z-[90] flex items-center justify-between gap-3 border-b px-4 py-3">
			<h2 class="inline-flex items-center gap-2 text-base font-semibold">
				<img src="/icons/gnomad.png" alt="" class="size-4 opacity-75" />
				<span>gnomAD Ethnicity Frequencies</span>
			</h2>
			<a href={gnomadUrl} target="_blank" rel="noopener" class="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">
				<img src="/icons/gnomad.png" alt="" class="size-3.5 opacity-75" />
				<span>Open gnomAD</span>
			</a>
		</div>
		<div class="relative overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
					<tr>
						<th class="px-3 py-2 font-medium">Source</th>
						<th class="px-3 py-2 font-medium">Population / ancestry</th>
						<th class="px-3 py-2 font-medium"><span class="sr-only">Frequency bar</span></th>
						<th class="px-3 py-2 text-right font-medium">
							<button onclick={() => setAncestrySort('af')} class="inline-flex cursor-pointer items-center justify-end gap-1 uppercase hover:text-foreground" title="Sort by alternate allele frequency">
								<span>AF</span>
								<span class="text-[9px]">{ancestrySortIndicator('af')}</span>
							</button>
						</th>
						<th class="px-3 py-2 text-right font-medium">
							<button onclick={() => setAncestrySort('ac')} class="inline-flex cursor-pointer items-center justify-end gap-1 uppercase hover:text-foreground" title="Sort by alternate allele count">
								<span>AC</span>
								<span class="text-[9px]">{ancestrySortIndicator('ac')}</span>
							</button>
						</th>
						<th class="px-3 py-2 text-right font-medium">
							<button onclick={() => setAncestrySort('an')} class="inline-flex cursor-pointer items-center justify-end gap-1 uppercase hover:text-foreground" title="Sort by allele number">
								<span>AN</span>
								<span class="text-[9px]">{ancestrySortIndicator('an')}</span>
							</button>
						</th>
					</tr>
				</thead>
					<tbody>
						{#each sortedAncestryFrequencyRows as row}
							<tr class={ancestryRowClass(row)}>
								<td class="whitespace-nowrap px-3 py-2 font-medium">
									<span class="inline-flex items-center gap-1.5">
										{#if row.icon}
										<img src={row.icon} alt="" class="size-3.5 opacity-70" />
									{/if}
									<span>{row.source}</span>
									</span>
								</td>
								<td class="px-3 py-2">
									<div class="flex flex-wrap items-center gap-2">
										<span>{row.label}</span>
										{#if row.marker}
											<span class={ancestryMarkerClass(row)}>{ancestryMarkerLabel(row)}</span>
										{/if}
									</div>
									<div class="text-xs text-muted-foreground">{row.detail}</div>
								</td>
							<td class="min-w-32 px-3 py-2">
								<span class="af-track block h-2 cursor-help overflow-hidden rounded-full" title={`${row.label} · alt allele freq ${fmtAf(row.af)} · AC ${row.ac}/${row.an}`}>
									<span class="af-fill block h-full rounded-full" style={`width:${afBarWidth(row.af)}%`}></span>
								</span>
							</td>
							<td class="px-3 py-2 text-right font-mono text-xs">
								<span class="inline-flex items-center justify-end gap-1">
									<span>{fmtAf(row.af)}</span>
									{#if row.comparison}
										<span
											class={row.comparison.direction === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
											title={`${row.comparison.direction === 'up' ? 'Higher' : 'Lower'} than ${row.comparison.baselineLabel} (${fmtAf(row.comparison.baselineAf)})`}
											aria-label={`${row.comparison.direction === 'up' ? 'Higher' : 'Lower'} than ${row.comparison.baselineLabel}`}
										>
											{row.comparison.direction === 'up' ? '↑' : '↓'}
										</span>
									{/if}
								</span>
							</td>
							<td class="px-3 py-2 text-right font-mono text-xs">{fmt(row.ac)}</td>
							<td class="px-3 py-2 text-right font-mono text-xs">{fmt(row.an)}</td>
						</tr>
					{/each}
					{#if !ancestryFrequencyRows.length && gnomadStatus !== 'idle'}
						<tr class="border-t">
							<td colspan="6" class="px-3 py-6 text-center text-sm text-muted-foreground">
								{#if gnomadStatus === 'error'}
									{gnomadError}
								{:else}
									No frequency rows returned.
								{/if}
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
			{#if gnomadStatus === 'loading'}
				<div class="absolute inset-0 grid min-h-28 place-items-center bg-card/75 backdrop-blur-[1px]">
					<div class="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground shadow-sm">
						<span class="size-4 animate-spin rounded-full border-2 border-muted border-t-primary"></span>
						<span>Loading gnomAD...</span>
					</div>
				</div>
			{/if}
		</div>
		{#if gnomadStatus === 'error'}
			<div class="border-t px-4 py-3 text-xs text-destructive">{gnomadError}</div>
		{:else if gnomadRow?.colocatedVariants.length}
			<div class="border-t px-4 py-3 text-xs text-muted-foreground">
				Colocated variants: <span class="font-mono">{gnomadRow.colocatedVariants.join(', ')}</span>
			</div>
		{/if}
	</section>

	<section class="card-surface relative z-[80] mb-5 overflow-visible">
		<div class="relative z-[300] flex items-center justify-between gap-3 border-b px-4 py-3">
			<h2 class="inline-flex items-center gap-2 text-base font-semibold">
				<img src="/icons/clinvar.svg" alt="" class="h-4 w-auto" />
				<span>ClinVar</span>
			</h2>
			<div class="flex shrink-0 items-center gap-2">
				{#if clinvarSignificanceOptions.length}
					<details class="relative z-[100]" data-external-filter-menu>
						<summary class="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">
							<span>Significance</span>
							<span class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{clinvarFilterSummary}</span>
						</summary>
						<div class="absolute right-0 z-[200] mt-2 w-64 rounded-md border bg-background p-2 text-xs shadow-lg">
							<div class="mb-2 flex items-center justify-between gap-2 border-b pb-2">
								<span class="font-medium text-foreground">Show significance</span>
								<span class="inline-flex items-center gap-1">
									<button onclick={showAllClinvarSignificance} class="rounded px-1.5 py-1 text-primary hover:bg-muted">All</button>
									<button onclick={hideAllClinvarSignificance} class="rounded px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">None</button>
								</span>
							</div>
							<div class="space-y-1">
								{#each clinvarSignificanceOptions as significance}
									<label class="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-muted">
										<input
											type="checkbox"
											class="size-3.5"
											checked={clinvarSignificanceEnabled(significance)}
											onchange={() => toggleClinvarSignificance(significance)}
										/>
										<span class={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${clinvarSignificanceClass(significance)}`}>
											{significance}
										</span>
									</label>
								{/each}
							</div>
						</div>
					</details>
				{/if}
				{#if clinvarReviewStatusOptions.length}
					<details class="relative z-[100]" data-external-filter-menu>
						<summary class="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">
							<span>Review</span>
							<span class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{clinvarReviewStatusFilterSummary}</span>
						</summary>
						<div class="absolute right-0 z-[200] mt-2 w-72 rounded-md border bg-background p-2 text-xs shadow-lg">
							<div class="mb-2 flex items-center justify-between gap-2 border-b pb-2">
								<span class="font-medium text-foreground">Show review status</span>
								<span class="inline-flex items-center gap-1">
									<button onclick={showAllClinvarReviewStatus} class="rounded px-1.5 py-1 text-primary hover:bg-muted">All</button>
									<button onclick={hideAllClinvarReviewStatus} class="rounded px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">None</button>
								</span>
							</div>
							<div class="space-y-1">
								{#each clinvarReviewStatusOptions as status}
									<label class="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-muted">
										<input
											type="checkbox"
											class="mt-0.5 size-3.5"
											checked={clinvarReviewStatusEnabled(status)}
											onchange={() => toggleClinvarReviewStatus(status)}
										/>
										<span class="leading-snug text-foreground">{status}</span>
									</label>
								{/each}
							</div>
						</div>
					</details>
				{/if}
				<a href={clinvarSearchUrl} target="_blank" rel="noreferrer" class="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">
					<img src="/icons/clinvar.svg" alt="" class="h-3.5 w-auto" />
					<span>Open ClinVar</span>
				</a>
			</div>
		</div>
		<div class="relative z-0 overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
					<tr>
						<th class="px-3 py-2 font-medium">
							<button onclick={() => setClinvarSort('id')} class="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-foreground" title="Sort by ClinVar ID">
								<span>ClinVar ID</span>
								<span class="text-[9px]">{clinvarSortIndicator('id')}</span>
							</button>
						</th>
						<th class="px-3 py-2 font-medium">
							<button onclick={() => setClinvarSort('gene')} class="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-foreground" title="Sort by gene">
								<span>{tr($lang, 'gene')}</span>
								<span class="text-[9px]">{clinvarSortIndicator('gene')}</span>
							</button>
						</th>
						<th class="px-3 py-2 font-medium">
							<button onclick={() => setClinvarSort('location')} class="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-foreground" title="Sort by location">
								<span>Location</span>
								<span class="text-[9px]">{clinvarSortIndicator('location')}</span>
							</button>
						</th>
						<th class="px-3 py-2 font-medium">
							<button onclick={() => setClinvarSort('allele')} class="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-foreground" title="Sort by allele">
								<span>Allele</span>
								<span class="text-[9px]">{clinvarSortIndicator('allele')}</span>
							</button>
						</th>
						<th class="px-3 py-2 font-medium">
							<button onclick={() => setClinvarSort('significance')} class="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-foreground" title="Sort by significance">
								<span>Significance</span>
								<span class="text-[9px]">{clinvarSortIndicator('significance')}</span>
							</button>
						</th>
						<th class="px-3 py-2 font-medium">
							<button onclick={() => setClinvarSort('reviewStatus')} class="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-foreground" title="Sort by clinical review status">
								<span>Clinical Review Status</span>
								<span class="text-[9px]">{clinvarSortIndicator('reviewStatus')}</span>
							</button>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each sortedClinvarRows as row}
						<tr class="border-t">
							<td class="px-3 py-2 font-mono text-xs">
								<a href={row.url || clinvarHref(row.id)} target="_blank" rel="noreferrer" class="text-primary hover:underline" title={row.title || row.reviewStatus || undefined}>
									{row.id}
								</a>
							</td>
							<td class="px-3 py-2 font-medium">
								<a href={geneHref(row.gene)} class="text-primary hover:underline">{row.gene || '-'}</a>
							</td>
							<td class="px-3 py-2 font-mono text-xs">{row.location}</td>
							<td class="px-3 py-2 font-mono text-xs">{row.allele}</td>
							<td class="px-3 py-2">
								{#if row.significance}
									<div class="flex flex-wrap gap-1.5">
										{#each clinvarDisplaySignificanceParts(row.significance) as significance}
											<span class={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${clinvarSignificanceClass(significance)}`}>
												{significance}
											</span>
										{/each}
									</div>
								{:else}
									<span class="text-muted-foreground">-</span>
								{/if}
							</td>
							<td class="max-w-64 px-3 py-2">
								<div class="flex flex-wrap gap-1.5">
									{#each clinvarReviewStatusParts(row.reviewStatus) as status}
										<span class={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${clinvarReviewStatusClass(status)}`}>
											{clinvarReviewStatusLabel(status)}
										</span>
									{/each}
								</div>
							</td>
						</tr>
					{/each}
					{#if !sortedClinvarRows.length && clinvarStatus !== 'idle'}
						<tr>
							<td colspan="6" class="px-3 py-6 text-center text-sm text-muted-foreground">
								{#if clinvarStatus === 'loading'}
									Loading ClinVar...
								{:else if clinvarStatus === 'error'}
									{clinvarError}
								{:else if clinvarRows.length}
									No ClinVar rows match the active filters.
								{:else}
									No ClinVar rows returned for this variant.
								{/if}
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
			{#if clinvarStatus === 'loading'}
				<div class="absolute inset-0 grid min-h-28 place-items-center bg-card/75 backdrop-blur-[1px]">
					<div class="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground shadow-sm">
						<span class="size-4 animate-spin rounded-full border-2 border-muted border-t-primary"></span>
						<span>Loading ClinVar...</span>
					</div>
				</div>
			{/if}
		</div>
	</section>

	<section class="card-surface relative z-[70] mb-5 overflow-visible">
		<div class="relative z-[300] flex items-center justify-between gap-3 border-b px-4 py-3">
			<h2 class="inline-flex items-center gap-2 text-base font-semibold">
				<img src="/icons/clinpgx.svg" alt="" class="size-4" />
				<span>ClinPGx</span>
			</h2>
			<div class="flex shrink-0 items-center gap-2">
				{#if clinpgxLevelOptions.length}
					<details class="relative z-[100]" data-external-filter-menu>
						<summary class="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">
							<span>Level</span>
							<span class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{clinpgxLevelFilterSummary}</span>
						</summary>
						<div class="absolute right-0 z-[200] mt-2 w-56 rounded-md border bg-background p-2 text-xs shadow-lg">
							<div class="mb-2 flex items-center justify-between gap-2 border-b pb-2">
								<span class="font-medium text-foreground">Show level</span>
								<span class="inline-flex items-center gap-1">
									<button onclick={showAllClinpgxLevels} class="rounded px-1.5 py-1 text-primary hover:bg-muted">All</button>
									<button onclick={hideAllClinpgxLevels} class="rounded px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">None</button>
								</span>
							</div>
							<div class="space-y-1">
								{#each clinpgxLevelOptions as level}
									<label class="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-muted">
										<input
											type="checkbox"
											class="size-3.5"
											checked={clinpgxLevelEnabled(level)}
											onchange={() => toggleClinpgxLevel(level)}
										/>
										<span class="inline-flex min-w-14 items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={clinpgxLevelStyle(level)}>
											{level}
										</span>
									</label>
								{/each}
							</div>
						</div>
					</details>
				{/if}
				<a href={clinpgxLevelInfoUrl} target="_blank" rel="noreferrer" class="inline-flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground" title="ClinPGx clinical annotation levels" aria-label="ClinPGx clinical annotation levels">
					<svg viewBox="0 0 512 512" class="size-3.5" aria-hidden="true">
						<path fill="currentColor" d="M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512zM224 160a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zm-8 64l48 0c13.3 0 24 10.7 24 24l0 88 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l24 0 0-64-24 0c-13.3 0-24-10.7-24-24s10.7-24 24-24z"></path>
					</svg>
				</a>
				<a href={clinpgxOpenUrl} target="_blank" rel="noreferrer" class="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">
					<img src="/icons/clinpgx.svg" alt="" class="size-3.5" />
					<span>Open ClinPGx</span>
				</a>
			</div>
		</div>
		{#if clinpgxVariant}
			<div class="grid gap-0 border-b text-sm sm:grid-cols-4">
				<div class="border-b px-4 py-3 sm:border-b-0 sm:border-r">
					<div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">ClinPGx ID</div>
					<a href={clinpgxOpenUrl} target="_blank" rel="noreferrer" class="mt-1 inline-flex font-mono text-xs text-primary hover:underline">
						{clinpgxVariant.id}
					</a>
				</div>
				<div class="border-b px-4 py-3 sm:border-b-0 sm:border-r">
					<div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Classification</div>
					<div class="mt-1">{clinpgxVariant.changeClassification || '-'}</div>
				</div>
				<div class="border-b px-4 py-3 sm:border-b-0 sm:border-r">
					<div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Clinical significance</div>
					<div class="mt-1">{clinpgxVariant.clinicalSignificance || '-'}</div>
				</div>
				<div class="px-4 py-3">
					<div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">ClinPGx GRCh38</div>
					<div class="mt-1 font-mono text-xs">
						{#if clinpgxLocation}
							{clinpgxLocation.sequenceName.replace('[GRCh38]', '')}:{clinpgxLocation.begin?.toLocaleString() ?? '-'} {clinpgxLocation.referenceAllele}>{clinpgxLocation.variantAlleles.join(',') || '-'}
						{:else}
							-
						{/if}
					</div>
				</div>
			</div>
		{/if}
		<div class="relative z-0 overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
					<tr>
						<th class="px-3 py-2 font-medium">Annotation</th>
						<th class="px-3 py-2 font-medium">Level</th>
						<th class="px-3 py-2 font-medium">Type</th>
						<th class="px-3 py-2 font-medium">Drugs</th>
						<th class="px-3 py-2 font-medium">Phenotype</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredClinpgxRows as row}
						<tr class="border-t align-top">
							<td class="px-3 py-2">
								{#if row.url}
									<a href={row.url} target="_blank" rel="noreferrer" class="font-mono text-xs text-primary hover:underline">
										{row.accessionId || row.id}
									</a>
								{:else}
									<span class="font-mono text-xs text-muted-foreground" title="ClinPGx API annotation identifier">{row.accessionId || row.id}</span>
								{/if}
								<div class="mt-1 max-w-md text-xs text-muted-foreground">{row.name}</div>
							</td>
							<td class="whitespace-nowrap px-3 py-2">
								<span class="inline-flex min-w-10 items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold" style={clinpgxLevelStyle(clinpgxDisplayLevel(row.level))}>
									{clinpgxDisplayLevel(row.level)}
								</span>
							</td>
							<td class="px-3 py-2">{row.types.length ? row.types.join(', ') : '-'}</td>
							<td class="px-3 py-2">{joinNames(row.chemicals)}</td>
							<td class="min-w-72 px-3 py-2 text-xs leading-relaxed">
								{#if row.allelePhenotypes.length}
									<span class="font-mono">{row.allelePhenotypes[0].allele}</span>
									<span class="text-muted-foreground"> {truncateText(row.allelePhenotypes[0].phenotype)}</span>
								{:else}
									-
								{/if}
							</td>
						</tr>
					{/each}
					{#if !filteredClinpgxRows.length && clinpgxStatus !== 'idle'}
						<tr>
							<td colspan="5" class="px-3 py-6 text-center text-sm text-muted-foreground">
								{#if clinpgxStatus === 'loading'}
									Loading ClinPGx...
								{:else if clinpgxStatus === 'error'}
									{clinpgxError}
								{:else if !v.rsid}
									ClinPGx lookup needs an rsID for this variant.
								{:else if clinpgxRows.length}
									No ClinPGx rows match the active filters.
								{:else}
									No ClinPGx clinical annotations returned for this variant.
								{/if}
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
			{#if clinpgxStatus === 'loading'}
				<div class="absolute inset-0 grid min-h-28 place-items-center bg-card/75 backdrop-blur-[1px]">
					<div class="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground shadow-sm">
						<span class="size-4 animate-spin rounded-full border-2 border-muted border-t-primary"></span>
						<span>Loading ClinPGx...</span>
					</div>
				</div>
			{/if}
		</div>
	</section>

	<section class="card-surface mb-5 overflow-hidden">
		<div class="border-b px-4 py-3">
			<h2 class="text-base font-semibold">Overlapping Genes</h2>
		</div>
	{#if v.genes.length}
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
					<tr>
						<th class="px-3 py-2 font-medium">{tr($lang, 'gene')}</th>
						<th class="px-3 py-2 font-medium">Ensembl</th>
						<th class="px-3 py-2 font-medium">Type</th>
						<th class="px-3 py-2 font-medium">Region</th>
						<th class="px-3 py-2 font-medium">Strand</th>
						<th class="px-3 py-2 font-medium">ClinPGx</th>
					</tr>
				</thead>
				<tbody>
					{#each v.genes as g}
						<tr class="border-t">
							<td class="px-3 py-2 font-medium">
								<a href={geneHref(g.symbol)} class="text-primary hover:underline">{g.symbol}</a>
							</td>
							<td class="px-3 py-2 font-mono text-xs">{g.ensemblId}</td>
							<td class="px-3 py-2">{g.geneType}</td>
							<td class="px-3 py-2 font-mono text-xs">chr{v.chromName}:{g.start.toLocaleString()}-{g.end.toLocaleString()}</td>
							<td class="px-3 py-2 font-mono text-xs">{g.strand}</td>
							<td class="px-3 py-2">
								<a href={clinpgxSearchHref(g.symbol)} target="_blank" rel="noreferrer" class="text-primary hover:underline">Search</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="px-4 py-6 text-sm text-muted-foreground">No overlapping genes were found for this position.</div>
	{/if}
</section>

{#if vrsJson}
	<section class="card-surface overflow-hidden">
		<div class="flex items-center justify-between gap-3 border-b px-4 py-3">
			<h2 class="text-base font-semibold">GA4GH VRS Allele</h2>
			<button onclick={copyVrsAllele} class="shrink-0 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">
				{copiedVrs ? 'copied!' : 'Copy VRS'}
			</button>
		</div>
		<pre class="max-h-96 overflow-auto bg-muted/35 p-4 text-xs leading-relaxed"><code>{vrsJson}</code></pre>
	</section>
{/if}
