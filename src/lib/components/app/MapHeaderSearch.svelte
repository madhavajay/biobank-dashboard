<script lang="ts">
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { onMount } from 'svelte'
	import SearchIcon from '@lucide/svelte/icons/search'

	type Population = {
		name: string
		country?: string
		countryCode?: string
		countryCodes?: string[]
		sampleCount?: number
		variantCount?: number
		biobankName: string
		countryMappings?: Array<{
			country: string
			countryCode: string
			sampleCount: number
		}>
	}

	type Dashboard = {
		populations?: Population[]
	}

	type CountryRow = {
		code: string
		name: string
		samples: number
		variants: number
		sources: string[]
	}

	let { dashboard = undefined }: { dashboard?: Dashboard } = $props()

	let selectedCode = $state<string | null>(null)
	let searchQuery = $state('')
	let countryPickerOpen = $state(false)
	let lastUrlQuery = ''
	let exploreSearchTimer: ReturnType<typeof setTimeout> | undefined

	$effect(() => {
		const urlQuery = page.url.searchParams.get('q') ?? ''
		if (urlQuery === lastUrlQuery) return
		lastUrlQuery = urlQuery
		searchQuery = urlQuery
	})

	onMount(() => {
		const onExploreQueryChange = (event: Event) => {
			const detail = (event as CustomEvent<{ q?: string }>).detail
			const nextQuery = detail?.q ?? new URLSearchParams(location.search).get('q') ?? ''
			lastUrlQuery = nextQuery
			searchQuery = nextQuery
		}
		window.addEventListener('biovault:explore-query-change', onExploreQueryChange)
		return () => {
			window.removeEventListener('biovault:explore-query-change', onExploreQueryChange)
			clearTimeout(exploreSearchTimer)
		}
	})

	const countryRows = $derived.by<CountryRow[]>(() => {
		const byCode = new Map<string, CountryRow>()
		const populations = dashboard?.populations ?? []

		function upsert(
			code: string,
			name: string,
			samples: number,
			variants: number,
			source: string
		) {
			if (!code || code === 'XK') return
			const existing = byCode.get(code)
			if (existing) {
				existing.samples += samples
				existing.variants = Math.max(existing.variants, variants)
				if (!existing.sources.includes(source)) existing.sources.push(source)
			} else {
				byCode.set(code, { code, name, samples, variants, sources: [source] })
			}
		}

		for (const population of populations) {
			const codes = population.countryCode ? [population.countryCode] : (population.countryCodes ?? [])
			for (const code of codes) {
				upsert(
					code,
					population.country ?? population.name,
					population.sampleCount ?? 0,
					population.variantCount ?? 0,
					population.biobankName
				)
			}
		}

		const directCountryCodes = new Set(
			populations
				.filter((population) => population.countryCode && population.countryCode !== 'XK')
				.map((population) => population.countryCode!)
		)

		for (const population of populations) {
			for (const mapping of population.countryMappings ?? []) {
				if (directCountryCodes.has(mapping.countryCode)) continue
				upsert(
					mapping.countryCode,
					mapping.country,
					mapping.sampleCount,
					population.variantCount ?? 0,
					population.name
				)
			}
		}

		return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name))
	})

	const selectedCountry = $derived(
		selectedCode ? (countryRows.find((country) => country.code === selectedCode) ?? null) : null
	)

	const closeCountryPickerOnOutsideClick = (node: HTMLElement) => {
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

	function countryFlagEmoji(code: string) {
		const normalized = code.trim().toUpperCase()
		if (normalized.length !== 2 || !/^[A-Z]{2}$/.test(normalized)) return '🌐'
		return [...normalized]
			.map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65))
			.join('')
	}

	function normalizeSearch(value: string) {
		return value.trim().toLowerCase()
	}

	function findCountryMatch(query: string) {
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

	function isLocationQuery(query: string, country: CountryRow) {
		const q = normalizeSearch(query)
		return (
			q === normalizeSearch(country.name) ||
			q === normalizeSearch(country.code) ||
			q === 'caribbean'
		)
	}

	function findPopulationMatch(query: string) {
		const q = normalizeSearch(query)
		if (!q) return undefined
		return (dashboard?.populations ?? []).find((population) => normalizeSearch(population.name) === q)
	}

	function pickCountry(country: CountryRow) {
		selectedCode = country.code
		countryPickerOpen = false
	}

	function pickAllCountries() {
		selectedCode = null
		countryPickerOpen = false
	}

	function handleSearchSubmit(event: SubmitEvent) {
		event.preventDefault()
		const trimmed = searchQuery.trim()
		lastUrlQuery = trimmed
		clearTimeout(exploreSearchTimer)

		if (page.url.pathname.startsWith('/explore')) {
			window.dispatchEvent(
				new CustomEvent('biovault:header-search-query', {
					detail: { q: trimmed, immediate: true },
				})
			)
			return
		}

		const params = new URLSearchParams()
		const countryMatch = trimmed ? findCountryMatch(trimmed) : undefined
		const populationMatch = trimmed ? findPopulationMatch(trimmed) : undefined

		if (countryMatch && isLocationQuery(trimmed, countryMatch)) {
			params.set('country', countryMatch.code)
		} else if (populationMatch?.countryCode) {
			params.set('country', populationMatch.countryCode)
		} else {
			if (selectedCode) params.set('country', selectedCode)
			if (trimmed) params.set('q', trimmed)
		}

		void goto(`/explore${params.toString() ? `?${params.toString()}` : ''}`)
	}

	function handleSearchInput(event: Event) {
		const input = event.currentTarget
		if (!(input instanceof HTMLInputElement)) return
		searchQuery = input.value
		if (!page.url.pathname.startsWith('/explore')) return
		clearTimeout(exploreSearchTimer)
		exploreSearchTimer = setTimeout(() => {
			window.dispatchEvent(
				new CustomEvent('biovault:header-search-query', {
					detail: { q: searchQuery, immediate: false },
				})
			)
		}, 500)
	}
</script>

<form
	method="GET"
	action="/explore"
	class="map-header-search"
	onsubmit={handleSearchSubmit}
>
	<div class="map-search-cluster">
		<input
			bind:value={searchQuery}
			oninput={handleSearchInput}
			list="map-header-search-suggestions"
			name="q"
			placeholder="Search variants, genes, rsIDs, regions, or HGVS consequences"
		/>
		<datalist id="map-header-search-suggestions">
			{#each countryRows as country}
				<option value={country.name}>{country.code} · {country.samples.toLocaleString()} samples</option>
			{/each}
			<option value="Caribbean">Region</option>
			<option value="BRCA1">Gene</option>
			<option value="rs1050828">rsID</option>
			<option value="chr17:43078520">Position</option>
		</datalist>
		<button type="submit" class="map-search-submit" aria-label="Search">
			<SearchIcon class="size-[18px]" aria-hidden="true" />
		</button>
	</div>
</form>

<style>
	.map-header-search {
		position: relative;
		z-index: 3;
		width: 100%;
		--search-control-height: 40px;
	}

	.map-search-cluster {
		display: flex;
		width: 100%;
		min-width: 0;
		align-items: center;
		overflow: hidden;
		border: 1px solid color-mix(in srgb, var(--om-gray-400) 38%, transparent);
		border-radius: 10px;
		background: color-mix(in srgb, var(--om-white) 96%, transparent);
		box-shadow: 0 1px 2px rgb(39 37 50 / 0.04);
		backdrop-filter: blur(12px);
	}

	.map-header-search input,
	.map-search-submit {
		box-sizing: border-box;
		height: var(--search-control-height);
		margin: 0;
		border: 0;
		font-family: inherit;
	}

	.map-header-search input {
		min-width: 0;
		flex: 1;
		border-radius: 10px 0 0 10px;
		background: transparent;
		padding: 0 14px;
		color: var(--om-gray-850);
		font-size: 13px;
		outline: none;
	}

	.map-header-search input::placeholder {
		color: color-mix(in srgb, var(--om-gray-550) 88%, transparent);
	}

	.map-search-submit {
		display: grid;
		flex-shrink: 0;
		width: var(--search-control-height);
		place-items: center;
		border-radius: 0 10px 10px 0;
		background: var(--primary);
		padding: 0;
		color: var(--primary-foreground);
		cursor: pointer;
	}

	.map-search-submit:hover {
		background: color-mix(in oklch, var(--primary) 88%, black);
	}

	@media (max-width: 980px) {
		.map-header-search input {
			font-size: 12.5px;
		}
	}

	@media (max-width: 700px) {
		.map-header-search {
			--search-control-height: 38px;
		}
	}
</style>
