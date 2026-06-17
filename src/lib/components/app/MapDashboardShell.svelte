<script lang="ts">
	import { onDestroy, onMount, setContext } from 'svelte'
	import { page } from '$app/state'
	import type { Action } from 'svelte/action'
	import type {
		ExpressionSpecification,
		GeoJSONSource,
		Map as MapboxMap,
		Popup,
		StyleSpecification,
	} from 'mapbox-gl'
	import type { FeatureCollection, Point } from 'geojson'
	import 'mapbox-gl/dist/mapbox-gl.css'
	import { key, mapboxgl } from '$lib/mapboxgl'
	import { TENANTS } from '$lib/tenants'
	import { biobankSlugForDatasetSlug } from '$lib/datasets'
	import { BRAZIL_STATES } from '$lib/data/brazil-states'
	import { lang } from '$lib/i18n'
	import AtlasHome from '$lib/templates/AtlasHome.svelte'
	import VariantBrowser from '$lib/components/widgets/VariantBrowser.svelte'
	import VariantDetailPage from '$lib/components/app/VariantDetailPage.svelte'
	import type { PageServerData as VariantPageData } from '../../routes/explore/variant/[id]/$types'
	import { goto, replaceState } from '$app/navigation'
	import * as Drawer from '$lib/components/ui/drawer/index.js'

	type Population = {
		cohortId?: number
		name: string
		country: string
		countryCode: string
		lat: number
		lon: number
		sampleCount: number
		variantCount: number
		biobankSlug: string
		biobankName: string
		countryMappings?: Array<{
			country: string
			countryCode: string
			regionGroup: string
			subpopulationCode: string
			subpopulationName: string
			sampleCount: number
		}>
	}

	type CountryMapping = NonNullable<Population['countryMappings']>[number]

	type DisplayDataset = {
		slug?: string
		title: string
		description?: string
		release?: string
		assay?: string
		genomeBuild?: string
		participants?: number
		variants?: number
		biobankSlug?: string
		superPopulation?: string
	}

	type DashboardData = {
		biobanks?: Array<Record<string, unknown>>
		populations?: Population[]
		datasets?: Array<Record<string, unknown>>
		totals?: {
			participants?: number
			datasetCount?: number
			variants?: number
			populations?: number
		}
		variantClasses?: {
			common?: number
			lowFreq?: number
			rare?: number
		}
	}

	type ResolvedDashboard = {
		biobanks: Array<Record<string, unknown>>
		populations: Population[]
		datasets: Array<Record<string, unknown>>
		totals: {
			participants: number
			datasetCount: number
			variants: number
			populations: number
		}
		variantClasses: {
			common: number
			lowFreq: number
			rare: number
		}
	}

	const emptyDashboard: ResolvedDashboard = {
		biobanks: [],
		populations: [],
		datasets: [],
		totals: { participants: 0, datasetCount: 0, variants: 0, populations: 0 },
		variantClasses: { common: 0, lowFreq: 0, rare: 0 },
	}

	const CARIBBEAN_CODES = new Set(['BS', 'BB', 'BM', 'VG', 'LC', 'TT'])

	type CountryRow = {
		code: string
		name: string
		samples: number
		variants: number
		center: [number, number]
		sources: string[]
	}

	type CoverageRow = {
		code: string
		name: string
		samples: number | null
		subtitle: string
		center: [number, number]
	}

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
		VN: [108.2772, 14.0583],
	}

	const COUNTRY_ZOOMS: Record<string, number> = {
		BB: 8,
		BM: 8.8,
		BR: 2.7,
		BS: 6.2,
		BD: 4.8,
		CN: 2.6,
		CO: 3.8,
		ES: 4.1,
		FI: 3.9,
		GB: 4.2,
		GM: 5.5,
		IT: 4.1,
		JP: 4,
		KE: 4,
		LC: 8.2,
		NG: 3.7,
		PE: 3.8,
		PK: 3.8,
		PR: 7.1,
		SL: 5.2,
		TT: 7.4,
		US: 2.5,
		VG: 8.4,
		VN: 4.1,
	}
	const DEFAULT_MAP_CENTER: [number, number] = [0, 22]
	const DEFAULT_MAP_ZOOM = 2
	const RESULTS_DRAWER_TOP = 84
	const COUNTRY_PANEL_MAX_HEIGHT = 430
	const SCREEN_INSET = 24
	const TOP_SEARCH_LEFT_RATIO = 0.495
	const TOP_SEARCH_WIDTH_RATIO = 0.42
	const TOP_SEARCH_MIN_WIDTH = 520
	const TOP_SEARCH_MAX_WIDTH = 720
	const SCROLL_ZOOM_RATE = 1 / 32
	const WHEEL_ZOOM_RATE = 1 / 150
	const VEP_IMPACT_OPTIONS = ['HIGH', 'MODERATE', 'LOW', 'MODIFIER']
	const VEP_CONSEQUENCE_OPTIONS = [
		'transcript ablation',
		'splice acceptor',
		'splice donor',
		'stop gained',
		'frameshift',
		'stop lost',
		'start lost',
		'transcript amplification',
		'inframe insertion',
		'inframe deletion',
		'missense',
		'protein altering',
		'splice region',
		'incomplete terminal codon',
		'start retained',
		'stop retained',
		'synonymous',
		'coding sequence',
		'5 prime UTR',
		'3 prime UTR',
		'non coding transcript exon',
		'intron',
		'NMD transcript',
		'non coding transcript',
		'upstream gene',
		'downstream gene',
		'intergenic',
	]

	let { data, children } = $props()
	const isHome = $derived(page.url.pathname === '/' || page.url.pathname === '/explore')
	const isVariantRoute = $derived(page.url.pathname.startsWith('/explore/variant/'))
	const variantDetailData = $derived.by((): VariantPageData | null => {
		if (!isVariantRoute) return null
		const routeData = page.data as VariantPageData
		if (!routeData.variant) return null
		return routeData
	})
	const variantRouteError = $derived(
		isVariantRoute && !variantDetailData && page.status >= 400
			? (typeof page.error === 'object' && page.error && 'message' in page.error
					? String(page.error.message)
					: 'Variant not found')
			: null
	)
	const dashboard = $derived.by((): ResolvedDashboard => {
		const source = (data.dashboard ?? emptyDashboard) as DashboardData
		const totals = source.totals ?? {}
		const variantClasses = source.variantClasses ?? {}

		return {
			biobanks: source.biobanks ?? [],
			populations: source.populations ?? [],
			datasets: source.datasets ?? [],
			totals: {
				participants: Number(totals.participants ?? 0),
				datasetCount: Number(totals.datasetCount ?? 0),
				variants: Number(totals.variants ?? 0),
				populations: Number(totals.populations ?? 0),
			},
			variantClasses: {
				common: Number(variantClasses.common ?? 0),
				lowFreq: Number(variantClasses.lowFreq ?? 0),
				rare: Number(variantClasses.rare ?? 0),
			},
		}
	})
	let map: MapboxMap | undefined
	let popup: Popup | undefined
	let selectedCode = $state<string | null>(null)
	let selectedDatasetSlug = $state<string | null>(null)
	let searchQuery = $state('')
	let appliedSearchQuery = $state('')
	let countryPickerOpen = $state(false)
	let drawerFiltersOpen = $state(false)
	let filterGene = $state('')
	let filterAfMin = $state('')
	let filterAfMax = $state('')
	let filterAcMin = $state('')
	let filterAcMax = $state('')
	let filterPageSize = $state(50)
	let filterVepImpacts = $state<Record<string, boolean>>(
		Object.fromEntries(VEP_IMPACT_OPTIONS.map((value) => [value, true]))
	)
	let filterVepConsequences = $state<Record<string, boolean>>(
		Object.fromEntries(VEP_CONSEQUENCE_OPTIONS.map((value) => [value, true]))
	)
	let filterBiobanks = $state<Record<string, boolean>>({})
	let filterMatchMode = $state<'any' | 'all'>('any')
	let filterPopulations = $state<Record<number, boolean>>({})
	let filterPopulationMatchMode = $state<'any' | 'all'>('any')
	let filterStateHydrated = $state(false)
	let lastHydratedExploreUrl = $state('')
	let resultsDrawerOpen = $state(false)
	let resultsDrawerExpanded = $state(false)
	let resultsTableQueryString = $state('')
	let lastExploreQueryString = ''
	let curlCopied = $state(false)
	let shareCopied = $state(false)
	let routerReady = $state(false)
	let pendingResultsUrlOpen: boolean | null = null

	onMount(() => {
		routerReady = true
		if (pendingResultsUrlOpen !== null) {
			syncResultsUrl(pendingResultsUrlOpen)
			pendingResultsUrlOpen = null
		}
	})

	setContext(key, {
		getMap: () => map,
	})

	const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString()
	const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '0%')
	const tx = (en: string, pt: string) => ($lang === 'pt' ? pt : en)
	const filterBiobankOptions = $derived(
		(dashboard.biobanks as Array<{ slug?: string; name: string }>).filter((bank) =>
			Boolean(bank.slug)
		) as Array<{ slug: string; name: string }>
	)
	const filterPopulationOptions = $derived(
		(dashboard.populations as Population[])
			.filter((population) => typeof population.cohortId === 'number')
			.map((population) => ({
				cohortId: population.cohortId as number,
				name: population.name,
				biobankSlug: population.biobankSlug,
				biobankName: population.biobankName,
			}))
	)
	const activeFilterPopulations = $derived(
		filterPopulationOptions.filter((population) => filterBiobanks[population.biobankSlug] !== false)
	)
	const selectedFilterBiobankSlugs = $derived(
		filterBiobankOptions
			.filter((bank) => filterBiobanks[bank.slug] !== false)
			.map((bank) => bank.slug)
	)
	const selectedFilterCohortIds = $derived(
		activeFilterPopulations
			.filter((population) => filterPopulations[population.cohortId] !== false)
			.map((population) => population.cohortId)
	)
	const selectedFilterVepImpactValues = $derived(
		VEP_IMPACT_OPTIONS.filter((value) => filterVepImpacts[value])
	)
	const selectedFilterVepConsequenceValues = $derived(
		VEP_CONSEQUENCE_OPTIONS.filter((value) => filterVepConsequences[value])
	)
	const filterBiobankSummary = $derived(
		selectedFilterBiobankSlugs.length === filterBiobankOptions.length
			? 'All'
			: `${selectedFilterBiobankSlugs.length}/${filterBiobankOptions.length}`
	)
	const filterPopulationSummary = $derived(
		activeFilterPopulations.length === 0
			? 'None'
			: selectedFilterCohortIds.length === activeFilterPopulations.length
				? 'All'
				: `${selectedFilterCohortIds.length}/${activeFilterPopulations.length}`
	)
	const filterPopulationsByBiobank = $derived.by(() => {
		const groups = new Map<
			string,
			{ slug: string; name: string; populations: typeof filterPopulationOptions }
		>()
		for (const population of filterPopulationOptions) {
			const group = groups.get(population.biobankSlug) ?? {
				slug: population.biobankSlug,
				name: population.biobankName,
				populations: [],
			}
			group.populations.push(population)
			groups.set(population.biobankSlug, group)
		}
		return [...groups.values()]
	})
	const mapFilterCount = $derived(
		Number(Boolean(filterGene.trim())) +
			Number(Boolean(filterAfMin || filterAfMax)) +
			Number(Boolean(filterAcMin || filterAcMax)) +
			Number(selectedFilterVepImpactValues.length < VEP_IMPACT_OPTIONS.length) +
			Number(selectedFilterVepConsequenceValues.length < VEP_CONSEQUENCE_OPTIONS.length) +
			Number(
				filterBiobankOptions.length > 1 &&
					selectedFilterBiobankSlugs.length < filterBiobankOptions.length
			) +
			Number(filterBiobankOptions.length > 1 && filterMatchMode === 'all') +
			Number(
				filterPopulationOptions.length > 1 &&
					selectedFilterCohortIds.length < activeFilterPopulations.length
			) +
			Number(filterPopulationOptions.length > 1 && filterPopulationMatchMode === 'all') +
			Number(filterPageSize !== 50)
	)

	function exploreUrlKey(pathname: string, sp: URLSearchParams) {
		const sorted = new URLSearchParams()
		for (const key of [...new Set(sp.keys())].sort()) {
			if (key === 'results') continue
			const value = sp.get(key)
			if (value !== null) sorted.set(key, value)
		}
		const qs = sorted.toString()
		return `${pathname}${qs ? `?${qs}` : ''}`
	}

	function exploreSearchParamsEqual(a: URLSearchParams, b: URLSearchParams) {
		const keys = new Set([...a.keys(), ...b.keys()])
		for (const key of keys) {
			if (key === 'results') continue
			if (a.get(key) !== b.get(key)) return false
		}
		return true
	}

	const EXPLORE_UI_PARAMS = new Set(['results', 'tenant', 'page', 'pageSize'])

	function hasExploreQueryContextFromParams(sp: URLSearchParams) {
		for (const key of sp.keys()) {
			if (!EXPLORE_UI_PARAMS.has(key)) return true
		}
		return false
	}

	let selfUrlSync = false

	function hydrateExploreFiltersFromUrl(
		sp: URLSearchParams,
		{
			syncSearch = true,
			clearSearch = false,
			syncMapSelection = true,
		}: { syncSearch?: boolean; clearSearch?: boolean; syncMapSelection?: boolean } = {}
	) {
		const urlBanks = (sp.get('biobanks') ?? '').split(',').filter(Boolean)
		const urlCohorts = new Set((sp.get('cohorts') ?? '').split(',').filter(Boolean).map(Number))
		const urlImpacts = new Set((sp.get('vepImpact') ?? '').split(',').filter(Boolean))
		const urlConsequences = new Set((sp.get('vepConsequence') ?? '').split(',').filter(Boolean))

		if (syncSearch) {
			const urlQ = sp.get('q') ?? ''
			searchQuery = urlQ
			appliedSearchQuery = urlQ
		} else if (clearSearch && !sp.has('q')) {
			searchQuery = ''
			appliedSearchQuery = ''
		}
		if (syncMapSelection) {
			const countryParam = sp.get('country')
			selectedCode =
				countryParam && countryRows.some((country) => country.code === countryParam)
					? countryParam
					: null
			const datasetParam = sp.get('dataset')
			selectedDatasetSlug =
				datasetParam && displayDatasets.some((dataset) => dataset.slug === datasetParam)
					? datasetParam
					: null
		}
		filterGene = sp.get('gene') ?? ''
		filterAfMin = sp.get('afMin') ?? ''
		filterAfMax = sp.get('afMax') ?? ''
		filterAcMin = sp.get('acMin') ?? ''
		filterAcMax = sp.get('acMax') ?? ''
		filterPageSize = Number(sp.get('pageSize')) || 50
		filterBiobanks = Object.fromEntries(
			filterBiobankOptions.map((bank) => [
				bank.slug,
				urlBanks.length ? urlBanks.includes(bank.slug) : true,
			])
		)
		filterMatchMode = sp.get('match') === 'all' ? 'all' : 'any'
		filterPopulations = Object.fromEntries(
			filterPopulationOptions.map((population) => [
				population.cohortId,
				urlCohorts.size ? urlCohorts.has(population.cohortId) : true,
			])
		)
		filterPopulationMatchMode = sp.get('cohortMatch') === 'all' ? 'all' : 'any'
		filterVepImpacts = Object.fromEntries(
			VEP_IMPACT_OPTIONS.map((value) => [value, sp.has('vepImpact') ? urlImpacts.has(value) : true])
		)
		filterVepConsequences = Object.fromEntries(
			VEP_CONSEQUENCE_OPTIONS.map((value) => [
				value,
				sp.has('vepConsequence') ? urlConsequences.has(value) : true,
			])
		)
		resultsDrawerOpen = hasExploreQueryContextFromParams(sp)
	}

	$effect(() => {
		if (!filterBiobankOptions.length) return
		const path = page.url.pathname === '/explore' ? '/' : page.url.pathname
		if (path !== '/') return
		const urlKey = exploreUrlKey(path, page.url.searchParams)
		if (selfUrlSync) {
			selfUrlSync = false
			return
		}
		if (urlKey === lastHydratedExploreUrl) return

		const stateParams = buildExploreParams()
		const urlHasContext = hasExploreQueryContextFromParams(page.url.searchParams)
		const stateHasContext = hasExploreQueryContextFromParams(stateParams)
		const lastHydratedParams = new URLSearchParams(lastHydratedExploreUrl.split('?')[1] ?? '')
		const lastHydratedHasContext = hasExploreQueryContextFromParams(lastHydratedParams)

		if (urlHasContext && !stateHasContext && lastHydratedExploreUrl && !lastHydratedHasContext) {
			syncResultsUrl(resultsDrawerOpen, true)
			return
		}

		const prevPath = lastHydratedExploreUrl ? lastHydratedExploreUrl.split('?')[0] : ''
		const forceFullHydrate = !lastHydratedExploreUrl
		const pathChanged = Boolean(lastHydratedExploreUrl) && prevPath !== path
		hydrateExploreFiltersFromUrl(page.url.searchParams, {
			syncSearch: forceFullHydrate || pathChanged,
			clearSearch: forceFullHydrate || pathChanged,
			syncMapSelection: forceFullHydrate || pathChanged,
		})
		lastHydratedExploreUrl = urlKey
		filterStateHydrated = true
	})
	const datasetCountValue = (_slug: string, value: unknown, _field: 'participants' | 'variants') =>
		Number(value ?? 0)

	const countryRows = $derived.by<CountryRow[]>(() => {
		const byCode = new Map<string, CountryRow>()
		function upsert(
			code: string,
			name: string,
			samples: number,
			variants: number,
			center: [number, number],
			source: string
		) {
			if (!code || code === 'XK') return
			const existing = byCode.get(code)
			if (existing) {
				existing.samples += samples
				existing.variants = Math.max(existing.variants, variants)
				if (!existing.sources.includes(source)) existing.sources.push(source)
			} else {
				byCode.set(code, { code, name, samples, variants, center, sources: [source] })
			}
		}

		for (const p of dashboard.populations as Population[]) {
			if (p.countryCode !== 'XK') {
				upsert(
					p.countryCode,
					p.country,
					p.sampleCount,
					p.variantCount,
					[p.lon, p.lat],
					p.biobankName
				)
			}
			for (const m of p.countryMappings ?? []) {
				const center = COUNTRY_CENTERS[m.countryCode]
				if (center) upsert(m.countryCode, m.country, m.sampleCount, p.variantCount, center, p.name)
			}
		}
		return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name))
	})

	const tenantFor = (slug?: string) => TENANTS.find((tenant) => tenant.slug === slug)

	const displayDatasets = $derived.by<DisplayDataset[]>(() => {
		const live = dashboard.datasets as Array<Record<string, unknown>> | undefined
		if (live?.length) {
			return live.map((dataset) => {
				const slug = String(dataset.slug ?? '')
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
					superPopulation: dataset.superPopulation ? String(dataset.superPopulation) : undefined,
				}
			})
		}

		return []
	})

	function isBipmedDataset(dataset?: DisplayDataset | null) {
		return dataset?.slug === 'bipmed-wes' || dataset?.biobankSlug === 'bipmed'
	}

	function isPgpDataset(dataset?: DisplayDataset | null) {
		return dataset?.slug === 'pgp-usa' || dataset?.biobankSlug === 'pgp-harvard'
	}

	function datasetCoverageLabel(dataset: DisplayDataset) {
		if (dataset.slug === 'cari-caribbean' || dataset.biobankSlug === 'carigenetics')
			return tx('Caribbean coverage', 'Cobertura do Caribe')
		if (isBipmedDataset(dataset)) return tx('Brazil states', 'Estados do Brasil')
		if (isPgpDataset(dataset)) return tx('United States coverage', 'Cobertura dos Estados Unidos')
		return tx('Countries in dataset', 'Países no conjunto de dados')
	}

	function countryCodesForDataset(dataset: DisplayDataset) {
		if (dataset.slug === 'cari-caribbean' || dataset.biobankSlug === 'carigenetics') {
			return [...CARIBBEAN_CODES]
		}
		if (dataset.slug === 'bipmed-wes') return ['BR']
		if (dataset.slug === 'pgp-usa') return ['US']
		if (dataset.superPopulation) {
			const population = (dashboard.populations as Population[]).find(
				(item) => item.name === dataset.superPopulation
			)
			if (population?.countryMappings?.length) {
				return [...new Set(population.countryMappings.map((mapping) => mapping.countryCode))]
			}
		}
		return []
	}

	function cohortIdsForCountryCode(code: string) {
		const direct = new Set<number>()
		const mapped = new Set<number>()
		for (const population of dashboard.populations as Population[]) {
			if (typeof population.cohortId !== 'number') continue
			if (population.countryCode === code) {
				direct.add(population.cohortId)
			} else if (population.countryMappings?.some((mapping) => mapping.countryCode === code)) {
				mapped.add(population.cohortId)
			}
		}
		// Prefer biobanks pinned to this country (e.g. PGP → US). Fall back to 1KGP-style
		// country mappings only when there is no direct population for the country.
		return direct.size ? [...direct] : [...mapped]
	}

	const selectedCountry = $derived(
		selectedCode ? (countryRows.find((country) => country.code === selectedCode) ?? null) : null
	)
	const selectedCountryCohortIds = $derived(
		selectedCode ? cohortIdsForCountryCode(selectedCode) : []
	)
	const selectedDataset = $derived(
		selectedDatasetSlug
			? (displayDatasets.find((dataset) => dataset.slug === selectedDatasetSlug) ?? null)
			: null
	)
	const showExploreLeftPanels = $derived(
		!isVariantRoute &&
			page.url.pathname === '/' &&
			resultsDrawerOpen &&
			!selectedCountry &&
			!selectedDataset
	)
	const showVariantLeftPanels = $derived(!!variantDetailData)
	const scopedCountryRows = $derived.by(() => {
		if (!selectedDataset) return countryRows
		const codes = new Set(countryCodesForDataset(selectedDataset))
		return countryRows.filter((country) => codes.has(country.code))
	})
	const scopedCoverageRows = $derived.by((): CoverageRow[] => {
		if (!selectedDataset) return []
		if (isBipmedDataset(selectedDataset)) {
			return BRAZIL_STATES.map((state) => ({
				code: state.code,
				name: state.name,
				samples: null,
				subtitle: 'BIPMed',
				center: state.center,
			}))
		}
		return scopedCountryRows.map((country) => ({
			code: country.code,
			name: country.name,
			samples: country.samples,
			subtitle: country.sources.slice(0, 2).join(' + '),
			center: country.center,
		}))
	})
	const highlightCountryCodes = $derived.by(() => {
		if (selectedCountry) return [selectedCountry.code]
		if (selectedDataset) {
			return countryCodesForDataset(selectedDataset).filter((code) =>
				countryRows.some((country) => country.code === code)
			)
		}
		return countryRows.map((country) => country.code)
	})
	const bubbleFocusCodes = $derived.by(() => {
		if (selectedCountry) return [selectedCountry.code]
		if (selectedDataset) return countryCodesForDataset(selectedDataset)
		return countryRows.map((country) => country.code)
	})
	const countryHighlightExpression = $derived([
		'in',
		['get', 'iso_3166_1'],
		['literal', highlightCountryCodes],
	])
	type MapSelectionState = {
		country: CountryRow | null
		dataset: DisplayDataset | null
	}
	const variantMixTotal = $derived(
		selectedCountry?.variants ?? selectedDataset?.variants ?? dashboard.totals.variants
	)
	const variantClassRows = $derived([
		{
			key: 'common',
			label: tx('Common', 'Comuns'),
			count: dashboard.variantClasses.common,
			color: '#4a6fd8',
		},
		{
			key: 'lowFreq',
			label: tx('Low-freq', 'Baixa freq.'),
			count: dashboard.variantClasses.lowFreq,
			color: '#7b5cc4',
		},
		{
			key: 'rare',
			label: tx('Rare', 'Raras'),
			count: dashboard.variantClasses.rare,
			color: '#e2689a',
		},
	])
	const countryMaskFilter = [
		'all',
		['==', ['get', 'disputed'], 'false'],
		['any', ['==', 'all', ['get', 'worldview']], ['in', 'US', ['get', 'worldview']]],
	]
	const openMinedMapPalette = [
		'#b9dfb8',
		'#a9ddd3',
		'#f5e6b8',
		'#f7d39f',
		'#f5bd9e',
		'#dfb1b9',
		'#c7b4ca',
	]
	const directPopulations = $derived(
		(dashboard.populations as Population[])
			.filter((p) => p.countryCode !== 'XK')
			.sort((a, b) => b.sampleCount - a.sampleCount)
	)
	const bubbleColorExpression: ExpressionSpecification = [
		'step',
		['get', 'samples'],
		'#53bea9',
		150,
		'#f2d98c',
		350,
		'#f79763',
	]
	const bubbleRadiusExpression: ExpressionSpecification = [
		'+',
		8.3,
		['*', 0.66, ['sqrt', ['max', ['to-number', ['get', 'samples']], 1]]],
	]
	const bubbleHaloRadiusExpression: ExpressionSpecification = [
		'+',
		10.5,
		['*', 0.74, ['sqrt', ['max', ['to-number', ['get', 'samples']], 1]]],
	]
	const bubbleLabelSizeExpression: ExpressionSpecification = [
		'interpolate',
		['linear'],
		['sqrt', ['max', ['to-number', ['get', 'samples']], 1]],
		1,
		10.2,
		12,
		11.2,
		25,
		12.6,
		55,
		14.5,
	]
	const bubbleStyleVersion = 'large-bubbles-v16'
	const bubbleSortKey: ExpressionSpecification = ['get', 'samples']
	const collectionGeoJson = $derived<
		FeatureCollection<
			Point,
			{ code: string; name: string; samples: number; label: string; sources: string }
		>
	>({
		type: 'FeatureCollection',
		features: countryRows.map((country) => ({
			type: 'Feature',
			properties: {
				code: country.code,
				name: country.name,
				samples: country.samples,
				label: fmt(country.samples),
				sources: country.sources.join(' + '),
			},
			geometry: {
				type: 'Point',
				coordinates: country.center,
			},
		})),
	})

	function normalizeSearch(value: string) {
		return value.trim().toLowerCase()
	}

	function findMapSearchMatch(query: string) {
		const q = normalizeSearch(query)
		if (!q) return undefined
		const directMatch = countryRows.find(
			(country) => normalizeSearch(country.name) === q || normalizeSearch(country.code) === q
		)
		if (directMatch) return directMatch
		if (q === 'caribbean') {
			return (
				countryRows.find((country) => country.code === 'BM') ??
				countryRows.find((country) =>
					['BS', 'BB', 'BM', 'VG', 'LC', 'TT', 'PR'].includes(country.code)
				)
			)
		}
		return countryRows.find((country) => {
			const sources = country.sources.map(normalizeSearch)
			return (
				normalizeSearch(country.name).includes(q) ||
				sources.some((source) => source === q || source.includes(q))
			)
		})
	}

	function isMapLocationQuery(query: string, country: CountryRow) {
		const q = normalizeSearch(query)
		return (
			q === normalizeSearch(country.name) ||
			q === normalizeSearch(country.code) ||
			q === 'caribbean'
		)
	}

	function findPopulationSearchMatch(query: string) {
		const q = normalizeSearch(query)
		if (!q) return undefined
		return directPopulations.find((population) => normalizeSearch(population.name) === q)
	}

	function handleSearchSubmit(event: SubmitEvent) {
		event.preventDefault()
		const trimmed = searchQuery.trim()
		const countryMatch = trimmed ? findMapSearchMatch(trimmed) : undefined
		if (countryMatch && isMapLocationQuery(trimmed, countryMatch)) {
			appliedSearchQuery = ''
			flyToCountry(countryMatch)
			return
		}
		const populationMatch = trimmed ? findPopulationSearchMatch(trimmed) : undefined
		if (populationMatch) {
			appliedSearchQuery = ''
			const country = countryRows.find((row) => row.code === populationMatch.countryCode)
			if (country) {
				flyToCountry(country)
				return
			}
		}
		if (
			!trimmed &&
			resultsDrawerOpen &&
			!isVariantRoute &&
			trimmed === appliedSearchQuery.trim() &&
			!hasActiveExploreContext()
		) {
			closeResultsDrawer()
			return
		}
		appliedSearchQuery = trimmed
		openResultsDrawer(true)
	}

	function pickCountry(country: CountryRow) {
		countryPickerOpen = false
		flyToCountry(country)
	}

	function toggleFilterVepImpact(value: string) {
		filterVepImpacts = { ...filterVepImpacts, [value]: !filterVepImpacts[value] }
	}

	function toggleFilterVepConsequence(value: string) {
		filterVepConsequences = { ...filterVepConsequences, [value]: !filterVepConsequences[value] }
	}

	function toggleFilterBiobank(slug: string) {
		filterBiobanks = { ...filterBiobanks, [slug]: filterBiobanks[slug] === false }
	}

	function setAllFilterBiobanks(enabled: boolean) {
		filterBiobanks = Object.fromEntries(filterBiobankOptions.map((bank) => [bank.slug, enabled]))
	}

	function toggleFilterPopulation(cohortId: number) {
		filterPopulations = { ...filterPopulations, [cohortId]: filterPopulations[cohortId] === false }
	}

	function setAllFilterPopulations(enabled: boolean) {
		filterPopulations = Object.fromEntries(
			filterPopulationOptions.map((population) => [population.cohortId, enabled])
		)
	}

	function setFilterBiobankPopulations(slug: string, enabled: boolean) {
		filterPopulations = {
			...filterPopulations,
			...Object.fromEntries(
				filterPopulationOptions
					.filter((population) => population.biobankSlug === slug)
					.map((population) => [population.cohortId, enabled])
			),
		}
	}

	function resetExploreQueriesAndFilters() {
		searchQuery = ''
		appliedSearchQuery = ''
		resultsTableQueryString = ''
		lastExploreQueryString = ''
		filterGene = ''
		filterAfMin = ''
		filterAfMax = ''
		filterAcMin = ''
		filterAcMax = ''
		filterPageSize = 50
		filterVepImpacts = Object.fromEntries(VEP_IMPACT_OPTIONS.map((value) => [value, true]))
		filterVepConsequences = Object.fromEntries(
			VEP_CONSEQUENCE_OPTIONS.map((value) => [value, true])
		)
		filterBiobanks = Object.fromEntries(filterBiobankOptions.map((bank) => [bank.slug, true]))
		filterMatchMode = 'any'
		filterPopulations = Object.fromEntries(
			filterPopulationOptions.map((population) => [population.cohortId, true])
		)
		filterPopulationMatchMode = 'any'
	}

	function syncExploreUrlAfterReset() {
		syncResultsUrl(resultsDrawerOpen, true)
	}

	function resetMapFilters() {
		resetExploreQueriesAndFilters()
		syncExploreUrlAfterReset()
	}

	function buildExploreParams() {
		const params = new URLSearchParams()
		if (appliedSearchQuery) params.set('q', appliedSearchQuery)
		if (selectedCode) params.set('country', selectedCode)
		if (selectedDatasetSlug) params.set('dataset', selectedDatasetSlug)
		if (filterGene.trim()) params.set('gene', filterGene.trim())
		if (filterAfMin) params.set('afMin', filterAfMin)
		if (filterAfMax) params.set('afMax', filterAfMax)
		if (filterAcMin) params.set('acMin', filterAcMin)
		if (filterAcMax) params.set('acMax', filterAcMax)
		if (selectedFilterVepImpactValues.length === 0) params.set('vepImpact', '__none__')
		else if (selectedFilterVepImpactValues.length < VEP_IMPACT_OPTIONS.length)
			params.set('vepImpact', selectedFilterVepImpactValues.join(','))
		if (selectedFilterVepConsequenceValues.length === 0) params.set('vepConsequence', '__none__')
		else if (selectedFilterVepConsequenceValues.length < VEP_CONSEQUENCE_OPTIONS.length)
			params.set('vepConsequence', selectedFilterVepConsequenceValues.join(','))
		if (filterPageSize !== 50) params.set('pageSize', String(filterPageSize))
		if (filterBiobankOptions.length > 1 && selectedFilterBiobankSlugs.length === 0) {
			params.set('biobanks', '__none__')
		} else if (
			filterBiobankOptions.length > 1 &&
			selectedFilterBiobankSlugs.length &&
			(filterMatchMode === 'all' || selectedFilterBiobankSlugs.length < filterBiobankOptions.length)
		) {
			params.set('biobanks', selectedFilterBiobankSlugs.join(','))
			params.set('match', filterMatchMode)
		} else if (selectedDataset?.biobankSlug) {
			params.set('biobanks', selectedDataset.biobankSlug)
		}
		const effectiveCohortIds = selectedCountryCohortIds.length
			? selectedFilterCohortIds.filter((cohortId) => selectedCountryCohortIds.includes(cohortId))
			: selectedFilterCohortIds
		if (filterPopulationOptions.length > 1 && effectiveCohortIds.length === 0) {
			params.set('cohorts', '-1')
		} else if (
			filterPopulationOptions.length > 1 &&
			effectiveCohortIds.length &&
			(selectedCountryCohortIds.length ||
				filterPopulationMatchMode === 'all' ||
				effectiveCohortIds.length < activeFilterPopulations.length)
		) {
			params.set('cohorts', effectiveCohortIds.join(','))
			if (!selectedCountryCohortIds.length && filterPopulationMatchMode === 'all')
				params.set('cohortMatch', 'all')
		}
		if (data.forceTenant) params.set('tenant', data.forceTenant)
		return params
	}

	function urlExploreParams() {
		if (hasActiveExploreContext()) return buildExploreParams()
		const params = new URLSearchParams()
		if (data.forceTenant) params.set('tenant', data.forceTenant)
		return params
	}

	function hasActiveExploreContext() {
		return hasExploreQueryContextFromParams(buildExploreParams())
	}

	const exploreQueryString = $derived(buildExploreParams().toString())
	const activeResultsQueryString = $derived(resultsTableQueryString || exploreQueryString)
	const mapResultsPath = $derived.by(() => {
		const params = buildExploreParams()
		return `/${params.toString() ? `?${params.toString()}` : ''}`
	})
	const mapResultsUrl = $derived(
		`${typeof location !== 'undefined' ? location.origin : ''}${mapResultsPath}`
	)
	const resultsDrawerKey = $derived(exploreQueryString || 'default')
	const resultsContextTitle = $derived.by(() => {
		const parts = []
		if (selectedCountry) parts.push(selectedCountry.name)
		if (selectedDataset) parts.push(selectedDataset.title)
		if (filterGene.trim()) parts.push(filterGene.trim())
		if (appliedSearchQuery) parts.push(appliedSearchQuery)
		if (filterAfMin || filterAfMax) parts.push(`AF ${filterAfMin || '0'}-${filterAfMax || 'max'}`)
		if (filterAcMin || filterAcMax) parts.push(`AC ${filterAcMin || '0'}-${filterAcMax || 'max'}`)
		return parts.length
			? parts.join(' · ')
			: tx('All visible datasets', 'Todos os conjuntos visíveis')
	})
	const drawerApiQueryString = $derived.by(() => {
		const params = new URLSearchParams(exploreQueryString)
		params.delete('pageSize')
		params.set('limit', String(filterPageSize))
		return params.toString()
	})
	const drawerCurlCmd = $derived(
		`curl '${typeof location !== 'undefined' ? location.origin : ''}/api/variants?${drawerApiQueryString}'`
	)

	function openVariantFromDrawer(href: string) {
		resultsDrawerOpen = true
		resultsDrawerExpanded = true
		const target = new URL(href, page.url)
		const tenant = page.url.searchParams.get('tenant') ?? data.forceTenant
		if (tenant && !target.searchParams.has('tenant')) {
			target.searchParams.set('tenant', tenant)
		}
		void goto(`${target.pathname}${target.search}`)
	}

	function openExploreFromVariant(href: string) {
		resultsDrawerOpen = true
		resultsDrawerExpanded = true
		const target = new URL(href, page.url)
		const tenant = page.url.searchParams.get('tenant') ?? data.forceTenant
		if (tenant && !target.searchParams.has('tenant')) {
			target.searchParams.set('tenant', tenant)
		}
		const path = target.pathname === '/explore' ? '/' : target.pathname
		hydrateExploreFiltersFromUrl(target.searchParams, {
			syncSearch: true,
			clearSearch: true,
			syncMapSelection: true,
		})
		filterStateHydrated = true
		resultsTableQueryString = ''
		lastHydratedExploreUrl = exploreUrlKey(path, buildExploreParams())
		selfUrlSync = true
		void goto(`${path}${target.search}`)
	}

	function openResultsDrawer(force = false) {
		if (!force && !hasActiveExploreContext()) {
			closeResultsDrawer()
			return
		}
		resultsDrawerOpen = true
		countryPickerOpen = false
		syncResultsUrl(true)
	}

	function closeResultsDrawer() {
		resultsDrawerOpen = false
		syncResultsUrl(false)
	}

	function copyDrawerCurl() {
		navigator.clipboard?.writeText(drawerCurlCmd)
		curlCopied = true
		setTimeout(() => (curlCopied = false), 1200)
	}

	function copyShareUrl() {
		navigator.clipboard?.writeText(mapResultsUrl)
		shareCopied = true
		setTimeout(() => (shareCopied = false), 1200)
	}

	function syncResultsUrl(_drawerOpen: boolean, force = false) {
		if (typeof location === 'undefined') return
		const path = page.url.pathname === '/explore' ? '/' : page.url.pathname
		if (path !== '/') return
		const params = urlExploreParams()
		const urlKey = exploreUrlKey(path, params)
		if (
			!force &&
			exploreSearchParamsEqual(params, page.url.searchParams) &&
			!page.url.searchParams.has('results')
		) {
			lastHydratedExploreUrl = urlKey
			return
		}
		if (!routerReady) {
			pendingResultsUrlOpen = _drawerOpen
			lastHydratedExploreUrl = urlKey
			return
		}
		selfUrlSync = true
		lastHydratedExploreUrl = urlKey
		try {
			replaceState(urlKey, {})
		} catch {
			selfUrlSync = false
			pendingResultsUrlOpen = _drawerOpen
			void goto(urlKey, { replaceState: true, noScroll: true, keepFocus: true })
		}
	}

	$effect(() => {
		if (!filterStateHydrated) return
		if (exploreQueryString !== lastExploreQueryString) {
			resultsTableQueryString = ''
			lastExploreQueryString = exploreQueryString
		}
		void resultsDrawerOpen
		void exploreQueryString
		if (isVariantRoute) return
		const path = page.url.pathname === '/explore' ? '/' : page.url.pathname
		if (path !== '/') return

		const stateParams = buildExploreParams()
		const urlHasContext = hasExploreQueryContextFromParams(page.url.searchParams)
		const stateHasContext = hasExploreQueryContextFromParams(stateParams)

		if (urlHasContext && !stateHasContext && lastHydratedExploreUrl) {
			const lastHydratedParams = new URLSearchParams(lastHydratedExploreUrl.split('?')[1] ?? '')
			if (!hasExploreQueryContextFromParams(lastHydratedParams)) {
				syncResultsUrl(resultsDrawerOpen, true)
				return
			}
		}

		if (urlHasContext && !exploreSearchParamsEqual(stateParams, page.url.searchParams)) {
			return
		}

		const params = urlExploreParams()
		if (exploreUrlKey(path, params) === lastHydratedExploreUrl) return
		syncResultsUrl(resultsDrawerOpen)
	})

	$effect(() => {
		if (isVariantRoute && variantDetailData) {
			resultsDrawerOpen = true
			resultsDrawerExpanded = true
		}
	})

	function countrySourceBanks(country: CountryRow) {
		const banks = dashboard.biobanks as Array<{ slug?: string; name: string; website?: string }>
		const seen = new Set<string>()
		const results = []
		for (const source of country.sources) {
			const normalized = normalizeSearch(source)
			let bank = banks.find((item) => normalizeSearch(item.name) === normalized)
			if (!bank && ['afr', 'amr', 'eas', 'eur', 'sas'].includes(normalized)) {
				bank = banks.find((item) => item.slug === '1kgp')
			}
			if (!bank) continue
			const key = bank.slug ?? bank.name
			if (seen.has(key)) continue
			seen.add(key)
			results.push(bank)
		}
		return results
	}

	function countryMappingsForCode(code: string) {
		const rows: Array<CountryMapping & { superpop: string }> = []
		for (const population of dashboard.populations as Population[]) {
			for (const mapping of population.countryMappings ?? []) {
				if (mapping.countryCode === code) {
					rows.push({ ...mapping, superpop: population.name })
				}
			}
		}
		return rows.sort(
			(a, b) =>
				b.sampleCount - a.sampleCount || a.subpopulationName.localeCompare(b.subpopulationName)
		)
	}

	function caribbeanPeerCountries(country: CountryRow) {
		if (!CARIBBEAN_CODES.has(country.code)) return []
		return countryRows
			.filter((row) => CARIBBEAN_CODES.has(row.code))
			.sort((a, b) => b.samples - a.samples || a.name.localeCompare(b.name))
	}

	function countryContextLine(country: CountryRow) {
		const caribbeanPeers = caribbeanPeerCountries(country)
		if (caribbeanPeers.length) {
			const total = caribbeanPeers.reduce((sum, row) => sum + row.samples, 0)
			return `${fmt(country.samples)} of ${fmt(total)} Caribbean samples`
		}

		for (const bank of countrySourceBanks(country)) {
			const total = (dashboard.biobanks as Array<{ slug?: string; totalSamples?: number }>).find(
				(item) => item.slug === bank.slug
			)?.totalSamples
			if (total && total > country.samples) {
				return `${fmt(country.samples)} of ${fmt(total)} ${bank.name} samples`
			}
		}

		return null
	}

	function datasetsForCountry(country: CountryRow) {
		const bankSlugs = new Set(
			countrySourceBanks(country)
				.map((bank) => bank.slug)
				.filter(Boolean)
		)
		const superpops = new Set(
			countryMappingsForCode(country.code).map((mapping) => mapping.superpop)
		)

		return displayDatasets.filter((dataset) => {
			if (!dataset.biobankSlug || !bankSlugs.has(dataset.biobankSlug)) return false
			if (dataset.biobankSlug === '1kgp') {
				return dataset.superPopulation ? superpops.has(dataset.superPopulation) : false
			}
			if (dataset.biobankSlug === 'carigenetics') {
				return CARIBBEAN_CODES.has(country.code)
			}
			return true
		})
	}

	function flyToDatasetView(dataset: DisplayDataset) {
		if (isBipmedDataset(dataset)) {
			map?.flyTo({
				center: [-51.925, -14.235],
				zoom: 3.9,
				duration: 900,
				essential: true,
			})
			return
		}

		if (isPgpDataset(dataset)) {
			map?.flyTo({
				center: [-98.58, 39.83],
				zoom: 3.4,
				duration: 900,
				essential: true,
			})
			return
		}

		const rows = countryRows.filter((country) =>
			countryCodesForDataset(dataset).includes(country.code)
		)
		if (!rows.length) {
			map?.flyTo({
				center: DEFAULT_MAP_CENTER,
				zoom: DEFAULT_MAP_ZOOM,
				duration: 900,
				essential: true,
			})
			return
		}

		if (rows.length === 1) {
			map?.flyTo({
				center: rows[0].center,
				zoom: COUNTRY_ZOOMS[rows[0].code] ?? 4.3,
				duration: 900,
				essential: true,
			})
			return
		}

		const lng = rows.reduce((sum, country) => sum + country.center[0], 0) / rows.length
		const lat = rows.reduce((sum, country) => sum + country.center[1], 0) / rows.length
		const zoom =
			dataset.slug === 'cari-caribbean'
				? 4.6
				: dataset.slug === 'bipmed-wes'
					? 3.9
					: dataset.slug === 'pgp-usa'
						? 3.4
						: dataset.superPopulation
							? 2.4
							: 3.2

		map?.flyTo({
			center: [lng, lat],
			zoom,
			duration: 900,
			essential: true,
		})
	}

	function flyToCoverageRow(row: CoverageRow, options?: { keepDataset?: boolean }) {
		selectedCode = options?.keepDataset ? selectedCode : null
		map?.flyTo({
			center: row.center,
			zoom: isBipmedDataset(selectedDataset) ? 5.4 : 5.8,
			duration: 900,
			essential: true,
		})
	}

	function selectDataset(dataset: DisplayDataset) {
		selectedDatasetSlug = dataset.slug ?? null
		selectedCode = null
		flyToDatasetView(dataset)
	}

	function clearDatasetSelection() {
		selectedDatasetSlug = null
		selectedCode = null
		countryPickerOpen = false
		map?.flyTo({
			center: DEFAULT_MAP_CENTER,
			zoom: DEFAULT_MAP_ZOOM,
			duration: 900,
			essential: true,
		})
	}

	function resetMapView() {
		selectedDatasetSlug = null
		selectedCode = null
		countryPickerOpen = false
		resultsDrawerOpen = false
		resultsDrawerExpanded = false
		resetExploreQueriesAndFilters()

		const params = new URLSearchParams()
		if (data.forceTenant) params.set('tenant', data.forceTenant)
		const homeUrl = exploreUrlKey('/', params)
		lastHydratedExploreUrl = homeUrl
		selfUrlSync = true

		if (isVariantRoute) {
			void goto(homeUrl, { replaceState: true, noScroll: true, keepFocus: true })
		} else {
			syncExploreUrlAfterReset()
		}

		syncMapState({ country: null, dataset: null })
		map?.flyTo({
			center: DEFAULT_MAP_CENTER,
			zoom: DEFAULT_MAP_ZOOM,
			duration: 900,
			essential: true,
		})
	}

	function handleResetView() {
		resetMapView()
	}

	function syncMapState(
		selection: MapSelectionState = { country: selectedCountry, dataset: selectedDataset }
	) {
		if (!map?.isStyleLoaded() || !map.getSource('collection-countries')) return

		const source = map.getSource('collection-countries') as GeoJSONSource
		source.setData(collectionGeoJson)

		const selectedHighlightCodes = selection.country
			? [selection.country.code]
			: selection.dataset
				? countryCodesForDataset(selection.dataset).filter((code) =>
						countryRows.some((country) => country.code === code)
					)
				: countryRows.map((country) => country.code)
		const selectedFocusCodes = selection.country
			? [selection.country.code]
			: selection.dataset
				? countryCodesForDataset(selection.dataset)
				: countryRows.map((country) => country.code)
		const selectionHighlightExpression: ExpressionSpecification = [
			'in',
			['get', 'iso_3166_1'],
			['literal', selectedHighlightCodes],
		]
		const hasSelection = Boolean(selection.country || selection.dataset)

		map.setFilter('selected-country-fill', [
			'all',
			...countryMaskFilter.slice(1),
			selectionHighlightExpression,
		])
		map.setFilter('selected-country-outline', [
			'all',
			...countryMaskFilter.slice(1),
			selectionHighlightExpression,
		])
		map.setFilter('non-selected-country-mask', [
			'all',
			...countryMaskFilter.slice(1),
			['!', selectionHighlightExpression],
		])

		const focusExpression: ExpressionSpecification = [
			'case',
			['in', ['get', 'code'], ['literal', selectedFocusCodes]],
			0.98,
			hasSelection ? 0.12 : 0.98,
		]
		const haloExpression: ExpressionSpecification = [
			'case',
			['in', ['get', 'code'], ['literal', selectedFocusCodes]],
			0.2,
			hasSelection ? 0.03 : 0.2,
		]
		const labelExpression: ExpressionSpecification = [
			'case',
			['in', ['get', 'code'], ['literal', selectedFocusCodes]],
			1,
			hasSelection ? 0.18 : 1,
		]

		map.setPaintProperty('collection-country-bubbles', 'circle-radius', bubbleRadiusExpression)
		map.setPaintProperty(
			'collection-country-bubble-halo',
			'circle-radius',
			bubbleHaloRadiusExpression
		)
		map.setLayoutProperty('collection-country-labels', 'text-size', bubbleLabelSizeExpression)
		map.setPaintProperty('collection-country-bubbles', 'circle-opacity', focusExpression)
		map.setPaintProperty('collection-country-bubble-halo', 'circle-opacity', haloExpression)
		map.setPaintProperty('collection-country-labels', 'text-opacity', labelExpression)
	}

	function clearCountrySelection() {
		selectedCode = null
		if (selectedDataset) {
			flyToDatasetView(selectedDataset)
			return
		}
		map?.flyTo({
			center: DEFAULT_MAP_CENTER,
			zoom: DEFAULT_MAP_ZOOM,
			duration: 900,
			essential: true,
		})
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
						showTransitLabels: false,
					},
				},
			],
			sources: {
				composite: {
					type: 'vector',
					url: 'mapbox://mapbox.country-boundaries-v1',
				},
				'collection-countries': {
					type: 'geojson',
					data: collectionGeoJson,
				},
			},
			sprite: 'mapbox://sprites/mapbox/standard',
			glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
			terrain: null,
			projection: {
				name: 'mercator',
			},
			layers: [
				{
					id: 'ocean-background',
					type: 'background',
					paint: {
						'background-color': '#d7eef4',
					},
				},
				{
					id: 'non-selected-country-mask',
					type: 'fill',
					source: 'composite',
					'source-layer': 'country_boundaries',
					filter: ['all', ...countryMaskFilter.slice(1), ['!', countryHighlightExpression]],
					paint: {
						'fill-color': '#f8f7f2',
						'fill-opacity': 0.98,
					},
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
							openMinedMapPalette[3],
						],
						'fill-opacity': 0.52,
					},
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
						'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.25, 5, 0.8],
					},
				},
				{
					id: 'collection-country-bubble-halo',
					type: 'circle',
					source: 'collection-countries',
					layout: {
						'circle-sort-key': bubbleSortKey,
					},
					paint: {
						'circle-color': bubbleColorExpression,
						'circle-opacity': 0.2,
						'circle-radius': bubbleHaloRadiusExpression,
					},
				},
				{
					id: 'collection-country-bubbles',
					type: 'circle',
					source: 'collection-countries',
					layout: {
						'circle-sort-key': bubbleSortKey,
					},
					paint: {
						'circle-color': bubbleColorExpression,
						'circle-opacity': 0.98,
						'circle-stroke-width': 0,
						'circle-radius': bubbleRadiusExpression,
					},
				},
				{
					id: 'collection-country-labels',
					type: 'symbol',
					source: 'collection-countries',
					layout: {
						'symbol-sort-key': bubbleSortKey,
						'text-field': ['get', 'label'],
						'text-size': bubbleLabelSizeExpression,
						'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
						'text-anchor': 'center',
						'text-offset': [0, 0],
						'text-allow-overlap': false,
						'text-ignore-placement': false,
						'text-optional': true,
					},
					paint: {
						'text-color': '#353243',
						'text-halo-color': 'rgba(255, 255, 255, 0.88)',
						'text-halo-width': 1,
					},
				},
			],
		}
	}

	function selectedCountryCameraPadding() {
		if (typeof window === 'undefined' || window.innerWidth <= 700) return undefined
		const bottomInset = 28
		const searchWidth = Math.min(
			TOP_SEARCH_MAX_WIDTH,
			Math.max(TOP_SEARCH_MIN_WIDTH, window.innerWidth * TOP_SEARCH_WIDTH_RATIO)
		)
		const drawerLeftEdge = Math.max(
			SCREEN_INSET,
			window.innerWidth * TOP_SEARCH_LEFT_RATIO - searchWidth / 2
		)
		const countryPanelHeight = Math.min(
			COUNTRY_PANEL_MAX_HEIGHT,
			Math.max(0, window.innerHeight - 140)
		)
		return {
			top: RESULTS_DRAWER_TOP,
			right: Math.round(window.innerWidth - drawerLeftEdge),
			bottom: Math.max(
				0,
				Math.min(
					window.innerHeight - RESULTS_DRAWER_TOP - 80,
					bottomInset + countryPanelHeight + 16
				)
			),
			left: 0,
		}
	}

	function flyToCountry(country: CountryRow, options: { keepDataset?: boolean } = {}) {
		selectedCode = country.code
		if (!options.keepDataset && selectedDatasetSlug) {
			const datasetCodes = selectedDataset ? countryCodesForDataset(selectedDataset) : []
			if (!datasetCodes.includes(country.code)) {
				selectedDatasetSlug = null
			}
		}
		resultsDrawerExpanded = true
		openResultsDrawer()
		map?.flyTo({
			center: country.center,
			zoom: COUNTRY_ZOOMS[country.code] ?? 4.3,
			padding: selectedCountryCameraPadding(),
			retainPadding: false,
			duration: 900,
			essential: true,
		})
	}

	const initMap: Action<HTMLDivElement> = (container) => {
		map = new mapboxgl.Map({
			container,
			style: createStyle(),
			center: DEFAULT_MAP_CENTER,
			zoom: DEFAULT_MAP_ZOOM,
			minZoom: 2,
			// maxBounds: [
			// 	[-180, -58],
			// 	[180, 78],
			// ],
			// maxBounds: [
			// 	[-180, -58],
			// 	[180, 78],
			// ],
			renderWorldCopies: true,
		})
		map.scrollZoom.setZoomRate(SCROLL_ZOOM_RATE)
		map.scrollZoom.setWheelZoomRate(WHEEL_ZOOM_RATE)

		const resizeMap = () => map?.resize()
		const resizeObserver = new ResizeObserver(resizeMap)
		resizeObserver.observe(container)
		requestAnimationFrame(resizeMap)
		requestAnimationFrame(() => requestAnimationFrame(resizeMap))
		window.addEventListener('resize', resizeMap)

		map.on('load', () => {
			resizeMap()
			map?.setTerrain(null)
			map?.setFog(null)
			map?.setSnow(null)
			map?.setRain(null)
			syncMapState()
		})

		map.on('click', 'collection-country-bubbles', (event) => {
			event.originalEvent.stopPropagation()
			const code = event.features?.[0]?.properties?.code
			const country = countryRows.find((item) => item.code === code)
			if (country) flyToCountry(country)
		})

		map.on('click', (event) => {
			if (!map) return
			const bubbleHits = map.queryRenderedFeatures(event.point, {
				layers: ['collection-country-bubbles'],
			})
			if (!bubbleHits.length) handleResetView()
		})

		map.on('mouseenter', 'collection-country-bubbles', (event) => {
			if (!map) return
			map.getCanvas().style.cursor = 'pointer'
			const feature = event.features?.[0]
			const coordinates = (feature?.geometry as Point | undefined)?.coordinates
			if (!feature?.properties || !coordinates) return
			popup?.remove()
			popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 16 })
				.setLngLat(coordinates as [number, number])
				.setHTML(
					`<strong>${feature.properties.name}</strong><br>${fmt(feature.properties.samples)} samples<br>${feature.properties.sources}`
				)
				.addTo(map)
		})

		map.on('mouseleave', 'collection-country-bubbles', () => {
			if (map) map.getCanvas().style.cursor = ''
			popup?.remove()
			popup = undefined
		})

		return {
			destroy() {
				window.removeEventListener('resize', resizeMap)
				resizeObserver.disconnect()
				popup?.remove()
				map?.remove()
				map = undefined
			},
		}
	}

	onDestroy(() => {
		popup?.remove()
		map?.remove()
		map = undefined
	})

	$effect(() => {
		collectionGeoJson
		countryHighlightExpression
		bubbleFocusCodes
		bubbleStyleVersion
		selectedDatasetSlug
		selectedCode
		syncMapState()
	})
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

		<form
			method="GET"
			action="/"
			class="global-search"
			class:dropdown-open={countryPickerOpen}
			onsubmit={handleSearchSubmit}
		>
			{#if selectedCode}<input type="hidden" name="country" value={selectedCode} />{/if}
			{#if selectedDatasetSlug}<input type="hidden" name="dataset" value={selectedDatasetSlug} />{/if}
			{#if data.forceTenant}<input type="hidden" name="tenant" value={data.forceTenant} />{/if}
			<div class="search-cluster">
				<div class="country-picker">
					<button
						type="button"
						class="country-picker-trigger"
						class:scoped={!!selectedCountry}
						aria-expanded={countryPickerOpen}
						onclick={() => (countryPickerOpen = !countryPickerOpen)}
					>
						<span
							>{selectedCountry
								? `${tx('In', 'Em')}: ${selectedCountry.name}`
								: tx('Countries', 'Países')}</span
						>
						<strong>{selectedCountry ? selectedCountry.code : countryRows.length}</strong>
					</button>
					{#if countryPickerOpen}
						<div class="country-picker-menu">
							{#each countryRows as country}
								<button
									type="button"
									class:active={country.code === selectedCode}
									onclick={() => pickCountry(country)}
								>
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
				</div>
				<input
					bind:value={searchQuery}
					list="dashboard-search-suggestions"
					name="q"
					placeholder={selectedCountry
						? tx('Search gene, rsID, or position', 'Pesquisar gene, rsID ou posição')
						: tx(
								'Search country, cohort, gene, rsID, or position',
								'Pesquisar país, coorte, gene, rsID ou posição'
							)}
				/>
				<datalist id="dashboard-search-suggestions">
					{#each countryRows as country}
						<option value={country.name}
							>{country.code} · {fmt(country.samples)} {tx('samples', 'amostras')}</option
						>
					{/each}
					{#each directPopulations as population}
						<option value={population.name}>{population.biobankName}</option>
					{/each}
					<option value="Caribbean">{tx('Region', 'Região')}</option>
					<option value="BRCA1">{tx('Gene', 'Gene')}</option>
					<option value="rs1050828">rsID</option>
					<option value="chr17:43078520">{tx('Position', 'Posição')}</option>
				</datalist>
				<button class="search-submit">{tx('Explore', 'Explorar')}</button>
			</div>
			{#if selectedCountry || selectedDataset || searchQuery || mapFilterCount}
				<button type="button" class="map-reset" onclick={handleResetView}
					>{tx('Reset', 'Redefinir')}</button
				>
			{/if}
		</form>

		<div class="floating-title">
			<h1>{tx('Global allele-frequency network', 'Rede global de frequência alélica')}</h1>
			{#if selectedDataset}
				<p>
					{#if isBipmedDataset(selectedDataset)}
						{selectedDataset.title} · {fmt(BRAZIL_STATES.length)}
						{tx('states', 'estados')} · {fmt(selectedDataset.participants)}
						{tx('participants', 'participantes')}
					{:else if isPgpDataset(selectedDataset)}
						{selectedDataset.title} · {tx('United States', 'Estados Unidos')} · {fmt(
							selectedDataset.participants
						)}
						{tx('participants', 'participantes')}
					{:else}
						{selectedDataset.title} · {fmt(scopedCountryRows.length)}
						{tx('countries', 'países')} · {fmt(selectedDataset.participants)}
						{tx('participants', 'participantes')}
					{/if}
				</p>
			{/if}
		</div>

		<nav class="top-nav" aria-label={tx('Dashboard navigation', 'Navegação do painel')}>
			<a href="/about">{tx('About', 'Sobre')}</a>
			<a href="/contact">{tx('Contact', 'Contato')}</a>
			<a href="/api">API</a>
			<!-- Language picker hidden for now.
		<label class="language-switcher" aria-label={tx('Language', 'Idioma')}>
			<select bind:value={$lang}>
				{#each LANGS as option}
					<option value={option.code}>{option.flag} {option.code.toUpperCase()}</option>
				{/each}
			</select>
		</label>
		-->
		</nav>

		<Drawer.Root
			bind:open={resultsDrawerOpen}
			onOpenChange={(open) => {
				if (!open) syncResultsUrl(false)
			}}
			shouldScaleBackground={false}
			direction="right"
			modal={false}
		>
			<Drawer.Content
				class={`map-results-drawer ${resultsDrawerExpanded ? 'expanded' : ''}`}
				aria-label={tx('Variant results', 'Resultados de variantes')}
			>
				<div class="drawer-copy-ears" aria-label={tx('Share tools', 'Ferramentas de compartilhamento')}>
					{#if !isVariantRoute}
						<button
							type="button"
							class:active={drawerFiltersOpen}
							onclick={() => (drawerFiltersOpen = !drawerFiltersOpen)}
						>
							{tx('Filters', 'Filtros')}{#if mapFilterCount} <strong>{mapFilterCount}</strong>{/if}
						</button>
						<button type="button" onclick={copyDrawerCurl} title={drawerCurlCmd}
							>{curlCopied ? tx('Copied', 'Copiado') : 'curl'}</button
						>
						<button type="button" onclick={copyShareUrl}
							>{shareCopied ? tx('Copied', 'Copiado') : tx('link', 'link')}</button
						>
					{/if}
				</div>
				{#if drawerFiltersOpen && !isVariantRoute}
					<div class="map-filter-menu drawer-filter-menu">
						{#if filterBiobankOptions.length > 1}
							<section class="map-filter-section">
								<div class="map-filter-section-head">
									<div>
										<div class="map-filter-heading">{tx('Biobanks', 'Biobancos')}</div>
										<p>{filterBiobankSummary}</p>
									</div>
									<div class="map-filter-mini-actions">
										<button type="button" onclick={() => setAllFilterBiobanks(true)}>All</button>
										<button type="button" onclick={() => setAllFilterBiobanks(false)}>None</button>
									</div>
								</div>
								<div class="map-filter-options compact">
									{#each filterBiobankOptions as bank}
										<label>
											<input
												type="checkbox"
												checked={filterBiobanks[bank.slug] !== false}
												onchange={() => toggleFilterBiobank(bank.slug)}
											/>
											<span>{bank.name}</span>
										</label>
									{/each}
								</div>
								<div
									class="map-filter-match"
									class:disabled={selectedFilterBiobankSlugs.length < 2}
								>
									<span>{tx('Match', 'Correspondência')}</span>
									<label>
										<input
											type="radio"
											name="map-biobank-match"
											checked={filterMatchMode === 'any'}
											disabled={selectedFilterBiobankSlugs.length < 2}
											onchange={() => (filterMatchMode = 'any')}
										/>
										<span>Either biobank</span>
									</label>
									<label>
										<input
											type="radio"
											name="map-biobank-match"
											checked={filterMatchMode === 'all'}
											disabled={selectedFilterBiobankSlugs.length < 2}
											onchange={() => (filterMatchMode = 'all')}
										/>
										<span>All selected biobanks</span>
									</label>
								</div>
							</section>
						{/if}

						{#if filterPopulationOptions.length > 1}
							<section class="map-filter-section">
								<div class="map-filter-section-head">
									<div>
										<div class="map-filter-heading">{tx('Populations', 'Populações')}</div>
										<p>{filterPopulationSummary}</p>
									</div>
									<div class="map-filter-mini-actions">
										<button type="button" onclick={() => setAllFilterPopulations(true)}>All</button>
										<button type="button" onclick={() => setAllFilterPopulations(false)}
											>None</button
										>
									</div>
								</div>
								<div class="map-filter-population-groups">
									{#each filterPopulationsByBiobank as group}
										<div
											class="map-filter-population-group"
											class:disabled={filterBiobanks[group.slug] === false}
										>
											<div class="map-filter-population-head">
												<span>{group.name}</span>
												{#if filterPopulationsByBiobank.length > 1}
													<div class="map-filter-mini-actions">
														<button
															type="button"
															onclick={() => setFilterBiobankPopulations(group.slug, true)}
															>All</button
														>
														<button
															type="button"
															onclick={() => setFilterBiobankPopulations(group.slug, false)}
															>None</button
														>
													</div>
												{/if}
											</div>
											<div class="map-filter-options compact">
												{#each group.populations as population}
													<label>
														<input
															type="checkbox"
															checked={filterPopulations[population.cohortId] !== false}
															onchange={() => toggleFilterPopulation(population.cohortId)}
														/>
														<span>{population.name}</span>
													</label>
												{/each}
											</div>
										</div>
									{/each}
								</div>
								<div class="map-filter-match" class:disabled={selectedFilterCohortIds.length < 2}>
									<span>{tx('Match', 'Correspondência')}</span>
									<label>
										<input
											type="radio"
											name="map-population-match"
											checked={filterPopulationMatchMode === 'any'}
											disabled={selectedFilterCohortIds.length < 2}
											onchange={() => (filterPopulationMatchMode = 'any')}
										/>
										<span>Either population</span>
									</label>
									<label>
										<input
											type="radio"
											name="map-population-match"
											checked={filterPopulationMatchMode === 'all'}
											disabled={selectedFilterCohortIds.length < 2}
											onchange={() => (filterPopulationMatchMode = 'all')}
										/>
										<span>All selected populations</span>
									</label>
								</div>
							</section>
						{/if}

						<div class="map-filter-grid">
							<label>
								<span>{tx('Gene', 'Gene')}</span>
								<input bind:value={filterGene} placeholder="ISG15" />
							</label>
							<label>
								<span>{tx('Allele freq', 'Freq. alélica')}</span>
								<div class="range-inputs">
									<input bind:value={filterAfMin} placeholder="min" />
									<input bind:value={filterAfMax} placeholder="max" />
								</div>
							</label>
							<label>
								<span>{tx('Allele count', 'Contagem alélica')}</span>
								<div class="range-inputs">
									<input bind:value={filterAcMin} type="number" placeholder="min" />
									<input bind:value={filterAcMax} type="number" placeholder="max" />
								</div>
							</label>
							<label>
								<span>{tx('Per page', 'Por página')}</span>
								<select bind:value={filterPageSize}>
									{#each [25, 50, 100, 200, 500] as n}<option value={n}>{n}</option>{/each}
								</select>
							</label>
						</div>
						<div class="map-filter-columns">
							<div>
								<div class="map-filter-heading">VEP impact</div>
								<div class="map-filter-options compact">
									{#each VEP_IMPACT_OPTIONS as impact}
										<label>
											<input
												type="checkbox"
												checked={filterVepImpacts[impact]}
												onchange={() => toggleFilterVepImpact(impact)}
											/>
											<span>{impact}</span>
										</label>
									{/each}
								</div>
							</div>
							<div>
								<div class="map-filter-heading">VEP consequence</div>
								<div class="map-filter-options">
									{#each VEP_CONSEQUENCE_OPTIONS as consequence}
										<label>
											<input
												type="checkbox"
												checked={filterVepConsequences[consequence]}
												onchange={() => toggleFilterVepConsequence(consequence)}
											/>
											<span>{consequence}</span>
										</label>
									{/each}
								</div>
							</div>
						</div>
						<div class="map-filter-actions">
							<button type="button" onclick={resetMapFilters}
								>{tx('Clear search & filters', 'Limpar pesquisa e filtros')}</button
							>
						</div>
					</div>
				{/if}
				<div class="map-results-body">
					{#if isVariantRoute && variantDetailData}
						<VariantDetailPage data={variantDetailData} part="tables" onExploreNavigate={openExploreFromVariant} />
					{:else if variantRouteError}
						<div class="variant-route-error">
							<p>{variantRouteError}</p>
							<button type="button" onclick={() => history.back()}>
								{tx('Back to results', 'Voltar aos resultados')}
							</button>
						</div>
					{:else if resultsDrawerOpen}
						{#key resultsDrawerKey}
							<VariantBrowser
								forceTenant={data.forceTenant}
								scoped={!!data.tenant.scope}
								options={filterBiobankOptions}
								populations={filterPopulationOptions}
								initialParams={activeResultsQueryString}
								syncToUrl={false}
								showApiBar={false}
								showTitle={false}
								onParamsChange={(params) => (resultsTableQueryString = params)}
								onVariantNavigate={openVariantFromDrawer}
								showGenotypeCounts={data.showGenotypeCounts}
								display={data.display}
								title={tx('Variants', 'Variantes')}
								subtitle={resultsContextTitle}
							/>
						{/key}
					{/if}
				</div>
			</Drawer.Content>
		</Drawer.Root>

		{#if showVariantLeftPanels && variantDetailData}
			<VariantDetailPage data={variantDetailData} part="panel" onExploreNavigate={openExploreFromVariant} />
		{:else if showExploreLeftPanels}
			<section class="explore-intro-panel" aria-label={tx('Explore BioVault', 'Explorar BioVault')}>
				<h2>{tx('Explore', 'Explorar')} <span>BioVault</span></h2>
				<p>{tx('Variants across the whole network.', 'Variantes em toda a rede.')}</p>
			</section>

			<section class="explore-stat-row" aria-label={tx('Network summary', 'Resumo da rede')}>
				<div class="explore-stat-box">
					<strong>{countryRows.length}</strong>
					<span>{tx('countries', 'países')}</span>
				</div>
				<div class="explore-stat-box">
					<strong>{fmt(dashboard.totals.participants)}</strong>
					<span>{tx('participants', 'participantes')}</span>
				</div>
			</section>

			<section class="variant-mix explore-variant-panel" aria-label={tx('Variants', 'Variantes')}>
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

			<section class="bottom-panel explore-datasets-panel" aria-label={tx('Databases', 'Bancos de dados')}>
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
									<span>{tenant?.logoEmoji ?? 'DB'}</span>
								{/if}
							</span>
							<span class="database-row-main">
								<span class="database-row-title">{dataset.title}</span>
								<small
									>{dataset.release} · {fmt(dataset.participants)}
									{tx('participants', 'participantes')} · {dataset.assay}</small
								>
							</span>
						</button>
					{/each}
					<a href="/contact" class="dataset-cta"
						>{tx('Want to contribute data?', 'Quer contribuir com dados?')}
						<strong>{tx('Get in touch', 'Entre em contato')}</strong></a
					>
				</div>
			</section>
		{/if}

		{#if isHome}
			{#if selectedCountry || selectedDataset}
				<aside
					class="country-panel"
					class:drawer-open={resultsDrawerOpen}
					aria-label={tx('Countries by sample count', 'Países por número de amostras')}
				>
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
							{#if selectedDataset}
								<button type="button" class="panel-action secondary" onclick={clearCountrySelection}
									>{tx('Back', 'Voltar')}</button
								>
							{/if}
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
											<button
												type="button"
												class="detail-list-row"
												class:active={peer.code === selectedCountry.code}
												onclick={() => flyToCountry(peer)}
											>
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
												{#if dataset.release}<span class="meta-release">{dataset.release}</span
													>{/if}
											</div>
											<h3>{dataset.title}</h3>
											{#if dataset.description}<p class="meta-desc">{dataset.description}</p>{/if}
										</div>
									</div>
									<dl class="meta-grid">
										<div>
											<dt>{tx('Participants', 'Participantes')}</dt>
											<dd>{fmt(dataset.participants)}</dd>
										</div>
										<div>
											<dt>{tx('Variants', 'Variantes')}</dt>
											<dd>{fmt(dataset.variants)}</dd>
										</div>
										<div>
											<dt>{tx('Assay', 'Ensaio')}</dt>
											<dd>{dataset.assay}</dd>
										</div>
										<div>
											<dt>{tx('Build', 'Montagem')}</dt>
											<dd>{dataset.genomeBuild}</dd>
										</div>
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
						</div>

						<div class="country-detail">
							{#if selectedDataset.description}
								<p class="detail-context">{selectedDataset.description}</p>
							{/if}

							<article class="meta-dataset compact">
								<div class="meta-dataset-head">
									<p>{tx('Dataset stats', 'Estatísticas do conjunto')}</p>
									{#if selectedDataset.release}<span class="meta-release"
											>{selectedDataset.release}</span
										>{/if}
								</div>
								<dl class="meta-grid">
									<div>
										<dt>{tx('Participants', 'Participantes')}</dt>
										<dd>{fmt(selectedDataset.participants)}</dd>
									</div>
									<div>
										<dt>{tx('Variants', 'Variantes')}</dt>
										<dd>{fmt(selectedDataset.variants)}</dd>
									</div>
									<div>
										<dt>{tx('Assay', 'Ensaio')}</dt>
										<dd>{selectedDataset.assay}</dd>
									</div>
									<div>
										<dt>{tx('Build', 'Montagem')}</dt>
										<dd>{selectedDataset.genomeBuild}</dd>
									</div>
								</dl>
							</article>

							<div class="detail-section">
								<p>{datasetCoverageLabel(selectedDataset)}</p>
								<div class="country-list inset">
									{#each scopedCoverageRows as row}
										<button
											type="button"
											onclick={() => flyToCoverageRow(row, { keepDataset: true })}
										>
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
					{/if}
				</aside>
			{/if}

			<!-- Temporarily hidden per design pass.
	<section class="variant-mix" class:drawer-open={resultsDrawerOpen} aria-label={tx('Variants', 'Variantes')}>
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
	-->

			<!-- Temporarily hidden per design pass.
	<section class="bottom-panel" class:drawer-open={resultsDrawerOpen} aria-label={tx('Databases', 'Bancos de dados')}>
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
	-->

			<p class="site-footer">© BioVault GA4GH VRS · <a href="/api">Beacon v2</a></p>
		{:else if !isVariantRoute}
			<main class="route-overlay" class:with-left-panels={showExploreLeftPanels || showVariantLeftPanels}>
				{@render children?.()}
			</main>
		{/if}
	</div>
{:else}
	<AtlasHome {data} />
{/if}

<style>
	:global(body:has(.dashboard-shell)) {
		overflow: hidden;
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
		--layout-left-width: 25vw;
		--side-panel-width: calc(var(--layout-left-width) - var(--screen-inset) - 8px);
		--top-search-left: 49.5vw;
		--top-search-width: clamp(520px, 42vw, 720px);
		--panel-surface: color-mix(in srgb, var(--om-white) 85%, transparent);
		--panel-shadow: 0 10px 28px rgb(46 43 59 / 0.08);
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

	.dashboard-shell :global(.mapboxgl-ctrl-bottom-left .mapboxgl-ctrl),
	.dashboard-shell :global(.mapboxgl-ctrl-bottom-right .mapboxgl-ctrl),
	.dashboard-shell :global(.mapboxgl-ctrl-attrib) {
		background: transparent !important;
		background-color: transparent !important;
		box-shadow: none;
	}

	.dashboard-shell :global(.mapboxgl-ctrl-attrib.mapboxgl-compact) {
		background: transparent !important;
		background-color: transparent !important;
	}

	.dashboard-shell :global(.mapboxgl-ctrl-attrib-inner) {
		background: transparent !important;
		background-color: transparent !important;
	}

	.dashboard-shell :global(.mapboxgl-ctrl-attrib a) {
		color: color-mix(in srgb, var(--om-gray-850) 78%, transparent);
		text-shadow: 0 1px 2px rgb(255 255 255 / 0.72);
	}

	.country-panel,
	.bottom-panel,
	.variant-mix,
	.explore-intro-panel,
	:global(.variant-detail-panel) {
		position: absolute;
		z-index: 2;
		border: 0;
		border-radius: var(--om-radius-m);
		background: var(--panel-surface);
		box-shadow: var(--panel-shadow);
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
		font-size: 17px;
		font-weight: 650;
		line-height: 1.2;
		color: color-mix(in srgb, var(--om-gray-850) 88%, transparent);
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
		gap: 12px;
		max-width: calc(100vw - 32px);
		padding: 0;
		border-radius: var(--om-radius-m);
		background: transparent;
	}

	.top-nav a {
		display: inline-flex;
		height: 38px;
		align-items: center;
		border-radius: var(--om-radius-s);
		padding: 0 10px;
		font-size: 13px;
		font-weight: 700;
		line-height: 1.3;
		color: var(--om-gray-600);
		text-decoration: none;
	}

	.top-nav a:hover {
		background: color-mix(in srgb, var(--om-white) 58%, transparent);
		color: var(--om-teal-700);
		text-decoration: none;
	}

	/* Language picker hidden for now.
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
	*/

	.global-search {
		position: absolute;
		z-index: 60;
		top: var(--screen-inset);
		left: calc(var(--top-search-left) - (var(--top-search-width) / 2));
		display: flex;
		align-items: center;
		width: var(--top-search-width);
		gap: var(--om-space-s);
		transform: none;
		--search-control-height: 48px;
		--search-shadow: none;
		--topbar-shadow: 0 3px 14px rgb(46 43 59 / 0.045);
	}

	.search-cluster {
		display: flex;
		min-width: 0;
		flex: 1;
		align-items: center;
		overflow: visible;
		border-radius: var(--om-radius-m);
		background: var(--panel-surface);
		box-shadow: var(--topbar-shadow);
	}

	.global-search.dropdown-open {
		z-index: 80;
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
	.search-submit,
	.country-picker-trigger,
	.map-reset {
		box-sizing: border-box;
		height: var(--search-control-height);
		margin: 0;
		border: 0;
	}

	.country-picker {
		position: relative;
		flex-shrink: 0;
	}

	.country-picker-trigger {
		display: flex;
		align-items: center;
		gap: 8px;
		border-radius: var(--om-radius-m) 0 0 var(--om-radius-m);
		background: transparent;
		box-shadow: var(--search-shadow);
		padding: 0 13px;
		font-family: 'Inter', system-ui, sans-serif;
		color: var(--om-gray-700);
		cursor: pointer;
	}

	.country-picker-trigger:hover,
	.country-picker-trigger[aria-expanded='true'] {
		background: color-mix(in srgb, var(--om-teal-100) 52%, transparent);
		color: var(--om-teal-700);
	}

	.country-picker-trigger.scoped {
		border: 0;
		background: color-mix(in srgb, var(--om-teal-100) 62%, transparent);
		color: var(--om-teal-700);
	}

	.country-picker-trigger span {
		max-width: min(180px, 20vw);
		overflow: hidden;
		font-size: 13px;
		font-weight: 800;
		line-height: 1;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.country-picker-trigger strong {
		display: grid;
		min-width: 25px;
		height: 24px;
		place-items: center;
		border-radius: 999px;
		background: var(--om-gray-850);
		padding: 0 8px;
		font-size: 11px;
		font-weight: 800;
		line-height: 1;
		color: var(--om-white);
	}

	.country-picker-menu {
		position: absolute;
		z-index: 5;
		top: calc(100% + 8px);
		left: 0;
		display: grid;
		width: min(360px, calc(100vw - 32px));
		max-height: min(430px, calc(100vh - 110px));
		overflow: auto;
		border-radius: var(--om-radius-m);
		background: color-mix(in srgb, var(--om-white) 96%, transparent);
		box-shadow: 0 8px 24px rgb(46 43 59 / 0.08);
		padding: var(--om-space-xs);
	}

	.country-picker-menu button {
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

	.country-picker-menu button:hover,
	.country-picker-menu button.active {
		background: color-mix(in srgb, var(--om-teal-100) 72%, var(--om-white));
	}

	.map-filter-menu {
		display: grid;
		max-height: min(44vh, 520px);
		overflow: auto;
		gap: var(--om-space-m);
		padding: var(--om-space-m);
	}

	.drawer-filter-menu {
		border-radius: 0;
	}

	.map-filter-section {
		display: grid;
		gap: var(--om-space-s);
	}

	.map-filter-section-head,
	.map-filter-population-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--om-space-m);
	}

	.map-filter-section-head p {
		margin-top: 2px;
		font-family: 'Inter', system-ui, sans-serif;
		font-size: 11px;
		font-weight: 800;
		line-height: 1.1;
		color: var(--om-gray-850);
	}

	.map-filter-mini-actions {
		display: flex;
		flex-shrink: 0;
		gap: 4px;
	}

	.map-filter-mini-actions button {
		height: 26px;
		border: 1px solid color-mix(in srgb, var(--om-gray-400) 55%, transparent);
		border-radius: var(--om-radius-xs);
		background: color-mix(in srgb, var(--om-white) 76%, transparent);
		padding: 0 8px;
		font-size: 11px;
		font-weight: 800;
		color: var(--om-gray-600);
		cursor: pointer;
	}

	.map-filter-mini-actions button:hover {
		background: color-mix(in srgb, var(--om-teal-100) 70%, var(--om-white));
		color: var(--om-teal-700);
	}

	.map-filter-match {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		padding: 2px 0;
		font-size: 12px;
		font-weight: 700;
		color: var(--om-gray-700);
	}

	.map-filter-match.disabled {
		opacity: 0.45;
	}

	.map-filter-match > span,
	.map-filter-population-head > span {
		font-size: 10px;
		font-weight: 800;
		line-height: 1.2;
		text-transform: uppercase;
		color: var(--om-gray-600);
	}

	.map-filter-match label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
	}

	.map-filter-match input {
		accent-color: var(--om-teal-600);
		cursor: pointer;
	}

	.map-filter-population-groups {
		display: grid;
		max-height: 250px;
		overflow: auto;
		gap: var(--om-space-s);
		padding-right: 2px;
	}

	.map-filter-population-group {
		display: grid;
		gap: 6px;
		border: 1px solid color-mix(in srgb, var(--om-gray-300) 70%, transparent);
		border-radius: var(--om-radius-s);
		background: color-mix(in srgb, var(--om-white) 58%, transparent);
		padding: var(--om-space-s);
	}

	.map-filter-population-group.disabled {
		opacity: 0.45;
	}

	.map-filter-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--om-space-s);
	}

	.map-filter-grid label,
	.map-filter-columns label {
		display: grid;
		gap: 5px;
		min-width: 0;
	}

	.map-filter-grid label > span,
	.map-filter-heading {
		font-size: 10px;
		font-weight: 800;
		line-height: 1.2;
		text-transform: uppercase;
		color: var(--om-gray-600);
	}

	.map-filter-grid input,
	.map-filter-grid select {
		min-width: 0;
		height: 34px;
		border: 1px solid color-mix(in srgb, var(--om-gray-400) 55%, transparent);
		border-radius: var(--om-radius-s);
		background: color-mix(in srgb, var(--om-white) 88%, transparent);
		padding: 0 9px;
		font-size: 13px;
		color: var(--om-gray-850);
		outline: none;
	}

	.map-filter-grid select {
		cursor: pointer;
	}

	.range-inputs {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 6px;
	}

	.map-filter-columns {
		display: grid;
		grid-template-columns: 0.75fr 1.25fr;
		gap: var(--om-space-m);
	}

	.map-filter-options {
		display: grid;
		max-height: 210px;
		overflow: auto;
		gap: 2px;
		margin-top: 6px;
		border: 1px solid color-mix(in srgb, var(--om-gray-300) 70%, transparent);
		border-radius: var(--om-radius-s);
		background: color-mix(in srgb, var(--om-gray-100) 62%, transparent);
		padding: 6px;
	}

	.map-filter-options.compact {
		max-height: none;
	}

	.map-filter-options label {
		display: flex;
		cursor: pointer;
		align-items: center;
		gap: 7px;
		border-radius: var(--om-radius-xs);
		padding: 5px 6px;
		font-size: 12px;
		font-weight: 650;
		line-height: 1.25;
		color: var(--om-gray-750);
	}

	.map-filter-options label:hover {
		background: color-mix(in srgb, var(--om-teal-100) 62%, var(--om-white));
	}

	.map-filter-options input {
		accent-color: var(--om-teal-600);
		cursor: pointer;
	}

	.map-filter-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--om-space-s);
		border-top: 1px solid color-mix(in srgb, var(--om-gray-300) 80%, transparent);
		padding-top: var(--om-space-s);
	}

	.map-filter-actions button {
		display: inline-flex;
		height: 34px;
		align-items: center;
		border: 1px solid transparent;
		border-radius: var(--om-radius-s);
		padding: 0 12px;
		font-size: 12px;
		font-weight: 800;
		text-decoration: none;
	}

	.map-filter-actions button {
		border: 1px solid color-mix(in srgb, var(--om-gray-400) 65%, transparent);
		background: color-mix(in srgb, var(--om-white) 84%, transparent);
		color: var(--om-gray-700);
		cursor: pointer;
	}

	.global-search input {
		min-width: 0;
		flex: 1;
		border-radius: 0;
		background: transparent;
		box-shadow: var(--search-shadow);
		padding: 0 14px;
		font-size: 15px;
		font-weight: 400;
		line-height: 1;
		color: var(--om-gray-850);
		outline: none;
		appearance: none;
		user-select: text;
		-webkit-user-select: text;
	}

	.global-search input::placeholder {
		color: var(--om-gray-550);
	}

	.global-search input:focus {
		box-shadow: none;
	}

	.search-submit {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		align-self: stretch;
		height: var(--search-control-height);
		border-radius: 0 var(--om-radius-m) var(--om-radius-m) 0;
		background: var(--om-gray-850);
		box-shadow: var(--search-shadow);
		padding: 0 18px;
		font-size: 15px;
		font-weight: 700;
		line-height: 1;
		color: var(--om-white);
		cursor: pointer;
		appearance: none;
	}

	.search-submit:hover {
		background: var(--om-green-600);
	}

	.search-submit:active {
		background: var(--om-teal-700);
	}

	.map-reset {
		flex-shrink: 0;
		border-radius: var(--om-radius-m);
		background: var(--panel-surface);
		box-shadow: var(--topbar-shadow);
		padding: 0 12px;
		font-family: 'Inter', system-ui, sans-serif;
		font-size: 13px;
		font-weight: 800;
		line-height: 1;
		color: var(--om-gray-700);
		cursor: pointer;
	}

	.map-reset:hover {
		background: color-mix(in srgb, var(--om-teal-100) 70%, var(--om-white));
		color: var(--om-teal-700);
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
		left: max(16px, calc((100vw - 480px) / 2));
		width: min(480px, calc(100vw - 32px));
		padding: var(--om-space-m);
	}

	.explore-intro-panel {
		position: absolute;
		z-index: 2;
		top: var(--results-drawer-top);
		left: var(--screen-inset);
		display: grid;
		width: var(--side-panel-width);
		gap: 3px;
		padding: 14px var(--om-space-l);
	}

	.explore-intro-panel h2 {
		margin: 0;
		overflow: hidden;
		font-size: 26px;
		font-weight: 800;
		line-height: 1.05;
		color: var(--om-gray-850);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.explore-intro-panel h2 span {
		color: var(--om-green-600);
	}

	.explore-intro-panel p {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		line-height: 1.3;
		color: var(--om-gray-600);
	}

	:global(.variant-detail-panel) {
		top: var(--results-drawer-top);
		left: var(--screen-inset);
		display: flex;
		width: var(--side-panel-width);
		max-height: calc(100vh - var(--results-drawer-top) - var(--bottom-inset));
		flex-direction: column;
		gap: var(--om-space-s);
		overflow: auto;
		padding: 14px var(--om-space-l) var(--om-space-l);
	}

	:global(.variant-detail-back) {
		font-size: 12px;
		font-weight: 700;
		color: var(--om-gray-600);
		text-decoration: none;
	}

	:global(.variant-detail-back:hover) {
		color: var(--om-teal-700);
		text-decoration: underline;
	}

	:global(.variant-detail-title) {
		margin: 0;
		overflow: hidden;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 18px;
		font-weight: 800;
		line-height: 1.15;
		color: var(--om-gray-850);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.variant-detail-links) {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	:global(.variant-detail-links a) {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		border: 1px solid color-mix(in srgb, var(--om-gray-400) 70%, transparent);
		border-radius: var(--om-radius-s);
		background: color-mix(in srgb, var(--om-white) 84%, transparent);
		padding: 4px 8px;
		font-size: 11px;
		font-weight: 700;
		color: var(--om-gray-700);
		text-decoration: none;
	}

	:global(.variant-detail-links a:hover) {
		border-color: color-mix(in srgb, var(--om-teal-600) 42%, transparent);
		color: var(--om-teal-700);
	}

	:global(.variant-detail-links img),
	:global(.variant-detail-links svg) {
		width: 14px;
		height: 14px;
	}

	:global(.variant-detail-summary) {
		display: grid;
		gap: var(--om-space-s);
	}

	:global(.variant-detail-summary h3) {
		margin: 0;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--om-teal-700);
	}

	:global(.variant-detail-summary dl) {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px 12px;
		margin: 0;
	}

	:global(.variant-detail-summary dl .span-all) {
		grid-column: 1 / -1;
	}

	:global(.variant-detail-summary dt) {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--om-gray-550);
	}

	:global(.variant-detail-summary dd) {
		margin: 2px 0 0;
		font-size: 12px;
		font-weight: 600;
		line-height: 1.35;
		color: var(--om-gray-850);
	}

	:global(.variant-detail-summary dd.mono) {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 11px;
	}

	:global(.variant-gene-list) {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	:global(.variant-gene-list a) {
		border: 1px solid color-mix(in srgb, var(--om-gray-400) 70%, transparent);
		border-radius: 999px;
		padding: 2px 8px;
		font-size: 11px;
		font-weight: 700;
		color: var(--om-teal-700);
		text-decoration: none;
	}

	:global(.variant-gene-list a:hover) {
		background: color-mix(in srgb, var(--om-teal-100) 60%, transparent);
	}

	:global(.vep-chip) {
		display: inline-flex;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--om-gray-400) 70%, transparent);
		padding: 2px 8px;
		font-size: 11px;
		font-weight: 700;
		text-decoration: none;
	}

	.explore-stat-row {
		position: absolute;
		z-index: 2;
		top: 174px;
		left: var(--screen-inset);
		display: grid;
		width: var(--side-panel-width);
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--om-space-s);
	}

	.explore-stat-box {
		display: grid;
		min-width: 0;
		gap: 2px;
		border: 0;
		border-radius: var(--om-radius-m);
		background: var(--panel-surface);
		box-shadow: var(--panel-shadow);
		padding: var(--om-space-m);
	}

	.explore-stat-box strong {
		overflow: hidden;
		font-size: 20px;
		font-weight: 800;
		line-height: 1.1;
		color: var(--om-gray-850);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.explore-stat-box span {
		overflow: hidden;
		font-size: 10px;
		font-weight: 800;
		line-height: 1.2;
		text-transform: uppercase;
		color: var(--om-teal-700);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.explore-variant-panel {
		top: 250px;
		bottom: auto;
		left: var(--screen-inset);
		width: var(--side-panel-width);
		transform: none;
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

	.bottom-panel.drawer-open {
		opacity: 0;
		pointer-events: none;
		transition: opacity 160ms ease;
	}

	.variant-mix.drawer-open {
		opacity: 0;
		pointer-events: none;
		transition: opacity 160ms ease;
	}

	.site-footer {
		position: absolute;
		z-index: 2;
		left: 0;
		width: 100%;
		bottom: 6px;
		margin: 0;
		font-family: 'Inter', system-ui, sans-serif;
		font-size: 11px;
		font-weight: 600;
		line-height: 1.2;
		text-align: center;
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

	.route-overlay {
		position: absolute;
		z-index: 2;
		left: var(--screen-inset);
		right: var(--screen-inset);
		top: 92px;
		bottom: var(--bottom-inset);
		overflow: auto;
		border-radius: var(--om-radius-m);
		background: color-mix(in srgb, var(--om-white) 88%, transparent);
		box-shadow: 0 12px 34px rgb(46 43 59 / 0.1);
		padding: clamp(20px, 3vw, 36px);
	}

	.route-overlay.with-left-panels {
		left: calc(var(--layout-left-width) + var(--screen-inset));
	}

	:global(.map-results-drawer) {
		--om-white: #ffffff;
		--om-gray-100: #f7f6f9;
		--om-gray-300: #ecebef;
		--om-gray-400: #cfcdd6;
		--om-gray-600: #5e5a72;
		--om-gray-700: #464257;
		--om-gray-850: #272532;
		--om-teal-100: #ddeef3;
		--om-teal-600: #388ca8;
		--om-teal-700: #2a697e;
		--om-radius-s: 6px;
		--om-radius-m: 8px;
		--om-space-s: 8px;
		--om-space-m: 12px;
		--om-space-l: 16px;
		--panel-surface: color-mix(in srgb, var(--om-white) 85%, transparent);
		--panel-shadow: 0 10px 28px rgb(46 43 59 / 0.08);
		--screen-inset: 24px;
		--top-search-left: 49.5vw;
		--top-search-width: clamp(520px, 42vw, 720px);
		--results-drawer-top: 84px;
		--results-drawer-bottom: 28px;
		--results-drawer-left-edge: calc(var(--top-search-left) - (var(--top-search-width) / 2));
		top: var(--results-drawer-top) !important;
		right: var(--screen-inset) !important;
		bottom: var(--results-drawer-bottom) !important;
		left: auto !important;
		width: calc(100vw - var(--results-drawer-left-edge) - var(--screen-inset)) !important;
		max-width: none !important;
		height: calc(100vh - var(--results-drawer-top) - var(--results-drawer-bottom)) !important;
		max-height: none !important;
		min-height: 0;
		overflow: visible;
		border: 0 !important;
		border-radius: var(--om-radius-m) 0 0 var(--om-radius-m);
		background: var(--panel-surface);
		box-shadow: var(--panel-shadow);
		font-family: 'Inter', system-ui, sans-serif;
		animation: none !important;
		transition: none !important;
		transform: none !important;
	}

	:global(.map-results-drawer.expanded) {
		--results-drawer-bottom: 28px;
		top: var(--results-drawer-top) !important;
		right: var(--screen-inset) !important;
		bottom: var(--results-drawer-bottom) !important;
		left: auto !important;
		width: calc(100vw - var(--results-drawer-left-edge) - var(--screen-inset)) !important;
		height: calc(100vh - var(--results-drawer-top) - var(--results-drawer-bottom)) !important;
		min-height: 0;
	}

	.drawer-copy-ears {
		position: absolute;
		z-index: 3;
		top: -30px;
		right: 10px;
		display: flex;
		gap: 4px;
		align-items: flex-end;
	}

	.drawer-copy-ears button {
		display: inline-flex;
		height: 30px;
		align-items: center;
		justify-content: center;
		gap: 6px;
		border: 0;
		border-radius: var(--om-radius-s) var(--om-radius-s) 0 0;
		background: color-mix(in srgb, var(--om-white) 88%, transparent);
		box-shadow: 0 -4px 14px rgb(46 43 59 / 0.06);
		padding: 0 11px;
		font-family: 'Inter', system-ui, sans-serif;
		font-size: 12px;
		font-weight: 800;
		line-height: 1;
		color: var(--om-gray-700);
		cursor: pointer;
	}

	.drawer-copy-ears button:hover {
		background: color-mix(in srgb, var(--om-teal-100) 64%, var(--om-white));
		color: var(--om-teal-700);
	}

	.drawer-copy-ears button.active {
		background: var(--om-gray-850);
		color: var(--om-white);
	}

	.drawer-copy-ears button strong {
		display: grid;
		min-width: 18px;
		height: 18px;
		place-items: center;
		border-radius: 999px;
		background: currentColor;
		padding: 0 5px;
		font-size: 10px;
		line-height: 1;
		color: var(--panel-surface);
	}

	.map-results-body {
		display: flex;
		min-height: 0;
		flex: 1;
		overflow: hidden;
		border-radius: inherit;
		padding: 0;
	}

	/* vaul applies user-select: none on the drawer; allow copying table values */
	:global(.map-results-drawer .map-results-body),
	:global(.map-results-drawer .map-results-body *) {
		user-select: text !important;
		-webkit-user-select: text !important;
	}

	:global(.map-results-drawer .map-results-body button),
	:global(.map-results-drawer .map-results-body summary) {
		user-select: none !important;
		-webkit-user-select: none !important;
	}

	.map-results-body > :global(.card-surface) {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		border: 0;
		background: transparent;
		box-shadow: none;
		padding: 0;
	}

	.map-results-body :global(.variant-detail-tables) {
		display: flex;
		min-height: 0;
		min-width: 0;
		flex: 1;
		flex-direction: column;
		overflow: hidden;
		width: 100%;
	}

	.map-results-body :global(.variant-detail-tabs) {
		display: flex;
		flex-shrink: 0;
		gap: 0;
		overflow-x: auto;
		border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
		background: color-mix(in srgb, var(--om-gray-100) 60%, transparent);
	}

	.map-results-body :global(.variant-detail-tabs button) {
		flex-shrink: 0;
		border: 0;
		border-bottom: 2px solid transparent;
		background: transparent;
		padding: 10px 14px;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--muted-foreground);
		cursor: pointer;
		white-space: nowrap;
	}

	.map-results-body :global(.variant-detail-tabs button:hover) {
		color: var(--foreground);
	}

	.map-results-body :global(.variant-detail-tabs button.active),
	.map-results-body :global(.variant-detail-tabs button[aria-selected='true']) {
		color: var(--foreground);
		border-bottom-color: var(--primary);
	}

	.map-results-body :global(.variant-detail-tab-panels) {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		overflow: hidden;
	}

	.map-results-body :global(.variant-detail-tab-panels > .card-surface) {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		overflow: auto;
		border: 0;
		background: transparent;
		box-shadow: none;
		margin-bottom: 0 !important;
	}

	.variant-route-error {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: 0.75rem;
		padding: 1.5rem;
		color: var(--muted-foreground);
	}

	.variant-route-error button {
		border: 1px solid var(--border);
		border-radius: 0.375rem;
		padding: 0.375rem 0.75rem;
		font-size: 0.875rem;
	}

	.variant-route-error button:hover {
		background: var(--muted);
	}

	.map-results-body > :global(.card-surface > .mb-3) {
		order: 2;
		flex-shrink: 0;
		margin: 0 !important;
		padding: 10px var(--om-space-m);
	}

	.map-results-body > :global(.card-surface > .mb-3 button:not(:disabled)) {
		cursor: pointer;
	}

	.map-results-body :global(.variant-results-shell) {
		order: 1;
		min-height: 0;
		flex: 1;
		overflow: auto;
		border-radius: 0;
		background: transparent;
	}

	.map-results-body :global(.variant-results-shell > .overflow-x-auto) {
		min-height: 100%;
	}

	.map-results-body :global(.variant-results-shell thead) {
		position: sticky;
		z-index: 1;
		top: 0;
		background: color-mix(in srgb, var(--om-gray-100) 72%, transparent) !important;
	}

	.country-panel {
		left: var(--screen-inset);
		right: auto;
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

	.country-list button:hover {
		background: color-mix(in srgb, var(--om-teal-100) 42%, transparent);
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

	.explore-datasets-panel {
		top: 370px;
		right: auto;
		bottom: var(--bottom-inset);
		left: var(--screen-inset);
		height: auto;
		max-height: none;
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
		background: transparent;
		padding: var(--om-space-s);
		text-align: left;
		cursor: pointer;
		font-family: 'Inter', system-ui, sans-serif;
	}

	.database-row:hover,
	.database-row.active {
		background: color-mix(in srgb, var(--om-teal-100) 42%, transparent);
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
		background: transparent;
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
		background: color-mix(in srgb, var(--om-teal-100) 42%, transparent);
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

		.variant-mix,
		.explore-stat-row {
			display: none;
		}

		.route-overlay.with-left-panels {
			left: var(--screen-inset);
		}

		:global(.map-results-drawer) {
			right: var(--screen-inset) !important;
			left: auto !important;
			top: var(--results-drawer-top) !important;
			bottom: 28px !important;
			width: min(760px, calc(100vw - var(--screen-inset) - var(--screen-inset))) !important;
			height: calc(100vh - var(--results-drawer-top) - 28px) !important;
			min-height: 0;
		}

		:global(.map-results-drawer.expanded) {
			right: var(--screen-inset) !important;
			left: auto !important;
			top: var(--results-drawer-top) !important;
			bottom: 28px !important;
			width: calc(100vw - var(--screen-inset) - var(--screen-inset)) !important;
			height: calc(100vh - var(--results-drawer-top) - 28px) !important;
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

		.route-overlay {
			top: var(--screen-inset);
			left: var(--screen-inset);
			right: var(--screen-inset);
			bottom: var(--screen-inset);
			padding: 18px;
		}

		.country-panel {
			left: var(--screen-inset);
			right: var(--screen-inset);
			bottom: var(--bottom-inset);
			width: auto;
		}

		:global(.map-results-drawer) {
			--screen-inset: 12px;
			right: var(--screen-inset) !important;
			left: var(--screen-inset) !important;
			top: var(--screen-inset) !important;
			bottom: 20px !important;
			width: auto !important;
			height: calc(100vh - var(--screen-inset) - 20px) !important;
			border-radius: var(--om-radius-m);
		}

		:global(.map-results-drawer.expanded) {
			left: 0 !important;
			right: 0 !important;
			top: 0 !important;
			bottom: 0 !important;
			width: auto !important;
			height: 100vh !important;
			border-radius: 0;
		}

		.drawer-copy-ears {
			top: 8px;
			right: 8px;
		}
	}
</style>
