<script lang="ts">
	import GeoMap from '$lib/components/widgets/GeoMap.svelte';
	import { TENANTS } from '$lib/tenants';

	let { data } = $props();
	const tenant = $derived(data.tenant);
	const banks = $derived(data.biobanks);
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

	const pins = $derived(
		banks.flatMap((b: any) =>
			b.populations.map((p: any) => ({
				...p,
				biobankSlug: b.slug,
				biobankName: b.name,
				color: b.slug === '1kgp' ? (superpopColors[p.name] ?? undefined) : undefined,
				colorMix: b.slug === '1kgp' ? colorMixFor(p) : undefined
			}))
		)
	);
	const sortedPins = $derived([...pins].sort((a: any, b: any) => a.name.localeCompare(b.name)));
	const caribbeanPins = $derived(pins.filter((p: any) => p.biobankSlug === 'carigenetics' && p.name !== 'Bermuda'));
	const bermudaPins = $derived(pins.filter((p: any) => p.biobankSlug === 'carigenetics' && p.name === 'Bermuda'));
	const oneKgpPins = $derived(pins.filter((p: any) => p.biobankSlug === '1kgp'));
	let activeSuperpop = $state<any | null>(null);
	const activeCountryNames = $derived(activeSuperpop?.countryMappings?.map((m: any) => m.country) ?? []);
	const caribbeanSampleTotal = $derived(
		[...caribbeanPins, ...bermudaPins].reduce((s: number, p: any) => s + p.sampleCount, 0)
	);
	const totalSamples = $derived(pins.reduce((s: number, p: any) => s + p.sampleCount, 0));
	const totalVariants = $derived(data.totals.variants);
	const assays = $derived([...new Set(data.datasets.map((d: any) => d.assay).filter(Boolean))]);
	const vc = $derived(data.variantClasses);

	const tenantFor = (slug: string) => TENANTS.find((t) => t.slug === slug);
	const go = (slug: string) => `/?tenant=${slug}`;
	const exploreLink = (q = '') =>
		`/${q || data.forceTenant ? '?' : ''}${q ? `q=${encodeURIComponent(q)}` : ''}${data.forceTenant ? `${q ? '&' : ''}tenant=${data.forceTenant}` : ''}`;
	const fmt = (n: number) => n.toLocaleString();
	const tryQueries = ['BRCA1', 'rs1050828', 'p.Arg124His', 'G6PD', 'chr17:43078520'];
	const sampleTotalFor = (slug: string) =>
		pins.filter((p: any) => p.biobankSlug === slug).reduce((s: number, p: any) => s + p.sampleCount, 0);

	const mapLabels = [
		{ label: 'USA', slug: 'pgp-harvard', class: 'left-[19%] top-[38%]' },
		{ label: 'Caribbean', slug: 'carigenetics', class: 'left-[29%] top-[57%]' },
		{ label: 'Brazil', slug: 'bipmed', class: 'left-[38%] top-[66%]' }
	];
	const superpopLayout: Record<string, string> = {
		AFR: 'left-[55%] top-[46%]',
		AMR: 'left-[29%] top-[49%]',
		EAS: 'left-[81%] top-[33%]',
		EUR: 'left-[52%] top-[23%]',
		SAS: 'left-[71%] top-[38%]'
	};
	const superpopCountryCount = (p: any) => new Set((p.countryMappings ?? []).map((m: any) => m.countryCode)).size;

	const islandLayouts: Record<string, { left: number; top: number; anchorX: number; anchorY: number }> = {
		Bahamas: { left: 45, top: 24, anchorX: 31, anchorY: 43 },
		'British Virgin Islands': { left: 59, top: 30, anchorX: 35, anchorY: 48 },
		'Saint Lucia': { left: 48, top: 43, anchorX: 36, anchorY: 52 },
		Barbados: { left: 64, top: 45, anchorX: 38, anchorY: 53 },
		'Trinidad & Tobago': { left: 53, top: 59, anchorX: 36, anchorY: 56 }
	};
	const fallbackIslandLayouts = [
		{ left: 45, top: 24, anchorX: 31, anchorY: 43 },
		{ left: 59, top: 30, anchorX: 35, anchorY: 48 },
		{ left: 48, top: 43, anchorX: 36, anchorY: 52 },
		{ left: 64, top: 45, anchorX: 38, anchorY: 53 },
		{ left: 53, top: 59, anchorX: 36, anchorY: 56 },
		{ left: 67, top: 60, anchorX: 39, anchorY: 56 }
	];
	const islandLayout = (name: string, index = 0) => islandLayouts[name] ?? fallbackIslandLayouts[index % fallbackIslandLayouts.length];
	const bermudaLayout = { left: 25, top: 9, anchorX: 31, anchorY: 34 };
</script>

<div class="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
	<span>Try:</span>
	{#each tryQueries as ex}
		<a href={exploreLink(ex)} class="max-w-[14rem] truncate rounded-full border px-2 py-0.5 font-mono hover:bg-muted hover:text-foreground">{ex}</a>
	{/each}
</div>

<form method="GET" action="/" class="mb-6 flex items-center gap-2 rounded-[var(--radius)] border bg-card p-2.5 shadow-sm">
	{#if data.forceTenant}<input type="hidden" name="tenant" value={data.forceTenant} />{/if}
	<svg viewBox="0 0 24 24" class="ml-2 size-5 text-muted-foreground" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
	<input name="q" placeholder="Search variants, genes, rsIDs, regions, or HGVS consequences" class="flex-1 bg-transparent px-1 py-2 text-sm outline-none" />
	<button class="brand-gradient group inline-flex cursor-pointer items-center gap-1.5 rounded-md px-5 py-2 text-sm font-semibold text-white transition-all duration-200 hover:scale-105 hover:shadow-lg active:scale-95">
		Explore
		<span class="transition-transform duration-200 group-hover:translate-x-1">-></span>
	</button>
</form>

<div class="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
	<section class="card-surface overflow-hidden">
		<div class="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4">
			<div class="flex items-center gap-3">
				<img src="/tenants/biovault/logo.png" alt="BioVault" class="size-10 rounded-lg" />
				<div>
					<p class="text-[11px] font-semibold uppercase tracking-widest text-primary">BioVault Data</p>
					<h1 class="text-xl font-bold tracking-tight">Global allele-frequency network</h1>
				</div>
			</div>
			<div class="flex flex-wrap gap-2 text-xs">
				<span class="rounded-full border bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">{banks.length} biobanks</span>
				<span class="rounded-full border bg-sky-50 px-2.5 py-1 font-medium text-sky-700">{pins.length} populations</span>
				<a href="/api/biobanks" class="rounded-full border px-2.5 py-1 font-medium hover:bg-muted">API</a>
			</div>
		</div>

		<div class="relative h-[430px] sm:h-[520px] lg:h-[650px]">
			<GeoMap
				{pins}
				center={tenant.map.center}
				zoom={tenant.map.zoom}
				showMatchedDots
				hideDotsFor={['pgp-harvard', 'bipmed']}
				highlightedCountries={activeCountryNames}
				framed={false}
				tooltipPlacement="bottom-left"
				onhover={(p) => (activeSuperpop = p?.biobankSlug === '1kgp' ? p : null)}
				onselect={(p) => (location.href = go(p.biobankSlug))}
			/>

			{#each mapLabels as item}
				<a
					href={go(item.slug)}
					class={`absolute z-20 rounded-full border bg-card/95 px-3 py-1 text-xs font-bold shadow-sm hover:bg-muted ${item.class}`}
				>
					<span>{item.label}</span>
					<span class="ml-1 font-mono text-[10px] text-muted-foreground">{fmt(item.slug === 'carigenetics' ? caribbeanSampleTotal : sampleTotalFor(item.slug))}</span>
				</a>
			{/each}

			{#each oneKgpPins as p}
				<a
					href={go('1kgp')}
					class={`absolute z-30 rounded-md border bg-card/95 px-2.5 py-1.5 text-xs font-bold shadow-sm hover:bg-muted ${superpopLayout[p.name] ?? 'left-[50%] top-[50%]'}`}
					style={`border-color:${p.color}; background:${mixedBackground(p)}; color:white; text-shadow:0 1px 1px rgb(0 0 0 / 0.35)`}
					onmouseenter={() => (activeSuperpop = p)}
					onmouseleave={() => (activeSuperpop = null)}
					onfocus={() => (activeSuperpop = p)}
					onblur={() => (activeSuperpop = null)}
				>
					<span>{p.name}</span>
					<span class="ml-1 font-mono text-[10px] text-white/90">{fmt(p.sampleCount)}</span>
					<span class="ml-1 text-[10px] font-medium text-white/85">{superpopCountryCount(p)} countries</span>
				</a>
			{/each}

			{#if bermudaPins.length}
				<svg class="pointer-events-none absolute inset-0 z-10 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
					<line
						x1={bermudaLayout.left + 4.8}
						y1={bermudaLayout.top + 4.8}
						x2={bermudaLayout.anchorX}
						y2={bermudaLayout.anchorY}
						stroke="color-mix(in oklch, var(--primary) 56%, transparent)"
						stroke-width="0.22"
						stroke-dasharray="1.2 1"
						vector-effect="non-scaling-stroke"
					/>
					<circle cx={bermudaLayout.anchorX} cy={bermudaLayout.anchorY} r="0.55" fill="var(--primary)" opacity="0.8" />
				</svg>
			{/if}

			{#if bermudaPins.length}
				<a href={go('carigenetics')} class="absolute left-[25%] top-[9%] z-20 w-28 overflow-hidden rounded-md border bg-card/95 p-1 shadow-lg sm:left-[26%] sm:top-[10%] sm:w-32">
					<div class="mb-1.5">
						<div class="text-[9px] font-bold uppercase tracking-wider text-primary">Caribbean - Bermuda</div>
						<div class="mt-0.5 text-[10px] text-muted-foreground">{fmt(bermudaPins[0].sampleCount)} of {fmt(caribbeanSampleTotal)} samples</div>
					</div>
					<div class="h-12 overflow-hidden rounded border sm:h-16">
						<GeoMap
							pins={bermudaPins}
							center={[32.31915, -64.76696]}
							zoom={1100}
							showMatchedDots
							showDots={false}
							source="/bermuda.geo.json"
							framed={false}
							showTooltip={false}
						/>
					</div>
				</a>
			{/if}

			{#if caribbeanPins.length}
				<svg class="pointer-events-none absolute inset-0 z-10 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
					{#each caribbeanPins as island, index}
						{@const layout = islandLayout(island.name, index)}
						<line
							x1={layout.left + 3.8}
							y1={layout.top + 3.2}
							x2={layout.anchorX}
							y2={layout.anchorY}
							stroke="color-mix(in oklch, var(--primary) 56%, transparent)"
							stroke-width="0.22"
							stroke-dasharray="1.2 1"
							vector-effect="non-scaling-stroke"
						/>
						<circle cx={layout.anchorX} cy={layout.anchorY} r="0.55" fill="var(--primary)" opacity="0.8" />
					{/each}
				</svg>
				<div class="absolute inset-0 z-20">
					{#each caribbeanPins as island, index}
						{@const layout = islandLayout(island.name, index)}
						<a
							href={go('carigenetics')}
							class="absolute overflow-hidden rounded border bg-card/95 p-0.5 shadow-sm hover:bg-muted"
							style={`left:${layout.left}%;top:${layout.top}%;width:4.5rem`}
						>
							<div class="truncate text-[7px] font-bold uppercase leading-tight tracking-wide text-primary" title={island.name}>{island.name}</div>
							<div class="text-[7px] leading-tight text-muted-foreground">{fmt(island.sampleCount)}</div>
							<div class="mt-0.5 h-7 overflow-hidden rounded-sm border">
								<GeoMap
									pins={[island]}
									center={[island.lat, island.lon]}
									zoom={70}
									showMatchedDots
									showDots={false}
									source="/caribbean.geo.json"
									framed={false}
									showTooltip={false}
								/>
							</div>
						</a>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<aside class="flex flex-col gap-4">
		<div>
			<p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Core stats</p>
			<h2 class="text-2xl font-bold tracking-tight">Database totals</h2>
		</div>

		<div class="grid grid-cols-2 gap-3">
			<div class="rounded-xl p-4" style="background:#e8f3ee">
				<div class="flex items-center justify-between">
					<span class="text-[11px] font-semibold uppercase tracking-wide" style="color:#2f7a57">Participants</span>
					<span class="text-2xl font-extrabold" style="color:#1d3a2c">{fmt(totalSamples)}</span>
				</div>
				<div class="mt-2 text-xs" style="color:#3c6b54">Across {banks.length} biobanks</div>
			</div>

			<div class="rounded-xl p-4" style="background:#fbf2d6">
				<div class="flex items-center justify-between">
					<span class="text-[11px] font-semibold uppercase tracking-wide" style="color:#9a7a1e">Datasets</span>
					<span class="text-2xl font-extrabold" style="color:#5c4a13">{fmt(data.datasets.length)}</span>
				</div>
				<div class="mt-2 flex flex-col gap-0.5 text-xs" style="color:#7a6320">
					{#each assays as a}<span>{a}</span>{/each}
				</div>
			</div>

			<div class="rounded-xl p-4" style="background:#e9eefb">
				<div class="flex items-center justify-between">
					<span class="text-[11px] font-semibold uppercase tracking-wide" style="color:#3a55a8">Populations</span>
					<span class="text-2xl font-extrabold" style="color:#22325f">{fmt(pins.length)}</span>
				</div>
				<div class="mt-2 grid max-h-40 gap-1 overflow-y-auto pr-1 text-xs" style="color:#41538f">
					{#each sortedPins as p}
						<div class="flex items-center justify-between gap-3">
							<span class="truncate">{p.name}</span>
							<strong class="shrink-0 tabular-nums">{fmt(p.sampleCount)}</strong>
						</div>
					{/each}
				</div>
			</div>

			<div class="rounded-xl p-4 text-white" style="background:#164e43">
				<div class="flex items-center justify-between">
					<span class="text-[11px] font-semibold uppercase tracking-wide text-white/70">Variants</span>
					<span class="text-2xl font-extrabold">{fmt(totalVariants)}</span>
				</div>
				<div class="mt-2 flex flex-col gap-0.5 text-xs text-white/85">
					<span class="flex justify-between"><span>Common</span><strong>{fmt(vc.common)}</strong></span>
					<span class="flex justify-between"><span>Low frequency</span><strong>{fmt(vc.lowFreq)}</strong></span>
					<span class="flex justify-between"><span>Rare</span><strong>{fmt(vc.rare)}</strong></span>
				</div>
			</div>
		</div>

		{#each data.datasets as d}
			<div class="card-surface p-4">
				<div class="flex items-center justify-between gap-3">
					<p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Dataset</p>
					<span class="rounded-full px-2 py-0.5 text-xs" style="background:color-mix(in oklch, var(--primary) 14%, transparent); color:var(--primary)">{d.release ?? 'current'}</span>
				</div>
				<h3 class="mt-1 text-base font-bold">{d.title}</h3>
				<p class="mt-1 text-xs text-muted-foreground">{d.description}</p>
				<dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
					<div><dt class="text-muted-foreground">Participants</dt><dd class="font-semibold">{fmt(d.participants ?? 0)}</dd></div>
					<div><dt class="text-muted-foreground">Variants</dt><dd class="font-semibold">{fmt(d.variants ?? 0)}</dd></div>
					<div><dt class="text-muted-foreground">Assay</dt><dd class="font-semibold">{d.assay}</dd></div>
					<div><dt class="text-muted-foreground">Build</dt><dd class="font-semibold">{d.genomeBuild}</dd></div>
					{#if d.access}
						<div class="col-span-2"><dt class="text-muted-foreground">Access</dt><dd class="font-semibold">{d.access}</dd></div>
					{/if}
				</dl>
			</div>
		{/each}
	</aside>
</div>

<h2 class="mb-3 mt-8 text-lg font-semibold">Biobanks in the network</h2>
<div class="mb-9 grid gap-3 sm:grid-cols-2">
	{#each banks as b}
		{@const t = tenantFor(b.slug)}
		<a href={go(b.slug)} class="card-surface group flex items-center gap-4 p-4 transition hover:shadow-md">
			<span
				class="flex h-14 w-28 shrink-0 items-center justify-center rounded-md border bg-white p-2 shadow-sm"
				style={`border-color:color-mix(in oklch, ${t?.theme.primary ?? 'var(--primary)'} 28%, transparent)`}
			>
				{#if t?.logoImg}
					<img src={t.logoImg} alt={t.name} class="max-h-full max-w-full object-contain" />
				{:else}
					<span class="text-2xl">{t?.logoEmoji ?? 'DNA'}</span>
				{/if}
			</span>
			<div class="min-w-0 flex-1">
				<div class="flex items-center justify-between gap-3">
					<span class="font-semibold">{b.name}</span>
					<span class="shrink-0 text-xs text-muted-foreground group-hover:text-primary">open portal -></span>
				</div>
				<p class="truncate text-sm text-muted-foreground">{b.description}</p>
				<div class="mt-1 flex gap-3 text-xs text-muted-foreground">
					<span>{b.populations.length} pops</span>
					<span>{fmt(b.totalSamples)} samples</span>
					<span>{fmt(b.totalVariants)} variants</span>
				</div>
			</div>
		</a>
	{/each}
</div>
