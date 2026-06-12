<script lang="ts">
	import GeoMap from '$lib/components/widgets/GeoMap.svelte';
	import VariantBrowser from '$lib/components/widgets/VariantBrowser.svelte';
	import Stat from '$lib/components/widgets/Stat.svelte';

	let { data } = $props();
	const tenant = $derived(data.tenant);
	const bank = $derived(data.biobanks[0]);
	const pins = $derived((bank?.populations ?? []).map((p: any) => ({ ...p, biobankSlug: bank.slug, biobankName: bank.name })));
	let selected = $state<string>('');
</script>

<section class="relative mb-8 overflow-hidden rounded-[var(--radius)] border brand-gradient text-white">
	<div class="relative grid gap-6 p-6 sm:p-10 lg:grid-cols-[1fr_1fr] lg:items-center">
		<div>
			<div class="text-5xl">{tenant.logoEmoji}</div>
			<h1 class="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">{tenant.name}</h1>
			<p class="mt-2 text-lg text-white/90">{tenant.tagline}</p>
			<p class="mt-4 max-w-md text-sm text-white/80">Allele frequencies across {pins.length} Caribbean nations, {bank?.totalVariants.toLocaleString()} variants on GRCh38, with GA4GH VRS identifiers and a Beacon v2 endpoint.</p>
			<a href="/explore" class="mt-5 inline-block rounded-md bg-white px-4 py-2 text-sm font-semibold text-foreground shadow-sm">Explore the data</a>
		</div>
		<div class="rounded-[var(--radius)] bg-white/95 p-2 shadow-xl">
			<GeoMap {pins} center={tenant.map.center} zoom={tenant.map.zoom} onselect={(p) => (selected = `${p.cohortId}`)} />
		</div>
	</div>
</section>

<div class="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
	<Stat label="Island nations" value={pins.length} />
	<Stat label="Samples" value={bank?.totalSamples.toLocaleString() ?? '0'} />
	<Stat label="Variants" value={bank?.totalVariants.toLocaleString() ?? '0'} />
	<Stat label="Genome build" value="GRCh38" sub="anchor assembly" />
</div>

<h2 class="mb-3 text-lg font-semibold">Populations</h2>
<div class="mb-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
	{#each pins as p}
		<div class="card-surface p-4">
			<div class="flex items-center justify-between">
				<span class="font-semibold">{p.name}</span>
				<span class="rounded-full px-2 py-0.5 text-xs" style="background:color-mix(in oklch, var(--primary) 14%, transparent); color:var(--primary)">{p.countryCode}</span>
			</div>
			<div class="mt-2 flex gap-4 text-sm text-muted-foreground">
				<span><b class="text-foreground">{p.sampleCount.toLocaleString()}</b> samples</span>
				<span><b class="text-foreground">{p.variantCount.toLocaleString()}</b> variants</span>
			</div>
		</div>
	{/each}
</div>

<VariantBrowser forceTenant={data.forceTenant} scoped title="CariGenetics variant browser" subtitle="Caribbean allele frequencies by rsID, region, or position." />
