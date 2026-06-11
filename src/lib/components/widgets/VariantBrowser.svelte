<script lang="ts">
	import { replaceState } from '$app/navigation';
	let {
		forceTenant = '',
		title = 'Variant browser',
		subtitle = 'Search allele frequencies by rsID, region, or position.',
		scoped = false,
		options = [],
		examples = ['rs2465136', '1:1000000-1100000', 'chr7', 'ga4gh:VA.3W84-kCDOBIiXcaOdX8XvHqgcoTx7u2a'],
		initialQuery = '',
		showGenotypeCounts = true,
		populations = []
	}: {
		forceTenant?: string;
		title?: string;
		subtitle?: string;
		scoped?: boolean;
		options?: { slug: string; name: string }[];
		examples?: string[];
		initialQuery?: string;
		showGenotypeCounts?: boolean;
		populations?: { cohortId: number; name: string }[];
	} = $props();

	// initial state read from the page URL (so a pasted/bookmarked link reproduces the view)
	const sp0 = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
	const sp0Cohorts = (sp0.get('cohorts') ?? '').split(',').filter(Boolean).map(Number);

	// population (cohort) checkboxes — carigenetics-style multi-population tenants
	let selectedPops = $state<Record<number, boolean>>(
		Object.fromEntries(populations.map((p) => [p.cohortId, sp0Cohorts.length ? sp0Cohorts.includes(p.cohortId) : true]))
	);
	const selectedCohortIds = $derived(populations.filter((p) => selectedPops[p.cohortId]).map((p) => p.cohortId));
	const showPopFilter = $derived(populations.length > 1);
	function togglePop(id: number) {
		const next = { ...selectedPops, [id]: !selectedPops[id] };
		if (!Object.values(next).some(Boolean)) return; // keep at least one
		selectedPops = next;
		offset = 0;
	}


	// biobank filter (global view only): which biobanks + ANY/ALL match
	const sp0Banks = (sp0.get('biobanks') ?? '').split(',').filter(Boolean);
	const initialSelected = () => Object.fromEntries(options.map((o) => [o.slug, sp0Banks.length ? sp0Banks.includes(o.slug) : true]));
	let selected = $state<Record<string, boolean>>(initialSelected());
	let matchMode = $state<'any' | 'all'>(sp0.get('match') === 'all' ? 'all' : 'any');
	const selectedSlugs = $derived(options.filter((o) => selected[o.slug]).map((o) => o.slug));
	const showFilter = $derived(!scoped && options.length > 1);

	function toggleBank(slug: string) {
		const next = { ...selected, [slug]: !selected[slug] };
		if (!Object.values(next).some(Boolean)) return; // keep at least one
		selected = next;
		offset = 0;
	}
	function setMatch(m: 'any' | 'all') {
		matchMode = m;
		offset = 0;
	}

	interface FreqCell {
		population: string;
		biobankSlug: string;
		af: number;
		ac: number;
		an: number;
		nHetero: number | null;
		nHomo: number | null;
		nHomoRef: number | null;
	}
	interface VRow {
		id: number;
		chromName: string;
		pos: number;
		ref: string;
		alt: string;
		rsid: number | null;
		vrsDigest: string | null;
		lifted: number;
		frequencies: FreqCell[];
	}
	interface VariantResponse {
		rows?: VRow[];
		total?: number;
	}

	let q = $state(sp0.get('q') ?? initialQuery); // bound to the text input
	let afMin = $state(sp0.get('afMin') ?? '');
	let afMax = $state(sp0.get('afMax') ?? '');
	let acMin = $state(sp0.get('acMin') ?? '');
	let acMax = $state(sp0.get('acMax') ?? '');
	let qA = $state(sp0.get('q') ?? initialQuery); // debounced/applied values that actually drive queries
	let afMinA = $state(sp0.get('afMin') ?? '');
	let afMaxA = $state(sp0.get('afMax') ?? '');
	let acMinA = $state(sp0.get('acMin') ?? '');
	let acMaxA = $state(sp0.get('acMax') ?? '');
	let rows = $state<VRow[]>([]);
	let total = $state(0);
	let loading = $state(false);

	const tenantQ = $derived(forceTenant ? `&tenant=${forceTenant}` : '');
	let pageSize = $state(Number(sp0.get('pageSize')) || 50);
	let offset = $state(((Number(sp0.get('page')) || 1) - 1) * (Number(sp0.get('pageSize')) || 50));
	function setPageSize(n: number) {
		pageSize = n;
		offset = 0;
	}

	type SortCol = '' | 'variant' | 'rsid' | 'maxaf' | 'vrs';
	let sortCol = $state<SortCol>((['variant', 'rsid', 'maxaf', 'vrs'].includes(sp0.get('sort') ?? '') ? sp0.get('sort') : '') as SortCol);
	let sortDir = $state<'asc' | 'desc'>(sp0.get('dir') === 'desc' ? 'desc' : 'asc');
	function setSort(col: SortCol) {
		if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else {
			sortCol = col;
			sortDir = col === 'maxaf' ? 'desc' : 'asc';
		}
		offset = 0;
	}

	function buildParams(extra = '') {
		const p = new URLSearchParams();
		if (qA.trim()) p.set('q', qA.trim());
		if (afMinA) p.set('afMin', afMinA);
		if (afMaxA) p.set('afMax', afMaxA);
		if (acMinA) p.set('acMin', acMinA);
		if (acMaxA) p.set('acMax', acMaxA);
		if (showPopFilter && selectedCohortIds.length < populations.length) p.set('cohorts', selectedCohortIds.join(','));
		p.set('limit', String(pageSize));
		p.set('offset', String(offset));
		if (sortCol) {
			p.set('sort', sortCol);
			p.set('dir', sortDir);
		}
		if (showFilter && selectedSlugs.length) {
			p.set('biobanks', selectedSlugs.join(','));
			p.set('match', matchMode);
		}
		return p.toString() + tenantQ + extra;
	}

	// mirror the current query into the page URL so it's copy-paste / bookmark-able
	function syncUrl() {
		const sp = new URLSearchParams();
		if (qA.trim()) sp.set('q', qA.trim());
		if (afMinA) sp.set('afMin', afMinA);
		if (afMaxA) sp.set('afMax', afMaxA);
		if (acMinA) sp.set('acMin', acMinA);
		if (acMaxA) sp.set('acMax', acMaxA);
		if (sortCol) {
			sp.set('sort', sortCol);
			sp.set('dir', sortDir);
		}
		if (pageSize !== 50) sp.set('pageSize', String(pageSize));
		const pg = Math.floor(offset / pageSize) + 1;
		if (pg > 1) sp.set('page', String(pg));
		if (showPopFilter && selectedCohortIds.length < populations.length) sp.set('cohorts', selectedCohortIds.join(','));
		if (showFilter && selectedSlugs.length < options.length) {
			sp.set('biobanks', selectedSlugs.join(','));
			sp.set('match', matchMode);
		}
		if (forceTenant) sp.set('tenant', forceTenant);
		const qs = sp.toString();
		try {
			replaceState(`${location.pathname}${qs ? `?${qs}` : ''}`, {});
		} catch {
			/* router not ready */
		}
	}

	let seq = 0;
	async function load() {
		const my = ++seq;
		loading = true;
		try {
			const res = (await fetch(`/api/variants?${buildParams()}`).then((r) => r.json())) as VariantResponse;
			if (my !== seq) return; // a newer request superseded this one
			rows = res.rows ?? [];
			total = res.total ?? 0;
		} finally {
			if (my === seq) loading = false;
		}
	}

	// Reactive load with EXPLICIT deps so tracking never depends on async reads.
	// The seq guard in load() drops stale (out-of-order) responses.
	$effect(() => {
		void qA;
		void afMinA;
		void afMaxA;
		void acMinA;
		void acMaxA;
		void offset;
		void pageSize;
		void matchMode;
		void selectedSlugs;
		void selectedCohortIds;
		void showFilter;
		void sortCol;
		void sortDir;
		load();
		syncUrl();
	});

	let timer: ReturnType<typeof setTimeout>;
	function applyInputs() {
		offset = 0;
		qA = q;
		afMinA = afMin;
		afMaxA = afMax;
		acMinA = acMin;
		acMaxA = acMax;
	}
	function onInput() {
		clearTimeout(timer);
		timer = setTimeout(applyInputs, 250);
	}
	// explicit "Go" — run the query now
	function go() {
		clearTimeout(timer);
		applyInputs();
	}
	// click an example → populate the box and run it immediately
	function runExample(ex: string) {
		clearTimeout(timer);
		q = ex;
		offset = 0;
		qA = ex;
	}
	// clear search + all filters
	function reset() {
		clearTimeout(timer);
		q = afMin = afMax = acMin = acMax = '';
		qA = afMinA = afMaxA = acMinA = acMaxA = '';
		sortCol = '';
		offset = 0;
	}

	// live curl for the current query (matches what just ran)
	const origin = $derived(typeof location !== 'undefined' ? location.origin : '');
	const curlCmd = $derived(`curl '${origin}/api/variants?${buildParams()}'`);
	let curlCopied = $state(false);
	function copyCurl() {
		navigator.clipboard?.writeText(curlCmd);
		curlCopied = true;
		setTimeout(() => (curlCopied = false), 1200);
	}
	const apiLink = forceTenant ? `/api?tenant=${forceTenant}` : '/api';

	const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));
	const curPage = $derived(Math.floor(offset / pageSize) + 1);
	function goPage(n: number) {
		offset = (Math.min(Math.max(n, 1), totalPages) - 1) * pageSize;
	}
	// page numbers with ellipsis: 1 … c-1 c c+1 … N
	const pageItems = $derived.by(() => {
		const items: (number | '…')[] = [];
		const add = (n: number) => items.push(n);
		const N = totalPages;
		const c = curPage;
		const win = new Set<number>([1, 2, N - 1, N, c - 1, c, c + 1]);
		let last = 0;
		for (let i = 1; i <= N; i++) {
			if (win.has(i) || i === 1 || i === N) {
				if (i - last > 1) items.push('…');
				add(i);
				last = i;
			}
		}
		return items;
	});

	const ind = (c: SortCol) => (sortCol === c ? (sortDir === 'asc' ? '▲' : '▼') : '↕');
	// shared grid template for the population rows + their header (so they align).
	// The last visible column is max-content so it collapses to its text width.
	const multiPop = $derived(rows.some((r) => r.frequencies.length > 1));
	const popTmpl = $derived(
		[
			multiPop ? 'minmax(5rem,7rem)' : null,
			'5rem', // bar
			'4rem', // freq
			showGenotypeCounts ? '4.5rem' : 'max-content', // ac/an
			...(showGenotypeCounts ? ['2.75rem', '4.75rem', '4.75rem'] : []) // het, hom_alt, hom_ref
		]
			.filter(Boolean)
			.join(' ')
	);
	const fmtAf = (af: number) => (af >= 0.0001 || af === 0 ? af.toFixed(4) : af.toExponential(1));
	const maxAf = (r: VRow) => (r.frequencies.length ? Math.max(...r.frequencies.map((f) => f.af)) : 0);
	let copied = $state<string | null>(null);
	function copyVrs(d: string) {
		navigator.clipboard?.writeText(`ga4gh:VA.${d}`);
		copied = d;
		setTimeout(() => (copied = null), 1200);
	}
</script>

<section class="card-surface p-5 sm:p-6">
	{#if loading}
		<div class="fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-primary/15">
			<div class="bv-loadbar"></div>
		</div>
	{/if}
	<div class="mb-4">
		<h3 class="text-lg font-semibold">{title}</h3>
		<p class="text-sm text-muted-foreground">{subtitle}</p>
	</div>

	{#if showFilter}
		<div class="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
			<span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Biobanks</span>
			<div class="flex flex-wrap gap-3">
				{#each options as o}
					<label class="flex cursor-pointer items-center gap-1.5">
						<input type="checkbox" checked={selected[o.slug]} onchange={() => toggleBank(o.slug)} class="accent-[var(--primary)]" />
						<span>{o.name}</span>
					</label>
				{/each}
			</div>
			<div class="flex items-center gap-3" class:opacity-40={selectedSlugs.length < 2}>
				<span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Match</span>
				<label class="flex cursor-pointer items-center gap-1.5">
					<input type="radio" name="match" checked={matchMode === 'any'} onchange={() => setMatch('any')} disabled={selectedSlugs.length < 2} class="accent-[var(--primary)]" />
					<span>Either</span>
				</label>
				<label class="flex cursor-pointer items-center gap-1.5">
					<input type="radio" name="match" checked={matchMode === 'all'} onchange={() => setMatch('all')} disabled={selectedSlugs.length < 2} class="accent-[var(--primary)]" />
					<span>All</span>
				</label>
			</div>
		</div>
	{/if}

	{#if showPopFilter}
		<div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
			<span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Populations</span>
			{#each populations as pop}
				<label class="flex cursor-pointer items-center gap-1.5">
					<input type="checkbox" checked={selectedPops[pop.cohortId]} onchange={() => togglePop(pop.cohortId)} class="accent-[var(--primary)]" />
					<span>{pop.name}</span>
				</label>
			{/each}
		</div>
	{/if}

	{#if examples.length}
		<div class="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
			<span>Try:</span>
			{#each examples as ex}
				<button onclick={() => runExample(ex)} class="rounded-full border px-2 py-0.5 font-mono hover:bg-muted hover:text-foreground">{ex}</button>
			{/each}
		</div>
	{/if}

	<div class="mb-3 flex flex-wrap items-end gap-2">
		<div class="relative min-w-48 flex-1">
			<input
				bind:value={q}
				oninput={onInput}
				onkeydown={(e) => e.key === 'Enter' && go()}
				placeholder="rs123 · rs1|rs2|rs3 · chr7 · 1:1000000-1100000 · ga4gh:VA.…"
				class="w-full rounded-md border bg-background px-3 py-2 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring"
			/>
			{#if loading}
				<span class="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-muted border-t-primary"></span>
			{/if}
		</div>
		<button onclick={go} class="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">Go</button>
		<div class="flex flex-col gap-1">
			<span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Allele freq</span>
			<div class="flex items-center gap-1">
				<input bind:value={afMin} oninput={onInput} placeholder="min" class="w-16 rounded-md border bg-background px-2 py-2 text-sm" />
				<span class="text-muted-foreground">–</span>
				<input bind:value={afMax} oninput={onInput} placeholder="max" class="w-16 rounded-md border bg-background px-2 py-2 text-sm" />
			</div>
		</div>
		<div class="flex flex-col gap-1">
			<span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Allele count</span>
			<div class="flex items-center gap-1">
				<input bind:value={acMin} oninput={onInput} placeholder="min" class="w-16 rounded-md border bg-background px-2 py-2 text-sm" />
				<span class="text-muted-foreground">–</span>
				<input bind:value={acMax} oninput={onInput} placeholder="max" class="w-16 rounded-md border bg-background px-2 py-2 text-sm" />
			</div>
		</div>
		<label class="flex flex-col text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
			Per page
			<select value={pageSize} onchange={(e) => setPageSize(Number((e.target as HTMLSelectElement).value))} class="rounded-md border bg-background px-2 py-2 text-sm text-foreground">
				{#each [25, 50, 100, 200, 500] as n}<option value={n}>{n}</option>{/each}
			</select>
		</label>
		<button onclick={reset} class="rounded-md border px-3 py-2 text-sm hover:bg-muted">Reset</button>
	</div>

	<!-- live curl for the current query -->
	<div class="mb-3 flex items-center gap-2">
		<code class="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">{curlCmd}</code>
		<button onclick={copyCurl} class="shrink-0 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">{curlCopied ? 'copied!' : 'copy curl'}</button>
		<a href={apiLink} class="shrink-0 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">API ↗</a>
	</div>

	<div class="mb-3">{@render pager()}</div>

	<div class="relative overflow-x-auto rounded-md border">
		{#if loading}
			<div class="absolute inset-0 z-10 grid place-items-center bg-background/55 backdrop-blur-[1px]">
				<span class="size-7 animate-spin rounded-full border-2 border-muted border-t-primary"></span>
			</div>
		{/if}
		<table class="w-full text-sm">
			<thead class="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
				<tr>
					<th class="px-3 py-2 font-medium"><button onclick={() => setSort('variant')} class="inline-flex items-center gap-1 uppercase hover:text-foreground">Variant <span class="normal-case text-[9px] text-muted-foreground/70">GRCh38</span> <span class="text-[9px]">{ind('variant')}</span></button></th>
					<th class="px-3 py-2 font-medium"><button onclick={() => setSort('rsid')} class="inline-flex items-center gap-1 uppercase hover:text-foreground">rsID <span class="text-[9px]">{ind('rsid')}</span></button></th>
					<th class="px-3 py-2 font-medium">
						<div class="grid items-center gap-x-3 uppercase" style={`grid-template-columns:${popTmpl}`}>
							{#if multiPop}<span class="text-left">Population</span>{/if}
							<span></span>
							<button onclick={() => setSort('maxaf')} class="inline-flex items-center justify-end gap-1 uppercase hover:text-foreground">Freq <span class="text-[9px]">{ind('maxaf')}</span></button>
							<span class="text-right">AC/AN</span>
							{#if showGenotypeCounts}
								<span class="text-right">HET</span>
								<span class="text-right">HOM_ALT</span>
								<span class="text-right">HOM_REF</span>
							{/if}
						</div>
					</th>
					<th class="whitespace-nowrap px-3 py-2 text-right font-medium"><button onclick={() => setSort('maxaf')} class="inline-flex items-center gap-1 whitespace-nowrap uppercase hover:text-foreground">Max AF <span class="text-[9px]">{ind('maxaf')}</span></button></th>
					<th class="px-3 py-2 font-medium"><button onclick={() => setSort('vrs')} class="inline-flex items-center gap-1 uppercase hover:text-foreground">VRS <span class="text-[9px]">{ind('vrs')}</span></button></th>
				</tr>
			</thead>
			<tbody>
				{#each rows as r (r.id)}
					<tr class="border-t hover:bg-muted/40">
						<td class="whitespace-nowrap px-3 py-2 font-mono text-xs">
							<span class="font-semibold">chr{r.chromName}:{r.pos.toLocaleString()}</span>
							<span class="text-muted-foreground">{r.ref}›{r.alt}</span>
						</td>
						<td class="whitespace-nowrap px-3 py-2">
							{#if r.rsid}
								<a class="text-primary hover:underline" href={`https://www.ncbi.nlm.nih.gov/snp/rs${r.rsid}`} target="_blank" rel="noreferrer">rs{r.rsid}</a>
							{:else}<span class="text-muted-foreground">—</span>{/if}
						</td>
						<td class="px-3 py-2">
							<div class="grid items-center gap-x-3 gap-y-1" style={`grid-template-columns:${popTmpl}`}>
								{#each r.frequencies.slice(0, 6) as f}
									{#if multiPop}
										<span class="truncate text-xs text-muted-foreground" title={f.population}>{f.population}</span>
									{/if}
									<span class="af-track h-2 cursor-help overflow-hidden rounded-full" title={`${f.population} · alt allele freq ${fmtAf(f.af)} · AC ${f.ac}/${f.an}`}>
										<span class="af-fill block h-full rounded-full" style={`width:${Math.min(100, f.af * 100)}%`}></span>
									</span>
									<span class="text-right font-mono text-[11px] tabular-nums">{fmtAf(f.af)}</span>
									<span class="text-right font-mono text-[10px] tabular-nums text-muted-foreground" title="allele count / allele number">{f.ac}/{f.an}</span>
									{#if showGenotypeCounts}
										<span class="text-right font-mono text-[10px] tabular-nums text-muted-foreground" title="heterozygous">{f.nHetero ?? '—'}</span>
										<span class="text-right font-mono text-[10px] tabular-nums text-muted-foreground" title="homozygous alt">{f.nHomo ?? '—'}</span>
										<span class="text-right font-mono text-[10px] tabular-nums text-muted-foreground" title="homozygous ref">{f.nHomoRef ?? '—'}</span>
									{/if}
								{/each}
							</div>
						</td>
						<td class="px-3 py-2 text-right font-mono text-xs">{fmtAf(maxAf(r))}</td>
						<td class="px-3 py-2">
							{#if r.vrsDigest}
								<button
									onclick={() => copyVrs(r.vrsDigest!)}
									class="rounded border px-1.5 py-0.5 font-mono text-[10px] hover:bg-muted"
									title={`ga4gh:VA.${r.vrsDigest} — click to copy`}
								>
									{copied === r.vrsDigest ? 'copied!' : `VA.${r.vrsDigest.slice(0, 6)}…`}
								</button>
							{:else}<span class="text-muted-foreground">—</span>{/if}
						</td>
					</tr>
				{/each}
				{#if !rows.length && !loading}
					<tr><td colspan="5" class="px-3 py-10 text-center text-muted-foreground">No variants match.</td></tr>
				{/if}
			</tbody>
		</table>
	</div>

	<div class="mt-3">{@render pager()}</div>
</section>

{#snippet pager()}
	<div class="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
		<span>{loading ? 'Loading…' : `${total.toLocaleString()} variants`}</span>
		<div class="flex flex-wrap items-center gap-1">
			<button onclick={() => goPage(curPage - 1)} disabled={curPage <= 1} class="rounded-md border px-2.5 py-1 disabled:opacity-40 hover:bg-muted">Prev</button>
			{#each pageItems as it}
				{#if it === '…'}
					<span class="px-1 text-muted-foreground">…</span>
				{:else}
					<button onclick={() => goPage(it)} class={`min-w-8 rounded-md border px-2 py-1 ${it === curPage ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{it}</button>
				{/if}
			{/each}
			<button onclick={() => goPage(curPage + 1)} disabled={curPage >= totalPages} class="rounded-md border px-2.5 py-1 disabled:opacity-40 hover:bg-muted">Next</button>
		</div>
	</div>
{/snippet}
