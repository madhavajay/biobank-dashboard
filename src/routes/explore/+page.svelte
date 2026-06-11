<script lang="ts">
	import VariantBrowser from '$lib/components/widgets/VariantBrowser.svelte';
	let { data } = $props();
</script>

<svelte:head><title>Explore · {data.tenant.name}</title></svelte:head>

<div class="mb-6">
	<h1 class="text-3xl font-bold tracking-tight">Explore <span class="brand-text">{data.tenant.name}</span></h1>
	<p class="text-muted-foreground">{data.tenant.scope ? 'Variants for this biobank.' : 'Variants across the whole network.'}</p>
</div>

<VariantBrowser
	forceTenant={data.forceTenant}
	scoped={!!data.tenant.scope}
	options={data.options}
	populations={data.populations}
	initialQuery={data.q}
	showGenotypeCounts={data.showGenotypeCounts}
	title="Variant browser"
	subtitle="Search by rsID, region (chr7), or position (1:100000723)."
/>
