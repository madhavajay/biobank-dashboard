<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>About · {data.tenant.name}</title></svelte:head>

<div class="mx-auto max-w-2xl py-6">
	<h1 class="text-3xl font-bold tracking-tight">About <span class="brand-text">{data.tenant.name}</span></h1>
	<p class="mt-3 text-muted-foreground">{data.tenant.tagline}</p>

	<div class="card-surface mt-6 p-6 text-sm text-muted-foreground">
		<p>This page is a placeholder — add the {data.tenant.name} description, team, citation, and data-use details here.</p>
	</div>
</div>
