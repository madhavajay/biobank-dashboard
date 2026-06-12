<script lang="ts">
	import GeoMap from '$lib/components/widgets/GeoMap.svelte';
	import VariantBrowser from '$lib/components/widgets/VariantBrowser.svelte';
	import Stat from '$lib/components/widgets/Stat.svelte';
	import { TENANTS } from '$lib/tenants';

	let { data } = $props();
	const tenant = $derived(data.tenant);
	const banks = $derived(data.biobanks);

	const pins = $derived(
		banks.flatMap((b: any) =>
			b.populations.map((p: any) => ({ ...p, biobankSlug: b.slug, biobankName: b.name }))
		)
	);
	const totalSamples = $derived(pins.reduce((s: number, p: any) => s + p.sampleCount, 0));
	const totalVariants = $derived(banks.reduce((s: number, b: any) => s + b.totalVariants, 0));

	const tenantFor = (slug: string) => TENANTS.find((t) => t.slug === slug);
	const go = (slug: string) => `/?tenant=${slug}`;
</script>

<section class="relative mb-8 overflow-hidden rounded-[var(--radius)] border">
	<div class="hero-glow absolute inset-0"></div>
	<div class="relative grid gap-6 p-6 sm:p-9">
		<div class="max-w-3xl">
			<span class="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
				<span class="size-2 rounded-full brand-gradient"></span> Global allele-frequency network
			</span>
			<h1 class="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
				One window into <span class="brand-text">population genomics</span>.
			</h1>
			<p class="mt-3 max-w-xl text-muted-foreground">{tenant.tagline} Browse {banks.length} biobanks across {pins.length} populations, or open any biobank's own themed portal, all served by the same API.</p>
			<div class="mt-5 flex flex-wrap gap-2">
				<a href="/explore" class="brand-gradient cursor-pointer rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm">Explore variants</a>
				<a href="/api/biobanks" class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">View the API</a>
			</div>
		</div>
		<div class="-mx-6 -mb-6 h-[360px] overflow-hidden border-t sm:-mx-9 sm:-mb-9 sm:h-[440px] lg:h-[520px]">
			<GeoMap
				{pins}
				center={tenant.map.center}
				zoom={tenant.map.zoom}
				showMatchedDots
				framed={false}
				onselect={(p) => (location.href = go(p.biobankSlug))}
			/>
		</div>
	</div>
</section>

<div class="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
	<Stat label="Biobanks" value={banks.length} />
	<Stat label="Populations" value={pins.length} />
	<Stat label="Samples" value={totalSamples.toLocaleString()} />
	<Stat label="Variants" value={totalVariants.toLocaleString()} />
</div>

<h2 class="mb-3 text-lg font-semibold">Biobanks in the network</h2>
<div class="mb-9 grid gap-3 sm:grid-cols-2">
	{#each banks as b}
		{@const t = tenantFor(b.slug)}
		<a href={go(b.slug)} class="card-surface group flex items-center gap-4 p-4 transition hover:shadow-md">
			<span
				class="flex h-14 w-28 shrink-0 items-center justify-center rounded-md border bg-white p-2 shadow-sm"
				style={`border-color:color-mix(in oklch, ${t?.theme.primary ?? 'var(--primary)'} 28%, transparent)`}
			>
				{#if t?.logoImg}
					<img src={t.logoImg} alt={t.name} class="max-h-full max-w-full object-contain" />
				{:else}
					<span class="text-2xl">{t?.logoEmoji ?? '🧬'}</span>
				{/if}
			</span>
			<div class="min-w-0 flex-1">
				<div class="flex items-center justify-between">
					<span class="font-semibold">{b.name}</span>
					<span class="text-xs text-muted-foreground group-hover:text-primary">open portal →</span>
				</div>
				<p class="truncate text-sm text-muted-foreground">{b.description}</p>
				<div class="mt-1 flex gap-3 text-xs text-muted-foreground">
					<span>{b.populations.length} pops</span>
					<span>{b.totalSamples.toLocaleString()} samples</span>
					<span>{b.totalVariants.toLocaleString()} variants</span>
				</div>
			</div>
		</a>
	{/each}
</div>

<VariantBrowser
	forceTenant={data.forceTenant}
	title="Global variant browser"
	subtitle="Search across every biobank in the network."
	options={banks.map((b: any) => ({ slug: b.slug, name: b.name }))}
/>
