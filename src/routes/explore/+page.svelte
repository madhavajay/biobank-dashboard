<script lang="ts">
	import { page } from '$app/state';
	import VariantBrowser from '$lib/components/widgets/VariantBrowser.svelte';
	import { lang, tr } from '$lib/i18n';

	let { data } = $props();
	const isBioVault = $derived(page.data.tenant?.slug === 'biovault');
</script>

{#if !isBioVault}
	<h1 class="mb-4 text-2xl font-bold">{tr($lang, 'explore')}</h1>
	<VariantBrowser
		forceTenant={data.forceTenant}
		scoped={!!data.tenant?.scope}
		options={data.options ?? []}
		populations={data.populations ?? []}
		showGenotypeCounts={data.showGenotypeCounts}
		display={data.display}
	/>
{/if}
