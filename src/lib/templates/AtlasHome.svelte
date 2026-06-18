<script lang="ts">
	import GeoMap from '$lib/components/widgets/GeoMap.svelte';
	import { lang, tr } from '$lib/i18n';
	import brazilStatesUrl from '$lib/data/brazil-states.geojson?url';

	let { data } = $props();
	const tenant = $derived(data.tenant);
	const L = $derived($lang);
	const isCarigenetics = $derived(tenant.slug === 'carigenetics');
	const isBipmed = $derived(tenant.slug === 'bipmed');
	const isPgp = $derived(tenant.slug === 'pgp-harvard');
	const isOneKgp = $derived(tenant.slug === '1kgp');
	type LegendItem = { max: number; color: string; label: () => string };

	// coverage ramp (matches the original BIPMed atlas legend)
	const DEFAULT_RAMP: LegendItem[] = [
		{ max: 0, color: '#f3f8f8', label: () => tr(L, 'noSamples') },
		{ max: 100, color: '#dff2f1', label: () => '(0, 100]' },
		{ max: 200, color: '#b8e4e5', label: () => '(100, 200]' },
		{ max: 300, color: '#84cfd6', label: () => '(200, 300]' },
		{ max: 400, color: '#54b3c2', label: () => '(300, 400]' },
		{ max: 500, color: '#337f98', label: () => '(400, 500]' },
		{ max: Infinity, color: '#1e3850', label: () => '(500, 700]' }
	];
	const CARIBBEAN_RAMP: LegendItem[] = [
		{ max: 0, color: '#f3f4f6', label: () => tr(L, 'noSamples') },
		{ max: 100, color: '#d9f99d', label: () => '(0, 100]' },
		{ max: 200, color: '#86efac', label: () => '(100, 200]' },
		{ max: 300, color: '#22c55e', label: () => '(200, 300]' },
		{ max: 400, color: '#06b6d4', label: () => '(300, 400]' },
		{ max: 500, color: '#2563eb', label: () => '(400, 500]' },
		{ max: Infinity, color: '#581c87', label: () => '(500, 700]' }
	];
	const PGP_RAMP: LegendItem[] = [
		{ max: 0, color: '#faf3f2', label: () => tr(L, 'noSamples') },
		{ max: 100, color: '#fbe0db', label: () => '(0, 100]' },
		{ max: 200, color: '#f6b6aa', label: () => '(100, 200]' },
		{ max: 300, color: '#ec8775', label: () => '(200, 300]' },
		{ max: 400, color: '#d9533e', label: () => '(300, 400]' },
		{ max: 500, color: '#b0301f', label: () => '(400, 500]' },
		{ max: Infinity, color: '#7a1c12', label: () => '(500, 700]' }
	];
	const RAMP = $derived(isCarigenetics ? CARIBBEAN_RAMP : isPgp ? PGP_RAMP : DEFAULT_RAMP);
	const colorFor = (n: number) => RAMP.find((r) => n <= r.max)!.color;
	const superpopColors: Record<string, string> = {
		AFR: '#2563eb',
		AMR: '#f97316',
		EAS: '#dc2626',
		EUR: '#7c3aed',
		SAS: '#16a34a'
	};
	const regionColors: Record<string, string> = {
		'North America': '#2563eb',
		Caribbean: '#06b6d4',
		'West Africa': '#10b981',
		'East Africa': '#84cc16',
		Europe: '#7c3aed',
		'European diaspora': '#a855f7',
		'South America': '#f97316',
		'Latin American diaspora': '#fb923c',
		'East Asia': '#dc2626',
		'Southeast Asia': '#ef4444',
		'South Asia': '#16a34a',
		'South Asian diaspora': '#22c55e'
	};
	const colorMixFor = (p: any) =>
		[...new Set((p.countryMappings ?? []).map((m: any) => regionColors[m.regionGroup]).filter(Boolean))];
	const mixedBackground = (p: any) => {
		const colors = p.colorMix?.length > 1 ? p.colorMix : [p.color ?? 'var(--primary)'];
		const step = 100 / colors.length;
		const stops = colors.flatMap((color: string, i: number) => [`${color} ${i * step}%`, `${color} ${(i + 1) * step}%`]);
		return `linear-gradient(135deg, ${stops.join(',')})`;
	};

	const pins = $derived(data.populations.map((p: any) => ({ ...p, color: isOneKgp ? (superpopColors[p.name] ?? colorFor(p.sampleCount)) : colorFor(p.sampleCount), colorMix: isOneKgp ? colorMixFor(p) : undefined })));
	const mainMapPins = $derived(isCarigenetics ? pins.filter((p: any) => p.name !== 'Bermuda') : pins);
	const bermudaPins = $derived(isCarigenetics ? pins.filter((p: any) => p.name === 'Bermuda') : []);
	const mapSource = $derived(isCarigenetics ? '/caribbean.geo.json' : isBipmed ? brazilStatesUrl : '/world.geo.json');
	const legendItems = $derived(
		isOneKgp
			? (pins.map((p: any) => ({ max: Infinity, color: p.color, label: () => p.name })) satisfies LegendItem[])
			: isBipmed
			? ([{ max: Infinity, color: pins[0]?.color ?? 'var(--map-pin)', label: () => `Brazil cohort · ${fmt(pins[0]?.sampleCount ?? 0)} participants` }] satisfies LegendItem[])
			: RAMP
	);
	let mapHover = $state<any | null>(null);
	let activeSuperpop = $state<any | null>(null);

	const countries = $derived([...new Set(data.populations.flatMap((p: any) => p.countryMappings?.length ? p.countryMappings.map((m: any) => m.country) : [p.country]))]);
	const region = $derived(
		countries.length === 1 ? (countries[0] as string) : tenant.slug === 'carigenetics' ? 'the Caribbean' : tenant.slug === '1kgp' ? '1KGP countries' : 'the World'
	);
	const activeCountryNames = $derived((activeSuperpop ?? mapHover)?.countryMappings?.map((m: any) => m.country) ?? []);
	const superpopCountryCount = (p: any) => new Set((p.countryMappings ?? []).map((m: any) => m.countryCode)).size;

	const fmt = (n: number) => n.toLocaleString();
	const vc = $derived(data.variantClasses);
	const assays = $derived([...new Set(data.datasets.map((d: any) => d.assay))]);

	const tryQueries = ['BRCA1', 'rs2465136', 'p.Arg124His', '1:1000000-1100000', 'chr7'];
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
	<button class="brand-gradient group inline-flex cursor-pointer items-center gap-1.5 rounded-md px-5 py-2 text-sm font-semibold text-white transition-all duration-200 hover:scale-105 hover:shadow-lg active:scale-95">
		{tr(L, 'explore')}
		<span class="transition-transform duration-200 group-hover:translate-x-1">→</span>
	</button>
</form>

<div class="grid items-start gap-6 lg:grid-cols-[1.35fr_1fr]">
	<!-- LEFT: big map -->
	<section class="card-surface flex flex-col p-5">
		<div class="mb-4 flex items-start justify-between gap-4 sm:mb-5">
			<div>
				<p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tr(L, 'stateAtlas')}</p>
				<h2 class="text-2xl font-bold tracking-tight">{isBipmed ? 'Brazil states' : tr(L, 'byCoverage', { region })}</h2>
			</div>
		</div>
		<div class="mb-4 sm:mb-5">
			<p class="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tr(L, 'legend')}</p>
			<div class="flex h-2.5 w-full overflow-hidden rounded-full">
				{#each legendItems as r}<span class="flex-1" style={`background:${r.color}`}></span>{/each}
			</div>
			<div class="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
				{#each legendItems as r}
					<span class="flex items-center gap-1"><span class="size-2.5 rounded-full" style={`background:${r.color}`}></span>{r.label()}</span>
				{/each}
			</div>
		</div>
		<div class="relative min-h-[420px] flex-1">
			{#if isOneKgp}
				<div class="absolute left-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5">
					{#each pins as p}
						<button
							type="button"
							class="rounded-md border bg-card/95 px-2.5 py-1.5 text-xs font-semibold shadow-sm"
							style={`border-color:${p.color}; background:${mixedBackground(p)}; color:white; text-shadow:0 1px 1px rgb(0 0 0 / 0.35)`}
							onmouseenter={() => (activeSuperpop = p)}
							onmouseleave={() => (activeSuperpop = null)}
							onfocus={() => (activeSuperpop = p)}
							onblur={() => (activeSuperpop = null)}
						>
							{p.name} · {fmt(p.sampleCount)} · {superpopCountryCount(p)} countries
						</button>
					{/each}
				</div>
			{/if}
			<GeoMap pins={mainMapPins} center={tenant.map.center} zoom={tenant.map.zoom} showMatchedDots={isCarigenetics || isOneKgp} showDots={!isCarigenetics && !isBipmed} showLabels={isCarigenetics || isOneKgp} labelScale={isCarigenetics ? 0.42 : isOneKgp ? 0.82 : 1} markerScale={isCarigenetics ? 0.08 : isOneKgp ? 1.28 : undefined} fit={isCarigenetics ? 'slice' : 'meet'} backgroundSource={isBipmed ? '/world.geo.json' : null} source={mapSource} highlightedCountries={activeCountryNames} highlightAllFeatures={isBipmed} tooltipPlacement={isCarigenetics ? 'open-water' : 'top-left'} showTooltip={!isCarigenetics} onhover={(p) => (mapHover = p)} />
			{#if isCarigenetics && bermudaPins.length}
				<div class="absolute right-3 top-3 h-32 w-44 overflow-hidden rounded-md border bg-card/95 p-1.5 shadow-lg">
					<div
						class="absolute left-2 top-2 z-10 cursor-pointer rounded border bg-card/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
						style={`border-color:${bermudaPins[0].color}`}
						role="button"
						tabindex="0"
						onmouseenter={() => (mapHover = bermudaPins[0])}
						onmouseleave={() => (mapHover = null)}
						onfocus={() => (mapHover = bermudaPins[0])}
						onblur={() => (mapHover = null)}
					>
						Bermuda <span class="font-extrabold" style={`color:${bermudaPins[0].color}`}>{fmt(bermudaPins[0].sampleCount)}</span>
					</div>
					<GeoMap pins={bermudaPins} center={[32.31915, -64.76696]} zoom={1100} showMatchedDots showDots={false} source="/bermuda.geo.json" framed={false} showTooltip={false} onhover={(p) => (mapHover = p)} />
				</div>
			{/if}
			{#if isCarigenetics && mapHover}
				<div class="pointer-events-none absolute left-[27%] top-[70%] z-20 -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-popover/95 px-3 py-2 text-xs shadow-lg">
					<div class="font-semibold text-popover-foreground">{mapHover.name}</div>
					<div class="mt-1 flex gap-3 text-popover-foreground">
						<span>{fmt(mapHover.sampleCount)} samples</span>
						<span>{fmt(mapHover.variantCount)} variants</span>
					</div>
				</div>
			{/if}
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
				{#if isCarigenetics || isOneKgp}
					<div class="mt-2 grid gap-1 text-xs" style="color:#41538f">
						{#each pins as p}
							<div class="flex items-center justify-between gap-3">
								<span class="truncate">{p.name}{isOneKgp ? ` · ${superpopCountryCount(p)} countries` : ''}</span>
								<strong class="shrink-0 tabular-nums">{fmt(p.sampleCount)}</strong>
							</div>
						{/each}
					</div>
				{:else}
					<div class="mt-2 truncate text-xs" style="color:#41538f">{countries.join(', ')}</div>
				{/if}
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
			<div
				class="card-surface p-4"
				onmouseenter={() => isOneKgp && (activeSuperpop = pins.find((p: any) => p.name === d.superPopulation))}
				onmouseleave={() => isOneKgp && (activeSuperpop = null)}
			>
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
