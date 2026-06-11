<script lang="ts">
	import { onMount } from 'svelte';
	let { data } = $props();

	// On a scoped tenant (bipmed/carigenetics) bake the tenant into every query and
	// drop /api/biobanks (it's just their own biobank). biovault = global, untouched.
	const isTenant = $derived(!!data.tenant.scope);
	const tenantSlug = $derived(data.tenant.slug);
	const baked = (p: string) => (isTenant ? p + (p.includes('?') ? '&' : '?') + `tenant=${tenantSlug}` : p);

	const baseExamples = [
		{ label: 'List biobanks', path: '/api/biobanks' },
		{ label: 'Search rsID', path: '/api/variants?q=rs2465136&limit=5' },
		{ label: 'Region query', path: '/api/variants?chrom=1&posMin=1000000&posMax=1100000&limit=5' },
		{ label: 'Beacon g_variants', path: '/api/beacon/g_variants?referenceName=1&start=1055036&referenceBases=T&alternateBases=C' },
		{ label: 'VRS allele', path: '/api/vrs/vom-G9UOPuYNLNvxb0WDH_CSuitKUQBF' }
	];
	const examples = $derived(
		baseExamples
			.filter((e) => !(isTenant && e.path === '/api/biobanks'))
			.map((e) => ({ label: e.label, method: 'GET', body: '', path: baked(e.path) }))
	);

	const baseEndpoints = [
		{ m: 'GET', p: '/api/biobanks', d: 'Biobanks, populations & sample counts (map source).' },
		{ m: 'GET', p: '/api/variants', d: 'Search variants — q, chrom, posMin/posMax, rsid, afMin/afMax, acMin/acMax, sort, dir, limit, offset.' },
		{ m: 'GET', p: '/api/variants/:id', d: 'One variant across populations + its VRS allele.' },
		{ m: 'GET', p: '/api/beacon/g_variants', d: 'GA4GH Beacon v2 — referenceName, start, referenceBases, alternateBases.' },
		{ m: 'GET', p: '/api/vrs/:digest', d: 'GA4GH VRS Allele object by digest.' }
	];
	const endpoints = $derived(baseEndpoints.filter((e) => !(isTenant && e.p === '/api/biobanks')));

	let method = $state('GET');
	let path = $state('');
	let body = $state('');
	let resp = $state('');
	let status = $state('');
	let took = $state('');
	let loading = $state(false);

	function preset(e: { method: string; path: string; body: string }) {
		method = e.method;
		path = e.path;
		body = e.body;
		run();
	}

	function fullUrl() {
		if (path.includes('tenant=')) return path;
		if (isTenant) return path + (path.includes('?') ? '&' : '?') + `tenant=${tenantSlug}`;
		if (data.forceTenant) return path + (path.includes('?') ? '&' : '?') + `tenant=${data.forceTenant}`;
		return path;
	}

	async function run() {
		loading = true;
		resp = '';
		status = '';
		took = '';
		const t0 = performance.now();
		try {
			const init: RequestInit = { method };
			if (method !== 'GET' && body.trim()) {
				init.headers = { 'content-type': 'application/json' };
				init.body = body;
			}
			const r = await fetch(fullUrl(), init);
			status = `${r.status} ${r.statusText}`;
			const text = await r.text();
			try {
				resp = JSON.stringify(JSON.parse(text), null, 2);
			} catch {
				resp = text;
			}
		} catch (e) {
			status = 'error';
			resp = String(e);
		} finally {
			took = `${Math.round(performance.now() - t0)} ms`;
			loading = false;
		}
	}

	const origin = $derived(typeof location !== 'undefined' ? location.origin : '');
	const curl = $derived(
		method === 'GET'
			? `curl '${origin}${fullUrl()}'`
			: `curl -X ${method} '${origin}${fullUrl()}' \\\n  -H 'content-type: application/json' \\\n  -d '${body.replace(/\n/g, '')}'`
	);

	onMount(() => {
		path = examples.find((e) => e.label === 'Search rsID')?.path ?? examples[0].path;
		run();
	});
</script>

<svelte:head><title>API · {data.tenant.name}</title></svelte:head>

<div class="mx-auto max-w-4xl py-2">
	<h1 class="text-3xl font-bold tracking-tight">API</h1>
	<p class="mt-2 text-muted-foreground">
		Public, read-only JSON API (CORS-open). Try a query below, or call it from anywhere against
		<code class="rounded bg-muted px-1.5 py-0.5 text-sm">data.biovault.net</code>.
	</p>

	<!-- endpoint reference -->
	<div class="mt-6 overflow-hidden rounded-[var(--radius)] border">
		<table class="w-full text-sm">
			<tbody>
				{#each endpoints as e}
					<tr class="border-t first:border-t-0">
						<td class="w-16 px-3 py-2"><span class="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">{e.m}</span></td>
						<td class="px-3 py-2 font-mono text-xs">{e.p}</td>
						<td class="px-3 py-2 text-xs text-muted-foreground">{e.d}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- try it -->
	<div class="card-surface mt-6 p-5">
		<h2 class="text-lg font-semibold">Try it</h2>
		<div class="mt-2 flex flex-wrap gap-2">
			{#each examples as e}
				<button type="button" onclick={() => preset(e)} class="rounded-full border px-3 py-1 text-xs hover:bg-muted">{e.label}</button>
			{/each}
		</div>

		<div class="mt-3 flex gap-2">
			<select bind:value={method} class="rounded-md border bg-background px-2 py-2 text-sm font-mono">
				<option>GET</option>
				<option>POST</option>
			</select>
			<input bind:value={path} class="flex-1 rounded-md border bg-background px-3 py-2 font-mono text-sm" spellcheck="false" />
			<button onclick={run} class="brand-gradient rounded-md px-5 py-2 text-sm font-semibold text-white transition-transform hover:scale-105 active:scale-95">{loading ? '…' : 'Run'}</button>
		</div>

		{#if method !== 'GET'}
			<textarea bind:value={body} rows="4" placeholder={'{\n  "referenceName": "1",\n  "start": 100000722\n}'} class="mt-2 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs" spellcheck="false"></textarea>
		{/if}

		<div class="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
			{#if status}<span class={status.startsWith('2') ? 'font-semibold text-primary' : 'font-semibold text-destructive'}>{status}</span>{/if}
			{#if took}<span>{took}</span>{/if}
		</div>

		<pre class="mt-2 max-h-[28rem] overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed"><code>{resp || '// response will appear here'}</code></pre>

		<div class="mt-3">
			<p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">cURL</p>
			<pre class="overflow-auto rounded-md border bg-muted/40 p-3 text-xs"><code>{curl}</code></pre>
		</div>
	</div>
</div>
