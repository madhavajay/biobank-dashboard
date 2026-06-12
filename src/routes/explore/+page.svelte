<script lang="ts">
	import VariantBrowser from '$lib/components/widgets/VariantBrowser.svelte';
	import { lang, tr } from '$lib/i18n';
	let { data } = $props();
</script>

<svelte:head><title>{tr($lang, 'explore')} · {data.tenant.name}</title></svelte:head>

<div class="mb-6">
	<h1 class="text-3xl font-bold tracking-tight">{tr($lang, 'explore')} <span class="brand-text">{data.tenant.name}</span></h1>
	<p class="text-muted-foreground">{data.tenant.scope ? tr($lang, 'exploreScopeOne') : tr($lang, 'exploreScopeAll')}</p>
</div>

<VariantBrowser
	forceTenant={data.forceTenant}
	scoped={!!data.tenant.scope}
	options={data.options}
	populations={data.populations}
	initialQuery={data.q}
	showGenotypeCounts={data.showGenotypeCounts}
/>
