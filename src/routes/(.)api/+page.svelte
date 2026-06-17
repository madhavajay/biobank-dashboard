<script lang="ts">
	import ApiPageContent from '$lib/components/pages/ApiPageContent.svelte'

	let { data } = $props()
</script>

<svelte:head><title>API · {data.tenant.name}</title></svelte:head>

<ApiPageContent {data} />
