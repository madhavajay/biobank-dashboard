<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import { lang, LANGS, tr } from '$lib/i18n';
	import { tenantContent } from '$lib/content';

	let { children, data } = $props();
	const tenant = $derived(data.tenant);
	const forceTenant = $derived(data.forceTenant);
	const hasTeam = $derived(!!tenantContent(tenant.slug)?.team);

	const link = (path: string) => (forceTenant ? `${path}?tenant=${forceTenant}` : path);
	let dark = $state(false);
	$effect(() => {
		document.documentElement.classList.toggle('dark', dark);
	});

	const flags = $derived((tenant.langs ?? []).map((c: string) => LANGS.find((l) => l.code === c)!).filter(Boolean));

	$effect(() => {
		if (!data.analytics) return;

		const href = page.url.href;
		const properties = {
			tenant_slug: data.analytics.tenantSlug,
			tenant_name: data.analytics.tenantName,
			tenant_scope: data.analytics.tenantScope ?? 'global',
			real_hostname: data.analytics.hostname,
			analytics_site_domain: data.analytics.siteDomain,
			pathname: page.url.pathname,
			querystring: page.url.search,
			href
		};

		let attempts = 0;
		const timer = window.setInterval(() => {
			if (window.rybbit?.event) {
				window.rybbit.event('tenant_pageview', properties);
				window.clearInterval(timer);
			} else if (++attempts >= 20) {
				window.clearInterval(timer);
			}
		}, 250);

		return () => window.clearInterval(timer);
	});
</script>

<svelte:head>
	{#if data.analytics}
		<script
			src={data.analytics.scriptSrc}
			data-site-id={data.analytics.siteId}
			data-tag={data.analytics.tag}
			defer
		></script>
	{/if}
</svelte:head>

<div style={data.themeStyle} class="flex min-h-screen flex-col">
	<header class="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
		<div class="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
			<a href={link('/')} class="flex items-center gap-2.5">
				{#if tenant.logoImg}
					<img src={tenant.logoImg} alt={tenant.name} class={tenant.slug === 'biovault' ? 'size-9 rounded-lg object-contain' : 'h-12 w-auto max-w-56 object-contain'} />
					{#if tenant.slug === 'biovault'}
						<span class="flex flex-col leading-tight">
							<span class="text-sm font-bold">{tenant.name}</span>
							<span class="text-[11px] text-muted-foreground">{tenant.product}</span>
						</span>
					{/if}
				{:else}
					<span class="brand-gradient grid size-9 place-items-center rounded-xl text-lg shadow-sm">{tenant.logoEmoji}</span>
					<span class="flex flex-col leading-tight">
						<span class="text-sm font-bold">{tenant.name}</span>
						<span class="text-[11px] text-muted-foreground">{tenant.product}</span>
					</span>
				{/if}
			</a>
			<nav class="flex items-center gap-1 text-sm">
				<a href={link('/')} class="rounded-md px-3 py-1.5 hover:bg-muted" class:font-semibold={page.url.pathname === '/'}>{tr($lang, 'navHome')}</a>
				<a href={link('/explore')} class="rounded-md px-3 py-1.5 hover:bg-muted" class:font-semibold={page.url.pathname === '/explore'}>{tr($lang, 'navExplore')}</a>
				<a href={link('/about')} class="rounded-md px-3 py-1.5 hover:bg-muted" class:font-semibold={page.url.pathname === '/about'}>{tr($lang, 'navAbout')}</a>
				{#if hasTeam}
					<a href={link('/team')} class="rounded-md px-3 py-1.5 hover:bg-muted" class:font-semibold={page.url.pathname === '/team'}>{tr($lang, 'navTeam')}</a>
				{/if}
				<a href={link('/contact')} class="rounded-md px-3 py-1.5 hover:bg-muted" class:font-semibold={page.url.pathname === '/contact'}>{tr($lang, 'navContact')}</a>
				<a href={link('/api')} class="rounded-md px-3 py-1.5 hover:bg-muted" class:font-semibold={page.url.pathname === '/api'}>{tr($lang, 'navApi')}</a>
				{#if flags.length > 1}
					<span class="ml-1 flex items-center gap-0.5">
						{#each flags as f}
							<button
								onclick={() => ($lang = f.code)}
								title={f.label}
								class="grid size-8 place-items-center rounded-md border text-base hover:bg-muted"
								class:ring-2={$lang === f.code}
								class:ring-ring={$lang === f.code}
								style={$lang === f.code ? '' : 'opacity:0.55'}
							>
								{f.flag}
							</button>
						{/each}
					</span>
				{/if}
				<button onclick={() => (dark = !dark)} class="ml-1 grid size-8 place-items-center rounded-md border hover:bg-muted" aria-label="Toggle theme">
					{dark ? '☀' : '☾'}
				</button>
			</nav>
		</div>
	</header>

	<main class="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
		{@render children()}
	</main>

	<footer class="border-t">
		<div class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground">
			<span>© {tenant.name}</span>
			<span class="font-mono text-xs">GA4GH VRS · <a href={link('/api')} class="hover:text-primary hover:underline">Beacon v2</a></span>
		</div>
	</footer>
</div>
