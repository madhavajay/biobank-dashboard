<script lang="ts">
	import { tenantContent, loc } from '$lib/content';
	import { lang, tr } from '$lib/i18n';
	let { data } = $props();
	const about = $derived(tenantContent(data.tenant.slug)?.about ?? null);
</script>

<svelte:head><title>{tr($lang, 'aboutHeading')} · {data.tenant.name}</title></svelte:head>

<div class="mx-auto max-w-3xl py-6">
	<h1 class="text-3xl font-bold tracking-tight">{tr($lang, 'aboutHeading')} <span class="brand-text">{data.tenant.name}</span></h1>
	<p class="mt-3 text-muted-foreground">{data.tenant.tagline}</p>

	{#if about}
		<p class="mt-6 text-lg leading-relaxed">{loc(about.intro, $lang)}</p>

		<h2 class="mt-8 text-lg font-semibold">{tr($lang, 'researchCenters')}</h2>
		<div class="mt-4 grid gap-3 sm:grid-cols-2">
			{#each about.centers as c}
				<a href={c.url} target="_blank" rel="noopener" class="card-surface flex items-center gap-4 p-4 transition hover:border-primary/40 hover:shadow-sm">
					{#if c.logo}
						<img src={c.logo} alt={c.name} loading="lazy" class="h-10 w-20 shrink-0 object-contain" />
					{/if}
					<span class="min-w-0">
						<span class="block text-sm font-medium leading-snug">{c.name}</span>
						<span class="mt-1 block text-xs text-muted-foreground">{c.coordinator}</span>
					</span>
				</a>
			{/each}
		</div>

		<div class="mt-8 space-y-4 text-sm leading-relaxed text-muted-foreground">
			{#each loc(about.paragraphs, $lang) as p}<p>{p}</p>{/each}
		</div>

		<h2 class="mt-8 text-lg font-semibold">{tr($lang, 'references')}</h2>
		<div class="mt-3 flex flex-wrap gap-2">
			{#each about.references as r}
				<a href={r.url} target="_blank" rel="noopener" class="rounded-full border px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary">{r.label} ↗</a>
			{/each}
		</div>
	{:else}
		<div class="card-surface mt-6 p-6 text-sm text-muted-foreground">
			<p>This page is a placeholder. Add the {data.tenant.name} description, team, citation, and data-use details here.</p>
		</div>
	{/if}
</div>
