<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import GeoMap from '$lib/components/widgets/GeoMap.svelte';
	import brazilStatesUrl from '$lib/data/brazil-states.geojson?url';
	import { lang, tr } from '$lib/i18n';
	import { datasetMapHref, populationMapHref, sourceMapHref } from '$lib/map-links';
	import { TENANTS, themeVars } from '$lib/tenants';

	let { data } = $props();

	const source = $derived(data.source);
	const sourceTenant = $derived(TENANTS.find((tenant) => tenant.slug === source.slug));
	const fmt = (value: number | null | undefined) => Number(value ?? 0).toLocaleString();
	const exploreHref = $derived(`/explore?source=${encodeURIComponent(source.slug)}`);
	const mapHref = $derived(sourceMapHref(source.slug));
	const sourceThemeStyle = $derived(sourceTenant ? themeVars(sourceTenant) : '');
	const isBipmed = $derived(source.slug === 'bipmed');
	const primaryPopulation = $derived(source.populations[0]);
	const atlasPins = $derived(
		primaryPopulation
			? [
					{
						name: primaryPopulation.name,
						country: primaryPopulation.name,
						lat: primaryPopulation.lat,
						lon: primaryPopulation.lon,
						sampleCount: primaryPopulation.sampleCount,
						variantCount: primaryPopulation.variantCount,
						biobankSlug: source.slug,
						biobankName: source.name,
						cohortId: primaryPopulation.cohortId
					}
				]
			: []
	);
</script>

<svelte:head>
	<title>{source.name} · Biobanks · BioVault</title>
	<meta name="description" content={source.description} />
</svelte:head>

<div style={sourceThemeStyle} class="source-profile">
<div class="mb-6 border-b pb-5">
	<a href="/sources" class="mb-3 inline-flex text-sm font-medium text-muted-foreground hover:text-primary">
		Biobanks
	</a>
	<div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
		<div class="flex min-w-0 gap-4">
			<span class="grid size-16 shrink-0 place-items-center rounded-lg border bg-muted/30">
				{#if sourceTenant?.logoImg}
					<img src={sourceTenant.logoImg} alt="" class="max-h-12 max-w-12 object-contain" />
				{:else}
					<span class="text-2xl">{sourceTenant?.logoEmoji ?? 'DB'}</span>
				{/if}
			</span>
			<div class="min-w-0">
				<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">BioVault Biobank</p>
				<h1 class="text-3xl font-bold tracking-tight">{source.name}</h1>
				<p class="mt-2 max-w-3xl text-muted-foreground">{source.description}</p>
			</div>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button href={mapHref} variant="outline" size="lg">
				View on map
			</Button>
			<Button href={exploreHref} size="lg">
				Explore Biobank data
			</Button>
			{#if source.website}
				<Button href={source.website} target="_blank" rel="noreferrer" variant="outline" size="lg">
					Biobank website
				</Button>
			{/if}
		</div>
	</div>
</div>

<nav class="mb-6 flex flex-wrap gap-2 border-b pb-4 text-sm" aria-label={`${source.name} sections`}>
	<a href="#overview" class="rounded-md border bg-muted/30 px-3 py-1.5 font-medium hover:bg-muted">Overview</a>
	<a href="#atlas" class="rounded-md border bg-muted/30 px-3 py-1.5 font-medium hover:bg-muted">Map</a>
	<a href="#datasets" class="rounded-md border bg-muted/30 px-3 py-1.5 font-medium hover:bg-muted">Datasets</a>
	<a href="#populations" class="rounded-md border bg-muted/30 px-3 py-1.5 font-medium hover:bg-muted">Populations</a>
	{#if sourceTenant?.langs?.length}
		<span class="ml-auto inline-flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
			{#each sourceTenant.langs as code}
				<button
					type="button"
					class={`rounded px-2 py-0.5 ${$lang === code ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
					onclick={() => ($lang = code)}
				>
					{code.toUpperCase()}
				</button>
			{/each}
		</span>
	{/if}
</nav>

<div id="overview" class="grid gap-4 scroll-mt-24 md:grid-cols-4">
	<Card.Root size="sm">
		<Card.Content>
			<div class="text-xs text-muted-foreground">Samples</div>
			<div class="mt-1 text-2xl font-bold">{fmt(source.totalSamples)}</div>
		</Card.Content>
	</Card.Root>
	<Card.Root size="sm">
		<Card.Content>
			<div class="text-xs text-muted-foreground">Variants</div>
			<div class="mt-1 text-2xl font-bold">{fmt(source.totalVariants)}</div>
		</Card.Content>
	</Card.Root>
	<Card.Root size="sm">
		<Card.Content>
			<div class="text-xs text-muted-foreground">Datasets</div>
			<div class="mt-1 text-2xl font-bold">{source.datasets.length}</div>
		</Card.Content>
	</Card.Root>
	<Card.Root size="sm">
		<Card.Content>
			<div class="text-xs text-muted-foreground">Populations</div>
			<div class="mt-1 text-2xl font-bold">{source.populations.length}</div>
		</Card.Content>
	</Card.Root>
</div>

<section id="atlas" class="mt-8 scroll-mt-24">
	<div class="mb-3 flex items-center justify-between gap-3">
		<div>
			<h2 class="text-xl font-semibold">{isBipmed ? tr($lang, 'stateAtlas') : 'Map'}</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				{#if isBipmed}
					Brazil state geography is shown as atlas context. Current filtering is cohort-level until state-level participant data is available.
				{:else}
					View this Biobank in the global BioVault map.
				{/if}
			</p>
		</div>
		<Button href={mapHref} variant="outline">View full map</Button>
	</div>
	<Card.Root>
		<Card.Content class="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
			{#if isBipmed && primaryPopulation}
				<div class="min-h-72 overflow-hidden rounded-lg border bg-muted/20">
					<GeoMap
						pins={atlasPins}
						center={[-14.235, -51.925]}
						zoom={4.2}
						source={brazilStatesUrl}
						showDots={false}
						highlightAllFeatures
						showFeatureLabels
					/>
				</div>
				<div class="flex flex-col gap-3">
					<div>
						<div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">BIPMed WES</div>
						<div class="mt-1 text-2xl font-bold">{fmt(primaryPopulation.sampleCount)} participants</div>
						<p class="mt-2 text-sm text-muted-foreground">
							The current database exposes one Brazil cohort. State boundaries are shown for atlas context; state-level frequency filters are not available yet.
						</p>
					</div>
					<div class="rounded-lg border bg-muted/30 p-3 text-sm">
						<div class="font-semibold">Available filters</div>
						<p class="mt-1 text-muted-foreground">
							Use Biobank, dataset, cohort, gene, variant, frequency, and consequence filters in Explorer.
						</p>
					</div>
					<div class="flex flex-wrap gap-2">
						<Button href={exploreHref}>Explore BIPMed variants</Button>
						<Button href={mapHref} variant="outline">View Brazil on map</Button>
					</div>
				</div>
			{:else}
				<div>
					<h3 class="text-base font-semibold">{source.name} on BioVault map</h3>
					<p class="mt-2 text-sm text-muted-foreground">
						Open the map with this Biobank selected, then move between the Biobank, datasets, populations, and Explorer.
					</p>
				</div>
				<div class="flex items-center justify-end">
					<Button href={mapHref}>Open map view</Button>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</section>

<section id="datasets" class="mt-8 scroll-mt-24">
	<div class="mb-3 flex items-center justify-between gap-3">
		<h2 class="text-xl font-semibold">Datasets</h2>
		<Button href={exploreHref} variant="link" class="px-0">Open all in Explorer</Button>
	</div>
	<div class="grid gap-3">
		{#each source.datasets as dataset}
			<Card.Root>
				<Card.Content class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
					<div>
						<a href={`/datasets/${dataset.slug}`} class="font-semibold hover:text-primary hover:underline">{dataset.title}</a>
						<p class="mt-1 text-sm text-muted-foreground">{dataset.description}</p>
						<div class="mt-2 flex flex-wrap gap-2">
							{#if dataset.assay}<Badge variant="outline">{dataset.assay}</Badge>{/if}
							{#if dataset.release}<Badge variant="outline">{dataset.release}</Badge>{/if}
							{#if dataset.genomeBuild}<Badge variant="outline">{dataset.genomeBuild}</Badge>{/if}
						</div>
					</div>
					<div class="flex shrink-0 items-center gap-2">
						<div class="text-right text-sm">
							<div class="font-semibold">{fmt(dataset.participants)} samples</div>
							<div class="text-muted-foreground">{fmt(dataset.variants)} variants</div>
						</div>
						<Button href={datasetMapHref(dataset.slug)} variant="outline">
							Map
						</Button>
						<Button href={`/explore?dataset=${encodeURIComponent(dataset.slug)}`} variant="outline">
							Explore
						</Button>
					</div>
				</Card.Content>
			</Card.Root>
		{/each}
	</div>
</section>

<section id="populations" class="mt-8 scroll-mt-24">
	<h2 class="mb-3 text-xl font-semibold">Populations</h2>
	<div class="grid gap-3 md:grid-cols-2">
		{#each source.populations as population}
			<a href={populationMapHref(population.countryCode, population.cohortId)} class="block">
				<Card.Root class="hover:bg-muted/30">
					<Card.Content class="flex items-center justify-between gap-3">
						<div>
							<div class="font-semibold">{population.name}</div>
							<div class="text-sm text-muted-foreground">{population.countryCode} · cohort {population.cohortId} · View on map</div>
						</div>
						<div class="text-right text-sm">
							<div class="font-semibold">{fmt(population.sampleCount)}</div>
							<div class="text-muted-foreground">samples</div>
						</div>
					</Card.Content>
				</Card.Root>
			</a>
		{/each}
	</div>
</section>
</div>
