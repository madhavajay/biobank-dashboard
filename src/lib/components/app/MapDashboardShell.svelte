<script lang="ts">
	import { onDestroy, onMount, setContext, untrack } from 'svelte'
	import { page } from '$app/state'
	import type { Action } from 'svelte/action'
	import type {
		ExpressionSpecification,
		GeoJSONSource,
		Map as MapboxMap,
		MapMouseEvent,
		Popup,
		StyleSpecification,
	} from 'mapbox-gl'
	import type { FeatureCollection, Point } from 'geojson'
	import 'mapbox-gl/dist/mapbox-gl.css'
	import { key, mapboxgl } from '$lib/mapboxgl'
	import { TENANTS, mapboxBounds, mapboxCenter, mapboxZoom, portalMapFit, tenantPortalUrl, VARIANT_CLASS_COLORS } from '$lib/tenants'
	import { biobankSlugForDatasetSlug, cohortIdsForDatasetSlug } from '$lib/datasets'
	import { BRAZIL_STATES } from '$lib/data/brazil-states'
	import brazilStatesUrl from '$lib/data/brazil-states.geojson?url'
	import { lang } from '$lib/i18n'
	import { isIncompleteVariantSearchQuery, normalizeVariantSearchInput } from '$lib/search/variant-search'
	import VariantDetailPage from '$lib/components/app/VariantDetailPage.svelte'
	import type { PageServerData as VariantPageData } from '../../../routes/explore/variant/[id]/$types'
	import { afterNavigate, goto, replaceState } from '$app/navigation'
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link'

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
		cohortIds?: number[]
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

	const MAP_BUBBLE_LAYERS = ['collection-country-bubbles', 'collection-country-labels'] as const
	const MAP_ZONE_LAYERS = ['region-zone-fill'] as const
	const MAP_ZONE_QUERY_LAYERS = ['region-zone-fill', 'region-zone-highlight'] as const
	const ZONE_HOVER_CLEAR_MS = 48
	const ZONE_HIT_PAD_PX = 4
	const CARIBBEAN_CODES = new Set(['BS', 'BB', 'BM', 'VG', 'LC', 'TT'])

	type CountryRow = {
		code: string
		name: string
		samples: number
		variants: number
		center: [number, number]
		sources: string[]
		countryCode?: string
	}

	type MapBubbleRow = CountryRow

	type CollectionCountryProperties = {
		code: string
		name: string
		samples: number
		label: string
		sources: string
		sourceCount: number
		primarySourceSlug: string
		countryCode?: string
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
	const WORLD_MAP_BOUNDS: [[number, number], [number, number]] = [
		[-180, -85],
		[180, 85],
	]
	const DEFAULT_MAP_CENTER: [number, number] = [0, 22]
	const DEFAULT_MAP_ZOOM = 2
	const RESULTS_DRAWER_TOP = 84
	const COUNTRY_PANEL_MAX_HEIGHT = 430
	const SCREEN_INSET = 24
	const TOP_SEARCH_LEFT_RATIO = 0.495
	const TOP_SEARCH_WIDTH_RATIO = 0.52
	const TOP_SEARCH_MIN_WIDTH = 560
	const TOP_SEARCH_MAX_WIDTH = 920
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

	const data = $derived(page.data)
	const tenant = $derived(data.tenant)
	const tenantScope = $derived(tenant.scope)
	const portalCountryCodes = $derived(tenant.mapProfile?.countryCodes ?? null)
	const defaultMapCenter = $derived(tenantScope ? mapboxCenter(tenant) : DEFAULT_MAP_CENTER)
	const defaultMapZoom = $derived(tenantScope ? mapboxZoom(tenant) : DEFAULT_MAP_ZOOM)
	const portalMapBounds = $derived(mapboxBounds(tenant))
	const portalMinZoom = $derived(tenant.mapProfile?.minZoom ?? 2)
	const isMapPage = $derived(page.url.pathname === '/')
	const isExplorePage = $derived(page.url.pathname === '/explore')
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
	let hoverCountryCode = $state<string | null>(null)
	let countryPopupPinned = false
	let hoverDismissTimer: ReturnType<typeof setTimeout> | undefined
	let countryPopupPointerInside = false
	const HOVER_COUNTRY_DISMISS_MS = 550
	let selectedCountryPopup: Popup | undefined
	let selectedCountryPopupCode: string | null = null
	let suppressSelectedCountryPopupClose = false
	let ignoreNextMapBackgroundClick = false
	let zoneHighlightKey = ''
	let zoneHoverClearTimer: ReturnType<typeof setTimeout> | undefined
	let selectedCode = $state<string | null>(null)
	let selectedDatasetSlug = $state<string | null>(null)
	let selectedDatasetInferredFromSource = $state(false)
	let selectedSourceSlug = $state<string | null>(null)
	let searchQuery = $state('')
	let appliedSearchQuery = $state('')
	let countryPickerOpen = $state(false)
	let datasetPickerOpen = $state(false)
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
	let lastHydratedPathname = $state('')
	let resultsDrawerOpen = $state(false)
	let exploreDrawerDismissed = $state(false)
	let resultsTableQueryString = $state('')
	let liveExploreStats = $state<{
		variants: number
		common: number
		lowFreq: number
		rare: number
	} | null>(null)
	let liveExploreStatsKey = $state('')
	let liveExploreStatsSeq = 0
	let lastExploreQueryString = ''
	let curlCopied = $state(false)
	let shareCopied = $state(false)
	let routerReady = $state(false)
	let pendingResultsUrlOpen: boolean | null = null
	let lastDefaultCameraResetKey = ''
	let mapStyleLoaded = $state(false)

	const portalHomeMapView = $derived(
		isMapPage &&
			tenantScope &&
			!selectedCode &&
			!hasExploreQueryContextFromParams(page.url.searchParams)
	)

	onMount(() => {
		routerReady = true
		lastHydratedPathname = page.url.pathname
		if (pendingResultsUrlOpen !== null) {
			syncResultsUrl(pendingResultsUrlOpen)
			pendingResultsUrlOpen = null
		}

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && resultsDrawerOpen && !isVariantRoute) {
				event.preventDefault()
				closeResultsDrawer()
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	})

	const closeCountryPickerOnOutsideClick: Action<HTMLElement> = (node) => {
		const onPointerDown = (event: PointerEvent) => {
			if (!countryPickerOpen) return
			const target = event.target
			if (target instanceof Node && node.contains(target)) return
			countryPickerOpen = false
		}
		document.addEventListener('pointerdown', onPointerDown, true)
		return {
			destroy() {
				document.removeEventListener('pointerdown', onPointerDown, true)
			},
		}
	}

	setContext(key, {
		getMap: () => map,
	})

	const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString()
	const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '0%')
	const tx = (en: string, pt: string) => ($lang === 'pt' ? pt : en)
	function countryFlagEmoji(code: string) {
		const normalized = code.trim().toUpperCase()
		if (normalized.length !== 2 || !/^[A-Z]{2}$/.test(normalized)) return '🌐'
		return String.fromCodePoint(
			...([...normalized].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65))
		)
	}
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

	function drawerOpenFromUrl(sp: URLSearchParams) {
		void sp
		return false
	}

	let selfUrlSync = false

	function applyTenantScopeDefaults() {
		const scope = tenantScope
		if (!scope || hasExploreQueryContextFromParams(page.url.searchParams)) return
		if (!filterBiobankOptions.some((bank) => bank.slug === scope)) return

		selectedSourceSlug = scope
		filterBiobanks = Object.fromEntries(
			filterBiobankOptions.map((bank) => [bank.slug, bank.slug === scope])
		)
		filterMatchMode = 'any'

		const scopedDatasets = displayDatasets.filter((dataset) => dataset.biobankSlug === scope)
		if (scopedDatasets.length === 1) {
			selectedDatasetSlug = scopedDatasets[0].slug ?? null
			selectedDatasetInferredFromSource = Boolean(selectedDatasetSlug)
		}
	}

	function hydrateExploreFiltersFromUrl(
		sp: URLSearchParams,
		{
			syncSearch = true,
			clearSearch = false,
			syncMapSelection = true,
		}: { syncSearch?: boolean; clearSearch?: boolean; syncMapSelection?: boolean } = {}
	) {
		const urlBanks = (sp.get('source') ?? sp.get('biobanks') ?? '').split(',').filter(Boolean)
		const urlCohorts = new Set(
			(sp.get('cohorts') ?? '')
				.split(',')
				.filter(Boolean)
				.map(Number)
				.filter((cohortId) => cohortId > 0)
		)
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
			selectedCode = null
			const datasetParam = sp.get('dataset')
			const sourceParam = (sp.get('source') ?? sp.get('biobanks') ?? '').split(',').filter(Boolean)
			selectedSourceSlug =
				sourceParam.length === 1 &&
				filterBiobankOptions.some((source) => source.slug === sourceParam[0])
					? sourceParam[0]
					: null
			const sourceDatasets =
				sourceParam.length === 1
					? displayDatasets.filter((dataset) => dataset.biobankSlug === sourceParam[0])
					: []
			if (datasetParam && displayDatasets.some((dataset) => dataset.slug === datasetParam)) {
				selectedDatasetSlug = datasetParam
				selectedDatasetInferredFromSource = false
			} else if (sourceDatasets.length === 1) {
				selectedDatasetSlug = sourceDatasets[0].slug ?? null
				selectedDatasetInferredFromSource = Boolean(selectedDatasetSlug)
			} else {
				selectedDatasetSlug = null
				selectedDatasetInferredFromSource = false
			}
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
		if (sp.get('results') === '0') exploreDrawerDismissed = true
		resultsDrawerOpen = drawerOpenFromUrl(sp)
	}

	function restoreExploreDrawerAfterVariantReturn() {
		if (page.url.searchParams.get('results') === '0') return
		exploreDrawerDismissed = false
		resultsDrawerOpen = true
	}

	$effect(() => {
		if (!filterBiobankOptions.length) return
		const pathname = page.url.pathname
		const path = pathname === '/explore' ? '/' : pathname
		if (path !== '/') {
			lastHydratedPathname = pathname
			return
		}

		const urlKey = exploreUrlKey(path, page.url.searchParams)
		const returnedFromVariant =
			lastHydratedPathname.startsWith('/explore/variant/') && path === '/'

		if (selfUrlSync) {
			selfUrlSync = false
			lastHydratedPathname = pathname
			return
		}
		const urlHasContext = hasExploreQueryContextFromParams(page.url.searchParams)

		if (urlKey === lastHydratedExploreUrl && !returnedFromVariant) {
			lastHydratedPathname = pathname
			return
		}

		const lastHydratedParams = new URLSearchParams(lastHydratedExploreUrl.split('?')[1] ?? '')
		const lastHydratedHasContext = hasExploreQueryContextFromParams(lastHydratedParams)

		if (urlHasContext && lastHydratedExploreUrl && !lastHydratedHasContext) {
			const stateParams = buildExploreParams()
			if (!hasExploreQueryContextFromParams(stateParams)) {
				untrack(() => syncResultsUrl(resultsDrawerOpen, true))
				lastHydratedPathname = pathname
				return
			}
		}

		const prevPath = lastHydratedExploreUrl ? lastHydratedExploreUrl.split('?')[0] : ''
		const forceFullHydrate = !lastHydratedExploreUrl
		const pathChanged = Boolean(lastHydratedExploreUrl) && prevPath !== path
		if (returnedFromVariant) {
			restoreExploreDrawerAfterVariantReturn()
		}
		hydrateExploreFiltersFromUrl(page.url.searchParams, {
			syncSearch: forceFullHydrate || pathChanged || returnedFromVariant,
			clearSearch: forceFullHydrate || pathChanged,
			syncMapSelection: true,
		})
		if (forceFullHydrate && tenantScope && !hasExploreQueryContextFromParams(page.url.searchParams)) {
			applyTenantScopeDefaults()
		}
		lastHydratedExploreUrl = urlKey
		lastHydratedPathname = pathname
		filterStateHydrated = true
		resultsDrawerOpen = drawerOpenFromUrl(page.url.searchParams)
	})

	afterNavigate(({ from, to }) => {
		if (!to) return
		const toPath = to.url.pathname === '/explore' ? '/' : to.url.pathname
		if (toPath !== '/') return
		if (!from?.url.pathname.startsWith('/explore/variant/')) return

		restoreExploreDrawerAfterVariantReturn()
		const sp = to.url.searchParams
		if (hasExploreQueryContextFromParams(sp)) {
			hydrateExploreFiltersFromUrl(sp, {
				syncSearch: true,
				clearSearch: false,
				syncMapSelection: true,
			})
			lastHydratedExploreUrl = exploreUrlKey(toPath, sp)
			filterStateHydrated = true
		}
		resultsDrawerOpen = drawerOpenFromUrl(sp)
		lastHydratedPathname = to.url.pathname
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
		}
		const directCountryCodes = new Set(
			(dashboard.populations as Population[])
				.filter((p) => p.countryCode && p.countryCode !== 'XK')
				.map((p) => p.countryCode)
		)
		for (const p of dashboard.populations as Population[]) {
			for (const m of p.countryMappings ?? []) {
				// Countries with a direct biobank population (e.g. PGP → US) should not
				// also roll up 1KGP diaspora mapping samples into the same bubble.
				if (directCountryCodes.has(m.countryCode)) continue
				const center = COUNTRY_CENTERS[m.countryCode]
				if (center) upsert(m.countryCode, m.country, m.sampleCount, p.variantCount, center, p.name)
			}
		}
		return [...byCode.values()]
			.filter((row) => !portalCountryCodes?.length || portalCountryCodes.includes(row.code))
			.sort((a, b) => a.name.localeCompare(b.name))
	})

	const useZoneMap = $derived(tenant.mapProfile?.regionMode === 'zones')
	const zoneCodeProperty = $derived(tenant.mapProfile?.zoneCodeProperty ?? 'code')

	const mapBubbleRows = $derived.by<MapBubbleRow[]>(() => {
		if (!useZoneMap) return countryRows
		const brazil = countryRows.find((row) => row.code === 'BR')
		if (!brazil) return countryRows
		return BRAZIL_STATES.map((state) => ({
			code: state.code,
			name: state.name,
			countryCode: 'BR',
			samples: brazil.samples,
			variants: brazil.variants,
			center: state.center,
			sources: [...brazil.sources],
		}))
	})

	function mapInteractiveLayers() {
		return useZoneMap ? [...MAP_ZONE_LAYERS] : [...MAP_BUBBLE_LAYERS]
	}

	const EMPTY_ZONE_FILTER: ExpressionSpecification = ['==', ['get', 'sigla'], '__none__']

	function zoneCodeFromProperties(properties: Record<string, unknown> | null | undefined) {
		if (!properties) return null
		if (typeof properties.sigla === 'string') return properties.sigla
		const fallback = properties[zoneCodeProperty]
		return typeof fallback === 'string' ? fallback : null
	}

	function zoneCodeAtPoint(point: mapboxgl.PointLike) {
		if (!map) return null
		const x = typeof point === 'object' && point !== null && 'x' in point ? point.x : point[0]
		const y = typeof point === 'object' && point !== null && 'y' in point ? point.y : point[1]
		const hits = map.queryRenderedFeatures(
			[
				[x - ZONE_HIT_PAD_PX, y - ZONE_HIT_PAD_PX],
				[x + ZONE_HIT_PAD_PX, y + ZONE_HIT_PAD_PX],
			],
			{ layers: [...MAP_ZONE_QUERY_LAYERS] }
		)
		for (const feature of hits) {
			const code = zoneCodeFromProperties(feature.properties as Record<string, unknown> | undefined)
			if (code) return code
		}
		return null
	}

	function cancelZoneHoverClear() {
		if (zoneHoverClearTimer) {
			clearTimeout(zoneHoverClearTimer)
			zoneHoverClearTimer = undefined
		}
	}

	function scheduleZoneHoverClear() {
		cancelZoneHoverClear()
		zoneHoverClearTimer = setTimeout(() => {
			zoneHoverClearTimer = undefined
			if (selectedCountry) return
			hoverCountryCode = null
			zoneHighlightKey = ''
			updateZoneHighlight()
			scheduleHoverCountryDismiss()
		}, ZONE_HOVER_CLEAR_MS)
	}

	function handleZonePointerMove(event: MapMouseEvent) {
		if (!map || !useZoneMap) return
		const code = zoneCodeAtPoint(event.point)
		if (code) {
			cancelZoneHoverClear()
			map.getCanvas().style.cursor = 'pointer'
			if (selectedCountry?.code === code) return
			if (hoverCountryCode === code) return
			cancelHoverCountryDismiss()
			countryPopupPointerInside = false
			hoverCountryCode = code
			zoneHighlightKey = ''
			updateZoneHighlight()
			return
		}
		map.getCanvas().style.cursor = ''
		if (selectedCountry || !hoverCountryCode) return
		scheduleZoneHoverClear()
	}

	function resolveZoneHighlight(): {
		code: string | null
		mode: 'hover' | 'selected' | null
	} {
		if (hoverCountryCode && hoverCountryCode !== selectedCode) {
			return { code: hoverCountryCode, mode: 'hover' }
		}
		if (selectedCode) {
			return { code: selectedCode, mode: 'selected' }
		}
		return { code: null, mode: null }
	}

	function updateZoneHighlight() {
		if (!map?.isStyleLoaded() || !useZoneMap || !map.getLayer('region-zone-highlight')) return

		const { code, mode } = resolveZoneHighlight()
		const nextKey = `${code ?? ''}:${mode ?? ''}`
		if (zoneHighlightKey === nextKey) return
		zoneHighlightKey = nextKey

		const filter = code
			? (['==', ['get', 'sigla'], code] as ExpressionSpecification)
			: EMPTY_ZONE_FILTER

		map.setFilter('region-zone-highlight', filter)
		map.setFilter('region-zone-highlight-outline', filter)

		if (code) {
			map.setPaintProperty(
				'region-zone-highlight',
				'fill-color',
				mode === 'selected' ? '#1a9e88' : '#2eccaa'
			)
			map.setPaintProperty(
				'region-zone-highlight',
				'fill-opacity',
				mode === 'selected' ? 0.78 : 0.72
			)
			map.setPaintProperty('region-zone-fill', 'fill-opacity', [
				'case',
				['==', ['get', 'sigla'], code],
				0.28,
				0.12,
			])
		} else {
			map.setPaintProperty(
				'region-zone-fill',
				'fill-opacity',
				0.32 as unknown as ExpressionSpecification
			)
		}
	}

	function mapRowCountryCode(row: MapBubbleRow) {
		return row.countryCode ?? row.code
	}

	const tenantFor = (slug?: string) => TENANTS.find((tenant) => tenant.slug === slug)

	function portalUrlFor(biobankSlug?: string | null) {
		if (!biobankSlug) return null
		return tenantPortalUrl(biobankSlug, {
			hostname: page.url.hostname,
			port: page.url.port,
			protocol: page.url.protocol,
		})
	}

	function isCurrentBiobankPortal(biobankSlug?: string | null) {
		return Boolean(biobankSlug && tenantScope === biobankSlug)
	}

	function databaseRowHref(dataset: DisplayDataset) {
		if (isCurrentBiobankPortal(dataset.biobankSlug)) {
			return `/datasets/${dataset.slug}`
		}
		return portalUrlFor(dataset.biobankSlug) ?? (dataset.biobankSlug ? `/sources/${dataset.biobankSlug}` : `/datasets/${dataset.slug}`)
	}

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
					cohortIds: cohortIdsForDatasetSlug(slug),
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

	function cohortIdsForDataset(dataset?: DisplayDataset | null) {
		if (!dataset?.slug) return []
		return dataset.cohortIds?.length ? dataset.cohortIds : cohortIdsForDatasetSlug(dataset.slug)
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
		selectedCode ? (mapBubbleRows.find((country) => country.code === selectedCode) ?? null) : null
	)
	const selectedCountryCohortIds = $derived(
		selectedCode ? cohortIdsForCountryCode(selectedCode) : []
	)
	const selectedDataset = $derived(
		selectedDatasetSlug
			? (displayDatasets.find((dataset) => dataset.slug === selectedDatasetSlug) ?? null)
			: null
	)
	const selectedSourceDatasets = $derived(
		selectedSourceSlug
			? displayDatasets.filter((dataset) => dataset.biobankSlug === selectedSourceSlug)
			: []
	)
	const selectedSource = $derived(
		selectedSourceSlug
			? ((dashboard.biobanks as Array<{ slug?: string; name: string; description?: string }>)
					.find((source) => source.slug === selectedSourceSlug) ?? null)
			: null
	)
	const selectedSourceParticipants = $derived(
		selectedSourceDatasets.reduce((sum, dataset) => sum + (dataset.participants ?? 0), 0)
	)
	const selectedSourceVariants = $derived(
		selectedSourceDatasets.reduce((sum, dataset) => sum + (dataset.variants ?? 0), 0)
	)
	const selectedCountryDatasets = $derived(
		selectedCountry ? datasetsForCountry(selectedCountry) : []
	)
	const selectedCountrySources = $derived(
		selectedCountry ? countrySourceBanks(selectedCountry) : []
	)
	const selectedCountryVariantTotal = $derived.by(() => {
		if (!selectedCountryDatasets.length) return selectedCountry?.variants ?? 0
		return Math.max(...selectedCountryDatasets.map((dataset) => dataset.variants ?? 0))
	})
	const selectedCountrySourceProfileHref = $derived(
		selectedCountrySources.length === 1 && selectedCountrySources[0].slug
			? `/sources/${selectedCountrySources[0].slug}`
			: '/sources'
	)
	const showExploreLeftPanels = $derived(
		false
	)
	const showMapVariantPanel = $derived(isMapPage && !isVariantRoute && !resultsDrawerOpen)
	const showMapSummaryPanels = $derived(isMapPage && !isVariantRoute && !resultsDrawerOpen)
	const showVariantLeftPanels = $derived(!!variantDetailData)
	const scopedCountryRows = $derived.by(() => {
		if (!selectedDataset) return countryRows
		const codes = new Set(countryCodesForDataset(selectedDataset))
		return countryRows.filter((country) => codes.has(country.code))
	})
	const highlightCountryCodes = $derived.by(() => {
		if (selectedCountry) return [mapRowCountryCode(selectedCountry)]
		if (selectedDataset) {
			return countryCodesForDataset(selectedDataset).filter((code) =>
				countryRows.some((country) => country.code === code)
			)
		}
		return countryRows.map((country) => country.code)
	})
	const bubbleFocusCodes = $derived.by(() => {
		if (useZoneMap) return []
		if (selectedCountry) return [selectedCountry.code]
		if (selectedDataset) return countryCodesForDataset(selectedDataset)
		return mapBubbleRows.map((country) => country.code)
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
	const mapPanelCountryCount = $derived(
		selectedCountry ? 1 : mapBubbleRows.length
	)
	const mapPanelParticipantCount = $derived(
		selectedCountry?.samples ?? dashboard.totals.participants
	)
	const variantMixTotal = $derived.by(() => {
		const { common, lowFreq, rare } = dashboard.variantClasses
		const classTotal = common + lowFreq + rare
		if (classTotal) return classTotal
		return selectedCountry?.variants ?? dashboard.totals.variants
	})
	const variantClassRows = $derived([
		{
			key: 'common',
			label: tx('Common', 'Comuns'),
			count: dashboard.variantClasses.common,
			color: VARIANT_CLASS_COLORS.common,
		},
		{
			key: 'lowFreq',
			label: tx('Low-freq', 'Baixa freq.'),
			count: dashboard.variantClasses.lowFreq,
			color: VARIANT_CLASS_COLORS.lowFreq,
		},
		{
			key: 'rare',
			label: tx('Rare', 'Raras'),
			count: dashboard.variantClasses.rare,
			color: VARIANT_CLASS_COLORS.rare,
		},
	])
	const explorePanelScopePopulations = $derived.by(() => {
		const allPops = (dashboard.populations as Population[]).filter(
			(population) => population.countryCode && population.countryCode !== 'XK'
		)
		const hasPopulationFilter =
			filterPopulationOptions.length > 1 &&
			selectedFilterCohortIds.length < activeFilterPopulations.length
		const hasBiobankFilter =
			filterBiobankOptions.length > 1 &&
			selectedFilterBiobankSlugs.length < filterBiobankOptions.length
		if (!hasPopulationFilter && !hasBiobankFilter) return allPops
		const cohortSet = new Set(selectedFilterCohortIds)
		return allPops.filter(
			(population) =>
				typeof population.cohortId === 'number' && cohortSet.has(population.cohortId)
		)
	})
	const explorePanelCountryCount = $derived(
		new Set(explorePanelScopePopulations.map((population) => population.countryCode)).size
	)
	const explorePanelParticipantCount = $derived(
		explorePanelScopePopulations.reduce((sum, population) => sum + (population.sampleCount ?? 0), 0)
	)
	const explorePanelVariantStats = $derived.by(() => {
		if (liveExploreStats && (liveExploreStatsKey === exploreQueryString || resultsDrawerOpen)) {
			return liveExploreStats
		}
		return {
			variants: dashboard.totals.variants,
			common: dashboard.variantClasses.common,
			lowFreq: dashboard.variantClasses.lowFreq,
			rare: dashboard.variantClasses.rare,
		}
	})
	const explorePanelVariantTotal = $derived(explorePanelVariantStats.variants)
	const explorePanelVariantClassRows = $derived([
		{
			key: 'common',
			label: tx('Common', 'Comuns'),
			count: explorePanelVariantStats.common,
			color: VARIANT_CLASS_COLORS.common,
		},
		{
			key: 'lowFreq',
			label: tx('Low-freq', 'Baixa freq.'),
			count: explorePanelVariantStats.lowFreq,
			color: VARIANT_CLASS_COLORS.lowFreq,
		},
		{
			key: 'rare',
			label: tx('Rare', 'Raras'),
			count: explorePanelVariantStats.rare,
			color: VARIANT_CLASS_COLORS.rare,
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
		'match',
		['get', 'primarySourceSlug'],
		'bipmed',
		'#53bea9',
		'pgp-harvard',
		'#f79763',
		'carigenetics',
		'#f2d98c',
		'1kgp',
		'#bea9c1',
		'multi',
		'#d5c7d6',
		'#53bea9',
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
	const collectionGeoJson = $derived(collectionGeoJsonFor())

	function collectionGeoJsonFor(): FeatureCollection<Point, CollectionCountryProperties> {
		if (useZoneMap) {
			return { type: 'FeatureCollection', features: [] }
		}
		return {
			type: 'FeatureCollection',
			features: mapBubbleRows.map((country) => {
				const sourceBanks = countrySourceBanks(country)
				const sourceCount = sourceBanks.length || country.sources.length
				const primarySourceSlug =
					sourceCount === 1 ? (sourceBanks[0]?.slug ?? country.sources[0] ?? '') : 'multi'
				return {
					type: 'Feature',
					properties: {
						code: country.code,
						name: country.name,
						countryCode: country.countryCode,
						samples: country.samples,
						label: fmt(country.samples),
						sources: sourceBanks.length
							? sourceBanks.map((source) => source.name).join(' + ')
							: country.sources.join(' + '),
						sourceCount,
						primarySourceSlug,
					},
					geometry: {
						type: 'Point',
						coordinates: country.center,
					},
				}
			}),
		}
	}

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

	function isIncompleteLocationQuery(query: string) {
		const trimmed = query.trim()
		if (!trimmed) return false
		const q = normalizeSearch(trimmed)

		const countryMatch = findMapSearchMatch(trimmed)
		if (countryMatch) {
			const name = normalizeSearch(countryMatch.name)
			const code = normalizeSearch(countryMatch.code)
			if (name !== q && name.startsWith(q)) return true
			if (code !== q && code.startsWith(q)) return true
			if (!isMapLocationQuery(trimmed, countryMatch)) {
				const sources = countryMatch.sources.map(normalizeSearch)
				if (sources.some((source) => source !== q && source.startsWith(q))) return true
			}
		}

		return directPopulations.some((population) => {
			const name = normalizeSearch(population.name)
			return name !== q && name.startsWith(q)
		})
	}

	function shouldRunVariantLiveSearch(query: string) {
		const trimmed = query.trim()
		if (!trimmed) return false
		if (isIncompleteVariantSearchQuery(trimmed)) return false
		if (isIncompleteLocationQuery(trimmed)) return false
		const countryMatch = findMapSearchMatch(trimmed)
		if (countryMatch && isMapLocationQuery(trimmed, countryMatch)) return false
		if (findPopulationSearchMatch(trimmed)) return false
		return true
	}

	function handleSearchSubmit(event: SubmitEvent) {
		event.preventDefault()
		const trimmed = searchQuery.trim()
		const countryMatch = trimmed ? findMapSearchMatch(trimmed) : undefined
		if (countryMatch && isMapLocationQuery(trimmed, countryMatch)) {
			selectedCode = countryMatch.code
			searchQuery = ''
			appliedSearchQuery = ''
			goToExploreFromLocalState()
			return
		}
		const populationMatch = trimmed ? findPopulationSearchMatch(trimmed) : undefined
		if (populationMatch) {
			appliedSearchQuery = ''
			const country = countryRows.find((row) => row.code === populationMatch.countryCode)
			if (country) {
				selectedCode = country.code
				searchQuery = ''
				goToExploreFromLocalState()
				return
			}
		}
		if (!trimmed && resultsDrawerOpen && !isVariantRoute) {
			appliedSearchQuery = ''
			openResultsDrawer(true)
			return
		}
		appliedSearchQuery = normalizeVariantSearchInput(trimmed)
		goToExploreFromLocalState()
	}

	const SEARCH_QUERY_DEBOUNCE_MS = 300

	function applyLiveSearchQuery(raw: string) {
		return normalizeVariantSearchInput(raw.trim())
	}

	$effect(() => {
		const query = searchQuery
		if (!filterStateHydrated || !isExplorePage || isVariantRoute) return

		const trimmed = query.trim()
		const variantSearch = shouldRunVariantLiveSearch(query)

		const timer = window.setTimeout(() => {
			const normalized = applyLiveSearchQuery(query)
			if (normalized === appliedSearchQuery.trim()) return

			if (!trimmed) {
				appliedSearchQuery = ''
				resultsTableQueryString = ''
				return
			}

			if (!variantSearch) return

			releaseMapScopeForVariantExplore()
			appliedSearchQuery = normalized
			openResultsDrawer(true)
		}, SEARCH_QUERY_DEBOUNCE_MS)

		return () => window.clearTimeout(timer)
	})

	function pickCountry(country: CountryRow) {
		countryPickerOpen = false
		datasetPickerOpen = false
		selectedCode = country.code
	}

	function pickAllCountries() {
		countryPickerOpen = false
		datasetPickerOpen = false
		clearCountrySelection()
	}

	function pickDataset(dataset: DisplayDataset) {
		datasetPickerOpen = false
		countryPickerOpen = false
		const keepCountry =
			!!selectedCode && countryCodesForDataset(dataset).includes(selectedCode)
		selectDataset(dataset, { keepCountry })
	}

	function pickAllDatabases() {
		datasetPickerOpen = false
		countryPickerOpen = false
		if (!selectedDatasetSlug) return
		clearDatasetFromPicker()
	}

	function clearDatasetFromPicker() {
		datasetPickerOpen = false
		selectedDatasetSlug = null
		selectedDatasetInferredFromSource = false
		selectedSourceSlug = null
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
		untrack(() => syncResultsUrl(resultsDrawerOpen, true))
	}

	function resetMapFilters() {
		resetExploreQueriesAndFilters()
		syncExploreUrlAfterReset()
	}

	function clearUrlBackedMapState() {
		selectedCode = null
		selectedDatasetSlug = null
		selectedDatasetInferredFromSource = false
		selectedSourceSlug = null
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
		exploreDrawerDismissed = false
		resultsDrawerOpen = false
	}

	function buildExploreParams(options: { includeMapCountry?: boolean } = {}) {
		const params = new URLSearchParams()
		if (appliedSearchQuery) params.set('q', appliedSearchQuery)
		if (options.includeMapCountry && selectedCode) params.set('country', selectedCode)
		if (selectedDatasetSlug && !selectedDatasetInferredFromSource)
			params.set('dataset', selectedDatasetSlug)
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
			params.set('source', '__none__')
		} else if (
			filterBiobankOptions.length > 1 &&
			selectedFilterBiobankSlugs.length &&
			(filterMatchMode === 'all' || selectedFilterBiobankSlugs.length < filterBiobankOptions.length)
		) {
			params.set('source', selectedFilterBiobankSlugs.join(','))
			params.set('match', filterMatchMode)
		} else if (selectedDataset?.biobankSlug) {
			params.set('source', selectedDataset.biobankSlug)
		}
		const datasetScopeCohortIds = selectedDatasetInferredFromSource
			? []
			: cohortIdsForDataset(selectedDataset)
		const countryScopeCohortIds = options.includeMapCountry ? selectedCountryCohortIds : []
		let mapScopeCohortIds: number[] = []
		if (datasetScopeCohortIds.length && countryScopeCohortIds.length) {
			mapScopeCohortIds = datasetScopeCohortIds.filter((cohortId) =>
				countryScopeCohortIds.includes(cohortId)
			)
		} else if (datasetScopeCohortIds.length) {
			mapScopeCohortIds = datasetScopeCohortIds
		} else if (countryScopeCohortIds.length) {
			mapScopeCohortIds = countryScopeCohortIds
		}

		const effectiveCohortIds = mapScopeCohortIds.length
			? selectedFilterCohortIds.filter((cohortId) => mapScopeCohortIds.includes(cohortId))
			: options.includeMapCountry && selectedCountryCohortIds.length
				? selectedFilterCohortIds.filter((cohortId) => selectedCountryCohortIds.includes(cohortId))
				: selectedFilterCohortIds

		if (mapScopeCohortIds.length) {
			params.set('cohorts', mapScopeCohortIds.join(','))
		} else if (filterPopulationOptions.length > 1 && effectiveCohortIds.length === 0) {
			params.set('cohorts', '-1')
		} else if (
			filterPopulationOptions.length > 1 &&
			effectiveCohortIds.length &&
			((options.includeMapCountry && selectedCountryCohortIds.length) ||
				filterPopulationMatchMode === 'all' ||
				effectiveCohortIds.length < activeFilterPopulations.length)
		) {
			params.set('cohorts', effectiveCohortIds.join(','))
			if (!countryScopeCohortIds.length && filterPopulationMatchMode === 'all')
				params.set('cohortMatch', 'all')
		}
		if (data.forceTenant) params.set('tenant', data.forceTenant)
		return params
	}

	function urlExploreParams() {
		const params = hasActiveExploreContext()
			? buildExploreParams()
			: (() => {
					const empty = new URLSearchParams()
					if (data.forceTenant) empty.set('tenant', data.forceTenant)
					return empty
				})()
		if (exploreDrawerDismissed && hasActiveExploreContext()) {
			params.set('results', '0')
		}
		return params
	}

	function hasActiveExploreContext() {
		return hasExploreQueryContextFromParams(buildExploreParams())
	}

	const exploreQueryString = $derived(buildExploreParams({ includeMapCountry: true }).toString())
	const activeResultsQueryString = $derived(exploreQueryString)
	function mapRouteContextParams() {
		const params = buildExploreParams()
		if (hasExploreQueryContextFromParams(params)) return params

		const urlParams = new URLSearchParams()
		for (const key of [
			'source',
			'biobanks',
			'dataset',
			'country',
			'cohorts',
			'cohortMatch',
			'match',
			'q',
			'gene',
			'afMin',
			'afMax',
			'acMin',
			'acMax',
			'vepImpact',
			'vepConsequence',
		]) {
			const value = page.url.searchParams.get(key)
			if (value) urlParams.set(key === 'biobanks' ? 'source' : key, value)
		}
		if (data.forceTenant) urlParams.set('tenant', data.forceTenant)
		return urlParams
	}
	const mapResultsPath = $derived.by(() => {
		const params = mapRouteContextParams()
		return `/${params.toString() ? `?${params.toString()}` : ''}`
	})
	const explorerPath = $derived.by(() => {
		const params = mapRouteContextParams()
		return `/explore${params.toString() ? `?${params.toString()}` : ''}`
	})
	const mapResultsUrl = $derived(
		`${typeof location !== 'undefined' ? location.origin : ''}${explorerPath}`
	)
	const resultsDrawerKey = $derived.by(() => {
		const params = buildExploreParams()
		params.delete('q')
		return params.toString() || 'default'
	})
	const resultsContextTitle = $derived.by(() => {
		const parts = []
		if (selectedCountry) parts.push(selectedCountry.name)
		if (selectedDataset) parts.push(selectedDataset.title)
		if (filterGene.trim()) parts.push(filterGene.trim())
		const liveQuery = isExplorePage ? searchQuery.trim() || appliedSearchQuery : appliedSearchQuery
		if (liveQuery) parts.push(liveQuery)
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

	$effect(() => {
		if (!showExploreLeftPanels || !filterStateHydrated) {
			if (!showExploreLeftPanels) {
				liveExploreStats = null
				liveExploreStatsKey = ''
			}
			return
		}

		const queryKey = exploreQueryString
		void queryKey

		const timer = window.setTimeout(() => {
			const seq = ++liveExploreStatsSeq
			void fetch(`/api/variants/summary?${queryKey}`)
				.then((response) => (response.ok ? response.json() : null))
				.then((payload: unknown) => {
					if (seq !== liveExploreStatsSeq || !payload || typeof payload !== 'object') return
					const stats = payload as Record<string, unknown>
					if (
						typeof stats.variants !== 'number' ||
						typeof stats.common !== 'number' ||
						typeof stats.lowFreq !== 'number' ||
						typeof stats.rare !== 'number'
					) {
						return
					}
					liveExploreStats = {
						variants: stats.variants,
						common: stats.common,
						lowFreq: stats.lowFreq,
						rare: stats.rare,
					}
					liveExploreStatsKey = queryKey
				})
				.catch(() => {})
		}, SEARCH_QUERY_DEBOUNCE_MS)

		return () => window.clearTimeout(timer)
	})

	function openVariantFromDrawer(href: string) {
		resultsDrawerOpen = true
		exploreDrawerDismissed = false
		syncResultsUrl(true, true)
		const target = new URL(href, page.url)
		const tenant = page.url.searchParams.get('tenant') ?? data.forceTenant
		if (tenant && !target.searchParams.has('tenant')) {
			target.searchParams.set('tenant', tenant)
		}
		void goto(`${target.pathname}${target.search}`)
	}

	function openExploreFromVariant(href: string) {
		resultsDrawerOpen = true
		exploreDrawerDismissed = false
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
		lastHydratedPathname = path
		selfUrlSync = true
		void goto(`${path}${target.search}`)
	}

	function openExplorer() {
		exploreDrawerDismissed = false
		resultsDrawerOpen = false
		countryPickerOpen = false
		datasetPickerOpen = false
		goToExploreFromLocalState()
	}

	function goToExploreFromLocalState() {
		const params = buildExploreParams()
		void goto(`/explore${params.toString() ? `?${params.toString()}` : ''}`)
	}

	function openResultsDrawer(force = false) {
		if (!force && !hasActiveExploreContext()) return
		openExplorer()
	}

	function closeResultsDrawer() {
		exploreDrawerDismissed = true
		resultsDrawerOpen = false
		syncResultsUrl(false, true)
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
		const hasLegacyResultsParam = page.url.searchParams.has('results')
		if (
			!force &&
			!hasLegacyResultsParam &&
			exploreSearchParamsEqual(params, page.url.searchParams)
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
		if (!isExplorePage) return
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
					untrack(() => syncResultsUrl(resultsDrawerOpen, true))
					return
				}
			}

		if (urlHasContext && !exploreSearchParamsEqual(stateParams, page.url.searchParams)) {
			return
		}

		const params = urlExploreParams()
		if (exploreUrlKey(path, params) === lastHydratedExploreUrl) return
		untrack(() => syncResultsUrl(resultsDrawerOpen))
	})

	$effect(() => {
		if (isVariantRoute && variantDetailData) {
			resultsDrawerOpen = true
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

	function datasetsForCountry(country: MapBubbleRow) {
		const bankSlugs = new Set(
			countrySourceBanks(country)
				.map((bank) => bank.slug)
				.filter(Boolean)
		)
		const superpops = new Set(
			countryMappingsForCode(mapRowCountryCode(country)).map((mapping) => mapping.superpop)
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

	function dashboardCameraPadding() {
		if (typeof window === 'undefined') {
			return { top: 84, bottom: 148, left: 280, right: 280 }
		}
		if (window.innerWidth <= 700) {
			return { top: 72, bottom: 160, left: 16, right: 16 }
		}
		const side = Math.max(20, Math.round(window.innerWidth * 0.25 - 8))
		return {
			top: 88,
			bottom: 28 + 112 + 20,
			left: side,
			right: side,
		}
	}

	function shouldUseDashboardCameraPadding() {
		return Boolean(selectedCountry || selectedDataset || selectedSource) && !portalHomeMapView
	}

	/** Pixel offset so the selected region sits in the clear map band between side panels. */
	function mapSelectionCameraOffset(): [number, number] {
		if (typeof window === 'undefined' || window.innerWidth <= 700) return [0, 0]
		return [
			-Math.round(window.innerWidth * 0.06),
			-Math.round(window.innerHeight * 0.045),
		]
	}

	/** Symmetric padding so fitBounds keeps map content roughly centered on portal home. */
	function portalHomeFitPadding(generous = false): mapboxgl.PaddingOptions {
		const edge = generous ? 96 : 64
		return { top: edge, bottom: edge + 24, left: edge, right: edge }
	}

	function mapFitPadding(useDashboardPadding: boolean, generous = false): mapboxgl.PaddingOptions {
		if (tenantScope && portalHomeMapView) return portalHomeFitPadding(generous)
		if (useDashboardPadding) {
			const base = dashboardCameraPadding()
			const extra = generous ? 48 : 24
			return {
				top: base.top + extra,
				right: base.right + extra,
				bottom: base.bottom + extra,
				left: base.left + extra,
			}
		}
		const edge = generous ? 180 : 120
		return { top: edge, bottom: edge, left: edge, right: edge }
	}

	function expandBounds(bounds: mapboxgl.LngLatBounds, marginRatio = 0.22) {
		const sw = bounds.getSouthWest()
		const ne = bounds.getNorthEast()
		const lngSpan = Math.max(ne.lng - sw.lng, 0.8)
		const latSpan = Math.max(ne.lat - sw.lat, 0.8)
		bounds.extend([sw.lng - lngSpan * marginRatio, sw.lat - latSpan * marginRatio])
		bounds.extend([ne.lng + lngSpan * marginRatio, ne.lat + latSpan * marginRatio])
		return bounds
	}

	function relaxPortalMapBounds() {
		if (!map || !tenantScope) return
		map.setMaxBounds(WORLD_MAP_BOUNDS)
	}

	function portalBubbleFitOptions(scope: string) {
		return portalMapFit(scope)
	}

	function fitMapToCountryRows(
		rows: CountryRow[],
		options: {
			padding?: boolean
			animate?: boolean
			maxZoom?: number
			marginRatio?: number
			singleCountryZoom?: number
			generousPadding?: boolean
		} = {}
	) {
		if (!map) return
		const portalFit = tenantScope ? portalBubbleFitOptions(tenantScope) : null
		const fitPadding = mapFitPadding(Boolean(options.padding), options.generousPadding)
		const fitOffset = options.padding ? mapSelectionCameraOffset() : ([0, 0] as [number, number])
		const duration = options.animate === false ? 0 : 900
		const marginRatio = options.marginRatio ?? portalFit?.marginRatio ?? 0.22
		const maxZoom = options.maxZoom ?? portalFit?.maxZoom ?? 2.4

		if (!rows.length) {
			map.flyTo({
				center: defaultMapCenter,
				zoom: defaultMapZoom,
				padding: fitPadding,
				retainPadding: false,
				duration,
				essential: true,
			})
			return
		}

		if (tenantScope) relaxPortalMapBounds()

		const bounds = new mapboxgl.LngLatBounds()
		for (const row of rows) bounds.extend(row.center)
		expandBounds(bounds, marginRatio)

		map.fitBounds(bounds, {
			padding: fitPadding,
			offset: fitOffset,
			duration,
			maxZoom,
			essential: true,
		})
	}

	function flyToDatasetView(dataset: DisplayDataset, options: { padding?: boolean; animate?: boolean } = {}) {
		if (!map) return
		const rows =
			tenantScope && dataset.biobankSlug === tenantScope
				? mapBubbleRows
				: countryRows.filter((country) => countryCodesForDataset(dataset).includes(country.code))
		fitMapToCountryRows(rows, options)
	}

	function flyToDatasetsView(
		datasets: DisplayDataset[],
		options: { padding?: boolean; animate?: boolean } = {}
	) {
		if (!map) return
		if (tenantScope && datasets.length && datasets.every((dataset) => dataset.biobankSlug === tenantScope)) {
			fitMapToCountryRows(mapBubbleRows, options)
			return
		}

		const rowsByCode = new Map<string, CountryRow>()
		for (const dataset of datasets) {
			for (const code of countryCodesForDataset(dataset)) {
				const row = countryRows.find((country) => country.code === code)
				if (row) rowsByCode.set(row.code, row)
			}
		}
		fitMapToCountryRows([...rowsByCode.values()], { ...options, maxZoom: 2.4, marginRatio: 0.4 })
	}

	function applyMapCameraForSelection(options: { animate?: boolean } = {}) {
		if (!map || !mapStyleLoaded || isVariantRoute) return
		const duration = options.animate === false ? 0 : 900
		const useDashboardPadding = shouldUseDashboardCameraPadding()
		const animateCamera = options.animate !== false

		if (selectedCountry) {
			const fitPadding = mapFitPadding(useDashboardPadding)
			map.flyTo({
				center: selectedCountry.center,
				zoom:
					useZoneMap && selectedCountry.countryCode
						? 5.8
						: (COUNTRY_ZOOMS[selectedCountry.code] ?? 4.3),
				padding: fitPadding,
				offset: mapSelectionCameraOffset(),
				retainPadding: false,
				duration: animateCamera ? duration : 0,
				essential: true,
			})
			return
		}

		if (selectedDataset) {
			flyToDatasetView(selectedDataset, {
				padding: useDashboardPadding,
				animate: animateCamera,
			})
			return
		}

		if (selectedSourceDatasets.length) {
			flyToDatasetsView(selectedSourceDatasets, {
				padding: useDashboardPadding,
				animate: animateCamera,
			})
			return
		}

		if (tenantScope && mapBubbleRows.length) {
			fitMapToCountryRows(mapBubbleRows, {
				padding: useDashboardPadding,
				animate: animateCamera,
			})
			return
		}

		map.flyTo({
			center: defaultMapCenter,
			zoom: defaultMapZoom,
			duration,
			essential: true,
		})
	}

	function resetDefaultMapCamera(options: { animate?: boolean } = {}) {
		if (!map) return
		map.stop()
		const animate = options.animate !== false
		const duration = animate ? 900 : 0
		if (tenantScope) {
			relaxPortalMapBounds()
			if (mapBubbleRows.length) {
				fitMapToCountryRows(mapBubbleRows, {
					animate,
					padding: false,
					generousPadding: true,
				})
			} else if (animate) {
				map.flyTo({
					center: defaultMapCenter,
					zoom: defaultMapZoom,
					duration,
					essential: true,
				})
			} else {
				map.jumpTo({
					center: defaultMapCenter,
					zoom: defaultMapZoom,
					bearing: 0,
					pitch: 0,
				})
			}
			return
		}
		if (animate) {
			map.flyTo({
				center: defaultMapCenter,
				zoom: defaultMapZoom,
				duration,
				essential: true,
			})
			return
		}
		map.jumpTo({
			center: defaultMapCenter,
			zoom: defaultMapZoom,
			bearing: 0,
			pitch: 0,
		})
	}

	function syncMapSelectionFromSearchQuery(query: string) {
		const trimmed = query.trim()
		if (!trimmed || shouldRunVariantLiveSearch(trimmed)) return false

		const countryMatch = findMapSearchMatch(trimmed)
		if (countryMatch && isMapLocationQuery(trimmed, countryMatch)) {
			if (selectedCode !== countryMatch.code) {
				selectedCode = countryMatch.code
			}
			return true
		}

		const populationMatch = findPopulationSearchMatch(trimmed)
		if (populationMatch) {
			const country = countryRows.find((row) => row.code === populationMatch.countryCode)
			if (country && selectedCode !== country.code) {
				selectedCode = country.code
				return true
			}
		}

		return false
	}

	function selectDataset(dataset: DisplayDataset, options: { keepCountry?: boolean } = {}) {
		selectedDatasetSlug = dataset.slug ?? null
		selectedDatasetInferredFromSource = false
		selectedSourceSlug = null
		if (!options.keepCountry) {
			selectedCode = null
		} else if (selectedCode && !countryCodesForDataset(dataset).includes(selectedCode)) {
			selectedCode = null
		}
		syncResultsUrl(false, true)
	}

	function clearDatasetSelection() {
		if (!selectedDatasetSlug) return
		selectedDatasetSlug = null
		selectedDatasetInferredFromSource = false
		selectedSourceSlug = null
		selectedCode = null
		countryPickerOpen = false
		datasetPickerOpen = false
		syncResultsUrl(resultsDrawerOpen, true)
	}

	function clearMapSurfaceSelection() {
		if (!selectedCode && !selectedDatasetSlug) return
		selectedCode = null
		selectedDatasetSlug = null
		selectedDatasetInferredFromSource = false
		selectedSourceSlug = null
		countryPickerOpen = false
		datasetPickerOpen = false
		syncResultsUrl(resultsDrawerOpen, true)
	}

	function mapSelectionActive() {
		return Boolean(selectedCountry || selectedDataset)
	}

	function isMapBubbleInFocus(code: string) {
		if (selectedCountry) return selectedCountry.code === code
		if (selectedDataset) {
			const datasetCodes = countryCodesForDataset(selectedDataset)
			if (useZoneMap && datasetCodes.includes('BR')) return true
			return datasetCodes.includes(code)
		}
		return true
	}

	function activeCountryPopupCountry(): MapBubbleRow | null {
		if (selectedCountry) return selectedCountry
		if (!hoverCountryCode) return null
		return mapBubbleRows.find((row) => row.code === hoverCountryCode) ?? null
	}

	function cancelHoverCountryDismiss() {
		if (hoverDismissTimer) {
			clearTimeout(hoverDismissTimer)
			hoverDismissTimer = undefined
		}
	}

	function scheduleHoverCountryDismiss() {
		cancelHoverCountryDismiss()
		if (selectedCountry || countryPopupPointerInside) return
		hoverDismissTimer = setTimeout(() => {
			hoverDismissTimer = undefined
			if (!selectedCountry && !countryPopupPointerInside) {
				hoverCountryCode = null
			}
		}, HOVER_COUNTRY_DISMISS_MS)
	}

	function attachCountryPopupHoverHandlers(popup: Popup) {
		const element = popup.getElement()
		if (!element || element.dataset.hoverBridge === '1') return
		element.dataset.hoverBridge = '1'
		element.addEventListener('pointerenter', () => {
			countryPopupPointerInside = true
			cancelHoverCountryDismiss()
		})
		element.addEventListener('pointerleave', () => {
			countryPopupPointerInside = false
			if (!selectedCountry) scheduleHoverCountryDismiss()
		})
	}

	function handleMapRegionClick(country: MapBubbleRow) {
		if (selectedCountry?.code === country.code) {
			hoverCountryCode = null
			cancelHoverCountryDismiss()
			ignoreNextMapBackgroundClick = true
			requestAnimationFrame(() => {
				ignoreNextMapBackgroundClick = false
			})
			return
		}

		if (!selectedCountry && mapSelectionActive() && !isMapBubbleInFocus(country.code)) {
			if (tenantScope) {
				clearCountrySelection()
			} else {
				clearMapSurfaceSelection()
			}
			return
		}

		hoverCountryCode = null
		cancelHoverCountryDismiss()
		flyToCountry(country, { keepDataset: Boolean(tenantScope && selectedDatasetSlug) })
		ignoreNextMapBackgroundClick = true
		requestAnimationFrame(() => {
			ignoreNextMapBackgroundClick = false
		})
	}

	function handleMapBackgroundClick(event: MapMouseEvent) {
		if (ignoreNextMapBackgroundClick) return
		if (!map) return
		const regionHits = map.queryRenderedFeatures(event.point, { layers: mapInteractiveLayers() })
		if (regionHits.length) return
		if (selectedCountry) {
			clearCountrySelection()
		} else if (!tenantScope && mapSelectionActive()) {
			clearMapSurfaceSelection()
		}
	}

	function selectedCountryPopupHtml(country: MapBubbleRow) {
		const sources = countrySourceBanks(country)
		const datasets = datasetsForCountry(country)
		const countryCode = mapRowCountryCode(country)
		const variantTotal = datasets.length
			? Math.max(...datasets.map((dataset) => dataset.variants ?? 0))
			: country.variants
		const explorerParams = new URLSearchParams()
		explorerParams.set('country', countryCode)
		const cohortIds = cohortIdsForCountryCode(countryCode)
		if (cohortIds.length) explorerParams.set('cohorts', cohortIds.join(','))
		if (data.forceTenant) explorerParams.set('tenant', data.forceTenant)
		const countryExplorerHref = `/explore?${explorerParams.toString()}`
		const primarySource = sources.length === 1 ? sources[0] : null
		const portalHref = primarySource?.slug
			? (portalUrlFor(primarySource.slug) ?? `/sources/${primarySource.slug}`)
			: '/sources'
		const showPortalAction = !(primarySource?.slug && isCurrentBiobankPortal(primarySource.slug))
		const popupExternalIcon = `<svg class="popup-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`
		const summaryLine = `${fmt(country.samples)} participants · ${fmt(variantTotal)} variants`
		const sourceLine =
			sources.length > 1
				? `<p class="popup-source-line">${sources.map((source) => source.name).join(' · ')}</p>`
				: ''

		let datasetBlock = ''
		if (datasets.length === 1) {
			const dataset = datasets[0]
			const meta = [dataset.assay, dataset.genomeBuild, dataset.release].filter(Boolean).join(' · ')
			datasetBlock = `
				<p class="popup-dataset-line">
					<strong>${dataset.title}</strong>
					${meta ? `<span>${meta}</span>` : ''}
				</p>
			`
		} else if (datasets.length > 1) {
			datasetBlock = `
				<ul class="popup-dataset-list">
					${datasets
						.map((dataset) => {
							const meta = [dataset.assay, dataset.release].filter(Boolean).join(' · ')
							return `
								<li>
									<a class="popup-dataset-row" href="/datasets/${dataset.slug}">
										<span>${dataset.title}</span>
										<b>${fmt(dataset.participants ?? 0)}</b>
									</a>
									${meta ? `<small>${meta}</small>` : ''}
								</li>
							`
						})
						.join('')}
				</ul>
			`
		}

		return `
			<div class="map-selection-popup">
				<header>
					<strong><span>${countryFlagEmoji(countryCode)}</span>${country.name}</strong>
					<p class="popup-summary">${summaryLine}</p>
				</header>
				${sourceLine}
				${datasetBlock}
				<div class="popup-actions${showPortalAction ? ' popup-actions--dual' : ''}">
					<a class="popup-action popup-action--primary" href="${countryExplorerHref}"><span>${tx('View in Explorer', 'Ver no Explorer')}</span></a>
					${showPortalAction ? `<a class="popup-action" href="${portalHref}"><span>${tx('Portal', 'Portal')}</span>${popupExternalIcon}</a>` : ''}
				</div>
			</div>
		`
	}

	function syncCountryBubblePopup() {
		const popupCountry = activeCountryPopupCountry()
		const pinned = Boolean(
			selectedCountry && popupCountry && selectedCountry.code === popupCountry.code
		)

		if (!map || !popupCountry || !isMapPage || isVariantRoute || resultsDrawerOpen) {
			suppressSelectedCountryPopupClose = true
			selectedCountryPopup?.remove()
			suppressSelectedCountryPopupClose = false
			selectedCountryPopup = undefined
			selectedCountryPopupCode = null
			countryPopupPinned = false
			return
		}

		if (
			selectedCountryPopup?.isOpen() &&
			selectedCountryPopupCode === popupCountry.code &&
			countryPopupPinned === pinned
		) {
			selectedCountryPopup.setLngLat(popupCountry.center)
			selectedCountryPopup.setHTML(selectedCountryPopupHtml(popupCountry))
			attachCountryPopupHoverHandlers(selectedCountryPopup)
			return
		}

		suppressSelectedCountryPopupClose = true
		selectedCountryPopup?.remove()
		suppressSelectedCountryPopupClose = false
		selectedCountryPopupCode = null

		const popup = new mapboxgl.Popup({
			closeButton: pinned,
			closeOnClick: false,
			closeOnMove: false,
			offset: pinned ? 20 : 28,
			maxWidth: '272px',
			className: 'country-selection-popup',
		})
		if (!popup) return
		const countryPopup = popup as Popup
		countryPopup.setLngLat(popupCountry.center)
		countryPopup.setHTML(selectedCountryPopupHtml(popupCountry))
		countryPopup.addTo(map)
		attachCountryPopupHoverHandlers(countryPopup)
		selectedCountryPopup = countryPopup
		selectedCountryPopupCode = popupCountry.code
		countryPopupPinned = pinned
		countryPopup.on('close', () => {
			if (suppressSelectedCountryPopupClose || !pinned) return
			if (selectedCode === popupCountry.code) {
				clearCountrySelection()
			}
			selectedCountryPopup = undefined
			selectedCountryPopupCode = null
			countryPopupPinned = false
		})
	}

	function resetMapView() {
		return null
		// liveExploreStats = null
		// liveExploreStatsKey = ''
		// drawerFiltersOpen = false
		// selectedDatasetSlug = null
		// selectedDatasetInferredFromSource = false
		// selectedSourceSlug = null
		// selectedCode = null
		// countryPickerOpen = false
		// datasetPickerOpen = false
		// exploreDrawerDismissed = false
		// resultsDrawerOpen = false
		// resetExploreQueriesAndFilters()

		// const params = new URLSearchParams()
		// if (data.forceTenant) params.set('tenant', data.forceTenant)
		// const homeUrl = exploreUrlKey('/', params)
		// lastHydratedExploreUrl = homeUrl
		// selfUrlSync = true

		// if (isVariantRoute) {
		// 	void goto(homeUrl, { replaceState: true, noScroll: true, keepFocus: true })
		// } else {
		// 	try {
		// 		replaceState(homeUrl, {})
		// 	} catch {
		// 		void goto(homeUrl, { replaceState: true, noScroll: true, keepFocus: true })
		// 	}
		// }

		// syncMapState({ country: null, dataset: null })
	}

	function handleResetView() {
		hoverCountryCode = null
		cancelHoverCountryDismiss()
		countryPopupPointerInside = false
		clearCountrySelection()
		suppressSelectedCountryPopupClose = true
		selectedCountryPopup?.remove()
		suppressSelectedCountryPopupClose = false
		selectedCountryPopup = undefined
		selectedCountryPopupCode = null
	}

	function applyMapHighlight(
		highlightCodes: string[],
		focusCodes: string[],
		hasSelection: boolean
	) {
		if (!map?.isStyleLoaded()) return
		const selectionHighlightExpression: ExpressionSpecification = [
			'in',
			['get', 'iso_3166_1'],
			['literal', highlightCodes],
		]
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

		if (!useZoneMap) {
			const focusExpression: ExpressionSpecification = [
				'case',
				['in', ['get', 'code'], ['literal', focusCodes]],
				0.98,
				hasSelection ? 0.12 : 0.98,
			]
			const haloExpression: ExpressionSpecification = [
				'case',
				['in', ['get', 'code'], ['literal', focusCodes]],
				0.2,
				hasSelection ? 0.03 : 0.2,
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
			map.setPaintProperty('collection-country-labels', 'text-opacity', 1)
		}
	}

	function syncMapState(
		selection: MapSelectionState = { country: selectedCountry, dataset: selectedDataset }
	) {
		if (!map?.isStyleLoaded() || !map.getSource('collection-countries')) return

		const source = map.getSource('collection-countries') as GeoJSONSource
		source.setData(collectionGeoJson)

		const selectedFocusCodes = selection.country
			? [selection.country.code]
			: selection.dataset
				? countryCodesForDataset(selection.dataset).includes('BR') && useZoneMap
					? mapBubbleRows.map((row) => row.code)
					: countryCodesForDataset(selection.dataset)
				: useZoneMap
					? []
					: mapBubbleRows.map((row) => row.code)
		const selectedCountryHighlightCodes = selection.country
			? [mapRowCountryCode(selection.country)]
			: selection.dataset
				? countryCodesForDataset(selection.dataset).filter((code) =>
						countryRows.some((country) => country.code === code)
					)
				: countryRows.map((country) => country.code)
		const hasSelection = Boolean(selection.country || selection.dataset)
		applyMapHighlight(selectedCountryHighlightCodes, selectedFocusCodes, hasSelection)
		updateZoneHighlight()
	}

	function clearCountrySelection() {
		if (!selectedCode) return
		selectedCode = null
		zoneHighlightKey = ''
		updateZoneHighlight()
	}

	function releaseMapScopeForVariantExplore() {
		if (!selectedCode && !selectedDatasetSlug) return
		selectedCode = null
		selectedDatasetSlug = null
		selectedDatasetInferredFromSource = false
		selectedSourceSlug = null
	}

	function createStyle(): StyleSpecification {
		const useBrazilStates = useZoneMap
		const zoneLayers: NonNullable<StyleSpecification['layers']> = useBrazilStates
			? [
					{
						id: 'region-zone-fill',
						type: 'fill',
						source: 'region-zones',
						paint: {
							'fill-color': openMinedMapPalette[3],
							'fill-opacity': 0.3,
						},
					},
					{
						id: 'region-zone-outline',
						type: 'line',
						source: 'region-zones',
						paint: {
							'line-color': '#ffffff',
							'line-opacity': 0.55,
							'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.4, 5, 0.9, 8, 1.4],
						},
					},
					{
						id: 'region-zone-highlight',
						type: 'fill',
						source: 'region-zones',
						filter: EMPTY_ZONE_FILTER,
						paint: {
							'fill-color': '#2eccaa',
							'fill-opacity': 0.72,
						},
					},
					{
						id: 'region-zone-highlight-outline',
						type: 'line',
						source: 'region-zones',
						filter: EMPTY_ZONE_FILTER,
						paint: {
							'line-color': '#ffffff',
							'line-width': 2.2,
							'line-opacity': 0.95,
						},
					},
				]
			: []
		const bubbleLayers: NonNullable<StyleSpecification['layers']> = useBrazilStates
			? []
			: [
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
							'text-allow-overlap': true,
							'text-ignore-placement': true,
							'text-optional': false,
						},
						paint: {
							'text-color': '#353243',
							'text-halo-color': 'rgba(255, 255, 255, 0.88)',
							'text-halo-width': 1,
							'text-opacity': 1,
						},
					},
				]

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
				...(useBrazilStates
					? {
							'region-zones': {
								type: 'geojson',
								data: brazilStatesUrl,
								promoteId: 'sigla',
							},
						}
					: {}),
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
				...zoneLayers,
				...bubbleLayers,
			],
		}
	}

	function flyToCountry(
		country: CountryRow,
		options: { keepDataset?: boolean; keepSearch?: boolean } = {}
	) {
		selectedCode = country.code
		selectedSourceSlug = null
		if (!options.keepSearch) {
			searchQuery = ''
			appliedSearchQuery = ''
			resultsTableQueryString = ''
		}
		if (!options.keepDataset && selectedDatasetSlug) {
			const datasetCodes = selectedDataset ? countryCodesForDataset(selectedDataset) : []
			if (!datasetCodes.includes(country.code)) {
				selectedDatasetSlug = null
				selectedDatasetInferredFromSource = false
				selectedSourceSlug = null
			}
		}
	}

	const initMap: Action<HTMLDivElement> = (container) => {
		const initialTenant = page.data.tenant
		const initialUseZoneMap = initialTenant.mapProfile?.regionMode === 'zones'
		const initialZoneCodeProperty = initialTenant.mapProfile?.zoneCodeProperty ?? 'code'
		const initialInteractiveLayers = initialUseZoneMap
			? [...MAP_ZONE_LAYERS]
			: [...MAP_BUBBLE_LAYERS]
		const initialCenter = initialTenant.scope ? mapboxCenter(initialTenant) : DEFAULT_MAP_CENTER
		const initialZoom = initialTenant.scope ? mapboxZoom(initialTenant) : DEFAULT_MAP_ZOOM
		const initialBounds = mapboxBounds(initialTenant)
		const initialMinZoom = initialTenant.mapProfile?.minZoom ?? 2

		map = new mapboxgl.Map({
			container,
			style: createStyle(),
			center: initialCenter,
			zoom: initialZoom,
			minZoom: initialMinZoom,
			fadeDuration: 0,
			renderWorldCopies: true,
			...(initialBounds ? { maxBounds: initialBounds } : {}),
		})
		if (initialTenant.scope) map.setMaxBounds(WORLD_MAP_BOUNDS)
		map.scrollZoom.setZoomRate(SCROLL_ZOOM_RATE)
		map.scrollZoom.setWheelZoomRate(WHEEL_ZOOM_RATE)

		const resizeMap = () => {
			map?.resize()
			if (map && mapStyleLoaded && tenantScope && portalHomeMapView && mapBubbleRows.length) {
				fitMapToCountryRows(mapBubbleRows, { animate: false, padding: false })
			}
		}
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
			mapStyleLoaded = true
			syncMapState()
			if (initialUseZoneMap) {
				map?.on('sourcedata', (event) => {
					if (event.sourceId !== 'region-zones' || !event.isSourceLoaded) return
					zoneHighlightKey = ''
					updateZoneHighlight()
				})
			}
			if (page.url.pathname === '/' && !hasExploreQueryContextFromParams(page.url.searchParams)) {
				resetDefaultMapCamera({ animate: true })
			} else {
				applyMapCameraForSelection({ animate: true })
			}
		})

		map.on('click', initialInteractiveLayers, (event) => {
			event.originalEvent.stopPropagation()
			const properties = event.features?.[0]?.properties as Record<string, unknown> | undefined
			const code = initialUseZoneMap
				? (typeof properties?.[initialZoneCodeProperty] === 'string'
						? (properties[initialZoneCodeProperty] as string)
						: null)
				: (typeof properties?.code === 'string' ? properties.code : null)
			const country = code ? mapBubbleRows.find((item) => item.code === code) : undefined
			if (country) handleMapRegionClick(country)
		})

		map.on('click', (event) => {
			handleMapBackgroundClick(event)
		})

		let zonePointerMove: ((event: MapMouseEvent) => void) | undefined
		if (initialUseZoneMap) {
			zonePointerMove = (event) => handleZonePointerMove(event)
			map.on('mousemove', zonePointerMove)
		}

		if (!initialUseZoneMap) {
			for (const layer of initialInteractiveLayers) {
				map.on('mouseenter', layer, (event) => {
					if (!map) return
					map.getCanvas().style.cursor = 'pointer'
					const properties = event.features?.[0]?.properties as Record<string, unknown> | undefined
					const code =
						typeof properties?.code === 'string' ? (properties.code as string) : undefined
					if (!code || selectedCountry?.code === code) return
					cancelHoverCountryDismiss()
					countryPopupPointerInside = false
					hoverCountryCode = code
				})

				map.on('mouseleave', layer, () => {
					if (map) map.getCanvas().style.cursor = ''
					if (!selectedCountry) scheduleHoverCountryDismiss()
				})
			}
		}

		return {
			destroy() {
				window.removeEventListener('resize', resizeMap)
				resizeObserver.disconnect()
				if (zonePointerMove) map?.off('mousemove', zonePointerMove)
				cancelZoneHoverClear()
				hoverCountryCode = null
				cancelHoverCountryDismiss()
				countryPopupPointerInside = false
				suppressSelectedCountryPopupClose = true
				selectedCountryPopup?.remove()
				suppressSelectedCountryPopupClose = false
				map?.remove()
				map = undefined
			},
		}
	}

	onDestroy(() => {
		cancelZoneHoverClear()
		hoverCountryCode = null
		cancelHoverCountryDismiss()
		countryPopupPointerInside = false
		suppressSelectedCountryPopupClose = true
		selectedCountryPopup?.remove()
		suppressSelectedCountryPopupClose = false
		map?.remove()
		map = undefined
		mapStyleLoaded = false
	})

	$effect(() => {
		collectionGeoJson
		countryHighlightExpression
		bubbleFocusCodes
		bubbleStyleVersion
		selectedDatasetSlug
		selectedSourceSlug
		selectedCode
		hoverCountryCode
		syncMapState()
	})

	$effect(() => {
		selectedCode
		hoverCountryCode
		mapBubbleRows.length
		resultsDrawerOpen
		isVariantRoute
		isMapPage
		syncCountryBubblePopup()
	})

	$effect(() => {
		if (!mapStyleLoaded || isVariantRoute) return
		const isCleanMapRoute =
			page.url.pathname === '/' && !hasExploreQueryContextFromParams(page.url.searchParams)
		if (!isCleanMapRoute) return
		const resetKey = `${page.url.pathname}?${page.url.searchParams.toString()}`
		if (lastDefaultCameraResetKey === resetKey) return
		lastDefaultCameraResetKey = resetKey
		resetDefaultMapCamera({ animate: true })
	})

	$effect(() => {
		if (!filterStateHydrated || !mapStyleLoaded || isVariantRoute) return
		selectedCode
		selectedDatasetSlug
		selectedSourceSlug
		mapBubbleRows.length
		applyMapCameraForSelection()
	})

	$effect(() => {
		if (!filterStateHydrated || !mapStyleLoaded || !isExplorePage || isVariantRoute) return
		if (selectedCode || selectedDatasetSlug) return
		const query = appliedSearchQuery.trim() || searchQuery.trim()
		if (!query || shouldRunVariantLiveSearch(query)) return
		syncMapSelectionFromSearchQuery(query)
	})

	$effect(() => {
		if (!selectedCode) return
		if (mapBubbleRows.some((country) => country.code === selectedCode)) return
		selectedCode = null
	})

	$effect(() => {
		if (!selectedDatasetSlug) return
		if (displayDatasets.some((dataset) => dataset.slug === selectedDatasetSlug)) return
		selectedDatasetSlug = null
		selectedDatasetInferredFromSource = false
		selectedSourceSlug = null
		syncResultsUrl(resultsDrawerOpen, true)
	})
</script>

<svelte:head>
	<title>{data.tenant.name} · {data.tenant.product}</title>
	<meta name="description" content={data.tenant.tagline} />
</svelte:head>

<div class="dashboard-shell" class:map-mode={isMapPage}>
			{#if isMapPage}
				<div class="map" use:initMap></div>

					<!-- Bottom-left detail panel hidden.
					{#if selectedDataset || selectedSource}
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
						<div class="panel-heading detail-heading country-panel-header">
							<div class="detail-heading-main country-panel-titleblock">
								<h2 class="country-name-heading">
									<span class="picker-flag" aria-hidden="true"
										>{countryFlagEmoji(selectedCountry.code)}</span
									>
									{selectedCountry.name}
								</h2>
								<p class="detail-context">
									{fmt(selectedCountrySources.length)}
									{selectedCountrySources.length === 1 ? tx('source', 'fonte') : tx('sources', 'fontes')}
									· {fmt(selectedCountryDatasets.length)}
									{selectedCountryDatasets.length === 1
										? tx('dataset', 'conjunto')
										: tx('datasets', 'conjuntos')}
								</p>
							</div>
							{#if selectedDataset}
								<button type="button" class="panel-action secondary" onclick={clearCountrySelection}
									>{tx('Back', 'Voltar')}</button
								>
							{/if}
						</div>

						<div class="country-detail">
							<article class="meta-dataset compact detail-card">
								<div class="country-source-row" aria-label={tx('Sources', 'Fontes')}>
									{#each selectedCountrySources as source}
										{@const tenant = tenantFor(source.slug)}
										<span class="source-chip">
											{#if tenant?.logoImg}
												<img src={tenant.logoImg} alt="" />
											{:else}
												<span>{tenant?.logoEmoji ?? source.name.slice(0, 2)}</span>
											{/if}
											{source.name}
										</span>
									{/each}
								</div>
								<dl class="meta-grid meta-grid-flush">
									<div>
										<dt>{tx('Participants', 'Participantes')}</dt>
										<dd>{fmt(selectedCountry.samples)}</dd>
									</div>
									<div>
										<dt>{tx('Variants', 'Variantes')}</dt>
										<dd>{fmt(selectedCountryVariantTotal)}</dd>
									</div>
									<div>
										<dt>{tx('Sources', 'Fontes')}</dt>
										<dd>{fmt(selectedCountrySources.length)}</dd>
									</div>
									<div>
										<dt>{tx('Datasets', 'Conjuntos')}</dt>
										<dd>{fmt(selectedCountryDatasets.length)}</dd>
									</div>
								</dl>
							</article>

							<div class="panel-actions-row">
								<a class="panel-action primary" href={explorerPath}>
									{tx('Open in Explorer', 'Abrir no Explorer')}
								</a>
								<a class="panel-action secondary" href={selectedCountrySourceProfileHref}>
									{selectedCountrySources.length === 1
										? tx('Biobank profile', 'Perfil do biobanco')
										: tx('Biobanks', 'Biobancos')}
								</a>
							</div>
						</div>
					{:else if selectedDataset}
						{@const sourceTenant = tenantFor(selectedDataset.biobankSlug)}
						<div class="panel-heading detail-heading country-panel-header">
							<div class="detail-heading-main country-panel-titleblock">
								<div class="meta-dataset-title-row dataset-panel-title">
									{@render panelLogo(selectedDataset.biobankSlug)}
									<h2>{selectedDataset.title}</h2>
									{#if selectedDataset.release}<span class="meta-release">{selectedDataset.release}</span>{/if}
								</div>
								{#if selectedDataset.description}
									<p class="detail-context">{selectedDataset.description}</p>
								{/if}
							</div>
						</div>

						<div class="country-detail">
							<article class="meta-dataset compact detail-card">
								<div class="country-source-row" aria-label={tx('Sources', 'Fontes')}>
									<span class="source-chip">
										{#if sourceTenant?.logoImg}
											<img src={sourceTenant.logoImg} alt="" />
										{:else}
											<span>{sourceTenant?.logoEmoji ?? selectedDataset.biobankSlug?.slice(0, 2) ?? 'DB'}</span>
										{/if}
										{sourceTenant?.name ?? selectedDataset.biobankSlug}
									</span>
								</div>
								<dl class="meta-grid meta-grid-flush">
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

							<div class="panel-actions-row">
								<a class="panel-action primary" href={explorerPath}>
									{tx('Open in Explorer', 'Abrir no Explorer')}
								</a>
								<a class="panel-action secondary" href={`/datasets/${selectedDataset.slug}`}>
									{tx('Dataset page', 'Página do conjunto')}
								</a>
								{#if selectedDataset.biobankSlug}
									<a class="panel-action secondary" href={`/sources/${selectedDataset.biobankSlug}`}>
										{tx('Biobank profile', 'Perfil do biobanco')}
									</a>
								{/if}
							</div>
						</div>
					{:else if selectedSource}
						<div class="panel-heading detail-heading country-panel-header">
							<div class="detail-heading-main country-panel-titleblock">
								<div class="meta-dataset-title-row dataset-panel-title">
									{@render panelLogo(selectedSource.slug)}
									<h2>{selectedSource.name}</h2>
								</div>
								{#if selectedSource.description}
									<p class="detail-context">{selectedSource.description}</p>
								{/if}
							</div>
						</div>

						<div class="country-detail">
							<article class="meta-dataset compact detail-card">
								<p class="detail-card-label">{tx('Source stats', 'Estatísticas da fonte')}</p>
								<dl class="meta-grid meta-grid-flush">
									<div>
										<dt>{tx('Datasets', 'Conjuntos')}</dt>
										<dd>{fmt(selectedSourceDatasets.length)}</dd>
									</div>
									<div>
										<dt>{tx('Participants', 'Participantes')}</dt>
										<dd>{fmt(selectedSourceParticipants)}</dd>
									</div>
									<div>
										<dt>{tx('Variants', 'Variantes')}</dt>
										<dd>{fmt(selectedSourceVariants)}</dd>
									</div>
								</dl>
							</article>

							<div class="detail-section detail-card">
								<p class="detail-card-label">{tx('Datasets', 'Conjuntos')}</p>
								<div class="detail-list">
									{#each selectedSourceDatasets as dataset}
										<a class="detail-list-row" href={`/datasets/${dataset.slug}`}>
											<span>{dataset.title}</span>
											<strong>{fmt(dataset.participants ?? 0)}</strong>
										</a>
									{/each}
								</div>
							</div>

							<div class="panel-actions-row">
								<a class="panel-action primary" href={explorerPath}>
									{tx('Open in Explorer', 'Abrir no Explorer')}
								</a>
								<a class="panel-action secondary" href={`/sources/${selectedSource.slug}`}>
									{tx('Biobank profile', 'Perfil do biobanco')}
								</a>
							</div>
						</div>
					{/if}
				</aside>
			{/if}
			-->

			{#if showMapSummaryPanels}
				<section
					class="map-dashboard-panel map-dashboard-panel--left map-stat-panel"
					class:drawer-open={resultsDrawerOpen}
					aria-label={tx('Network summary', 'Resumo da rede')}
				>
					<div class="map-stat-grid">
						<div class="map-stat-item">
							<strong>{mapPanelCountryCount}</strong>
							<span>{tx('Countries', 'Países')}</span>
						</div>
						<div class="map-stat-item">
							<strong>{fmt(mapPanelParticipantCount)}</strong>
							<span>{tx('Participants', 'Participantes')}</span>
						</div>
					</div>
				</section>

				<section
					class="map-dashboard-panel map-dashboard-panel--right"
					class:drawer-open={resultsDrawerOpen}
					aria-label={tx('Databases', 'Bancos de dados')}
				>
					<div class="map-panel-head">
						<h2>{tx('Databases', 'Bancos de dados')}</h2>
						<strong>{displayDatasets.length}</strong>
					</div>

					<div class="map-panel-body database-scroll">
						{#each displayDatasets as dataset}
							{@const sourceTenant = tenantFor(dataset.biobankSlug)}
							{@const portalUrl = portalUrlFor(dataset.biobankSlug)}
							{@const showPortalLink = Boolean(portalUrl && !isCurrentBiobankPortal(dataset.biobankSlug))}
							<a
								href={databaseRowHref(dataset)}
								class="database-row"
								class:active={selectedDatasetSlug === dataset.slug || tenantScope === dataset.biobankSlug}
							>
								<span class="dataset-logo" aria-hidden="true">
									{#if sourceTenant?.logoImg}
										<img src={sourceTenant.logoImg} alt="" />
									{:else}
										<span>{sourceTenant?.logoEmoji ?? 'DB'}</span>
									{/if}
								</span>
								<span class="database-row-main">
									<span class="database-row-title-row">
										<span class="database-row-title">{dataset.title}</span>
										{#if showPortalLink}
											<ExternalLinkIcon class="database-row-external" aria-hidden="true" />
										{/if}
									</span>
									<small
										>{dataset.release} · {fmt(dataset.participants)}
										{tx('participants', 'participantes')} · {dataset.assay}</small
									>
									{#if dataset.description}
										<span class="database-row-desc">{dataset.description}</span>
									{/if}
								</span>
							</a>
						{/each}
						<a href="/contact" class="dataset-cta"
							>{tx('Want to contribute data?', 'Quer contribuir com dados?')}
							<strong>{tx('Get in touch', 'Entre em contato')}</strong></a
						>
					</div>
				</section>
			{/if}

			{#if showMapVariantPanel}
				<section
					class="map-dashboard-panel map-dashboard-panel--center"
					class:drawer-open={resultsDrawerOpen}
					aria-label={tx('Variants', 'Variantes')}
				>
					<div class="map-panel-head">
						<h2>{tx('Variants', 'Variantes')}</h2>
						<strong>{fmt(variantMixTotal)}</strong>
					</div>

					<div class="variant-bar" aria-hidden="true">
						{#each variantClassRows as row (row.key)}
							<span style={`width:${pct(row.count, variantMixTotal)}; background:${row.color}`}></span>
						{/each}
					</div>

					<div class="map-panel-key map-panel-key--triple">
						{#each variantClassRows as row (row.key)}
							<div class="map-panel-key-slot">
								<div class="map-panel-key-item">
									<span class="map-panel-key-label">
										<span class="variant-swatch" style:background-color={row.color}></span>
										{row.label}
									</span>
									<strong>{fmt(row.count)}</strong>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

				<p class="site-footer">© {tenant.name} GA4GH VRS · <a href="/api">Beacon v2</a></p>
			{/if}

	</div>

	<style>
	:global(body:has(.dashboard-shell.map-mode)) {
		overflow: hidden;
	}

	:global(html:has(.dashboard-shell.map-mode)),
	:global(body:has(.dashboard-shell.map-mode)) {
		overflow-x: hidden;
		overscroll-behavior-x: none;
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
		--top-search-width: clamp(560px, 52vw, 920px);
		--results-drawer-top: 84px;
		--results-drawer-bottom: 28px;
		--drawer-track-height: calc(100vh - var(--results-drawer-top) - var(--results-drawer-bottom));
		--explore-side-panel-gap: var(--screen-inset);
		--explore-side-panel-padding-x: 16px;
		--explore-side-panel-max-height: min(680px, calc(var(--drawer-track-height) * 0.8));
		--explore-side-panel-min-height: min(300px, calc(var(--drawer-track-height) * 0.4));
		--explore-side-panel-width: calc(
			var(--results-drawer-left-edge) - (2 * var(--screen-inset))
		);
		--explore-datasets-panel-height: var(--explore-side-panel-max-height);
		--results-drawer-left-edge: calc(var(--top-search-left) - (var(--top-search-width) / 2));
		--panel-surface: color-mix(in srgb, var(--om-white) 92%, transparent);
		--left-panel-surface: color-mix(in srgb, var(--om-teal-100) 24%, var(--om-white) 76%);
		--left-panel-card-bg: color-mix(in srgb, var(--om-teal-100) 42%, var(--om-white) 58%);
		--left-panel-card-border: color-mix(in srgb, var(--om-teal-600) 11%, var(--om-gray-400) 38%);
		--column-header-bg: var(--om-gray-100);
		--column-header-color: var(--om-gray-600);
		--column-header-size: 11px;
		--column-header-weight: 600;
		--column-header-tracking: 0.06em;
		--column-header-padding-y: 10px;
		--column-header-padding-x: 12px;
		--column-header-height: 32px;
		--drawer-toolbar-height: 42px;
		--panel-shadow: 0 10px 28px rgb(46 43 59 / 0.08);
			position: relative;
			height: 100%;
			min-height: calc(100vh - 65px);
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
		z-index: 0;
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

	.dashboard-shell :global(.country-selection-popup.mapboxgl-popup) {
		pointer-events: auto;
	}

	.dashboard-shell :global(.country-selection-popup .mapboxgl-popup-content) {
		border: 1px solid color-mix(in srgb, var(--om-gray-400) 38%, transparent);
		border-radius: var(--om-radius-m);
		background: color-mix(in srgb, var(--om-white) 96%, transparent);
		box-shadow: 0 12px 32px rgb(46 43 59 / 0.14);
		padding: 8px 10px;
		color: var(--om-gray-850);
		pointer-events: auto;
		backdrop-filter: blur(12px);
	}

	.dashboard-shell :global(.country-selection-popup.mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip) {
		margin-top: -1px;
		border-top-color: color-mix(in srgb, var(--om-white) 94%, transparent);
	}

	.dashboard-shell :global(.country-selection-popup.mapboxgl-popup-anchor-top .mapboxgl-popup-tip) {
		margin-bottom: -1px;
		border-bottom-color: color-mix(in srgb, var(--om-white) 94%, transparent);
	}

	.dashboard-shell :global(.country-selection-popup.mapboxgl-popup-anchor-left .mapboxgl-popup-tip) {
		margin-right: -1px;
		border-right-color: color-mix(in srgb, var(--om-white) 94%, transparent);
	}

	.dashboard-shell :global(.country-selection-popup.mapboxgl-popup-anchor-right .mapboxgl-popup-tip) {
		margin-left: -1px;
		border-left-color: color-mix(in srgb, var(--om-white) 94%, transparent);
	}

	.dashboard-shell :global(.country-selection-popup .mapboxgl-popup-close-button) {
		top: 4px;
		right: 5px;
		width: 20px;
		height: 20px;
		border-radius: 999px;
		color: var(--om-gray-650);
		font-size: 16px;
		line-height: 20px;
		pointer-events: auto;
	}

	.dashboard-shell :global(.country-selection-popup .mapboxgl-popup-close-button:hover) {
		background: color-mix(in srgb, var(--om-gray-200) 70%, transparent);
		color: var(--om-gray-850);
	}

	.dashboard-shell :global(.map-selection-popup) {
		display: grid;
		width: min(272px, calc(100vw - 48px));
		gap: 6px;
		padding-right: 10px;
		font-family: 'Inter', system-ui, sans-serif;
	}

	.dashboard-shell :global(.map-selection-popup header) {
		display: grid;
		gap: 2px;
	}

	.dashboard-shell :global(.map-selection-popup header strong) {
		display: flex;
		align-items: center;
		gap: 6px;
		font-family: 'Rubik', 'Inter', system-ui, sans-serif;
		font-size: 14px;
		font-weight: 700;
		line-height: 1.2;
	}

	.dashboard-shell :global(.map-selection-popup header strong span) {
		font-size: 15px;
		line-height: 1;
	}

	.dashboard-shell :global(.popup-summary) {
		margin: 0;
		color: var(--om-gray-600);
		font-size: 11px;
		font-weight: 500;
		line-height: 1.3;
	}

	.dashboard-shell :global(.popup-source-line) {
		margin: 0;
		color: var(--om-teal-700);
		font-size: 10px;
		font-weight: 600;
		line-height: 1.3;
	}

	.dashboard-shell :global(.popup-dataset-line) {
		display: grid;
		gap: 1px;
		margin: 0;
		padding: 6px 8px;
		border-radius: var(--om-radius-s);
		background: color-mix(in srgb, var(--om-gray-100) 55%, transparent);
	}

	.dashboard-shell :global(.popup-dataset-line strong) {
		overflow: hidden;
		font-size: 11px;
		font-weight: 700;
		line-height: 1.25;
		color: var(--om-gray-850);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dashboard-shell :global(.popup-dataset-line span) {
		overflow: hidden;
		color: var(--om-gray-550);
		font-size: 10px;
		font-weight: 500;
		line-height: 1.25;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dashboard-shell :global(.popup-dataset-list) {
		display: grid;
		gap: 4px;
		max-height: 96px;
		margin: 0;
		padding: 0;
		list-style: none;
		overflow: auto;
	}

	.dashboard-shell :global(.popup-dataset-list li) {
		display: grid;
		gap: 1px;
	}

	.dashboard-shell :global(.popup-dataset-list li small) {
		padding: 0 8px 2px;
		color: var(--om-gray-550);
		font-size: 9px;
		font-weight: 500;
		line-height: 1.2;
	}

	.dashboard-shell :global(.popup-dataset-row) {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 8px;
		border-radius: var(--om-radius-s);
		padding: 5px 8px;
		color: var(--om-gray-750);
		text-decoration: none;
		background: color-mix(in srgb, var(--om-gray-100) 55%, transparent);
	}

	.dashboard-shell :global(.popup-dataset-row:hover) {
		background: color-mix(in srgb, var(--om-teal-100) 48%, transparent);
	}

	.dashboard-shell :global(.popup-dataset-row span) {
		overflow: hidden;
		min-width: 0;
		font-size: 11px;
		font-weight: 700;
		line-height: 1.2;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dashboard-shell :global(.popup-dataset-row b) {
		font-size: 11px;
		font-weight: 800;
		line-height: 1;
	}

	.dashboard-shell :global(.popup-actions) {
		display: grid;
		grid-template-columns: 1fr;
		gap: 5px;
	}

	.dashboard-shell :global(.popup-actions--dual) {
		grid-template-columns: 1fr 1fr;
	}

	.dashboard-shell :global(.popup-action) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		min-height: 28px;
		min-width: 0;
		border: 1px solid color-mix(in srgb, var(--om-gray-400) 52%, transparent);
		border-radius: var(--om-radius-s);
		background: color-mix(in srgb, var(--om-white) 88%, transparent);
		padding: 6px 8px;
		color: var(--om-gray-700);
		font-size: 10px;
		font-weight: 700;
		line-height: 1.2;
		text-align: center;
		text-decoration: none;
		pointer-events: auto;
	}

	.dashboard-shell :global(.popup-action > span) {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dashboard-shell :global(.popup-action-icon) {
		flex-shrink: 0;
		width: 11px;
		height: 11px;
		opacity: 0.72;
	}

	.dashboard-shell :global(.popup-action--primary) {
		border-color: transparent;
		background: var(--om-gray-900);
		color: var(--om-white);
	}

		.country-panel {
			position: absolute;
			z-index: 2;
			border: 0;
		border-radius: var(--om-radius-m);
		box-shadow: var(--panel-shadow);
	}

		.map-dashboard-panel {
			position: absolute;
			z-index: 2;
			bottom: var(--bottom-inset);
			border: 0;
			border-radius: var(--om-radius-m);
			box-shadow: var(--panel-shadow);
			background: var(--left-panel-surface);
		}

		.map-dashboard-panel--left {
			left: var(--screen-inset);
			width: var(--side-panel-width);
			padding: var(--om-space-m);
		}

		.map-stat-grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: var(--om-space-s);
		}

		.map-stat-item {
			display: grid;
			gap: 2px;
			min-width: 0;
			text-align: center;
		}

		.map-stat-item strong {
			font-size: 20px;
			font-weight: 800;
			line-height: 1.1;
			color: var(--om-gray-850);
			font-variant-numeric: tabular-nums;
		}

		.map-stat-item span {
			font-size: 11px;
			font-weight: 600;
			line-height: 1.2;
			color: var(--om-gray-700);
		}

		.map-dashboard-panel--center {
			left: max(16px, calc((100vw - 480px) / 2));
			width: min(480px, calc(100vw - 32px));
			padding: var(--om-space-m);
		}

		.map-dashboard-panel--right {
			right: var(--screen-inset);
			width: var(--side-panel-width);
			max-height: min(430px, calc(100vh - 140px));
			padding: 0;
			display: flex;
			flex-direction: column;
			overflow: hidden;
		}

		.map-dashboard-panel.drawer-open {
			opacity: 0;
			pointer-events: none;
			transition: opacity 160ms ease;
		}

		.map-panel-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--om-space-l);
			margin-bottom: var(--om-space-s);
		}

		.map-dashboard-panel--right .map-panel-head {
			flex-shrink: 0;
			margin-bottom: 0;
			padding: var(--om-space-m) var(--om-space-m) var(--om-space-s);
		}

		.map-panel-head h2 {
			margin: 0;
			font-family: 'Rubik', 'Inter', system-ui, sans-serif;
			font-size: 17px;
			font-weight: 700;
			line-height: 1.15;
			color: var(--om-gray-850);
		}

		.map-panel-head > strong {
			font-size: 20px;
			font-weight: 800;
			line-height: 1.15;
			color: var(--om-gray-850);
			font-variant-numeric: tabular-nums;
		}

		.map-panel-body {
			min-height: 0;
		}

		.map-panel-key {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			column-gap: var(--om-space-s);
		}

		.map-panel-key--triple {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			margin-top: var(--om-space-s);
		}

		.map-panel-key-slot {
			min-width: 0;
		}

		.map-panel-key-item {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 1px;
			text-align: center;
		}

		.map-panel-key-label {
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

		.map-panel-key-item strong {
			font-size: 12px;
			font-weight: 800;
			line-height: 1.2;
			font-variant-numeric: tabular-nums;
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

		.variant-swatch {
			width: 9px;
			height: 9px;
			border-radius: 999px;
			flex-shrink: 0;
			box-shadow: 0 0 0 1px rgb(46 43 59 / 0.08);
		}

		.country-panel {
			background: var(--left-panel-surface);
		}

		.dashboard-shell.map-mode {
			min-height: 100vh;
		}

		p,
		h2 {
			margin: 0;
		}

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

	.picker-flag {
		display: grid;
		width: 24px;
		place-items: center;
		font-size: 18px;
		line-height: 1;
		flex-shrink: 0;
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

	.country-panel {
		left: var(--screen-inset);
		right: auto;
		bottom: var(--bottom-inset);
		display: flex;
		width: min(360px, calc(100vw - 48px));
		max-height: min(340px, calc(100vh - 140px));
		height: auto;
		flex-direction: column;
		overflow: hidden;
	}

	.country-panel.drawer-open {
		top: auto;
		bottom: var(--results-drawer-bottom);
		left: var(--screen-inset);
		width: calc(var(--results-drawer-left-edge) - (2 * var(--screen-inset)));
		max-width: calc(var(--results-drawer-left-edge) - (2 * var(--screen-inset)));
		height: calc((100vh - var(--results-drawer-top) - var(--results-drawer-bottom)) / 2);
		max-height: none;
	}

	.country-name-heading {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0;
		min-width: 0;
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

	.detail-heading .panel-action,
	.panel-actions-row .panel-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
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

	.panel-actions-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.panel-actions-row .panel-action.primary {
		background: var(--om-gray-900);
		color: var(--om-white);
	}

	.detail-heading .panel-action:hover,
	.panel-actions-row .panel-action:hover {
		border-color: color-mix(in srgb, var(--om-teal-600) 42%, transparent);
		background: color-mix(in srgb, var(--om-teal-100) 60%, var(--om-white));
		color: var(--om-teal-700);
	}

	.country-detail {
		display: flex;
		flex-direction: column;
		gap: 8px;
		overflow: auto;
		padding: 10px 12px 12px;
	}

	.country-panel-header {
		flex-shrink: 0;
		padding: 14px 14px 10px;
		border-bottom: 1px solid color-mix(in srgb, var(--om-teal-600) 10%, var(--om-gray-400) 28%);
		background: color-mix(in srgb, var(--om-teal-100) 18%, transparent);
	}

	.country-panel-titleblock {
		flex-direction: column;
		align-items: flex-start;
		gap: 3px;
		min-width: 0;
	}

	.country-panel .detail-heading .country-name-heading,
	.country-panel .dataset-panel-title h2 {
		font-size: 17px;
		line-height: 1.15;
	}

	.dataset-panel-title {
		flex-wrap: wrap;
		gap: 8px;
	}

	.dataset-panel-title h2 {
		margin: 0;
		font-family: 'Rubik', 'Inter', system-ui, sans-serif;
		font-size: 17px;
		font-weight: 700;
		line-height: 1.15;
		color: var(--om-gray-850);
	}

	.detail-card {
		border: 0;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
		padding: 0 0 4px;
	}

		.detail-card-label,
		.detail-section p {
			display: block;
			margin: 0 0 7px;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--om-teal-700);
	}

		.detail-section {
			margin: 0;
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

		.meta-dataset {
			border-radius: var(--om-radius-m);
			background: transparent;
		padding: 0;
	}

	.meta-dataset.compact {
		padding: 10px 11px;
	}

		.meta-dataset-title-row {
			display: flex;
			align-items: center;
		flex-wrap: wrap;
		gap: 6px 8px;
	}

		.meta-release {
			border-radius: 999px;
			background: color-mix(in srgb, var(--om-teal-100) 72%, var(--om-white));
		padding: 2px 7px;
		font-size: 9px;
		font-weight: 700;
		line-height: 1.35;
		color: var(--om-teal-700);
		white-space: nowrap;
	}

	.meta-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
		margin-top: 10px;
		padding-top: 0;
		border-top: 0;
	}

	.meta-grid-flush {
		margin-top: 0;
		padding-top: 0;
		border-top: 0;
	}

	.meta-grid > div {
		border-radius: var(--om-radius-s);
		border: 0;
		background: color-mix(in srgb, var(--om-teal-100) 24%, transparent);
		padding: 6px 8px;
	}

	.meta-grid dt {
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--om-gray-600);
	}

	.meta-grid dd {
		margin: 2px 0 0;
		font-size: 12px;
		font-weight: 700;
		line-height: 1.2;
		color: var(--om-gray-850);
	}

	.country-source-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 8px;
	}

	.source-chip {
		display: inline-flex;
		max-width: 100%;
		align-items: center;
		gap: 6px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--om-white) 90%, transparent);
		border: 1px solid color-mix(in srgb, var(--om-gray-400) 36%, transparent);
		padding: 4px 8px 4px 5px;
		font-size: 11px;
		font-weight: 700;
		color: var(--om-gray-850);
	}

	.source-chip img,
	.source-chip > span {
		display: grid;
		width: 22px;
		height: 22px;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 6px;
		background: color-mix(in srgb, var(--om-teal-100) 54%, var(--om-white));
		font-size: 9px;
		font-weight: 800;
		object-fit: contain;
	}

	.detail-context {
		margin: 0;
		font-size: 11px;
		font-weight: 500;
		line-height: 1.35;
		color: var(--om-gray-600);
	}

	.detail-list {
		display: grid;
		gap: 2px;
		margin-top: 0;
	}

	.detail-list-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--om-space-s);
		align-items: center;
		border: 0;
		border-radius: var(--om-radius-s);
		background: transparent;
		padding: 6px 8px;
		font-family: 'Inter', system-ui, sans-serif;
		font-size: 12px;
		font-weight: 600;
		line-height: 1.3;
		color: var(--om-gray-850);
		text-align: left;
		cursor: pointer;
	}

		.detail-list-row:hover {
			background: color-mix(in srgb, var(--om-teal-100) 62%, var(--om-white));
		}

	.detail-list-row span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

		.detail-list-row strong {
			font-size: 12px;
			font-weight: 800;
		font-variant-numeric: tabular-nums;
		color: var(--om-gray-700);
	}

	.country-panel .dataset-logo {
		width: 52px;
		height: 28px;
		border: 1px solid color-mix(in srgb, var(--om-gray-400) 28%, transparent);
		background: color-mix(in srgb, var(--om-white) 92%, transparent);
	}

	.country-panel .dataset-logo img {
		max-width: 46px;
		max-height: 22px;
	}

	.country-panel .dataset-logo > span {
		font-size: 16px;
	}

	.country-panel .dataset-logo > span {
		font-size: 16px;
	}

	.database-scroll {
		display: grid;
		gap: var(--om-space-s);
		padding: 0 var(--om-space-m) var(--om-space-m);
		overflow-y: auto;
		flex: 1 1 auto;
		min-height: 0;
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
		text-decoration: none;
		color: inherit;
	}

	.database-row-title-row {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	:global(.database-row-external) {
		flex-shrink: 0;
		width: 12px;
		height: 12px;
		color: var(--om-gray-600);
		opacity: 0.72;
	}

	.database-row:hover :global(.database-row-external),
	.database-row.active :global(.database-row-external) {
		color: var(--om-gray-850);
		opacity: 1;
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
		flex: 1 1 auto;
		min-width: 0;
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

	.database-row-desc {
		display: block;
		margin-top: 4px;
		font-size: 11px;
		font-weight: 500;
		line-height: 1.45;
		color: var(--om-gray-600);
		white-space: normal;
		word-break: break-word;
	}

	.map-dashboard-panel--right .dataset-logo {
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

	.map-dashboard-panel--right .dataset-logo img {
		max-width: 58px;
		max-height: 26px;
		object-fit: contain;
	}

	.map-dashboard-panel--right .dataset-logo > span {
		font-size: 22px;
		line-height: 1;
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
			.country-panel {
				top: auto;
				left: var(--screen-inset);
			right: var(--screen-inset);
			bottom: var(--bottom-inset);
			max-height: 38vh;
			height: auto;
			transform: none;
		}

		}

		@media (max-width: 700px) {
			.dashboard-shell {
				--screen-inset: 12px;
				--bottom-inset: 20px;
			}

			.country-panel {
				left: var(--screen-inset);
				right: var(--screen-inset);
				bottom: var(--bottom-inset);
				width: auto;
			}
		}
	</style>
