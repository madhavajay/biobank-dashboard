<script lang="ts">
	import { tenantContent, loc } from '$lib/content';
	import { lang, tr } from '$lib/i18n';
	let { data } = $props();
	const team = $derived(tenantContent(data.tenant.slug)?.team ?? null);
</script>

<svelte:head><title>{tr($lang, 'navTeam')} · {data.tenant.name}</title></svelte:head>

<div class="mx-auto max-w-5xl py-6">
	<h1 class="text-3xl font-bold tracking-tight">
		{#if $lang === 'pt'}{tr($lang, 'navTeam')} <span class="brand-text">{data.tenant.name}</span>{:else}The <span class="brand-text">{data.tenant.name}</span> Team{/if}
	</h1>

	{#if team}
		<p class="mt-3 max-w-2xl text-muted-foreground">{loc(team.intro, $lang)}</p>

		{#each team.groups as group}
			<section class="mt-10">
				<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{loc(group.name, $lang)}</h2>
				<div class="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
					{#each group.members as m}
						<div class="flex flex-col items-center text-center">
							<div class="relative size-28 overflow-hidden rounded-full ring-2 ring-primary/20 ring-offset-2 ring-offset-background shadow-sm">
								<img src={m.photo} alt={m.name} loading="lazy" class="size-full object-cover" />
							</div>
							<div class="mt-3 text-sm font-semibold leading-tight">
								<span class="text-primary">{m.degrees}</span> {m.name}
							</div>
							<div class="mt-1 text-xs leading-snug text-muted-foreground">{loc(m.role, $lang)}</div>
							{#if m.linkedin}
								<a href={m.linkedin} target="_blank" rel="noopener" aria-label={`${m.name} LinkedIn`} class="mt-2 inline-flex size-7 items-center justify-center rounded-md border text-muted-foreground transition hover:border-primary/40 hover:text-primary">
									<svg viewBox="0 0 24 24" class="size-3.5" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm6 0h3.8v1.7h.05c.53-1 1.83-2.05 3.76-2.05C20.6 8.65 22 10.6 22 14.1V21h-4v-6.1c0-1.45-.03-3.32-2.02-3.32-2.02 0-2.33 1.58-2.33 3.21V21H9V9Z"/></svg>
								</a>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{/each}
	{:else}
		<div class="card-surface mt-6 p-6 text-sm text-muted-foreground">
			<p>No team information is available for {data.tenant.name} yet.</p>
		</div>
	{/if}
</div>
