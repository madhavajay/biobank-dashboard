<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import { lang, LANGS } from '$lib/i18n';

	let { children, data } = $props();
	const tenant = $derived(data.tenant);
	const forceTenant = $derived(data.forceTenant);

	const link = (path: string) => (forceTenant ? `${path}?tenant=${forceTenant}` : path);
	let dark = $state(false);
	$effect(() => {
		document.documentElement.classList.toggle('dark', dark);
	});

	const flags = $derived((tenant.langs ?? []).map((c: string) => LANGS.find((l) => l.code === c)!).filter(Boolean));
</script>

<div style={data.themeStyle} class="flex min-h-screen flex-col">
	<header class="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
		<div class="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
			<a href={link('/')} class="flex items-center gap-2.5">
				{#if tenant.logoImg}
					<img src={tenant.logoImg} alt={tenant.name} class="h-12 w-auto max-w-56 object-contain" />
				{:else}
					<span class="brand-gradient grid size-9 place-items-center rounded-xl text-lg shadow-sm">{tenant.logoEmoji}</span>
					<span class="flex flex-col leading-tight">
						<span class="text-sm font-bold">{tenant.name}</span>
						<span class="text-[11px] text-muted-foreground">{tenant.product}</span>
					</span>
				{/if}
			</a>
			<nav class="flex items-center gap-1 text-sm">
				<a href={link('/')} class="rounded-md px-3 py-1.5 hover:bg-muted" class:font-semibold={page.url.pathname === '/'}>Home</a>
				<a href={link('/explore')} class="rounded-md px-3 py-1.5 hover:bg-muted" class:font-semibold={page.url.pathname === '/explore'}>Explore</a>
				<a href={link('/about')} class="rounded-md px-3 py-1.5 hover:bg-muted" class:font-semibold={page.url.pathname === '/about'}>About</a>
				<a href={link('/contact')} class="rounded-md px-3 py-1.5 hover:bg-muted" class:font-semibold={page.url.pathname === '/contact'}>Contact</a>
				<a href={link('/api')} class="rounded-md px-3 py-1.5 hover:bg-muted" class:font-semibold={page.url.pathname === '/api'}>API</a>
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
