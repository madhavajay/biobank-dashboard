<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import { lang, LANGS, tr } from '$lib/i18n';
	import { tenantContent } from '$lib/content';
	import { Button } from '$lib/components/ui/button';
	import MapHeaderSearch from '$lib/components/app/MapHeaderSearch.svelte';

	let { children, data } = $props();
	const tenant = $derived(data.tenant);
	const forceTenant = $derived(data.forceTenant);
	const isScopedPortal = $derived(!!tenant.scope);
	const hasTeam = $derived(!!tenantContent(tenant.slug)?.team);
	const isBioVaultMap = $derived(page.url.pathname === '/');
	const isExploreRoute = $derived(page.url.pathname.startsWith('/explore'));

	const link = (path: string) => (forceTenant ? `${path}?tenant=${forceTenant}` : path);

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

<div
	style={data.themeStyle}
	class="biovault-layout flex min-h-screen flex-col bg-background text-foreground"
	class:map-layout={isBioVaultMap}
>
	<header class="biovault-header" class:map-header={isBioVaultMap}>
		<a href={link('/')} class="biovault-brand">
			<img
				src={tenant.logoImg ?? '/biovault-logo.png'}
				alt=""
				class="biovault-brand-logo"
				aria-hidden="true"
			/>
			<span class="biovault-brand-copy">
				<strong>{tenant.name}</strong>
				<span>{isScopedPortal ? tenant.product : 'Global allele-frequency network'}</span>
			</span>
		</a>

		<MapHeaderSearch dashboard={isBioVaultMap ? page.data.dashboard : undefined} />

		<nav class="biovault-nav" aria-label="Site navigation">
			<a href={link('/explore')} class:active={isExploreRoute}>Explore</a>
			{#if !isScopedPortal}
				<a href={link('/sources')} class:active={page.url.pathname.startsWith('/sources')}>Biobanks</a>
			{/if}
			<a href={link('/about')} class:active={page.url.pathname === '/about'}>{tr($lang, 'navAbout')}</a>
			{#if hasTeam}
				<a href={link('/team')} class:active={page.url.pathname === '/team'}>{tr($lang, 'navTeam')}</a>
			{/if}
			<a href={link('/contact')} class:active={page.url.pathname === '/contact'}>{tr($lang, 'navContact')}</a>
			<a href={link('/api')} class:active={page.url.pathname === '/api'}>{tr($lang, 'navApi')}</a>
			{#if flags.length > 1}
				<span class="biovault-lang-switch" aria-label="Language">
					{#each flags as f}
						<button
							type="button"
							class:active={$lang === f.code}
							title={f.label}
							onclick={() => ($lang = f.code)}
						>
							{f.flag}
						</button>
					{/each}
				</span>
			{/if}
		</nav>
	</header>

	{#if isBioVaultMap}
		<main class="min-h-0 w-full flex-1 overflow-hidden">
			{@render children()}
		</main>
	{:else}
		<main class="mx-auto w-full max-w-6xl flex-1 px-4 py-5">
			{@render children()}
		</main>
	{/if}

	{#if !isBioVaultMap}
		<footer class="biovault-footer">
			<div class="biovault-footer-inner">
				<span>© {tenant.name}</span>
				<span class="biovault-footer-meta"
					>GA4GH VRS · <a href={link('/api')} class="hover:text-primary hover:underline">Beacon v2</a></span
				>
			</div>
		</footer>
	{/if}
</div>

<style>
	.biovault-layout {
		--om-white: #ffffff;
		--om-gray-100: #f7f6f9;
		--om-gray-200: #f1f0f4;
		--om-gray-300: #ecebef;
		--om-gray-400: #cfcdd6;
		--om-gray-550: #868394;
		--om-gray-600: #5e5a72;
		--om-gray-700: #464257;
		--om-gray-850: #272532;
		--om-gray-900: #23202c;
		--om-teal-100: #ddeef3;
		--om-teal-600: #388ca8;
		--om-teal-700: #2a697e;
		--om-radius-s: 6px;
		--om-radius-m: 8px;
		overflow-x: hidden;
	}

	.biovault-header {
		position: sticky;
		top: 0;
		z-index: 40;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		column-gap: 20px;
		min-height: 64px;
		background: var(--background);
		padding: 10px 20px;
	}

	.biovault-header.map-header {
		position: fixed;
		right: 0;
		left: 0;
		background: transparent;
		pointer-events: none;
	}

	.biovault-header.map-header > :global(*) {
		pointer-events: auto;
	}

	.biovault-header :global(.map-header-search) {
		position: static;
		left: auto;
		justify-self: center;
		width: min(560px, 100%);
		max-width: 100%;
		transform: none;
	}

	.biovault-layout.map-layout > main {
		min-height: 0;
		flex: 1;
	}

	.biovault-brand {
		display: flex;
		min-width: 0;
		max-width: min(240px, 34vw);
		align-items: center;
		gap: 10px;
		color: var(--om-gray-850);
		text-decoration: none;
	}

	.biovault-brand-logo {
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		object-fit: contain;
	}

	.biovault-brand-copy {
		display: grid;
		min-width: 0;
		gap: 1px;
	}

	.biovault-brand-copy strong {
		overflow: hidden;
		font-size: 15px;
		font-weight: 700;
		line-height: 1.25;
		letter-spacing: -0.01em;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.biovault-brand-copy span {
		overflow: hidden;
		color: var(--om-gray-550);
		font-size: 11px;
		font-weight: 500;
		line-height: 1.25;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.biovault-nav {
		display: flex;
		min-width: 0;
		flex-wrap: nowrap;
		align-items: center;
		justify-content: flex-end;
		gap: 4px;
	}

	.biovault-nav a {
		display: inline-flex;
		height: 36px;
		align-items: center;
		border-radius: var(--om-radius-m);
		padding: 0 11px;
		color: var(--om-gray-600);
		font-size: 13px;
		font-weight: 500;
		line-height: 1;
		text-decoration: none;
		white-space: nowrap;
	}

	.biovault-nav a:hover {
		background: color-mix(in srgb, var(--om-white) 58%, transparent);
		color: var(--om-teal-700);
		text-decoration: none;
	}

	.biovault-nav a.active {
		background: color-mix(in srgb, var(--om-teal-100) 72%, var(--om-white));
		color: var(--om-teal-700);
		font-weight: 600;
	}

	.biovault-lang-switch {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		margin-left: 2px;
	}

	.biovault-lang-switch button {
		display: grid;
		width: 30px;
		height: 30px;
		place-items: center;
		border: 1px solid var(--border);
		border-radius: var(--om-radius-s);
		background: var(--background);
		font-size: 14px;
		line-height: 1;
		cursor: pointer;
		opacity: 0.65;
	}

	.biovault-lang-switch button.active {
		opacity: 1;
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--ring) 45%, transparent);
	}

	.biovault-footer {
		flex-shrink: 0;
		background: var(--background);
	}

	.biovault-footer-inner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 16px;
		margin: 0 auto;
		width: min(100%, 72rem);
		padding: 1.25rem 1.5rem;
		color: var(--muted-foreground);
		font-size: 0.875rem;
		line-height: 1.4;
	}

	.biovault-footer-meta {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.75rem;
	}

	.biovault-footer-meta a {
		color: inherit;
		text-decoration: none;
	}

	@media (max-width: 1100px) {
		.biovault-header {
			column-gap: 14px;
			padding-inline: 16px;
		}

		.biovault-header :global(.map-header-search) {
			width: min(480px, 100%);
		}

		.biovault-nav a {
			padding: 0 8px;
			font-size: 12.5px;
		}
	}

	@media (max-width: 720px) {
		.biovault-header {
			grid-template-columns: 1fr;
			row-gap: 10px;
			padding: 10px 14px;
		}

		.biovault-header :global(.map-header-search) {
			order: 2;
			justify-self: stretch;
			width: 100%;
		}

		.biovault-brand {
			max-width: none;
		}

		.biovault-brand-copy span {
			display: none;
		}

		.biovault-nav {
			order: 3;
			width: 100%;
			max-width: calc(100vw - 28px);
			overflow-x: auto;
			justify-content: flex-start;
			gap: 6px;
		}
	}
</style>
