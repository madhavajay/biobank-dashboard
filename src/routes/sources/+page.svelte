<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { TENANTS, tenantPortalUrl, type Tenant } from '$lib/tenants';

	let { data } = $props();

	const fmt = (value: number | null | undefined) => Number(value ?? 0).toLocaleString();
	const tenantFor = (slug: string) => TENANTS.find((tenant) => tenant.slug === slug);
	const portalUrlFor = (slug: string) =>
		tenantPortalUrl(slug, {
			hostname: page.url.hostname,
			port: page.url.port,
			protocol: page.url.protocol
		});

	function fullDescription(source: { description: string }, tenant?: Tenant) {
		const base = source.description?.trim() ?? '';
		const tagline = tenant?.tagline?.trim() ?? '';
		if (!tagline || base.includes(tagline)) return base;
		if (!base) return tagline;
		if (tagline.includes(base)) return tagline;
		return `${base} ${tagline}`;
	}
</script>

<svelte:head>
	<title>Biobanks · BioVault</title>
	<meta name="description" content="Browse BioVault Biobanks, datasets, and populations." />
</svelte:head>

<div class="mb-5 flex flex-wrap items-end justify-between gap-4 border-b pb-5">
	<div class="min-w-0">
		<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Biobanks</h1>
		<p class="mt-1 max-w-3xl text-muted-foreground">
			Partner biobanks, projects, and reference datasets connected through the BioVault network.
		</p>
	</div>
	<div class="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
		<strong class="text-foreground">{data.sources.length}</strong> connected biobanks
	</div>
</div>

<div class="grid gap-5 lg:grid-cols-2">
	{#each data.sources as source}
		{@const tenant = tenantFor(source.slug)}
		{@const portalUrl = portalUrlFor(source.slug)}
		{@const description = fullDescription(source, tenant)}
		<Card.Root class="flex h-full flex-col gap-0 overflow-hidden py-0">
			<div class="flex h-32 shrink-0 items-center justify-center border-b bg-muted/25 px-6">
				{#if tenant?.logoImg}
					<img
						src={tenant.logoImg}
						alt=""
						class="block h-full max-h-24 w-full max-w-[16rem] object-contain object-center"
					/>
				{:else}
					<span class="text-6xl leading-none">{tenant?.logoEmoji ?? 'DB'}</span>
				{/if}
			</div>
			<Card.Content class="flex flex-1 flex-col gap-4 pt-5">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div class="min-w-0">
						<Card.Title class="text-xl">
							{#if source.website}
								<a
									href={source.website}
									target="_blank"
									rel="noreferrer"
									class="hover:text-primary hover:underline"
								>
									{source.name}
								</a>
							{:else}
								{source.name}
							{/if}
						</Card.Title>
						{#if tenant?.product}
							<p class="mt-1 text-sm font-medium text-muted-foreground">{tenant.product}</p>
						{/if}
					</div>
					{#if portalUrl}
						<Button href={portalUrl} target="_blank" rel="noreferrer" size="sm" class="w-full shrink-0 sm:w-auto">
							Go to Portal
						</Button>
					{/if}
				</div>

				{#if description}
					<p class="line-clamp-3 min-h-[4.5rem] text-sm leading-relaxed text-muted-foreground">
						{description}
					</p>
				{:else}
					<div class="min-h-[4.5rem]"></div>
				{/if}

				<div class="mt-auto grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
					<div class="rounded-md border bg-muted/30 p-3">
						<div class="text-xs text-muted-foreground">Samples</div>
						<div class="mt-1 font-semibold tabular-nums">{fmt(source.totalSamples)}</div>
					</div>
					<div class="rounded-md border bg-muted/30 p-3">
						<div class="text-xs text-muted-foreground">Datasets</div>
						<div class="mt-1 font-semibold tabular-nums">{source.datasets.length}</div>
					</div>
					<div class="rounded-md border bg-muted/30 p-3">
						<div class="text-xs text-muted-foreground">Populations</div>
						<div class="mt-1 font-semibold tabular-nums">{source.populations.length}</div>
					</div>
				</div>
			</Card.Content>
		</Card.Root>
	{/each}
</div>
