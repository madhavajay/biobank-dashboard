<script lang="ts">
	import BioVaultHome from '$lib/templates/BioVaultHome.svelte';
	import AtlasHome from '$lib/templates/AtlasHome.svelte';

	let { data } = $props();
	const templates: Record<string, any> = {
		biovault: BioVaultHome,
		carigenetics: AtlasHome,
		bipmed: AtlasHome,
		'pgp-harvard': AtlasHome
	};
	const Template = $derived(templates[data.tenant.slug] ?? BioVaultHome);
</script>

<svelte:head>
	<title>{data.tenant.name} · {data.tenant.product}</title>
	<meta name="description" content={data.tenant.tagline} />
</svelte:head>

<Template {data} />
