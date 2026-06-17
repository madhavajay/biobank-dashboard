<script lang="ts">
	import { onMount } from 'svelte'
	import { lang, tr } from '$lib/i18n'

	let { data } = $props()

	const EX_LABEL: Record<string, 'apiExListBiobanks' | 'apiExSearchRsid' | 'apiExSearchGene' | 'apiExRegion'> =
		{
			'List biobanks': 'apiExListBiobanks',
			'Search rsID': 'apiExSearchRsid',
			'Search gene': 'apiExSearchGene',
			'Region query': 'apiExRegion',
		}
	const exLabel = (l: string) => (EX_LABEL[l] ? tr($lang, EX_LABEL[l]) : l)

	const isTenant = $derived(!!data.tenant.scope)
	const tenantSlug = $derived(data.tenant.slug)
	const baked = (p: string) => (isTenant ? p + (p.includes('?') ? '&' : '?') + `tenant=${tenantSlug}` : p)

	const baseExamples = [
		{ label: 'List biobanks', path: '/api/biobanks' },
		{ label: 'Search rsID', path: '/api/variants?q=rs2465136&limit=5' },
		{ label: 'Search gene', path: '/api/variants?q=BRCA1&limit=5' },
		{ label: 'Region query', path: '/api/variants?chrom=1&posMin=1000000&posMax=1100000&limit=5' },
		{ label: 'Beacon g_variants', path: '/api/beacon/g_variants?referenceName=1&start=1055036&referenceBases=T&alternateBases=C' },
		{ label: 'VRS allele', path: '/api/vrs/vom-G9UOPuYNLNvxb0WDH_CSuitKUQBF' },
	]
	const examples = $derived(
		baseExamples
			.filter((e) => !(isTenant && e.path === '/api/biobanks'))
			.map((e) => ({ label: e.label, method: 'GET', body: '', path: baked(e.path) }))
	)

	const baseEndpoints = [
		{ m: 'GET', p: '/api/biobanks', d: 'Biobanks, populations & sample counts (map source).' },
		{
			m: 'GET',
			p: '/api/variants',
			d: 'Search variants: q, gene, chrom, posMin/posMax, rsid, afMin/afMax, acMin/acMax, sort, dir, limit, offset. AF/AC filters apply only to reportable values.',
		},
		{
			m: 'GET',
			p: '/api/variants/:id',
			d: 'One variant across populations + its VRS allele. Low-count AF/AC values are returned as upper bounds.',
		},
		{ m: 'GET', p: '/api/beacon/g_variants', d: 'GA4GH Beacon v2: referenceName, start, referenceBases, alternateBases.' },
		{ m: 'GET', p: '/api/vrs/:digest', d: 'GA4GH VRS Allele object by digest.' },
	]
	const endpoints = $derived(baseEndpoints.filter((e) => !(isTenant && e.p === '/api/biobanks')))

	let method = $state('GET')
	let path = $state('')
	let body = $state('')
	let resp = $state('')
	let status = $state('')
	let took = $state('')
	let loading = $state(false)

	function preset(e: { method: string; path: string; body: string }) {
		method = e.method
		path = e.path
		body = e.body
		run()
	}

	function fullUrl() {
		if (path.includes('tenant=')) return path
		if (isTenant) return path + (path.includes('?') ? '&' : '?') + `tenant=${tenantSlug}`
		if (data.forceTenant) return path + (path.includes('?') ? '&' : '?') + `tenant=${data.forceTenant}`
		return path
	}

	async function run() {
		loading = true
		resp = ''
		status = ''
		took = ''
		const t0 = performance.now()
		try {
			const init: RequestInit = { method }
			if (method !== 'GET' && body.trim()) {
				init.headers = { 'content-type': 'application/json' }
				init.body = body
			}
			const r = await fetch(fullUrl(), init)
			status = `${r.status} ${r.statusText}`
			const text = await r.text()
			try {
				resp = JSON.stringify(JSON.parse(text), null, 2)
			} catch {
				resp = text
			}
		} catch (e) {
			status = 'error'
			resp = String(e)
		} finally {
			took = `${Math.round(performance.now() - t0)} ms`
			loading = false
		}
	}

	const origin = $derived(typeof location !== 'undefined' ? location.origin : '')
	const curl = $derived(
		method === 'GET'
			? `curl '${origin}${fullUrl()}'`
			: `curl -X ${method} '${origin}${fullUrl()}' \\\n  -H 'content-type: application/json' \\\n  -d '${body.replace(/\n/g, '')}'`
	)

	onMount(() => {
		path = examples.find((e) => e.label === 'Search rsID')?.path ?? examples[0].path
		run()
	})
</script>

<h1 class="site-modal-title">API</h1>
<p class="site-modal-lead">
	{tr($lang, 'apiIntro')}
	<code class="rounded bg-muted px-1.5 py-0.5 text-sm">data.biovault.net</code>.
</p>

<div class="site-modal-table-wrap">
	<table class="site-modal-table">
		<tbody>
			{#each endpoints as e}
				<tr>
					<td><span class="site-modal-method">{e.m}</span></td>
					<td class="font-mono text-xs">{e.p}</td>
					<td class="text-xs text-muted-foreground">{e.d}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<div class="card-surface site-modal-api-panel">
	<h2 class="site-modal-subtitle">{tr($lang, 'apiTryIt')}</h2>
	<div class="site-modal-tags">
		{#each examples as e}
			<button type="button" onclick={() => preset(e)} class="site-modal-chip">{exLabel(e.label)}</button>
		{/each}
	</div>

	<div class="site-modal-api-controls">
		<select bind:value={method} class="site-modal-input site-modal-method-select">
			<option>GET</option>
			<option>POST</option>
		</select>
		<input bind:value={path} class="site-modal-input site-modal-path-input" spellcheck="false" />
		<button onclick={run} class="brand-gradient site-modal-submit site-modal-run">
			{loading ? '…' : tr($lang, 'apiRun')}
		</button>
	</div>

	{#if method !== 'GET'}
		<textarea
			bind:value={body}
			rows="4"
			placeholder={'{\n  "referenceName": "1",\n  "start": 100000722\n}'}
			class="site-modal-input site-modal-code"
			spellcheck="false"
		></textarea>
	{/if}

	<div class="site-modal-api-meta">
		{#if status}<span class:site-modal-status-ok={status.startsWith('2')}>{status}</span>{/if}
		{#if took}<span>{took}</span>{/if}
	</div>

	<pre class="site-modal-pre"><code>{resp || tr($lang, 'apiRespPlaceholder')}</code></pre>

	<div>
		<p class="site-modal-kicker">cURL</p>
		<pre class="site-modal-pre"><code>{curl}</code></pre>
	</div>
</div>
