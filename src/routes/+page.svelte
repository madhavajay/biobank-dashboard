<script lang="ts">
	import AtlasHome from '$lib/templates/AtlasHome.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.tenant.name} · {data.tenant.product}</title>
	<meta name="description" content={data.tenant.tagline} />
</svelte:head>

{#if data.tenant.slug !== 'biovault'}
	<AtlasHome {data} />
{/if}
