<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Contact · {data.tenant.name}</title></svelte:head>

<div class="mx-auto max-w-2xl py-6">
	<h1 class="text-3xl font-bold tracking-tight">Contact</h1>
	<p class="mt-3 text-muted-foreground">Get in touch with the {data.tenant.name} team.</p>

	<div class="card-surface mt-6 p-6 text-sm text-muted-foreground">
		<p>This page is a placeholder — add contact details, a form, or data-access request info here.</p>
	</div>
</div>
