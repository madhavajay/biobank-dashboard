<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import logo from '$lib/assets/logo.png';
	import { Search } from '@lucide/svelte';
	import { portalMeta } from '$lib/data/biobank';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let { children } = $props();
	let headerQuery = $state('');

	const navItems = [
		{ label: 'Home', href: '/' },
		{ label: 'Browse', href: '/explorer' },
		{ label: 'About Us', href: '/about' },
		{ label: 'Contact', href: '/contact' }
	] as const;

	const handleHeaderSearchSubmit = async (event: SubmitEvent) => {
		event.preventDefault();

		const query = headerQuery.trim();
		const href = query ? `/explorer?q=${encodeURIComponent(query)}` : '/explorer';
		await goto(href);
	};
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="portal-frame bg-background text-foreground">
	<main class="portal-main">
		<header class="site-header">
			<div class="site-banner">
				<a href="/" class="site-banner__brand" aria-label="BIPMed home">
					<img class="site-banner__logo" src={logo} alt="BIPMed" />
				</a>
				<div class="site-banner__search-block">
					<p class="site-banner__title">BIPMed-Brazil Variant Browser</p>
					<form action="/explorer" class="site-search" onsubmit={handleHeaderSearchSubmit}>
						<div class="site-search__icon">
							<Search class="size-5" />
						</div>
						<Input
							type="search"
							name="q"
							bind:value={headerQuery}
							placeholder={portalMeta.searchPlaceholder}
							aria-label="Search variants"
							class="site-search__input"
						/>
						<Button type="submit" class="site-search__button">
							{headerQuery.trim() ? 'Search' : 'Explore'}
						</Button>
					</form>
				</div>
			</div>
			<nav class="site-nav" aria-label="Primary">
				{#each navItems as item}
					<a
						href={item.href}
						class="site-nav__link"
						aria-current={page.url.pathname === item.href ? 'page' : undefined}
					>
						{item.label}
					</a>
				{/each}
			</nav>
		</header>
		{@render children()}
		<footer class="site-footer" aria-label="Footer">
			<nav class="site-footer__nav" aria-label="Footer links">
				{#each navItems as item}
					<a
						href={item.href}
						class="site-footer__link"
						aria-current={page.url.pathname === item.href ? 'page' : undefined}
					>
						{item.label}
					</a>
				{/each}
			</nav>
		</footer>
	</main>
</div>
