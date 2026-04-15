<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="portal-frame bg-background text-foreground">
	<main class="portal-main">
		{@render children()}
	</main>
</div>
