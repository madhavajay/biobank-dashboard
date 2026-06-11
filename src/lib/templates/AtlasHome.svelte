<script lang="ts">
	import GeoMap from '$lib/components/widgets/GeoMap.svelte';
	import { lang, tr } from '$lib/i18n';

	let { data } = $props();
	const tenant = $derived(data.tenant);
	const L = $derived($lang);

	// coverage ramp (matches the original BIPMed atlas legend)
	const RAMP = [
		{ max: 0, color: '#f3f8f8', label: () => tr(L, 'noSamples') },
		{ max: 100, color: '#dff2f1', label: () => '(0, 100]' },
		{ max: 200, color: '#b8e4e5', label: () => '(100, 200]' },
		{ max: 300, color: '#84cfd6', label: () => '(200, 300]' },
		{ max: 400, color: '#54b3c2', label: () => '(300, 400]' },
		{ max: 500, color: '#337f98', label: () => '(400, 500]' },
		{ max: Infinity, color: '#1e3850', label: () => '(500, 700]' }
	];
	const colorFor = (n: number) => RAMP.find((r) => n <= r.max)!.color;

	const pins = $derived(data.populations.map((p: any) => ({ ...p, color: colorFor(p.sampleCount) })));

	const countries = $derived([...new Set(data.populations.map((p: any) => p.country))]);
	const region = $derived(
		countries.length === 1 ? (countries[0] as string) : tenant.slug === 'carigenetics' ? 'the Caribbean' : 'the World'
	);

	const fmt = (n: number) => n.toLocaleString();
	const vc = $derived(data.variantClasses);
	const assays = $derived([...new Set(data.datasets.map((d: any) => d.assay))]);

	const tryQueries = ['rs2465136', '1:1000000-1100000', 'chr7', 'ga4gh:VA.3W84-kCDOBIiXcaOdX8XvHqgcoTx7u2a'];
	const exploreLink = (q: string) =>
		`/explore?q=${encodeURIComponent(q)}${data.forceTenant ? `&tenant=${data.forceTenant}` : ''}`;
</script>

<!-- try bar -->
<div class="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
	<span>Try:</span>
	{#each tryQueries as ex}
		<a href={exploreLink(ex)} class="max-w-[14rem] truncate rounded-full border px-2 py-0.5 font-mono hover:bg-muted hover:text-foreground">{ex}</a>
	{/each}
</div>

<!-- search band -->
<form method="GET" action="/explore" class="mb-6 flex items-center gap-2 rounded-[var(--radius)] border bg-card p-2.5 shadow-sm">
	{#if data.forceTenant}<input type="hidden" name="tenant" value={data.forceTenant} />{/if}
	<svg viewBox="0 0 24 24" class="ml-2 size-5 text-muted-foreground" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
	<input name="q" placeholder={tr(L, 'search')} class="flex-1 bg-transparent px-1 py-2 text-sm outline-none" />
	<button class="brand-gradient group inline-flex items-center gap-1.5 rounded-md px-5 py-2 text-sm font-semibold text-white transition-all duration-200 hover:scale-105 hover:shadow-lg active:scale-95">
		{tr(L, 'explore')}
		<span class="transition-transform duration-200 group-hover:translate-x-1">→</span>
	</button>
</form>

<div class="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
	<!-- LEFT: big map -->
	<section class="card-surface flex flex-col p-5">
		<div class="mb-3 flex items-start justify-between gap-4">
			<div>
				<p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tr(L, 'stateAtlas')}</p>
				<h2 class="text-2xl font-bold tracking-tight">{tr(L, 'byCoverage', { region })}</h2>
			</div>
		</div>
		<div class="mb-3">
			<p class="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tr(L, 'legend')}</p>
			<div class="flex h-2.5 w-full overflow-hidden rounded-full">
				{#each RAMP as r}<span class="flex-1" style={`background:${r.color}`}></span>{/each}
			</div>
			<div class="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
				{#each RAMP as r}
					<span class="flex items-center gap-1"><span class="size-2.5 rounded-full" style={`background:${r.color}`}></span>{r.label()}</span>
				{/each}
			</div>
		</div>
		<div class="min-h-[420px] flex-1">
			<GeoMap {pins} center={tenant.map.center} zoom={tenant.map.zoom} />
		</div>
	</section>

	<!-- RIGHT: database totals -->
	<aside class="flex flex-col gap-4">
		<div class="flex items-center justify-between">
			<div>
				<p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tr(L, 'coreStats')}</p>
				<h2 class="text-2xl font-bold tracking-tight">{tr(L, 'databaseTotals')}</h2>
			</div>
		</div>

		<div class="grid grid-cols-2 gap-3">
			<!-- participants -->
			<div class="rounded-xl p-4" style="background:#e8f3ee">
				<div class="flex items-center justify-between">
					<span class="text-[11px] font-semibold uppercase tracking-wide" style="color:#2f7a57">{tr(L, 'participants')}</span>
					<span class="text-2xl font-extrabold" style="color:#1d3a2c">{fmt(data.totals.participants)}</span>
				</div>
				<div class="mt-2 text-xs" style="color:#3c6b54">{data.totals.populations} {tr(L, 'populations').toLowerCase()}</div>
			</div>
			<!-- datasets -->
			<div class="rounded-xl p-4" style="background:#fbf2d6">
				<div class="flex items-center justify-between">
					<span class="text-[11px] font-semibold uppercase tracking-wide" style="color:#9a7a1e">{tr(L, 'datasets')}</span>
					<span class="text-2xl font-extrabold" style="color:#5c4a13">{fmt(data.totals.datasetCount)}</span>
				</div>
				<div class="mt-2 flex flex-col gap-0.5 text-xs" style="color:#7a6320">
					{#each assays as a}<span>{a}</span>{/each}
				</div>
			</div>
			<!-- populations -->
			<div class="rounded-xl p-4" style="background:#e9eefb">
				<div class="flex items-center justify-between">
					<span class="text-[11px] font-semibold uppercase tracking-wide" style="color:#3a55a8">{tr(L, 'populations')}</span>
					<span class="text-2xl font-extrabold" style="color:#22325f">{fmt(data.totals.populations)}</span>
				</div>
				<div class="mt-2 truncate text-xs" style="color:#41538f">{countries.join(', ')}</div>
			</div>
			<!-- variants -->
			<div class="rounded-xl p-4 text-white" style="background:#1e3850">
				<div class="flex items-center justify-between">
					<span class="text-[11px] font-semibold uppercase tracking-wide text-white/70">{tr(L, 'variants')}</span>
					<span class="text-2xl font-extrabold">{fmt(data.totals.variants)}</span>
				</div>
				<div class="mt-2 flex flex-col gap-0.5 text-xs text-white/85">
					<span class="flex justify-between"><span>{tr(L, 'common')}</span><strong>{fmt(vc.common)}</strong></span>
					<span class="flex justify-between"><span>{tr(L, 'lowFreq')}</span><strong>{fmt(vc.lowFreq)}</strong></span>
					<span class="flex justify-between"><span>{tr(L, 'rare')}</span><strong>{fmt(vc.rare)}</strong></span>
				</div>
			</div>
		</div>

		<!-- dataset card(s) -->
		{#each data.datasets as d}
			<div class="card-surface p-4">
				<div class="flex items-center justify-between">
					<p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tr(L, 'dataset')}</p>
					<span class="rounded-full px-2 py-0.5 text-xs" style="background:color-mix(in oklch, var(--primary) 14%, transparent); color:var(--primary)">{d.release}</span>
				</div>
				<h3 class="mt-1 text-base font-bold">{d.title}</h3>
				<p class="mt-1 text-xs text-muted-foreground">{d.description}</p>
				<dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
					<div><dt class="text-muted-foreground">{tr(L, 'participants')}</dt><dd class="font-semibold">{fmt(d.participants ?? 0)}</dd></div>
					<div><dt class="text-muted-foreground">{tr(L, 'variants')}</dt><dd class="font-semibold">{fmt(d.variants ?? 0)}</dd></div>
					<div><dt class="text-muted-foreground">{tr(L, 'assay')}</dt><dd class="font-semibold">{d.assay}</dd></div>
					<div><dt class="text-muted-foreground">{tr(L, 'build')}</dt><dd class="font-semibold">{d.genomeBuild}</dd></div>
					{#if d.access}
						<div class="col-span-2"><dt class="text-muted-foreground">{tr(L, 'access')}</dt><dd class="font-semibold">{d.access}</dd></div>
					{/if}
				</dl>
			</div>
		{/each}
	</aside>
</div>
