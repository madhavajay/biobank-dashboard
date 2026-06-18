<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { datasetMapHref } from '$lib/map-links';

	let { data } = $props();

	const dataset = $derived(data.dataset);
	const fmt = (value: number | null | undefined) => Number(value ?? 0).toLocaleString();
	const mapHref = $derived(datasetMapHref(dataset.slug));
	const exploreHref = $derived(`/explore?dataset=${encodeURIComponent(dataset.slug)}`);
</script>

<svelte:head>
	<title>{dataset.title} · Datasets · BioVault</title>
	<meta name="description" content={dataset.description} />
</svelte:head>

<div class="mb-6 border-b pb-5">
	<a href={`/sources/${dataset.biobankSlug}`} class="mb-3 inline-flex text-sm font-medium text-muted-foreground hover:text-primary">
		{dataset.biobankName}
	</a>
	<div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">{dataset.title}</h1>
			<p class="mt-2 max-w-3xl text-muted-foreground">{dataset.description}</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button href={mapHref} variant="outline" size="lg">
				View on map
			</Button>
			<Button href={exploreHref} size="lg">
				Open in Explorer
			</Button>
		</div>
	</div>
</div>

<div class="grid gap-4 md:grid-cols-4">
	<Card.Root size="sm">
		<Card.Content>
			<div class="text-xs text-muted-foreground">Source</div>
			<a href={`/sources/${dataset.biobankSlug}`} class="mt-1 block text-lg font-semibold hover:text-primary hover:underline">{dataset.biobankName}</a>
		</Card.Content>
	</Card.Root>
	<Card.Root size="sm">
		<Card.Content>
			<div class="text-xs text-muted-foreground">Samples</div>
			<div class="mt-1 text-2xl font-bold">{fmt(dataset.participants)}</div>
		</Card.Content>
	</Card.Root>
	<Card.Root size="sm">
		<Card.Content>
			<div class="text-xs text-muted-foreground">Variants</div>
			<div class="mt-1 text-2xl font-bold">{fmt(dataset.variants)}</div>
		</Card.Content>
	</Card.Root>
	<Card.Root size="sm">
		<Card.Content>
			<div class="text-xs text-muted-foreground">Cohorts</div>
			<div class="mt-1 text-2xl font-bold">{dataset.cohortIds.length}</div>
		</Card.Content>
	</Card.Root>
</div>

<div class="mt-8 grid gap-4 lg:grid-cols-[1fr_1fr]">
<Card.Root>
	<Card.Header>
		<Card.Title>Explore this dataset</Card.Title>
		<Card.Description>
			Search variants while keeping this dataset selected.
		</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		<div class="grid gap-2 text-sm sm:grid-cols-2">
			<div class="rounded-md border bg-muted/30 p-3">
				<div class="text-xs uppercase tracking-wide text-muted-foreground">Dataset filter</div>
				<div class="mt-1 font-semibold">{dataset.slug}</div>
			</div>
			<div class="rounded-md border bg-muted/30 p-3">
				<div class="text-xs uppercase tracking-wide text-muted-foreground">Available search</div>
				<div class="mt-1 font-semibold">gene, rsID, position, consequence</div>
			</div>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button href={exploreHref}>Open filtered Explorer</Button>
			<Button href={`/sources/${dataset.biobankSlug}`} variant="outline">Biobank profile</Button>
		</div>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Map context</Card.Title>
		<Card.Description>
			Open this dataset on the BioVault map, then move directly into Explorer with the same dataset selected.
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="text-sm text-muted-foreground">
			{#if dataset.biobankSlug === 'bipmed'}
				BIPMed WES maps to the Brazil cohort. Brazilian states are shown as atlas context; current variant filtering remains cohort-level.
			{:else}
				The map view focuses the geographic coverage for this dataset.
			{/if}
		</div>
		<Button href={mapHref}>View dataset on map</Button>
	</Card.Content>
</Card.Root>
</div>

<Card.Root class="mt-8">
	<Card.Header>
		<Card.Title>Dataset metadata</Card.Title>
	</Card.Header>
	<Card.Content>
		<dl class="grid gap-4 text-sm md:grid-cols-3">
			<div>
				<dt class="text-xs uppercase tracking-wide text-muted-foreground">Assay</dt>
				<dd class="mt-1 font-medium">{dataset.assay || '-'}</dd>
			</div>
			<div>
				<dt class="text-xs uppercase tracking-wide text-muted-foreground">Release</dt>
				<dd class="mt-1 font-medium">{dataset.release || '-'}</dd>
			</div>
			<div>
				<dt class="text-xs uppercase tracking-wide text-muted-foreground">Genome build</dt>
				<dd class="mt-1 font-medium">{dataset.genomeBuild || '-'}</dd>
			</div>
		</dl>
	</Card.Content>
</Card.Root>
