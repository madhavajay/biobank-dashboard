<script lang="ts">
	import GeoMap from '$lib/components/widgets/GeoMap.svelte';
	import VariantBrowser from '$lib/components/widgets/VariantBrowser.svelte';
	import Stat from '$lib/components/widgets/Stat.svelte';

	let { data } = $props();
	const tenant = $derived(data.tenant);
	const bank = $derived(data.biobanks[0]);
	const pins = $derived((bank?.populations ?? []).map((p: any) => ({ ...p, biobankSlug: bank.slug, biobankName: bank.name })));
</script>

<section class="mb-8 grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-center">
	<div class="relative overflow-hidden rounded-[var(--radius)] border p-6 sm:p-9">
		<div class="hero-glow absolute inset-0"></div>
		<div class="relative">
			<span class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold" style="background:color-mix(in oklch, var(--accent) 22%, transparent)">
				{tenant.logoEmoji} Brazilian Initiative on Precision Medicine
			</span>
			<h1 class="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
				Variantes da <span class="brand-text">população brasileira</span>
			</h1>
			<p class="mt-3 max-w-xl text-muted-foreground">{tenant.tagline} A reference of allele frequencies from Brazil, lifted to GRCh38 and harmonized into the same engine that powers every BioVault portal.</p>
			<a href="/explore" class="brand-gradient mt-5 inline-block rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm">Explorar variantes</a>
		</div>
	</div>
	<GeoMap {pins} center={tenant.map.center} zoom={tenant.map.zoom} />
</section>

<div class="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
	<Stat label="Participants" value={bank?.totalSamples.toLocaleString() ?? '0'} sub="cohort allele counts" />
	<Stat label="Variants" value={bank?.totalVariants.toLocaleString() ?? '0'} sub="lifted hg19 → GRCh38" />
	<Stat label="Cohorts" value={bank?.populations.length ?? 0} sub="SNP-array (WGS soon)" />
	<Stat label="Assay" value="SNP 6.0" sub="Affymetrix array" />
</div>

<div class="mb-9 card-surface p-5">
	<h2 class="text-base font-semibold">About this dataset</h2>
	<p class="mt-1 text-sm text-muted-foreground">
		Allele counts (AC/AN) are computed over the full {bank?.totalSamples ?? 203}-participant SNP-array cohort from Brazil.
		Coordinates were lifted from GRCh37 to GRCh38 during harmonization so variants align with every other biobank in the network.
		Genotype-level counts are withheld for privacy; population frequencies remain available.
	</p>
</div>

<VariantBrowser forceTenant={data.forceTenant} scoped title="BIPMed variant browser" subtitle="Pesquise por rsID, região ou posição (GRCh38)." />
