<script lang="ts">
	import { tenantContent, loc } from '$lib/content'
	import { lang, tr } from '$lib/i18n'

	let { data } = $props()
	const about = $derived(tenantContent(data.tenant.slug)?.about ?? null)
</script>

<h1 class="site-modal-title">
	{tr($lang, 'aboutHeading')} <span class="brand-text">{data.tenant.name}</span>
</h1>
<p class="site-modal-lead">{data.tenant.tagline}</p>

{#if about}
	<p class="site-modal-copy site-modal-copy-lg">{loc(about.intro, $lang)}</p>

	<h2 class="site-modal-subtitle">{tr($lang, 'researchCenters')}</h2>
	<div class="site-modal-grid">
		{#each about.centers as c}
			<a
				href={c.url}
				target="_blank"
				rel="noopener"
				class="card-surface site-modal-card flex items-center gap-4 p-4 transition hover:border-primary/40 hover:shadow-sm"
			>
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

	<div class="site-modal-copy-stack">
		{#each loc(about.paragraphs, $lang) as p}<p>{p}</p>{/each}
	</div>

	<h2 class="site-modal-subtitle">{tr($lang, 'references')}</h2>
	<div class="site-modal-tags">
		{#each about.references as r}
			<a
				href={r.url}
				target="_blank"
				rel="noopener"
				class="rounded-full border px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary"
				>{r.label} ↗</a
			>
		{/each}
	</div>
{:else}
	<div class="card-surface site-modal-placeholder">
		<p>
			This page is a placeholder. Add the {data.tenant.name} description, team, citation, and
			data-use details here.
		</p>
	</div>
{/if}
