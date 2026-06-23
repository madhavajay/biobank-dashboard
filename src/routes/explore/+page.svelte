<script lang="ts">
	import { page } from '$app/state';
	import VariantBrowser from '$lib/components/widgets/VariantBrowser.svelte';
	import { lang, tr } from '$lib/i18n';

	let { data } = $props();
</script>

<svelte:head><title>{tr($lang, 'explore')} · {data.tenant.name}</title></svelte:head>

<VariantBrowser
	forceTenant={data.forceTenant}
	scoped={!!data.tenant.scope}
	options={data.options}
	populations={data.populations}
	initialParams={page.url.searchParams.toString()}
	showGenotypeCounts={data.showGenotypeCounts}
	display={data.display}
	showTitle={false}
/>
