<script lang="ts">
	import VariantDetailPage from '$lib/components/app/VariantDetailPage.svelte';

	let { data } = $props();
</script>

<VariantDetailPage {data} part="all" />
