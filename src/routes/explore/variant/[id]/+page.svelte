<script lang="ts">
	import { page } from '$app/state';
	import VariantDetailPage from '$lib/components/app/VariantDetailPage.svelte';

	let { data } = $props();
	const isBioVault = $derived(page.data.tenant?.slug === 'biovault');
</script>

{#if !isBioVault}
	<VariantDetailPage {data} part="all" />
{/if}
