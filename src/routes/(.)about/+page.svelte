<script lang="ts">
	import AboutPageContent from '$lib/components/pages/AboutPageContent.svelte'
	import { lang, tr } from '$lib/i18n'

	let { data } = $props()
</script>

<svelte:head><title>{tr($lang, 'aboutHeading')} · {data.tenant.name}</title></svelte:head>

<AboutPageContent {data} />
