<script lang="ts">
	import { onDestroy, setContext } from 'svelte';
	import type { Action } from 'svelte/action';
	import type { ExpressionSpecification, GeoJSONSource, Map as MapboxMap, Popup, StyleSpecification } from 'mapbox-gl';
	import type { FeatureCollection, Point } from 'geojson';
	import 'mapbox-gl/dist/mapbox-gl.css';
	import { key, mapboxgl } from '$lib/mapboxgl';
	import { TENANTS } from '$lib/tenants';
	import { DATASETS, biobankSlugForDatasetSlug } from '$lib/datasets';
	import { BRAZIL_STATES } from '$lib/data/brazil-states';
	import { LANGS, lang } from '$lib/i18n';
	import AtlasHome from '$lib/templates/AtlasHome.svelte';

	type Population = {
		name: string;
		country: string;
		countryCode: string;
		lat: number;
		lon: number;
		sampleCount: number;
		variantCount: number;
		biobankSlug: string;
		biobankName: string;
		countryMappings?: Array<{
			country: string;
			countryCode: string;
			regionGroup: string;
			subpopulationCode: string;
			subpopulationName: string;
			sampleCount: number;
		}>;
	};

	type CountryMapping = NonNullable<Population['countryMappings']>[number];

	type DisplayDataset = {
		slug?: string;
		title: string;
		description?: string;
		release?: string;
		assay?: string;
		genomeBuild?: string;
		participants?: number;
		variants?: number;
		biobankSlug?: string;
		superPopulation?: string;
	};

	const CARIBBEAN_CODES = new Set(['BS', 'BB', 'BM', 'VG', 'LC', 'TT']);
	const FALLBACK_DATASET_STATS: Record<string, { participants: number; variants: number }> = {
		'cari-caribbean': { participants: 1475, variants: 1053817 },
		'bipmed-wes': { participants: 203, variants: 708719 },
		'pgp-usa': { participants: 463, variants: 2907156 },
		'1kgp-afr': { participants: 893, variants: 1932985 },
		'1kgp-amr': { participants: 490, variants: 1932985 },
		'1kgp-eas': { participants: 585, variants: 1932985 },
		'1kgp-eur': { participants: 633, variants: 1932985 },
		'1kgp-sas': { participants: 601, variants: 1932985 }
	};

	type CountryRow = {
		code: string;
		name: string;
		samples: number;
		variants: number;
		center: [number, number];
		sources: string[];
	};

	type CoverageRow = {
		code: string;
		name: string;
		samples: number | null;
		subtitle: string;
		center: [number, number];
	};

	const fallbackDashboard = {
		biobanks: [
			{
				slug: 'carigenetics',
				name: 'CariGenetics',
				description: 'Caribbean population allele-frequency reference.',
				website: 'https://carigenetics.com',
				totalSamples: 1475,
				totalVariants: 1053817
			},
			{ slug: 'bipmed', name: 'BIPMed', description: 'Brazilian Initiative on Precision Medicine — Brazil.', website: 'https://bipmed.org', totalSamples: 203, totalVariants: 708719 },
			{ slug: 'pgp-harvard', name: 'PGP Harvard', description: 'Harvard Personal Genome Project — United States.', website: 'https://pgp.med.harvard.edu', totalSamples: 463, totalVariants: 2907156 },
			{ slug: '1kgp', name: '1000 Genomes Project', description: '1000 Genomes Project super-population allele frequencies.', website: 'https://www.internationalgenome.org', totalSamples: 3202, totalVariants: 1932985 }
		],
		populations: [
			{ name: 'Bermuda', country: 'Bermuda', countryCode: 'BM', lat: 32.308, lon: -64.751, sampleCount: 610, variantCount: 1053817, biobankSlug: 'carigenetics', biobankName: 'CariGenetics' },
			{ name: 'USA', country: 'United States', countryCode: 'US', lat: 39.83, lon: -98.58, sampleCount: 463, variantCount: 2907156, biobankSlug: 'pgp-harvard', biobankName: 'PGP Harvard' },
			{ name: 'Saint Lucia', country: 'Saint Lucia', countryCode: 'LC', lat: 13.909, lon: -60.979, sampleCount: 249, variantCount: 1053817, biobankSlug: 'carigenetics', biobankName: 'CariGenetics' },
			{ name: 'Brazil', country: 'Brazil', countryCode: 'BR', lat: -14.235, lon: -51.925, sampleCount: 203, variantCount: 708719, biobankSlug: 'bipmed', biobankName: 'BIPMed' },
			{ name: 'Trinidad & Tobago', country: 'Trinidad and Tobago', countryCode: 'TT', lat: 10.692, lon: -61.222, sampleCount: 193, variantCount: 1053817, biobankSlug: 'carigenetics', biobankName: 'CariGenetics' },
			{ name: 'Bahamas', country: 'Bahamas', countryCode: 'BS', lat: 25.034, lon: -77.396, sampleCount: 169, variantCount: 1053817, biobankSlug: 'carigenetics', biobankName: 'CariGenetics' },
			{ name: 'Barbados', country: 'Barbados', countryCode: 'BB', lat: 13.194, lon: -59.543, sampleCount: 146, variantCount: 1053817, biobankSlug: 'carigenetics', biobankName: 'CariGenetics' },
			{ name: 'British Virgin Islands', country: 'British Virgin Islands', countryCode: 'VG', lat: 18.421, lon: -64.64, sampleCount: 108, variantCount: 1053817, biobankSlug: 'carigenetics', biobankName: 'CariGenetics' },
			{
				name: 'AFR',
				country: 'Multiple countries',
				countryCode: 'XK',
				lat: 7,
				lon: 18,
				sampleCount: 893,
				variantCount: 1932985,
				biobankSlug: '1kgp',
				biobankName: '1000 Genomes Project',
				countryMappings: [
					{ country: 'Barbados', countryCode: 'BB', regionGroup: 'Caribbean', subpopulationCode: 'ACB', subpopulationName: 'African Caribbean in Barbados', sampleCount: 120 },
					{ country: 'Kenya', countryCode: 'KE', regionGroup: 'East Africa', subpopulationCode: 'LWK', subpopulationName: 'Luhya in Webuye, Kenya', sampleCount: 120 },
					{ country: 'United States', countryCode: 'US', regionGroup: 'North America', subpopulationCode: 'ASW', subpopulationName: 'African Ancestry in SW USA', sampleCount: 62 },
					{ country: 'Nigeria', countryCode: 'NG', regionGroup: 'West Africa', subpopulationCode: 'ESN', subpopulationName: 'Esan in Nigeria', sampleCount: 173 },
					{ country: 'Nigeria', countryCode: 'NG', regionGroup: 'West Africa', subpopulationCode: 'YRI', subpopulationName: 'Yoruba in Ibadan, Nigeria', sampleCount: 120 },
					{ country: 'Sierra Leone', countryCode: 'SL', regionGroup: 'West Africa', subpopulationCode: 'MSL', subpopulationName: 'Mende in Sierra Leone', sampleCount: 128 },
					{ country: 'The Gambia', countryCode: 'GM', regionGroup: 'West Africa', subpopulationCode: 'GWD', subpopulationName: 'Gambian in Western Division - Mandinka', sampleCount: 179 }
				]
			},
			{
				name: 'AMR',
				country: 'Multiple countries',
				countryCode: 'XK',
				lat: 2,
				lon: -74,
				sampleCount: 490,
				variantCount: 1932985,
				biobankSlug: '1kgp',
				biobankName: '1000 Genomes Project',
				countryMappings: [
					{ country: 'Puerto Rico', countryCode: 'PR', regionGroup: 'Caribbean', subpopulationCode: 'PUR', subpopulationName: 'Puerto Rican in Puerto Rico', sampleCount: 139 },
					{ country: 'United States', countryCode: 'US', regionGroup: 'Latin American diaspora', subpopulationCode: 'MXL', subpopulationName: 'Mexican Ancestry in Los Angeles CA USA', sampleCount: 71 },
					{ country: 'Colombia', countryCode: 'CO', regionGroup: 'South America', subpopulationCode: 'CLM', subpopulationName: 'Colombian in Medellin, Colombia', sampleCount: 136 },
					{ country: 'Peru', countryCode: 'PE', regionGroup: 'South America', subpopulationCode: 'PEL', subpopulationName: 'Peruvian in Lima Peru', sampleCount: 122 }
				]
			},
			{
				name: 'EAS',
				country: 'Multiple countries',
				countryCode: 'XK',
				lat: 30,
				lon: 112,
				sampleCount: 585,
				variantCount: 1932985,
				biobankSlug: '1kgp',
				biobankName: '1000 Genomes Project',
				countryMappings: [
					{ country: 'China', countryCode: 'CN', regionGroup: 'East Asia', subpopulationCode: 'CDX', subpopulationName: 'Chinese Dai in Xishuangbanna, China', sampleCount: 102 },
					{ country: 'China', countryCode: 'CN', regionGroup: 'East Asia', subpopulationCode: 'CHB', subpopulationName: 'Han Chinese in Beijing, China', sampleCount: 120 },
					{ country: 'China', countryCode: 'CN', regionGroup: 'East Asia', subpopulationCode: 'CHS', subpopulationName: 'Han Chinese South', sampleCount: 163 },
					{ country: 'Japan', countryCode: 'JP', regionGroup: 'East Asia', subpopulationCode: 'JPT', subpopulationName: 'Japanese in Tokyo, Japan', sampleCount: 120 },
					{ country: 'Vietnam', countryCode: 'VN', regionGroup: 'Southeast Asia', subpopulationCode: 'KHV', subpopulationName: 'Kinh in Ho Chi Minh City, Vietnam', sampleCount: 124 }
				]
			},
			{
				name: 'EUR',
				country: 'Multiple countries',
				countryCode: 'XK',
				lat: 50,
				lon: 9,
				sampleCount: 633,
				variantCount: 1932985,
				biobankSlug: '1kgp',
				biobankName: '1000 Genomes Project',
				countryMappings: [
					{ country: 'Finland', countryCode: 'FI', regionGroup: 'Europe', subpopulationCode: 'FIN', subpopulationName: 'Finnish in Finland', sampleCount: 103 },
					{ country: 'Italy', countryCode: 'IT', regionGroup: 'Europe', subpopulationCode: 'TSI', subpopulationName: 'Toscani in Italia', sampleCount: 114 },
					{ country: 'Spain', countryCode: 'ES', regionGroup: 'Europe', subpopulationCode: 'IBS', subpopulationName: 'Iberian Populations in Spain', sampleCount: 157 },
					{ country: 'United Kingdom', countryCode: 'GB', regionGroup: 'Europe', subpopulationCode: 'GBR', subpopulationName: 'British From England and Scotland', sampleCount: 100 },
					{ country: 'United States', countryCode: 'US', regionGroup: 'European diaspora', subpopulationCode: 'CEU', subpopulationName: 'Utah residents with Northern and Western European ancestry from the CEPH collection', sampleCount: 0 }
				]
			},
			{
				name: 'SAS',
				country: 'Multiple countries',
				countryCode: 'XK',
				lat: 22,
				lon: 76,
				sampleCount: 601,
				variantCount: 1932985,
				biobankSlug: '1kgp',
				biobankName: '1000 Genomes Project',
				countryMappings: [
					{ country: 'Bangladesh', countryCode: 'BD', regionGroup: 'South Asia', subpopulationCode: 'BEB', subpopulationName: 'Bengali in Bangladesh', sampleCount: 144 },
					{ country: 'Pakistan', countryCode: 'PK', regionGroup: 'South Asia', subpopulationCode: 'PJL', subpopulationName: 'Punjabi in Lahore, Pakistan', sampleCount: 158 },
					{ country: 'United Kingdom', countryCode: 'GB', regionGroup: 'South Asian diaspora', subpopulationCode: 'ITU', subpopulationName: 'Indian Telugu in the U.K.', sampleCount: 118 },
					{ country: 'United Kingdom', countryCode: 'GB', regionGroup: 'South Asian diaspora', subpopulationCode: 'STU', subpopulationName: 'Sri Lankan Tamil in the UK', sampleCount: 128 },
					{ country: 'United States', countryCode: 'US', regionGroup: 'South Asian diaspora', subpopulationCode: 'GIH', subpopulationName: 'Gujarati Indians in Houston, Texas, USA', sampleCount: 109 }
				]
			}
		],
		totals: { participants: 5343, datasetCount: 8, variants: 1966448, populations: 13 },
		variantClasses: { common: 1735446, lowFreq: 191949, rare: 11904 }
	};

	const COUNTRY_CENTERS: Record<string, [number, number]> = {
		BB: [-59.543, 13.194],
		BD: [90.3563, 23.685],
		BM: [-64.751, 32.308],
		BR: [-51.925, -14.235],
		BS: [-77.396, 25.034],
		CN: [104.1954, 35.8617],
		CO: [-74.2973, 4.5709],
		ES: [-3.7492, 40.4637],
		FI: [25.7482, 61.9241],
		GB: [-3.436, 55.3781],
		GM: [-15.3101, 13.4432],
		IT: [12.5674, 41.8719],
		JP: [138.2529, 36.2048],
		KE: [37.9062, -0.0236],
		LC: [-60.979, 13.909],
		NG: [8.6753, 9.082],
		PE: [-75.0152, -9.19],
		PK: [69.3451, 30.3753],
		PR: [-66.5901, 18.2208],
		SL: [-11.7799, 8.4606],
		TT: [-61.222, 10.692],
		US: [-98.5795, 39.8283],
		VG: [-64.64, 18.421],
		VN: [108.2772, 14.0583]
	};

	const COUNTRY_ZOOMS: Record<string, number> = {
		BB: 8,
		BM: 8.8,
		BS: 6.2,
		LC: 8.2,
		PR: 7.1,
		TT: 7.4,
		VG: 8.4
	};
	const DEFAULT_MAP_CENTER: [number, number] = [0, 22];
	const DEFAULT_MAP_ZOOM = 2;

	let { data } = $props();
	const rawDashboard = $derived(data.dashboard ?? data ?? fallbackDashboard);
	const dashboard = $derived.by(() => {
		const source = (rawDashboard ?? fallbackDashboard) as typeof fallbackDashboard & {
			datasets?: Array<Record<string, unknown>>;
		};
		const totals = source.totals ?? {};
		const variantClasses = source.variantClasses ?? {};
		const common = Number(variantClasses.common ?? 0);
		const lowFreq = Number(variantClasses.lowFreq ?? 0);
		const rare = Number(variantClasses.rare ?? 0);
		const hasVariantClasses = common + lowFreq + rare > 0;

		return {
			...source,
			biobanks: source.biobanks?.length ? source.biobanks : fallbackDashboard.biobanks,
			populations: source.populations?.length ? source.populations : fallbackDashboard.populations,
			datasets: source.datasets ?? [],
			totals: {
				participants: Number(totals.participants ?? 0) > 0 ? Number(totals.participants) : fallbackDashboard.totals.participants,
				datasetCount: Number(totals.datasetCount ?? 0) > 0 ? Number(totals.datasetCount) : fallbackDashboard.totals.datasetCount,
				variants: Number(totals.variants ?? 0) > 0 ? Number(totals.variants) : fallbackDashboard.totals.variants,
				populations: Number(totals.populations ?? 0) > 0 ? Number(totals.populations) : fallbackDashboard.totals.populations
			},
			variantClasses: hasVariantClasses
				? {
						common,
						lowFreq,
						rare
					}
				: fallbackDashboard.variantClasses
		};
	});
	let map: MapboxMap | undefined;
	let popup: Popup | undefined;
	let selectedCode = $state<string | null>(null);
	let selectedDatasetSlug = $state<string | null>(null);
	let searchQuery = $state('');

	setContext(key, {
		getMap: () => map
	});

	const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString();
	const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '0%');
	const tx = (en: string, pt: string) => ($lang === 'pt' ? pt : en);
	const datasetCountValue = (slug: string, value: unknown, field: 'participants' | 'variants') => {
		const live = Number(value ?? 0);
		return live > 0 ? live : (FALLBACK_DATASET_STATS[slug]?.[field] ?? 0);
	};

	const countryRows = $derived.by<CountryRow[]>(() => {
		const byCode = new Map<string, CountryRow>();
		function upsert(code: string, name: string, samples: number, variants: number, center: [number, number], source: string) {
			if (!code || code === 'XK') return;
			const existing = byCode.get(code);
			if (existing) {
				existing.samples += samples;
				existing.variants = Math.max(existing.variants, variants);
				if (!existing.sources.includes(source)) existing.sources.push(source);
			} else {
				byCode.set(code, { code, name, samples, variants, center, sources: [source] });
			}
		}

		for (const p of dashboard.populations as Population[]) {
			if (p.countryCode !== 'XK') {
				upsert(p.countryCode, p.country, p.sampleCount, p.variantCount, [p.lon, p.lat], p.biobankName);
			}
			for (const m of p.countryMappings ?? []) {
				const center = COUNTRY_CENTERS[m.countryCode];
				if (center) upsert(m.countryCode, m.country, m.sampleCount, p.variantCount, center, p.name);
			}
		}
		return [...byCode.values()].sort((a, b) => b.samples - a.samples || a.name.localeCompare(b.name));
	});

	const tenantFor = (slug?: string) => TENANTS.find((tenant) => tenant.slug === slug);

	const displayDatasets = $derived.by<DisplayDataset[]>(() => {
		const live = dashboard.datasets as Array<Record<string, unknown>> | undefined;
		if (live?.length) {
			return live.map((dataset) => {
				const slug = String(dataset.slug ?? '');
				return {
					slug,
					title: String(dataset.title ?? ''),
					description: dataset.description ? String(dataset.description) : undefined,
					release: dataset.release ? String(dataset.release) : undefined,
					assay: dataset.assay ? String(dataset.assay) : undefined,
					genomeBuild: dataset.genomeBuild ? String(dataset.genomeBuild) : undefined,
					participants: datasetCountValue(slug, dataset.participants, 'participants'),
					variants: datasetCountValue(slug, dataset.variants, 'variants'),
					biobankSlug: biobankSlugForDatasetSlug(slug),
					superPopulation: dataset.superPopulation ? String(dataset.superPopulation) : undefined
				};
			});
		}

		return DATASETS.map((dataset) => {
			const stats = FALLBACK_DATASET_STATS[dataset.id] ?? { participants: 0, variants: 0 };
			return {
				slug: dataset.id,
				title: dataset.title,
				description: dataset.description,
				release: dataset.release,
				assay: dataset.assay,
				genomeBuild: dataset.genomeBuild,
				participants: stats.participants,
				variants: stats.variants,
				biobankSlug: dataset.biobankSlug,
				superPopulation: dataset.superPopulation
			};
		});
	});

	function isBipmedDataset(dataset?: DisplayDataset | null) {
		return dataset?.slug === 'bipmed-wes' || dataset?.biobankSlug === 'bipmed';
	}

	function isPgpDataset(dataset?: DisplayDataset | null) {
		return dataset?.slug === 'pgp-usa' || dataset?.biobankSlug === 'pgp-harvard';
	}

	function datasetCoverageLabel(dataset: DisplayDataset) {
		if (dataset.slug === 'cari-caribbean' || dataset.biobankSlug === 'carigenetics') return tx('Caribbean coverage', 'Cobertura do Caribe');
		if (isBipmedDataset(dataset)) return tx('Brazil states', 'Estados do Brasil');
		if (isPgpDataset(dataset)) return tx('United States coverage', 'Cobertura dos Estados Unidos');
		return tx('Countries in dataset', 'Países no conjunto de dados');
	}

	function countryCodesForDataset(dataset: DisplayDataset) {
		if (dataset.slug === 'cari-caribbean' || dataset.biobankSlug === 'carigenetics') {
			return [...CARIBBEAN_CODES];
		}
		if (dataset.slug === 'bipmed-wes') return ['BR'];
		if (dataset.slug === 'pgp-usa') return ['US'];
		if (dataset.superPopulation) {
			const population = (dashboard.populations as Population[]).find((item) => item.name === dataset.superPopulation);
			if (population?.countryMappings?.length) {
				return [...new Set(population.countryMappings.map((mapping) => mapping.countryCode))];
			}
		}
		return [];
	}

	const selectedCountry = $derived(selectedCode ? (countryRows.find((country) => country.code === selectedCode) ?? null) : null);
	const selectedDataset = $derived(
		selectedDatasetSlug ? (displayDatasets.find((dataset) => dataset.slug === selectedDatasetSlug) ?? null) : null
	);
	const scopedCountryRows = $derived.by(() => {
		if (!selectedDataset) return countryRows;
		const codes = new Set(countryCodesForDataset(selectedDataset));
		return countryRows.filter((country) => codes.has(country.code));
	});
	const scopedCoverageRows = $derived.by((): CoverageRow[] => {
		if (!selectedDataset) return [];
		if (isBipmedDataset(selectedDataset)) {
			return BRAZIL_STATES.map((state) => ({
				code: state.code,
				name: state.name,
				samples: null,
				subtitle: 'BIPMed',
				center: state.center
			}));
		}
		return scopedCountryRows.map((country) => ({
			code: country.code,
			name: country.name,
			samples: country.samples,
			subtitle: country.sources.slice(0, 2).join(' + '),
			center: country.center
		}));
	});
	const highlightCountryCodes = $derived.by(() => {
		if (selectedCountry) return [selectedCountry.code];
		if (selectedDataset) {
			return countryCodesForDataset(selectedDataset).filter((code) => countryRows.some((country) => country.code === code));
		}
		return countryRows.map((country) => country.code);
	});
	const bubbleFocusCodes = $derived.by(() => {
		if (selectedCountry) return [selectedCountry.code];
		if (selectedDataset) return countryCodesForDataset(selectedDataset);
		return countryRows.map((country) => country.code);
	});
	const countryHighlightExpression = $derived(['in', ['get', 'iso_3166_1'], ['literal', highlightCountryCodes]]);
	const variantMixTotal = $derived(
		selectedCountry?.variants ?? selectedDataset?.variants ?? dashboard.totals.variants
	);
	const variantClassRows = $derived([
		{ key: 'common', label: tx('Common', 'Comuns'), count: dashboard.variantClasses.common, color: '#4a6fd8' },
		{ key: 'lowFreq', label: tx('Low-freq', 'Baixa freq.'), count: dashboard.variantClasses.lowFreq, color: '#7b5cc4' },
		{ key: 'rare', label: tx('Rare', 'Raras'), count: dashboard.variantClasses.rare, color: '#e2689a' }
	]);
	const countryMaskFilter = [
		'all',
		['==', ['get', 'disputed'], 'false'],
		['any', ['==', 'all', ['get', 'worldview']], ['in', 'US', ['get', 'worldview']]]
	];
	const openMinedMapPalette = [
		'#b9dfb8',
		'#a9ddd3',
		'#f5e6b8',
		'#f7d39f',
		'#f5bd9e',
		'#dfb1b9',
		'#c7b4ca'
	];
	const directPopulations = $derived((dashboard.populations as Population[]).filter((p) => p.countryCode !== 'XK').sort((a, b) => b.sampleCount - a.sampleCount));
	const bubbleColorExpression: ExpressionSpecification = [
		'step',
		['get', 'samples'],
		'#53bea9',
		150,
		'#f2d98c',
		350,
		'#f79763'
	];
	const collectionGeoJson = $derived<FeatureCollection<Point, { code: string; name: string; samples: number; label: string; sources: string }>>({
		type: 'FeatureCollection',
		features: countryRows.map((country) => ({
			type: 'Feature',
			properties: {
				code: country.code,
				name: country.name,
				samples: country.samples,
				label: fmt(country.samples),
				sources: country.sources.join(' + ')
			},
			geometry: {
				type: 'Point',
				coordinates: country.center
			}
		}))
	});

	function normalizeSearch(value: string) {
		return value.trim().toLowerCase();
	}

	function findMapSearchMatch(query: string) {
		const q = normalizeSearch(query);
		if (!q) return undefined;
		const directMatch = countryRows.find((country) => normalizeSearch(country.name) === q || normalizeSearch(country.code) === q);
		if (directMatch) return directMatch;
		if (q === 'caribbean') {
			return countryRows.find((country) => country.code === 'BM') ?? countryRows.find((country) => ['BS', 'BB', 'BM', 'VG', 'LC', 'TT', 'PR'].includes(country.code));
		}
		return countryRows.find((country) => {
			const sources = country.sources.map(normalizeSearch);
			return normalizeSearch(country.name).includes(q) || sources.some((source) => source === q || source.includes(q));
		});
	}

	function handleSearchSubmit(event: SubmitEvent) {
		const country = findMapSearchMatch(searchQuery);
		if (!country) return;
		event.preventDefault();
		flyToCountry(country);
	}

	function countrySourceBanks(country: CountryRow) {
		const banks = dashboard.biobanks as Array<{ slug?: string; name: string; website?: string }>;
		const seen = new Set<string>();
		const results = [];
		for (const source of country.sources) {
			const normalized = normalizeSearch(source);
			let bank = banks.find((item) => normalizeSearch(item.name) === normalized);
			if (!bank && ['afr', 'amr', 'eas', 'eur', 'sas'].includes(normalized)) {
				bank = banks.find((item) => item.slug === '1kgp');
			}
			if (!bank) continue;
			const key = bank.slug ?? bank.name;
			if (seen.has(key)) continue;
			seen.add(key);
			results.push(bank);
		}
		return results;
	}

	function countryMappingsForCode(code: string) {
		const rows: Array<CountryMapping & { superpop: string }> = [];
		for (const population of dashboard.populations as Population[]) {
			for (const mapping of population.countryMappings ?? []) {
				if (mapping.countryCode === code) {
					rows.push({ ...mapping, superpop: population.name });
				}
			}
		}
		return rows.sort((a, b) => b.sampleCount - a.sampleCount || a.subpopulationName.localeCompare(b.subpopulationName));
	}

	function caribbeanPeerCountries(country: CountryRow) {
		if (!CARIBBEAN_CODES.has(country.code)) return [];
		return countryRows
			.filter((row) => CARIBBEAN_CODES.has(row.code))
			.sort((a, b) => b.samples - a.samples || a.name.localeCompare(b.name));
	}

	function countryContextLine(country: CountryRow) {
		const caribbeanPeers = caribbeanPeerCountries(country);
		if (caribbeanPeers.length) {
			const total = caribbeanPeers.reduce((sum, row) => sum + row.samples, 0);
			return `${fmt(country.samples)} of ${fmt(total)} Caribbean samples`;
		}

		for (const bank of countrySourceBanks(country)) {
			const total = (dashboard.biobanks as Array<{ slug?: string; totalSamples?: number }>).find((item) => item.slug === bank.slug)?.totalSamples;
			if (total && total > country.samples) {
				return `${fmt(country.samples)} of ${fmt(total)} ${bank.name} samples`;
			}
		}

		return null;
	}

	function datasetsForCountry(country: CountryRow) {
		const bankSlugs = new Set(countrySourceBanks(country).map((bank) => bank.slug).filter(Boolean));
		const superpops = new Set(countryMappingsForCode(country.code).map((mapping) => mapping.superpop));

		return displayDatasets.filter((dataset) => {
			if (!dataset.biobankSlug || !bankSlugs.has(dataset.biobankSlug)) return false;
			if (dataset.biobankSlug === '1kgp') {
				return dataset.superPopulation ? superpops.has(dataset.superPopulation) : false;
			}
			if (dataset.biobankSlug === 'carigenetics') {
				return CARIBBEAN_CODES.has(country.code);
			}
			return true;
		});
	}

	function flyToDatasetView(dataset: DisplayDataset) {
		if (isBipmedDataset(dataset)) {
			map?.flyTo({
				center: [-51.925, -14.235],
				zoom: 3.9,
				duration: 900,
				essential: true
			});
			return;
		}

		if (isPgpDataset(dataset)) {
			map?.flyTo({
				center: [-98.58, 39.83],
				zoom: 3.4,
				duration: 900,
				essential: true
			});
			return;
		}

		const rows = countryRows.filter((country) => countryCodesForDataset(dataset).includes(country.code));
		if (!rows.length) {
			map?.flyTo({
				center: DEFAULT_MAP_CENTER,
				zoom: DEFAULT_MAP_ZOOM,
				duration: 900,
				essential: true
			});
			return;
		}

		if (rows.length === 1) {
			map?.flyTo({
				center: rows[0].center,
				zoom: COUNTRY_ZOOMS[rows[0].code] ?? 4.3,
				duration: 900,
				essential: true
			});
			return;
		}

		const lng = rows.reduce((sum, country) => sum + country.center[0], 0) / rows.length;
		const lat = rows.reduce((sum, country) => sum + country.center[1], 0) / rows.length;
		const zoom =
			dataset.slug === 'cari-caribbean'
				? 4.6
				: dataset.slug === 'bipmed-wes'
					? 3.9
					: dataset.slug === 'pgp-usa'
						? 3.4
						: dataset.superPopulation
							? 2.4
							: 3.2;

		map?.flyTo({
			center: [lng, lat],
			zoom,
			duration: 900,
			essential: true
		});
	}

	function flyToCoverageRow(row: CoverageRow, options?: { keepDataset?: boolean }) {
		selectedCode = options?.keepDataset ? selectedCode : null;
		map?.flyTo({
			center: row.center,
			zoom: isBipmedDataset(selectedDataset) ? 5.4 : 5.8,
			duration: 900,
			essential: true
		});
	}

	function selectDataset(dataset: DisplayDataset) {
		selectedDatasetSlug = dataset.slug ?? null;
		selectedCode = null;
		flyToDatasetView(dataset);
	}

	function clearDatasetSelection() {
		selectedDatasetSlug = null;
		selectedCode = null;
		map?.flyTo({
			center: DEFAULT_MAP_CENTER,
			zoom: DEFAULT_MAP_ZOOM,
			duration: 900,
			essential: true
		});
	}

	function syncMapState() {
		if (!map?.isStyleLoaded() || !map.getSource('collection-countries')) return;

		const source = map.getSource('collection-countries') as GeoJSONSource;
		source.setData(collectionGeoJson);

		map.setFilter('selected-country-fill', ['all', ...countryMaskFilter.slice(1), countryHighlightExpression]);
		map.setFilter('selected-country-outline', ['all', ...countryMaskFilter.slice(1), countryHighlightExpression]);
		map.setFilter('non-selected-country-mask', ['all', ...countryMaskFilter.slice(1), ['!', countryHighlightExpression]]);

		const focusExpression: ExpressionSpecification = [
			'case',
			['in', ['get', 'code'], ['literal', bubbleFocusCodes]],
			0.98,
			selectedDataset || selectedCountry ? 0.12 : 0.98
		];
		const haloExpression: ExpressionSpecification = [
			'case',
			['in', ['get', 'code'], ['literal', bubbleFocusCodes]],
			0.2,
			selectedDataset || selectedCountry ? 0.03 : 0.2
		];
		const labelExpression: ExpressionSpecification = [
			'case',
			['in', ['get', 'code'], ['literal', bubbleFocusCodes]],
			1,
			selectedDataset || selectedCountry ? 0.18 : 1
		];

		map.setPaintProperty('collection-country-bubbles', 'circle-opacity', focusExpression);
		map.setPaintProperty('collection-country-bubble-halo', 'circle-opacity', haloExpression);
		map.setPaintProperty('collection-country-labels', 'text-opacity', labelExpression);
	}

	function clearCountrySelection() {
		selectedCode = null;
		if (selectedDataset) {
			flyToDatasetView(selectedDataset);
			return;
		}
		map?.flyTo({
			center: DEFAULT_MAP_CENTER,
			zoom: DEFAULT_MAP_ZOOM,
			duration: 900,
			essential: true
		});
	}

	function createStyle(): StyleSpecification {
		return {
			version: 8,
			name: 'BioVault dashboard prototype',
			imports: [
				{
					id: 'basemap',
					url: 'mapbox://styles/mapbox/standard',
					config: {
						theme: 'monochrome',
						lightPreset: 'day',
						showPlaceLabels: false,
						showRoadLabels: false,
						showPointOfInterestLabels: false,
						showTransitLabels: false
					}
				}
			],
			sources: {
				composite: {
					type: 'vector',
					url: 'mapbox://mapbox.country-boundaries-v1'
				},
				'collection-countries': {
					type: 'geojson',
					data: collectionGeoJson
				}
			},
			sprite: 'mapbox://sprites/mapbox/standard',
			glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
			terrain: null,
			projection: {
				name: 'mercator'
			},
			layers: [
				{
					id: 'ocean-background',
					type: 'background',
					paint: {
						'background-color': '#d7eef4'
					}
				},
				{
					id: 'non-selected-country-mask',
					type: 'fill',
					source: 'composite',
					'source-layer': 'country_boundaries',
					filter: ['all', ...countryMaskFilter.slice(1), ['!', countryHighlightExpression]],
					paint: {
						'fill-color': '#f8f7f2',
						'fill-opacity': 0.98
					}
				},
				{
					id: 'selected-country-fill',
					type: 'fill',
					source: 'composite',
					'source-layer': 'country_boundaries',
					filter: ['all', ...countryMaskFilter.slice(1), countryHighlightExpression],
					paint: {
						'fill-color': [
							'match',
							['to-number', ['get', 'color_group']],
							1,
							openMinedMapPalette[0],
							2,
							openMinedMapPalette[1],
							3,
							openMinedMapPalette[2],
							4,
							openMinedMapPalette[3],
							5,
							openMinedMapPalette[4],
							6,
							openMinedMapPalette[5],
							7,
							openMinedMapPalette[6],
							openMinedMapPalette[3]
						],
						'fill-opacity': 0.52
					}
				},
				{
					id: 'selected-country-outline',
					type: 'line',
					source: 'composite',
					'source-layer': 'country_boundaries',
					filter: ['all', ...countryMaskFilter.slice(1), countryHighlightExpression],
					paint: {
						'line-color': '#ffffff',
						'line-opacity': 0.36,
						'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.25, 5, 0.8]
					}
				},
				{
					id: 'collection-country-bubble-halo',
					type: 'circle',
					source: 'collection-countries',
					paint: {
						'circle-color': bubbleColorExpression,
						'circle-opacity': 0.2,
						'circle-radius': ['interpolate', ['linear'], ['sqrt', ['max', ['get', 'samples'], 1]], 1, 15, 10, 21, 25, 29, 55, 36]
					}
				},
				{
					id: 'collection-country-bubbles',
					type: 'circle',
					source: 'collection-countries',
					paint: {
						'circle-color': bubbleColorExpression,
						'circle-opacity': 0.98,
						'circle-stroke-width': 0,
						'circle-radius': ['interpolate', ['linear'], ['sqrt', ['max', ['get', 'samples'], 1]], 1, 12, 10, 18, 25, 25, 55, 32]
					}
				},
				{
					id: 'collection-country-labels',
					type: 'symbol',
					source: 'collection-countries',
					layout: {
						'text-field': ['get', 'label'],
						'text-size': ['interpolate', ['linear'], ['sqrt', ['max', ['get', 'samples'], 1]], 1, 11, 25, 12.5, 55, 14],
						'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
						'text-anchor': 'center',
						'text-offset': [0, 0],
						'text-allow-overlap': false,
						'text-ignore-placement': false,
						'text-optional': true
					},
					paint: {
						'text-color': '#23202c',
						'text-halo-color': 'rgba(255, 255, 255, 0.9)',
						'text-halo-width': 1.1
					}
				}
			]
		};
	}

	function flyToCountry(country: CountryRow, options: { keepDataset?: boolean } = {}) {
		selectedCode = country.code;
		if (!options.keepDataset && selectedDatasetSlug) {
			const datasetCodes = selectedDataset ? countryCodesForDataset(selectedDataset) : [];
			if (!datasetCodes.includes(country.code)) {
				selectedDatasetSlug = null;
			}
		}
		map?.flyTo({
			center: country.center,
			zoom: COUNTRY_ZOOMS[country.code] ?? 4.3,
			duration: 900,
			essential: true
		});
	}

	const initMap: Action<HTMLDivElement> = (container) => {
		map = new mapboxgl.Map({
			container,
			style: createStyle(),
			center: DEFAULT_MAP_CENTER,
			zoom: DEFAULT_MAP_ZOOM,
			minZoom: 2,
			maxBounds: [
				[-180, -58],
				[180, 78]
			],
			renderWorldCopies: false
		});

		const resizeMap = () => map?.resize();
		const resizeObserver = new ResizeObserver(resizeMap);
		resizeObserver.observe(container);
		requestAnimationFrame(resizeMap);
		requestAnimationFrame(() => requestAnimationFrame(resizeMap));
		window.addEventListener('resize', resizeMap);

		map.on('load', () => {
			resizeMap();
			map?.setTerrain(null);
			map?.setFog(null);
			map?.setSnow(null);
			map?.setRain(null);
			syncMapState();
		});

		map.on('click', 'collection-country-bubbles', (event) => {
			const code = event.features?.[0]?.properties?.code;
			const country = countryRows.find((item) => item.code === code);
			if (country) flyToCountry(country);
		});

		map.on('mouseenter', 'collection-country-bubbles', (event) => {
			if (!map) return;
			map.getCanvas().style.cursor = 'pointer';
			const feature = event.features?.[0];
			const coordinates = (feature?.geometry as Point | undefined)?.coordinates;
			if (!feature?.properties || !coordinates) return;
			popup?.remove();
			popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 16 })
				.setLngLat(coordinates as [number, number])
				.setHTML(
					`<strong>${feature.properties.name}</strong><br>${fmt(feature.properties.samples)} samples<br>${feature.properties.sources}`
				)
				.addTo(map);
		});

		map.on('mouseleave', 'collection-country-bubbles', () => {
			if (map) map.getCanvas().style.cursor = '';
			popup?.remove();
			popup = undefined;
		});

		return {
			destroy() {
				window.removeEventListener('resize', resizeMap);
				resizeObserver.disconnect();
				popup?.remove();
				map?.remove();
				map = undefined;
			}
		};
	};

	onDestroy(() => {
		popup?.remove();
		map?.remove();
		map = undefined;
	});

	$effect(() => {
		collectionGeoJson;
		countryHighlightExpression;
		bubbleFocusCodes;
		selectedDatasetSlug;
		selectedCode;
		syncMapState();
	});
</script>

<svelte:head>
	<title>{data.tenant.name} · {data.tenant.product}</title>
	<meta name="description" content={data.tenant.tagline} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Rubik:wght@400;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

{#if data.tenant.slug === 'biovault'}
<div class="dashboard-shell">
	<div class="map" use:initMap></div>

	<form method="GET" action="/explore" class="global-search" onsubmit={handleSearchSubmit}>
		<input
			bind:value={searchQuery}
			list="dashboard-search-suggestions"
			name="q"
			placeholder={tx('Search country, cohort, gene, rsID, or position', 'Pesquisar país, coorte, gene, rsID ou posição')}
		/>
		<datalist id="dashboard-search-suggestions">
			{#each countryRows as country}
				<option value={country.name}>{country.code} · {fmt(country.samples)} {tx('samples', 'amostras')}</option>
			{/each}
			{#each directPopulations as population}
				<option value={population.name}>{population.biobankName}</option>
			{/each}
			<option value="Caribbean">{tx('Region', 'Região')}</option>
			<option value="BRCA1">{tx('Gene', 'Gene')}</option>
			<option value="rs1050828">rsID</option>
			<option value="chr17:43078520">{tx('Position', 'Posição')}</option>
		</datalist>
		<button>{tx('Explore', 'Explorar')}</button>
	</form>

	<div class="floating-title">
		<h1>{tx('Global allele-frequency network', 'Rede global de frequência alélica')}</h1>
		<p>
			{#if selectedDataset}
				{#if isBipmedDataset(selectedDataset)}
					{selectedDataset.title} · {fmt(BRAZIL_STATES.length)} {tx('states', 'estados')} · {fmt(selectedDataset.participants)} {tx('participants', 'participantes')}
				{:else if isPgpDataset(selectedDataset)}
					{selectedDataset.title} · {tx('United States', 'Estados Unidos')} · {fmt(selectedDataset.participants)} {tx('participants', 'participantes')}
				{:else}
					{selectedDataset.title} · {fmt(scopedCountryRows.length)} {tx('countries', 'países')} · {fmt(selectedDataset.participants)} {tx('participants', 'participantes')}
				{/if}
			{:else}
				{fmt(dashboard.totals.participants)} {tx('participants across', 'participantes em')} {countryRows.length} {tx('countries', 'países')}
			{/if}
		</p>
	</div>

	<nav class="top-nav" aria-label={tx('Dashboard navigation', 'Navegação do painel')}>
		<a href="/">{tx('Home', 'Início')}</a>
		<a href="/explore">{tx('Explore', 'Explorar')}</a>
		<a href="/about">{tx('About', 'Sobre')}</a>
		<a href="/contact">{tx('Contact', 'Contato')}</a>
		<a href="/api">API</a>
		<label class="language-switcher" aria-label={tx('Language', 'Idioma')}>
			<select bind:value={$lang}>
				{#each LANGS as option}
					<option value={option.code}>{option.flag} {option.code.toUpperCase()}</option>
				{/each}
			</select>
		</label>
	</nav>

	<aside class="country-panel" aria-label={tx('Countries by sample count', 'Países por número de amostras')}>
		{#snippet panelLogo(slug?: string)}
			{@const tenant = tenantFor(slug)}
			{#if tenant}
				<span class="dataset-logo" aria-hidden="true">
					{#if tenant.logoImg}
						<img src={tenant.logoImg} alt="" />
					{:else}
						<span>{tenant.logoEmoji}</span>
					{/if}
				</span>
			{/if}
		{/snippet}

		{#if selectedCountry}
			<div class="panel-heading detail-heading">
				<div>
					<p>{tx('Selected country', 'País selecionado')}</p>
					<h2>{selectedCountry.name}</h2>
				</div>
				<button type="button" class="panel-action secondary" onclick={clearCountrySelection}>{selectedDataset ? tx('Back', 'Voltar') : tx('Reset view', 'Redefinir vista')}</button>
			</div>

			<div class="country-detail">
				{#if countryContextLine(selectedCountry)}
					<p class="detail-context">{countryContextLine(selectedCountry)}</p>
				{/if}

				{#if caribbeanPeerCountries(selectedCountry).length}
					<div class="detail-section">
						<p>{tx('Caribbean breakdown', 'Detalhamento do Caribe')}</p>
						<div class="detail-list">
							{#each caribbeanPeerCountries(selectedCountry) as peer}
								<button type="button" class="detail-list-row" class:active={peer.code === selectedCountry.code} onclick={() => flyToCountry(peer)}>
									<span>{peer.name}</span>
									<strong>{fmt(peer.samples)}</strong>
								</button>
							{/each}
						</div>
					</div>
				{/if}

				{#if countryMappingsForCode(selectedCountry.code).length}
					<div class="detail-section">
						<p>{tx('1KGP subpopulations', 'Subpopulações 1KGP')}</p>
						<div class="detail-list">
							{#each countryMappingsForCode(selectedCountry.code) as mapping}
								<div class="detail-list-row static">
									<span>{mapping.subpopulationName}</span>
									<strong>{fmt(mapping.sampleCount)}</strong>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#each datasetsForCountry(selectedCountry) as dataset}
					<article class="meta-dataset compact">
						<div class="meta-dataset-intro">
							{@render panelLogo(dataset.biobankSlug)}
							<div class="meta-dataset-copy">
								<div class="meta-dataset-head">
									<p>{tx('Dataset', 'Conjunto de dados')}</p>
									{#if dataset.release}<span class="meta-release">{dataset.release}</span>{/if}
								</div>
								<h3>{dataset.title}</h3>
								{#if dataset.description}<p class="meta-desc">{dataset.description}</p>{/if}
							</div>
						</div>
						<dl class="meta-grid">
							<div><dt>{tx('Participants', 'Participantes')}</dt><dd>{fmt(dataset.participants)}</dd></div>
							<div><dt>{tx('Variants', 'Variantes')}</dt><dd>{fmt(dataset.variants)}</dd></div>
							<div><dt>{tx('Assay', 'Ensaio')}</dt><dd>{dataset.assay}</dd></div>
							<div><dt>{tx('Build', 'Montagem')}</dt><dd>{dataset.genomeBuild}</dd></div>
						</dl>
					</article>
				{/each}
			</div>
		{:else if selectedDataset}
			<div class="panel-heading detail-heading">
				<div class="detail-heading-main">
					{@render panelLogo(selectedDataset.biobankSlug)}
					<div>
						<p>{tx('Dataset', 'Conjunto de dados')}</p>
						<h2>{selectedDataset.title}</h2>
					</div>
				</div>
				<button type="button" class="panel-action secondary" onclick={clearDatasetSelection}>{tx('Reset view', 'Redefinir vista')}</button>
			</div>

			<div class="country-detail">
				{#if selectedDataset.description}
					<p class="detail-context">{selectedDataset.description}</p>
				{/if}

				<article class="meta-dataset compact">
					<div class="meta-dataset-head">
						<p>{tx('Dataset stats', 'Estatísticas do conjunto')}</p>
						{#if selectedDataset.release}<span class="meta-release">{selectedDataset.release}</span>{/if}
					</div>
					<dl class="meta-grid">
						<div><dt>{tx('Participants', 'Participantes')}</dt><dd>{fmt(selectedDataset.participants)}</dd></div>
						<div><dt>{tx('Variants', 'Variantes')}</dt><dd>{fmt(selectedDataset.variants)}</dd></div>
						<div><dt>{tx('Assay', 'Ensaio')}</dt><dd>{selectedDataset.assay}</dd></div>
						<div><dt>{tx('Build', 'Montagem')}</dt><dd>{selectedDataset.genomeBuild}</dd></div>
					</dl>
				</article>

				<div class="detail-section">
					<p>{datasetCoverageLabel(selectedDataset)}</p>
					<div class="country-list inset">
						{#each scopedCoverageRows as row}
							<button type="button" onclick={() => flyToCoverageRow(row, { keepDataset: true })}>
								<span class="country-main">
									<span>{row.name}</span>
									<small>{row.subtitle}</small>
								</span>
								<span class="country-count">
									<strong>{row.samples == null ? '—' : fmt(row.samples)}</strong>
									<small>{row.code}</small>
								</span>
							</button>
						{/each}
					</div>
				</div>
			</div>
		{:else}
			<div class="panel-heading">
				<h2>{tx('Countries by samples', 'Países por amostras')}</h2>
			</div>

			<div class="country-list">
				{#each countryRows as country}
					<button type="button" class:active={country.code === selectedCode} onclick={() => flyToCountry(country)}>
						<span class="country-main">
							<span>{country.name}</span>
							<small>{country.sources.slice(0, 2).join(' + ')}</small>
						</span>
						<span class="country-count">
							<strong>{fmt(country.samples)}</strong>
							<small>{country.code}</small>
						</span>
					</button>
				{/each}
			</div>
		{/if}
	</aside>

	<section class="variant-mix" aria-label={tx('Variants', 'Variantes')}>
		<div class="variant-head">
			<h2>{tx('Variants', 'Variantes')}</h2>
			<strong>{fmt(variantMixTotal)}</strong>
		</div>

		<div class="variant-bar" aria-hidden="true">
			{#each variantClassRows as row (row.key)}
				<span style={`width:${pct(row.count, dashboard.totals.variants)}; background:${row.color}`}></span>
			{/each}
		</div>
		<div class="variant-key">
			{#each variantClassRows as row (row.key)}
				<div class="variant-key-slot">
					<div class="variant-key-item">
						<span class="variant-key-label">
							<span class="variant-swatch" style:background-color={row.color}></span>
							{row.label}
						</span>
						<strong>{fmt(row.count)}</strong>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<section class="bottom-panel" aria-label={tx('Databases', 'Bancos de dados')}>
		<div class="panel-heading dataset-heading">
			<h2>{tx('Databases', 'Bancos de dados')}</h2>
			<span class="dataset-count">
				<strong>{displayDatasets.length}</strong>
				<small>{tx('databases', 'bancos')}</small>
			</span>
		</div>

		<div class="database-scroll">
			{#each displayDatasets as dataset}
				{@const tenant = tenantFor(dataset.biobankSlug)}
				<button
					type="button"
					class="database-row"
					class:active={selectedDatasetSlug === dataset.slug}
					onclick={() => selectDataset(dataset)}
				>
					<span class="dataset-logo" aria-hidden="true">
						{#if tenant?.logoImg}
							<img src={tenant.logoImg} alt="" />
						{:else}
							<span>{tenant?.logoEmoji ?? '🧬'}</span>
						{/if}
					</span>
					<span class="database-row-main">
						<span class="database-row-title">{dataset.title}</span>
						<small>{dataset.release} · {fmt(dataset.participants)} {tx('participants', 'participantes')} · {dataset.assay}</small>
					</span>
				</button>
			{/each}
			<a href="/contact" class="dataset-cta">{tx('Want to contribute data?', 'Quer contribuir com dados?')} <strong>{tx('Get in touch', 'Entre em contato')}</strong></a>
		</div>
	</section>

	<p class="site-footer">© BioVault GA4GH VRS · <a href="/api">Beacon v2</a></p>
</div>
{:else}
	<AtlasHome {data} />
{/if}

<style>
	:global(body:has(.dashboard-shell)) {
		overflow: hidden;
	}

	:global(body:has(.dashboard-shell) header),
	:global(body:has(.dashboard-shell) footer) {
		display: none;
	}

	:global(body:has(.dashboard-shell) main) {
		max-width: none;
		padding: 0;
	}

	.dashboard-shell {
		--om-white: #ffffff;
		--om-gray-50: #fcfcfd;
		--om-gray-100: #f7f6f9;
		--om-gray-150: #f4f3f6;
		--om-gray-200: #f1f0f4;
		--om-gray-300: #ecebef;
		--om-gray-400: #cfcdd6;
		--om-gray-500: #b4b0bf;
		--om-gray-550: #868394;
		--om-gray-600: #5e5a72;
		--om-gray-700: #464257;
		--om-gray-750: #353243;
		--om-gray-800: #2e2b3b;
		--om-gray-850: #272532;
		--om-gray-900: #23202c;
		--om-gray-950: #17161d;
		--om-teal-100: #ddeef3;
		--om-teal-600: #388ca8;
		--om-teal-700: #2a697e;
		--om-green-600: #3c9f8b;
		--om-gold-500: #f8c073;
		--om-red-500: #cc677b;
		--om-radius-xs: 2px;
		--om-radius-s: 6px;
		--om-radius-m: 8px;
		--om-radius-l: 16px;
		--om-space-xs: 6px;
		--om-space-s: 8px;
		--om-space-m: 12px;
		--om-space-l: 16px;
		--om-space-xl: 20px;
		--screen-inset: 24px;
		--bottom-inset: 28px;
		--side-panel-width: min(370px, calc(100vw - 32px));
		position: relative;
		height: 100vh;
		width: 100%;
		overflow: hidden;
		background: var(--om-gray-50);
		color: var(--om-gray-850);
		font-family: 'Inter', system-ui, sans-serif;
		font-weight: 400;
	}

	.map {
		position: absolute;
		inset: 0;
	}

	.country-panel,
	.bottom-panel,
	.variant-mix {
		position: absolute;
		z-index: 2;
		border: 0;
		border-radius: var(--om-radius-m);
		background: color-mix(in srgb, var(--om-white) 85%, transparent);
		box-shadow: 0 10px 28px rgb(46 43 59 / 0.08);
		backdrop-filter: blur(12px);
	}

	.floating-title {
		position: absolute;
		z-index: 2;
		left: var(--screen-inset);
		top: var(--screen-inset);
		max-width: min(360px, calc(100vw - 32px));
		color: var(--om-gray-850);
		text-shadow:
			0 1px 0 rgb(255 255 255 / 0.78),
			0 8px 24px rgb(255 255 255 / 0.72);
	}

	.floating-title h1 {
		margin: 0;
		font-family: 'Rubik', 'Inter', system-ui, sans-serif;
		font-size: 20px;
		font-weight: 700;
		line-height: 1.2;
	}

	.floating-title p {
		margin-top: 4px;
		font-size: 12px;
		font-weight: 600;
		line-height: 1.35;
		color: var(--om-gray-600);
	}

	.top-nav {
		position: absolute;
		z-index: 2;
		top: var(--screen-inset);
		right: var(--screen-inset);
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		justify-content: flex-end;
		gap: 14px;
		max-width: calc(100vw - 32px);
		padding: 10px 14px;
		border-radius: var(--om-radius-m);
		background: color-mix(in srgb, var(--om-white) 58%, transparent);
		backdrop-filter: blur(8px);
	}

	.top-nav a {
		font-size: 14px;
		font-weight: 700;
		line-height: 1.3;
		color: var(--om-gray-600);
		text-decoration: none;
	}

	.top-nav a:hover {
		color: var(--om-teal-700);
		text-decoration: underline;
	}

	.language-switcher {
		display: flex;
		align-items: center;
		margin-left: 2px;
		line-height: 1;
	}

	.language-switcher select {
		height: 24px;
		width: 68px;
		border: 1px solid color-mix(in srgb, var(--om-gray-400) 55%, transparent);
		border-radius: var(--om-radius-s);
		background: color-mix(in srgb, var(--om-white) 62%, transparent);
		padding: 0 22px 0 7px;
		font-size: 12px;
		font-weight: 700;
		line-height: 1;
		cursor: pointer;
		color: var(--om-gray-700);
	}

	.language-switcher select:hover,
	.language-switcher select:focus {
		border-color: color-mix(in srgb, var(--om-teal-600) 52%, transparent);
		background: color-mix(in srgb, var(--om-teal-100) 68%, var(--om-white));
		outline: none;
	}

	.global-search {
		position: absolute;
		z-index: 3;
		top: var(--screen-inset);
		left: 50%;
		display: flex;
		align-items: center;
		width: clamp(460px, 42vw, 680px);
		gap: var(--om-space-s);
		transform: translateX(-50%);
		--search-control-height: 48px;
		--search-shadow: 0 8px 22px rgb(46 43 59 / 0.1);
	}

	p,
	h1,
	h2 {
		margin: 0;
	}

	h1,
	h2 {
		font-family: 'Rubik', 'Inter', system-ui, sans-serif;
		font-weight: 700;
		letter-spacing: 0;
		color: var(--om-gray-850);
	}

	.panel-heading p {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0;
		text-transform: uppercase;
		color: var(--om-teal-700);
	}

	.global-search input,
	.global-search button {
		box-sizing: border-box;
		height: var(--search-control-height);
		margin: 0;
		border: 0;
	}

	.global-search input {
		min-width: 0;
		flex: 1;
		border-radius: var(--om-radius-s);
		background: color-mix(in srgb, var(--om-white) 92%, transparent);
		box-shadow: var(--search-shadow);
		padding: 0 var(--om-space-l);
		font-size: 15px;
		font-weight: 400;
		line-height: 1;
		color: var(--om-gray-850);
		outline: none;
		appearance: none;
	}

	.global-search input::placeholder {
		color: var(--om-gray-550);
	}

	.global-search input:focus {
		box-shadow:
			var(--search-shadow),
			0 0 0 3px color-mix(in srgb, var(--om-teal-600) 18%, transparent);
	}

	.global-search button {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		border-radius: var(--om-radius-s);
		background: var(--om-gray-850);
		box-shadow: var(--search-shadow);
		padding: 0 var(--om-space-xl);
		font-size: 15px;
		font-weight: 700;
		line-height: 1;
		color: var(--om-white);
		cursor: pointer;
		appearance: none;
	}

	.global-search button:hover {
		background: var(--om-green-600);
	}

	.global-search button:active {
		background: var(--om-teal-700);
	}

	.country-main small,
	.country-count small {
		display: block;
		font-size: 10px;
		font-weight: 500;
		line-height: 1.4;
		color: var(--om-gray-600);
	}

	.variant-mix {
		bottom: var(--bottom-inset);
		left: 50%;
		width: min(480px, calc(100vw - 32px));
		padding: var(--om-space-m);
		transform: translateX(-50%);
	}

	.variant-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--om-space-l);
		margin-bottom: var(--om-space-s);
	}

	.variant-head h2 {
		font-size: 18px;
		line-height: 1.2;
	}

	.variant-head > strong {
		font-size: 20px;
		font-weight: 800;
		line-height: 1.15;
		color: var(--om-gray-850);
	}

	.variant-bar {
		display: flex;
		height: 14px;
		overflow: hidden;
		border-radius: 999px;
		background: color-mix(in srgb, var(--om-gray-200) 55%, transparent);
		box-shadow: inset 0 1px 2px rgb(46 43 59 / 0.06);
	}

	.variant-bar span {
		min-width: 2px;
	}

	.variant-key {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		column-gap: var(--om-space-s);
		margin-top: var(--om-space-s);
	}

	.variant-key-slot {
		min-width: 0;
	}

	.variant-key-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		text-align: center;
	}

	.variant-key-label {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		font-size: 11px;
		font-weight: 600;
		color: var(--om-gray-700);
		min-width: 0;
		max-width: 100%;
		white-space: nowrap;
	}

	.variant-swatch {
		width: 9px;
		height: 9px;
		border-radius: 999px;
		flex-shrink: 0;
		box-shadow: 0 0 0 1px rgb(46 43 59 / 0.08);
	}

	.variant-key-item strong {
		font-size: 12px;
		font-weight: 800;
		line-height: 1.2;
		font-variant-numeric: tabular-nums;
		color: var(--om-gray-850);
	}

	.site-footer {
		position: absolute;
		z-index: 2;
		left: 50%;
		bottom: 6px;
		margin: 0;
		transform: translateX(-50%);
		font-family: 'Inter', system-ui, sans-serif;
		font-size: 11px;
		font-weight: 600;
		line-height: 1.2;
		color: var(--om-gray-600);
		text-align: center;
		text-shadow: 0 1px 0 rgb(255 255 255 / 0.72);
		white-space: nowrap;
	}

	.site-footer a {
		color: var(--om-gray-700);
		text-decoration: none;
	}

	.site-footer a:hover {
		color: var(--om-teal-700);
		text-decoration: underline;
	}

	.country-panel {
		left: var(--screen-inset);
		bottom: var(--bottom-inset);
		display: flex;
		max-height: min(430px, calc(100vh - 140px));
		height: min(430px, calc(100vh - 140px));
		width: var(--side-panel-width);
		flex-direction: column;
		overflow: hidden;
	}

	.panel-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: var(--om-space-m) var(--om-space-m) var(--om-space-l);
	}

	.panel-heading.detail-heading {
		padding-bottom: var(--om-space-s);
	}

	.panel-heading h2 {
		margin-top: 2px;
		font-size: 18px;
		line-height: 1.2;
	}

	.detail-heading-main {
		display: flex;
		align-items: center;
		gap: var(--om-space-m);
		min-width: 0;
	}

	.detail-heading .panel-action {
		min-height: 34px;
		border: 1px solid color-mix(in srgb, var(--om-gray-400) 70%, transparent);
		border-radius: var(--om-radius-s);
		background: color-mix(in srgb, var(--om-white) 84%, transparent);
		box-shadow: 0 1px 2px rgb(46 43 59 / 0.04);
		padding: 0 12px;
		font-size: 12px;
		font-weight: 700;
		line-height: 1;
		color: var(--om-gray-700);
		cursor: pointer;
		white-space: nowrap;
	}

	.detail-heading .panel-action:hover {
		border-color: color-mix(in srgb, var(--om-teal-600) 42%, transparent);
		background: color-mix(in srgb, var(--om-teal-100) 60%, var(--om-white));
		color: var(--om-teal-700);
	}

	.country-detail {
		display: grid;
		gap: var(--om-space-m);
		overflow: auto;
		padding: 0 var(--om-space-m) var(--om-space-s);
	}

	.meta-dataset-head p {
		margin: 0;
	}

	.meta-dataset-head p,
	.detail-section p {
		display: block;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0;
		text-transform: uppercase;
		color: var(--om-teal-700);
	}

	.country-list {
		overflow: auto;
		padding: 0 var(--om-space-xs) var(--om-space-xs);
	}

	.country-list button {
		display: grid;
		width: 100%;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--om-space-m);
		border: 0;
		border-radius: var(--om-radius-s);
		background: transparent;
		padding: var(--om-space-s) 9px;
		color: var(--om-gray-850);
		font-family: 'Inter', system-ui, sans-serif;
		text-align: left;
		cursor: pointer;
	}

	.country-list button:hover,
	.country-list button.active {
		background: color-mix(in srgb, var(--om-teal-100) 72%, var(--om-white));
	}

	.country-main span {
		display: block;
		overflow: hidden;
		font-size: 12px;
		font-weight: 700;
		line-height: 1.375;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.country-count {
		text-align: right;
	}

	.country-count strong {
		display: block;
		font-size: 13px;
		font-weight: 700;
	}

	.bottom-panel {
		right: var(--screen-inset);
		bottom: var(--bottom-inset);
		display: flex;
		flex-direction: column;
		width: var(--side-panel-width);
		max-height: min(430px, calc(100vh - 140px));
		overflow: hidden;
		padding: 0;
	}

	.database-scroll {
		display: grid;
		gap: var(--om-space-s);
		overflow: auto;
		padding: 0 var(--om-space-m) var(--om-space-m);
	}

	.database-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--om-space-m);
		align-items: center;
		width: 100%;
		border: 0;
		border-radius: var(--om-radius-m);
		background: color-mix(in srgb, var(--om-white) 55%, transparent);
		padding: var(--om-space-s);
		text-align: left;
		cursor: pointer;
		font-family: 'Inter', system-ui, sans-serif;
	}

	.database-row:hover,
	.database-row.active {
		background: color-mix(in srgb, var(--om-teal-100) 72%, var(--om-white));
	}

	.database-row-main {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.database-row-title {
		overflow: hidden;
		font-size: 12px;
		font-weight: 700;
		line-height: 1.35;
		color: var(--om-gray-850);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.database-row-main small {
		overflow: hidden;
		font-size: 10px;
		font-weight: 500;
		line-height: 1.4;
		color: var(--om-gray-600);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dataset-logo {
		display: flex;
		width: 64px;
		height: 32px;
		align-items: center;
		justify-content: center;
		border-radius: var(--om-radius-s);
		background: color-mix(in srgb, var(--om-white) 88%, transparent);
		overflow: hidden;
		flex-shrink: 0;
	}

	.dataset-logo img {
		max-width: 58px;
		max-height: 26px;
		object-fit: contain;
	}

	.dataset-logo > span {
		font-size: 22px;
		line-height: 1;
	}

	.country-list.inset {
		overflow: visible;
		padding: 0;
	}

	.meta-dataset {
		border-radius: var(--om-radius-m);
		background: var(--om-gray-100);
		padding: var(--om-space-m);
	}

	.meta-dataset.compact {
		padding: var(--om-space-s) var(--om-space-m);
	}

	.meta-dataset-intro {
		display: flex;
		align-items: flex-start;
		gap: var(--om-space-m);
		margin-bottom: var(--om-space-s);
	}

	.meta-dataset-copy {
		min-width: 0;
		flex: 1;
	}

	.meta-dataset-head {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: space-between;
		gap: var(--om-space-s);
	}

	.meta-release {
		border-radius: 999px;
		background: color-mix(in srgb, var(--om-teal-100) 80%, var(--om-white));
		padding: 2px 8px;
		font-size: 10px;
		font-weight: 700;
		line-height: 1.3;
		color: var(--om-teal-700);
	}

	.meta-dataset h3 {
		margin-top: 6px;
		font-family: 'Rubik', 'Inter', system-ui, sans-serif;
		font-size: 14px;
		font-weight: 700;
		line-height: 1.25;
		color: var(--om-gray-850);
	}

	.meta-desc {
		margin-top: 4px;
		font-size: 11px;
		font-weight: 500;
		line-height: 1.45;
		color: var(--om-gray-600);
	}

	.meta-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px var(--om-space-m);
		margin-top: var(--om-space-s);
	}

	.meta-grid dt {
		font-size: 10px;
		font-weight: 600;
		color: var(--om-gray-600);
	}

	.meta-grid dd {
		margin: 1px 0 0;
		font-size: 11px;
		font-weight: 700;
		color: var(--om-gray-850);
	}

	.detail-context {
		margin: 0;
		font-size: 12px;
		font-weight: 600;
		line-height: 1.4;
		color: var(--om-gray-600);
	}

	.detail-list {
		display: grid;
		gap: 4px;
		margin-top: var(--om-space-xs);
	}

	.detail-list-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--om-space-s);
		align-items: center;
		border: 0;
		border-radius: var(--om-radius-s);
		background: transparent;
		padding: 5px 7px;
		font-family: 'Inter', system-ui, sans-serif;
		font-size: 11px;
		font-weight: 600;
		line-height: 1.35;
		color: var(--om-gray-850);
		text-align: left;
		cursor: pointer;
	}

	.detail-list-row.static {
		cursor: default;
	}

	.detail-list-row:hover,
	.detail-list-row.active {
		background: color-mix(in srgb, var(--om-teal-100) 72%, var(--om-white));
	}

	.detail-list-row span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.detail-list-row strong {
		font-size: 11px;
		font-weight: 800;
	}

	.dataset-heading {
		flex-shrink: 0;
	}

	.dataset-count {
		display: flex;
		align-items: baseline;
		gap: 5px;
	}

	.dataset-count strong {
		font-size: 18px;
		font-weight: 800;
		line-height: 1.15;
		color: var(--om-gray-850);
	}

	.dataset-count small {
		font-size: 11px;
		font-weight: 600;
		line-height: 1.2;
		color: var(--om-gray-600);
	}

	.dataset-cta {
		margin-top: 2px;
		padding-top: 8px;
		font-size: 11px;
		font-weight: 600;
		line-height: 1.3;
		color: var(--om-gray-600);
		text-align: center;
		text-decoration: none;
	}

	.dataset-cta strong {
		color: var(--om-teal-700);
	}

	.dataset-cta:hover strong {
		color: var(--om-green-600);
		text-decoration: underline;
	}

	@media (max-width: 980px) {
		.global-search {
			right: var(--screen-inset);
			left: var(--screen-inset);
			width: auto;
			min-width: 0;
			transform: none;
		}

		.country-panel {
			top: auto;
			left: var(--screen-inset);
			right: var(--screen-inset);
			bottom: var(--bottom-inset);
			max-height: 38vh;
			height: auto;
			transform: none;
		}

		.bottom-panel {
			display: none;
		}

		.variant-mix {
			display: none;
		}
	}

	@media (max-width: 700px) {
		.dashboard-shell {
			--screen-inset: 12px;
			--bottom-inset: 20px;
		}

		.floating-title,
		.top-nav {
			display: none;
		}

		.country-panel {
			left: var(--screen-inset);
			right: var(--screen-inset);
			bottom: var(--bottom-inset);
			width: auto;
		}
	}
</style>
