<script lang="ts">
	import ContactPageContent from '$lib/components/pages/ContactPageContent.svelte'
	import { lang, tr } from '$lib/i18n'

	let { data } = $props()
</script>

<svelte:head><title>{tr($lang, 'contact')} · {data.tenant.name}</title></svelte:head>

<ContactPageContent {data} />
