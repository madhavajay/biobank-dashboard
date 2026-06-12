<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { lang, tr } from '$lib/i18n';
	import { DEFAULTS, type ExplorerDisplay } from '$lib/explorer';
	import { publicVariantPathToken } from '$lib/variant-id';
	let {
		forceTenant = '',
		title = '',
		subtitle = '',
		scoped = false,
		options = [],
		examples = ['BRCA1', 'rs2465136', '1:1000000-1100000', 'chr7', 'ga4gh:VA.3W84-kCDOBIiXcaOdX8XvHqgcoTx7u2a'],
		initialQuery = '',
		showGenotypeCounts = true,
		populations = [],
		display = undefined
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
		display?: ExplorerDisplay;
	} = $props();

	// resolved per-tenant column visibility (falls back to auto behaviour when no config passed)
	const cfg = $derived(display ?? DEFAULTS);
	const showGeno = $derived(display ? cfg.genotypes : showGenotypeCounts);
	const showGene = $derived(cfg.gene);
	const showVrs = $derived(cfg.vrs);
	const barMax = $derived(cfg.barMax);
	const acAnSplit = $derived(cfg.acAnSplit);
	const vrsExpand = $derived(cfg.vrsExpand);
	const showGnomad = $derived(cfg.gnomad);
	const variantDetailIcon = $derived(cfg.variantDetailIcon);
	const geneWidthOverride = $derived(cfg.geneColWidth);
	const frequencyWidthOverride = $derived(cfg.frequencyColWidth);
	const variantWidthOverride = $derived(cfg.variantColWidth);
	const gnomadUrl = (r: VRow) => `https://gnomad.broadinstitute.org/variant/${r.chromName}-${r.pos}-${r.ref}-${r.alt}?dataset=gnomad_r4`;
	const variantHref = (r: VRow) => `/explore/variant/${publicVariantPathToken(r)}${forceTenant ? `?tenant=${forceTenant}` : ''}`;

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
		selectedPops = { ...selectedPops, [id]: !selectedPops[id] };
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
		selected = { ...selected, [slug]: !selected[slug] };
		offset = 0;
	}
	function setMatch(m: 'any' | 'all') {
		matchMode = m;
		offset = 0;
	}

	interface FreqCell {
		cohortId: number;
		population: string;
		biobankSlug: string;
		af: number;
		ac: number;
		an: number;
		nHetero: number | null;
		nHomo: number | null;
		nHomoRef: number | null;
	}
	interface GeneHit {
		ensemblId: string;
		symbol: string;
		geneType: string;
		start: number;
		end: number;
		strand: string;
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
		genes?: GeneHit[];
		frequencies: FreqCell[];
	}
	interface VariantResponse {
		rows?: VRow[];
		total?: number;
	}
	interface PageTenant {
		slug?: string;
		name?: string;
		scope?: string | null;
	}
	interface PageAnalytics {
		hostname?: string;
		siteDomain?: string;
	}

	let q = $state(sp0.get('q') ?? initialQuery); // bound to the text input
	let gene = $state(sp0.get('gene') ?? '');
	let afMin = $state(sp0.get('afMin') ?? '');
	let afMax = $state(sp0.get('afMax') ?? '');
	let acMin = $state(sp0.get('acMin') ?? '');
	let acMax = $state(sp0.get('acMax') ?? '');
	let qA = $state(sp0.get('q') ?? initialQuery); // debounced/applied values that actually drive queries
	let geneA = $state(sp0.get('gene') ?? '');
	let afMinA = $state(sp0.get('afMin') ?? '');
	let afMaxA = $state(sp0.get('afMax') ?? '');
	let acMinA = $state(sp0.get('acMin') ?? '');
	let acMaxA = $state(sp0.get('acMax') ?? '');
	let rows = $state<VRow[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let lastTrackedQueryKey = '';

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
		if (geneA.trim()) p.set('gene', geneA.trim());
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
		// `any` with all biobanks selected is the cacheable default. `all` still
		// needs the explicit set so the API can require presence in every biobank.
		if (showFilter && selectedSlugs.length && (matchMode === 'all' || selectedSlugs.length < options.length)) {
			p.set('biobanks', selectedSlugs.join(','));
			p.set('match', matchMode);
		}
		return p.toString() + tenantQ + extra;
	}

	const tenantData = $derived((page.data.tenant ?? {}) as PageTenant);
	const analyticsData = $derived((page.data.analytics ?? null) as PageAnalytics | null);

	function analyticsTenantSlug() {
		return tenantData.slug ?? forceTenant ?? 'unknown';
	}

	function analyticsTenantName() {
		return tenantData.name ?? tenantData.slug ?? forceTenant ?? 'unknown';
	}

	function sendAnalyticsEvent(eventName: string, properties: Record<string, unknown>) {
		if (!analyticsData) return;

		let attempts = 0;
		const send = () => {
			if (window.rybbit?.event) {
				window.rybbit.event(eventName, properties);
			} else if (++attempts < 20) {
				window.setTimeout(send, 250);
			}
		};
		send();
	}

	function trackVariantQuery(params: string, response: VariantResponse) {
		if (!analyticsData) return;

		const parsed = new URLSearchParams(params);
		const queryText = parsed.get('q') ?? '';
		const geneText = parsed.get('gene') ?? '';
		const eventKey = [
			analyticsTenantSlug(),
			queryText,
			geneText,
			parsed.get('afMin') ?? '',
			parsed.get('afMax') ?? '',
			parsed.get('acMin') ?? '',
			parsed.get('acMax') ?? '',
			parsed.get('cohorts') ?? '',
			parsed.get('biobanks') ?? '',
			parsed.get('match') ?? '',
			parsed.get('sort') ?? '',
			parsed.get('dir') ?? '',
			parsed.get('limit') ?? '',
			parsed.get('offset') ?? ''
		].join('|');

		if (eventKey === lastTrackedQueryKey) return;
		lastTrackedQueryKey = eventKey;

		sendAnalyticsEvent('variant_query', {
			tenant_slug: analyticsTenantSlug(),
			tenant_name: analyticsTenantName(),
			tenant_scope: tenantData.scope ?? 'global',
			real_hostname: analyticsData.hostname ?? window.location.hostname,
			pathname: window.location.pathname,
			query_text: queryText,
			gene: geneText,
			af_min: parsed.get('afMin') ?? '',
			af_max: parsed.get('afMax') ?? '',
			ac_min: parsed.get('acMin') ?? '',
			ac_max: parsed.get('acMax') ?? '',
			cohorts: parsed.get('cohorts') ?? '',
			biobanks: parsed.get('biobanks') ?? '',
			match_mode: parsed.get('match') ?? 'any',
			sort: parsed.get('sort') ?? '',
			sort_dir: parsed.get('dir') ?? '',
			limit: Number(parsed.get('limit') ?? pageSize),
			offset: Number(parsed.get('offset') ?? offset),
			page: Math.floor(Number(parsed.get('offset') ?? offset) / Number(parsed.get('limit') ?? pageSize)) + 1,
			result_count: response.rows?.length ?? 0,
			total_results: response.total ?? 0,
			has_search_text: Boolean(queryText || geneText),
			has_filters: Boolean(
				parsed.get('afMin') ||
					parsed.get('afMax') ||
					parsed.get('acMin') ||
					parsed.get('acMax') ||
					parsed.get('cohorts') ||
					parsed.get('biobanks') ||
					parsed.get('match')
			),
			api_querystring: params
		});
	}

	// mirror the current query into the page URL so it's copy-paste / bookmark-able
	function syncUrl() {
		const sp = new URLSearchParams();
		if (qA.trim()) sp.set('q', qA.trim());
		if (geneA.trim()) sp.set('gene', geneA.trim());
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
		if (showFilter && selectedSlugs.length && (matchMode === 'all' || selectedSlugs.length < options.length)) {
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
		// an empty filter selection means "none" → no results (not "all")
		if ((showFilter && selectedSlugs.length === 0) || (showPopFilter && selectedCohortIds.length === 0)) {
			rows = [];
			total = 0;
			loading = false;
			return;
		}
		loading = true;
		try {
			const params = buildParams();
			const res = (await fetch(`/api/variants?${params}`).then((r) => r.json())) as VariantResponse;
			if (my !== seq) return; // a newer request superseded this one
			rows = res.rows ?? [];
			total = res.total ?? 0;
			trackVariantQuery(params, res);
		} finally {
			if (my === seq) loading = false;
		}
	}

	// Reactive load with EXPLICIT deps so tracking never depends on async reads.
	// The seq guard in load() drops stale (out-of-order) responses.
	$effect(() => {
		void qA;
		void geneA;
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
		geneA = gene;
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
		gene = '';
		qA = afMinA = afMaxA = acMinA = acMaxA = '';
		geneA = '';
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
	const visibleRows = $derived.by(() => {
		if (!showFilter && !showPopFilter) return rows;

		const slugSet = showFilter ? new Set(selectedSlugs) : null;
		const cohortSet = showPopFilter ? new Set(selectedCohortIds) : null;
		return rows
			.map((r) => {
				const frequencies = r.frequencies.filter(
					(f) => (!slugSet || slugSet.has(f.biobankSlug)) && (!cohortSet || cohortSet.has(f.cohortId))
				);
				return { ...r, frequencies };
			})
			.filter((r) => {
				if (showFilter) {
					if (matchMode === 'all') {
						return selectedSlugs.every((slug) =>
							r.frequencies.some((f) => f.biobankSlug === slug && f.ac > 0)
						);
					}
					return r.frequencies.some((f) => f.ac > 0);
				}
				return r.frequencies.length > 0;
			});
	});
	// shared grid template for the population rows + their header (so they align).
	// The last visible column is max-content so it collapses to its text width.
	const multiPop = $derived(visibleRows.some((r) => r.frequencies.length > 1));
	// Max AF (max across populations) is redundant for a single-population tenant — it just equals Freq.
	const showMaxAf = $derived(display ? cfg.maxAf : !scoped || populations.length > 1);
	const colCount = $derived(3 + (showGene ? 1 : 0) + (showMaxAf ? 1 : 0) + (showVrs ? 1 : 0) + (showGnomad ? 1 : 0));
	const popTmpl = $derived(
		[
			multiPop ? 'minmax(5rem,7rem)' : null,
			vrsExpand ? barMax : `minmax(5rem,${barMax})`, // bar: fixed when VRS absorbs slack, else stretches to fill
			'4rem', // freq
			...(acAnSplit ? ['2.75rem', '3.5rem'] : [showGeno ? '4.5rem' : 'max-content']), // ac/an (split: separate right-aligned cols)
			...(showGeno ? ['2rem', '3rem', '3rem'] : []) // het, hom_alt, hom_ref
		]
			.filter(Boolean)
			.join(' ')
	);
	const frequencyColWidth = $derived(
		frequencyWidthOverride ??
			(multiPop
				? acAnSplit
					? '25rem'
					: showGeno
						? '30rem'
						: '18rem'
				: acAnSplit
					? '16rem'
					: showGeno
						? '22rem'
						: '12rem')
	);
	const geneColWidth = $derived(geneWidthOverride ?? '8rem');
	const variantColWidth = $derived(variantWidthOverride ?? '10rem');
	const fmtAf = (af: number) => (af >= 0.0001 || af === 0 ? af.toFixed(4) : af.toExponential(1));
	const maxAf = (r: VRow) => (r.frequencies.length ? Math.max(...r.frequencies.map((f) => f.af)) : 0);
	const geneLabel = (r: VRow) => (r.genes?.length ? [...new Set(r.genes.map((g) => g.symbol))].join(', ') : '');
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
		<h3 class="text-lg font-semibold">{title || tr($lang, 'variantBrowser')}</h3>
		<p class="text-sm text-muted-foreground">{subtitle || tr($lang, 'vbSubtitle')}</p>
	</div>

	{#if showFilter}
		<div class="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
			<span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tr($lang, 'biobanks')}</span>
			<div class="flex flex-wrap gap-3">
				{#each options as o}
					<label class="flex cursor-pointer items-center gap-1.5">
						<input type="checkbox" checked={selected[o.slug]} onchange={() => toggleBank(o.slug)} class="accent-[var(--primary)]" />
						<span>{o.name}</span>
					</label>
				{/each}
			</div>
			<div class="flex items-center gap-3" class:opacity-40={selectedSlugs.length < 2}>
				<span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tr($lang, 'match')}</span>
				<label class="flex cursor-pointer items-center gap-1.5">
					<input type="radio" name="match" checked={matchMode === 'any'} onchange={() => setMatch('any')} disabled={selectedSlugs.length < 2} class="accent-[var(--primary)]" />
					<span>{tr($lang, 'either')}</span>
				</label>
				<label class="flex cursor-pointer items-center gap-1.5">
					<input type="radio" name="match" checked={matchMode === 'all'} onchange={() => setMatch('all')} disabled={selectedSlugs.length < 2} class="accent-[var(--primary)]" />
					<span>{tr($lang, 'matchAll')}</span>
				</label>
			</div>
		</div>
	{/if}

	{#if showPopFilter}
		<div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
			<span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tr($lang, 'populations')}</span>
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
			<span>{tr($lang, 'tryLabel')}</span>
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
				placeholder="rs123 · rs1|rs2|rs3 · chr7 · 1:1000000-1100000 · 1:1000000-1100000 ISG15"
				class="w-full rounded-md border bg-background px-3 py-2 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring"
			/>
			{#if loading}
				<span class="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-muted border-t-primary"></span>
			{/if}
		</div>
		<button onclick={go} class="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">{tr($lang, 'go')}</button>
		<div class="flex flex-col gap-1">
			<span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{tr($lang, 'gene')}</span>
			<input
				bind:value={gene}
				oninput={onInput}
				onkeydown={(e) => e.key === 'Enter' && go()}
				placeholder="ISG15"
				class="w-24 rounded-md border bg-background px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
			/>
		</div>
		<div class="flex flex-col gap-1">
			<span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{tr($lang, 'alleleFreq')}</span>
			<div class="flex items-center gap-1">
				<input bind:value={afMin} oninput={onInput} placeholder="min" class="w-16 rounded-md border bg-background px-2 py-2 text-sm" />
				<span class="text-muted-foreground">–</span>
				<input bind:value={afMax} oninput={onInput} placeholder="max" class="w-16 rounded-md border bg-background px-2 py-2 text-sm" />
			</div>
		</div>
		<div class="flex flex-col gap-1">
			<span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{tr($lang, 'alleleCount')}</span>
			<div class="flex items-center gap-1">
				<input bind:value={acMin} oninput={onInput} placeholder="min" class="w-16 rounded-md border bg-background px-2 py-2 text-sm" />
				<span class="text-muted-foreground">–</span>
				<input bind:value={acMax} oninput={onInput} placeholder="max" class="w-16 rounded-md border bg-background px-2 py-2 text-sm" />
			</div>
		</div>
		<label class="flex flex-col text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
			{tr($lang, 'perPage')}
			<select value={pageSize} onchange={(e) => setPageSize(Number((e.target as HTMLSelectElement).value))} class="rounded-md border bg-background px-2 py-2 text-sm text-foreground">
				{#each [25, 50, 100, 200, 500] as n}<option value={n}>{n}</option>{/each}
			</select>
		</label>
		<button onclick={reset} class="rounded-md border px-3 py-2 text-sm hover:bg-muted">{tr($lang, 'reset')}</button>
	</div>

	<!-- live curl for the current query -->
	<div class="mb-3 flex items-center gap-2">
		<code class="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">{curlCmd}</code>
		<button onclick={copyCurl} class="shrink-0 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">{curlCopied ? tr($lang, 'copiedLabel') : tr($lang, 'copyCurl')}</button>
		<a href={apiLink} class="shrink-0 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">API ↗</a>
	</div>

	<div class="mb-3">{@render pager()}</div>

	<div class="relative overflow-x-auto rounded-md border">
		<table class={`w-full text-sm ${vrsExpand ? 'table-fixed' : ''}`}>
			{#if vrsExpand}
				<colgroup>
					<col style={`width:${variantColWidth}`} />
					<col class="w-24" />
					{#if showGene}<col style={`width:${geneColWidth}`} />{/if}
					<col style={`width:${frequencyColWidth}`} />
					{#if showMaxAf}<col class="w-20" />{/if}
					{#if showVrs}<col />{/if}
					{#if showGnomad}<col class="w-9" />{/if}
				</colgroup>
			{/if}
			<thead class="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
				<tr>
					<th class={`py-2 pr-3 font-medium ${variantDetailIcon ? 'pl-7' : 'pl-3'}`}><button onclick={() => setSort('variant')} title="Genomic location on the GRCh38 assembly. Chromosome:position, then reference›alternate allele. Click to sort by position." class="inline-flex cursor-help items-center gap-1 uppercase hover:text-foreground">{tr($lang, 'colVariant')} <span class="normal-case text-[9px] text-muted-foreground/70">GRCh38</span> <span class="text-[9px]">{ind('variant')}</span></button></th>
					<th class="px-3 py-2 font-medium"><button onclick={() => setSort('rsid')} title="dbSNP Reference SNP cluster ID (rsID). Links out to NCBI dbSNP. Click to sort." class="inline-flex cursor-help items-center gap-1 uppercase hover:text-foreground">rsID <span class="text-[9px]">{ind('rsid')}</span></button></th>
					{#if showGene}<th class="px-3 py-2 font-medium"><span title="Gene(s) whose transcribed region overlaps this position (Ensembl)." class="cursor-help">Gene</span></th>{/if}
					<th class="px-3 py-2 font-medium">
						<div class="grid items-center gap-x-2 uppercase" style={`grid-template-columns:${popTmpl}`}>
							{#if multiPop}<span class="cursor-help text-left" title="Cohort / population in which the allele frequencies on this row were measured.">{tr($lang, 'colPopulation')}</span>{/if}
							<span></span>
							<button onclick={() => setSort('maxaf')} title="Alternate allele frequency in this population = allele count ÷ allele number (AC ÷ AN). Click to sort." class="inline-flex cursor-help items-center justify-end gap-1 uppercase hover:text-foreground">Freq <span class="text-[9px]">{ind('maxaf')}</span></button>
							{#if acAnSplit}
								<span class="cursor-help text-right" title="Allele count: observed alternate alleles.">AC</span>
								<span class="cursor-help text-right" title="Allele number: total alleles genotyped.">AN</span>
							{:else}
								<span class="cursor-help text-right" title="Allele count / allele number. Observed alternate alleles ÷ total alleles genotyped in this population.">AC/AN</span>
							{/if}
							{#if showGeno}
								<span class="cursor-help text-right text-[9px] tracking-tight" title="HET: heterozygous individuals (one copy of the alternate allele).">HET</span>
								<span class="cursor-help text-right text-[9px] tracking-tight" title="HOM_ALT: homozygous-alternate individuals (two copies of the alternate allele).">HOM_ALT</span>
								<span class="cursor-help text-right text-[9px] tracking-tight" title="HOM_REF: homozygous-reference individuals (no copies of the alternate allele).">HOM_REF</span>
							{/if}
						</div>
					</th>
					{#if showMaxAf}<th class="whitespace-nowrap px-3 py-2 text-right font-medium"><button onclick={() => setSort('maxaf')} title="Highest alternate allele frequency across all populations shown for this variant. Click to sort." class="inline-flex cursor-help items-center gap-1 whitespace-nowrap uppercase hover:text-foreground">Max AF <span class="text-[9px]">{ind('maxaf')}</span></button></th>{/if}
					{#if showVrs}
						<th class={`min-w-0 py-2 font-medium ${vrsExpand ? 'w-full overflow-hidden px-0' : 'px-3'}`}>
							<div class={vrsExpand ? 'vrs-collapse-content' : ''}>
								<button onclick={() => setSort('vrs')} title="GA4GH VRS computed allele identifier (ga4gh:VA.…): a global, sequence-derived variant ID. Click a cell to copy the full ID." class="inline-flex min-w-0 max-w-full cursor-help items-center gap-1 truncate uppercase hover:text-foreground">VRS <span class="text-[9px]">{ind('vrs')}</span></button>
							</div>
						</th>
					{/if}
					{#if showGnomad}<th class="w-9 py-2 pl-0 pr-4"><span class="sr-only">gnomAD</span></th>{/if}
				</tr>
			</thead>
			<tbody>
				{#each visibleRows as r (r.id)}
					<tr class="border-t hover:bg-muted/40">
						<td class={`relative whitespace-nowrap py-2 pr-3 font-mono text-xs ${variantDetailIcon ? 'pl-7' : 'pl-3'}`}>
							<a href={variantHref(r)} title="View variant details" class="group inline-flex items-baseline gap-1 rounded-sm text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring">
								{#if variantDetailIcon}
									<SearchIcon class="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 opacity-70" aria-hidden="true" />
								{/if}
								<span class="font-semibold">chr{r.chromName}-{r.pos}</span>
								<span class="text-muted-foreground group-hover:text-primary">-{r.ref}-{r.alt}</span>
							</a>
						</td>
						<td class="whitespace-nowrap px-3 py-2">
							{#if r.rsid}
								<a class="text-primary hover:underline" href={`https://www.ncbi.nlm.nih.gov/snp/rs${r.rsid}`} target="_blank" rel="noreferrer">rs{r.rsid}</a>
							{:else}<span class="text-muted-foreground">—</span>{/if}
						</td>
						{#if showGene}
							<td class={`px-3 py-2 ${vrsExpand ? 'min-w-0' : 'max-w-36'}`}>
								{#if geneLabel(r)}
									<span class="block truncate text-xs font-medium" title={r.genes?.map((g) => `${g.symbol} (${g.geneType}, ${g.ensemblId})`).join('\n')}>{geneLabel(r)}</span>
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							</td>
						{/if}
						<td class="px-3 py-2">
							<div class="grid items-center gap-x-2 gap-y-1" style={`grid-template-columns:${popTmpl}`}>
								{#each r.frequencies as f}
									{#if multiPop}
										<span class="truncate text-xs text-muted-foreground" title={f.population}>{f.population}</span>
									{/if}
									<span class="af-track h-2 cursor-help overflow-hidden rounded-full" title={`${f.population} · alt allele freq ${fmtAf(f.af)} · AC ${f.ac}/${f.an}`}>
										<span class="af-fill block h-full rounded-full" style={`width:${Math.min(100, f.af * 100)}%`}></span>
									</span>
									<span class="text-right font-mono text-[11px] tabular-nums">{fmtAf(f.af)}</span>
									{#if acAnSplit}
										<span class="text-right font-mono text-[10px] tabular-nums text-muted-foreground" title="allele count">{f.ac}</span>
										<span class="text-right font-mono text-[10px] tabular-nums text-muted-foreground" title="allele number">{f.an}</span>
									{:else}
										<span class="text-right font-mono text-[10px] tabular-nums text-muted-foreground" title="allele count / allele number">{f.ac}/{f.an}</span>
									{/if}
									{#if showGeno}
										<span class="text-right font-mono text-[10px] tabular-nums text-muted-foreground" title="heterozygous">{f.nHetero ?? '—'}</span>
										<span class="text-right font-mono text-[10px] tabular-nums text-muted-foreground" title="homozygous alt">{f.nHomo ?? '—'}</span>
										<span class="text-right font-mono text-[10px] tabular-nums text-muted-foreground" title="homozygous ref">{f.nHomoRef ?? '—'}</span>
									{/if}
								{/each}
							</div>
						</td>
						{#if showMaxAf}<td class="px-3 py-2 text-right font-mono text-xs">{fmtAf(maxAf(r))}</td>{/if}
						{#if showVrs}
							<td class={`min-w-0 py-2 ${vrsExpand ? 'w-full max-w-0 overflow-hidden px-0' : 'px-3'}`}>
								{#if r.vrsDigest}
									<div class={vrsExpand ? 'vrs-collapse-content' : ''}>
										<button
											onclick={() => copyVrs(r.vrsDigest!)}
											class={`box-border min-w-0 max-w-full rounded border px-1.5 py-0.5 font-mono text-[10px] hover:bg-muted ${vrsExpand ? 'inline-block truncate text-left align-middle' : ''}`}
											title={`ga4gh:VA.${r.vrsDigest} · click to copy`}
										>
											{copied === r.vrsDigest ? 'copied!' : vrsExpand ? `VA.${r.vrsDigest}` : `VA.${r.vrsDigest.slice(0, 6)}…`}
										</button>
									</div>
								{:else}<span class="text-muted-foreground">—</span>{/if}
							</td>
						{/if}
						{#if showGnomad}
							<td class="w-9 py-2 pl-0 pr-4 text-right">
								<a href={gnomadUrl(r)} target="_blank" rel="noopener" title={`View ${r.chromName}-${r.pos}-${r.ref}-${r.alt} on gnomAD (r4)`} class="inline-flex items-center">
									<img src="/icons/gnomad.png" alt="gnomAD" class="size-4 opacity-70 transition-opacity hover:opacity-100" />
								</a>
							</td>
						{/if}
					</tr>
				{/each}
				{#if !visibleRows.length && !loading}
					<tr><td colspan={colCount} class="px-3 py-10 text-center text-muted-foreground">{tr($lang, 'noVariants')}</td></tr>
				{/if}
			</tbody>
		</table>
	</div>

	<div class="mt-3">{@render pager()}</div>
</section>

{#snippet pager()}
	<div class="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
		<span>{loading ? tr($lang, 'loadingLabel') : `${total.toLocaleString()} ${tr($lang, 'variantsLower')}`}</span>
		<div class="flex flex-wrap items-center gap-1">
			<button onclick={() => goPage(curPage - 1)} disabled={curPage <= 1} class="rounded-md border px-2.5 py-1 disabled:opacity-40 hover:bg-muted">{tr($lang, 'prev')}</button>
			{#each pageItems as it}
				{#if it === '…'}
					<span class="px-1 text-muted-foreground">…</span>
				{:else}
					<button onclick={() => goPage(it)} class={`min-w-8 rounded-md border px-2 py-1 ${it === curPage ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{it}</button>
				{/if}
			{/each}
			<button onclick={() => goPage(curPage + 1)} disabled={curPage >= totalPages} class="rounded-md border px-2.5 py-1 disabled:opacity-40 hover:bg-muted">{tr($lang, 'next')}</button>
		</div>
	</div>
{/snippet}

<style>
	.vrs-collapse-content {
		display: block;
		width: 100%;
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
	}
</style>
