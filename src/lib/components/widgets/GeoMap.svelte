<script lang="ts">
	import { onMount } from 'svelte';

	interface Pin {
		name: string;
		country: string;
		lat: number;
		lon: number;
		sampleCount: number;
		variantCount: number;
		biobankSlug: string;
		biobankName: string;
		cohortId: number;
		countryMappings?: Array<{ country: string; countryCode?: string; subpopulationCode?: string; subpopulationName?: string }>;
		color?: string; // choropleth fill (coverage ramp)
		colorMix?: string[];
	}
	interface GeoFeature {
		id?: string;
		geometry: {
			type: 'Polygon' | 'MultiPolygon';
			coordinates: unknown;
		};
		geometry_name?: string;
		properties?: { name?: string; NAME?: string; Estado?: string; SIGLA?: string };
	}

	let {
		pins = [],
		center = [10, -20] as [number, number],
		zoom = 1.4,
		showMatchedDots = false,
		showDots = true,
		showLabels = false,
		labelScale = 1,
		markerScale,
		hideDotsFor = [],
		highlightedCountries = [],
		highlightAllFeatures = false,
		showFeatureLabels = false,
		fit = 'meet',
		backgroundSource = null,
		source = '/world.geo.json',
		framed = true,
		tooltipPlacement = 'top-left',
		showTooltip = true,
		onhover = (_p: Pin | null) => {},
		onselect = (_p: Pin) => {}
	}: {
		pins?: Pin[];
		center?: [number, number];
		zoom?: number;
		showMatchedDots?: boolean;
		showDots?: boolean;
		showLabels?: boolean;
		labelScale?: number;
		markerScale?: number;
		hideDotsFor?: string[];
		highlightedCountries?: string[];
		highlightAllFeatures?: boolean;
		showFeatureLabels?: boolean;
		fit?: 'meet' | 'slice';
		backgroundSource?: string | null;
		source?: string;
		framed?: boolean;
		tooltipPlacement?: 'top-left' | 'open-water' | 'bottom-left' | 'bottom-right';
		showTooltip?: boolean;
		onhover?: (p: Pin | null) => void;
		onselect?: (p: Pin) => void;
	} = $props();

	const W = 1000;
	const H = 500;
	type FeaturePath = { name: string; d: string; label: string; labelX: number; labelY: number };
	let backgroundFeatures = $state<FeaturePath[]>([]);
	let features = $state<FeaturePath[]>([]);
	let hover = $state<{ key: string; label: string; samples: number; variants: number } | null>(null);

	const projX = (lon: number) => ((lon + 180) / 360) * W;
	const projY = (lat: number) => ((90 - lat) / 180) * H;

	function ringToPath(ring: number[][]): string {
		return ring.map(([lon, lat], i) => `${i ? 'L' : 'M'}${projX(lon).toFixed(4)} ${projY(lat).toFixed(4)}`).join('') + 'Z';
	}

	function collectCoordinates(coords: unknown, out: number[][] = []): number[][] {
		if (!Array.isArray(coords)) return out;
		if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
			out.push(coords as number[]);
			return out;
		}
		for (const child of coords) collectCoordinates(child, out);
		return out;
	}

	function labelPoint(coords: unknown): [number, number] {
		const pairs = collectCoordinates(coords);
		if (!pairs.length) return [W / 2, H / 2];
		let minX = Infinity;
		let maxX = -Infinity;
		let minY = Infinity;
		let maxY = -Infinity;
		for (const [lon, lat] of pairs) {
			const x = projX(lon);
			const y = projY(lat);
			minX = Math.min(minX, x);
			maxX = Math.max(maxX, x);
			minY = Math.min(minY, y);
			maxY = Math.max(maxY, y);
		}
		return [(minX + maxX) / 2, (minY + maxY) / 2];
	}

	async function loadFeatures(src: string): Promise<FeaturePath[]> {
		const geo = (await fetch(src).then((r) => r.json())) as { features: GeoFeature[] };
		const out: FeaturePath[] = [];
		for (const f of geo.features) {
			const g = f.geometry;
			let d = '';
			if (g.type === 'Polygon') d = (g.coordinates as number[][][]).map(ringToPath).join('');
			else if (g.type === 'MultiPolygon') d = (g.coordinates as number[][][][]).map((poly) => poly.map(ringToPath).join('')).join('');
			const [labelX, labelY] = labelPoint(g.coordinates);
			if (d)
				out.push({
					name: f.properties?.name ?? f.properties?.NAME ?? f.properties?.Estado ?? f.geometry_name ?? f.properties?.SIGLA ?? '',
					label: f.properties?.SIGLA ?? f.id ?? '',
					labelX,
					labelY,
					d
				});
		}
		return out;
	}

	// population.country -> geojson feature name
	const ALIAS: Record<string, string> = {
		Bahamas: 'The Bahamas',
		'The Gambia': 'Gambia',
		'Trinidad and Tobago': 'Trinidad and Tobago',
		'United States': 'United States of America'
	};
	const featureName = (country: string) => ALIAS[country] ?? country;

	const pinByFeature = $derived.by(() => {
		const entries: Array<[string, Pin]> = [];
		for (const p of pins) {
			if (p.country && p.country !== 'Multiple countries') entries.push([featureName(p.country), p]);
			for (const m of p.countryMappings ?? []) entries.push([featureName(m.country), p]);
		}
		return new Map(entries);
	});
	const highlightedFeatureNames = $derived(new Set(highlightedCountries.map(featureName)));
	const firstPin = $derived(pins[0]);
	const pinForFeature = (name: string) => pinByFeature.get(name) ?? (highlightAllFeatures ? firstPin : undefined);
	const pinsAsDots = $derived(
		showDots
			? (showMatchedDots ? pins : pins.filter((p) => !features.some((f) => f.name === featureName(p.country)))).filter(
					(p) => !hideDotsFor.includes(p.biobankSlug) && !hideDotsFor.includes(String(p.cohortId)) && !hideDotsFor.includes(p.name)
				)
			: []
	);

	onMount(async () => {
		try {
			backgroundFeatures = backgroundSource ? await loadFeatures(backgroundSource) : [];
			features = await loadFeatures(source);
		} catch {
			backgroundFeatures = [];
			features = [];
		}
	});

	const vw = $derived(W / zoom);
	const vh = $derived(H / zoom);
	const cx = $derived(Math.min(Math.max(projX(center[1]), vw / 2), W - vw / 2));
	const cy = $derived(Math.min(Math.max(projY(center[0]), vh / 2), H - vh / 2));
	const viewBox = $derived(`${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`);
	const dotR = $derived(Math.max(2.4, 7 / Math.sqrt(zoom)));
	const dotScale = $derived(markerScale ?? (showMatchedDots ? 0.68 : 1));
	const maxSamples = $derived(Math.max(1, ...pins.map((p) => p.sampleCount)));
	const fillForPin = (p: Pin) => (p.colorMix && p.colorMix.length > 1 ? `url(#pin-mix-${p.cohortId})` : (p.color ?? 'var(--map-pin)'));
	const gradientStops = (colors: string[]) => {
		const stops: Array<{ offset: number; color: string }> = [];
		const step = 100 / colors.length;
		colors.forEach((color, i) => {
			stops.push({ offset: i * step, color });
			stops.push({ offset: (i + 1) * step, color });
		});
		return stops;
	};

	function enter(p: Pin, key: string) {
		hover = { key, label: p.name, samples: p.sampleCount, variants: p.variantCount };
		onhover(p);
	}

	function leave() {
		hover = null;
		onhover(null);
	}

	function labelText(p: Pin) {
		if (p.name === 'British Virgin Islands') return 'BVI';
		if (p.name === 'Saint Lucia') return 'St Lucia';
		return p.name;
	}

	function labelOffset(p: Pin): [number, number] {
		const offsets: Record<string, [number, number]> = {
			Bahamas: [16, 1.5],
			Barbados: [-17, -10],
			Bermuda: [2.4, -1.2],
			'British Virgin Islands': [1.9, -3.8],
			'Saint Lucia': [-21, -4],
			'Trinidad & Tobago': [-17, -7]
		};
		return offsets[p.name] ?? [2, -2];
	}

	function labelAnchor(p: Pin): [number, number] {
		const anchors: Record<string, [number, number]> = {
			Bahamas: [24.9, -77.9]
		};
		return anchors[p.name] ?? [p.lat, p.lon];
	}

	function labelWidth(p: Pin) {
		return Math.max(17, labelText(p).length * 1.55 + 10.5) * labelScale;
	}

	function tooltipClass() {
		const base = 'pointer-events-none absolute rounded-lg border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur';
		const positions = {
			'top-left': 'left-3 top-3',
			'open-water': 'left-[27%] top-[70%] -translate-x-1/2 -translate-y-1/2',
			'bottom-left': 'bottom-3 left-3',
			'bottom-right': 'bottom-3 right-3'
		};
		return `${base} ${positions[tooltipPlacement]}`;
	}
</script>

<div
	class={[
		'relative h-full w-full overflow-hidden',
		framed ? 'rounded-[var(--radius)] border' : 'rounded-none border-0'
	]}
	style="background: color-mix(in oklch, var(--brand-from) 8%, var(--card));"
>
	<svg {viewBox} class="block h-full w-full" preserveAspectRatio={`xMidYMid ${fit}`} role="img" aria-label="Biobank map" style="shape-rendering: geometricPrecision;">
		<defs>
			{#each pins.filter((p) => p.colorMix && p.colorMix.length > 1) as p}
				<linearGradient id={`pin-mix-${p.cohortId}`} x1="0%" y1="0%" x2="100%" y2="100%">
					{#each gradientStops(p.colorMix ?? []) as stop}
						<stop offset={`${stop.offset}%`} stop-color={stop.color} />
					{/each}
				</linearGradient>
			{/each}
		</defs>

		{#if backgroundFeatures.length}
			<g opacity="0.86">
				{#each backgroundFeatures as feat}
					<path d={feat.d} fill="var(--map-land)" stroke="color-mix(in oklch, var(--foreground) 16%, transparent)" stroke-width={0.42 / zoom} stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
				{/each}
			</g>
		{/if}

		<g>
			{#each features as feat}
				{@const pin = pinForFeature(feat.name)}
				{@const highlighted = highlightedFeatureNames.has(feat.name)}
				{#if pin}
					<path
						d={feat.d}
						class="cursor-pointer outline-none focus:outline-none [-webkit-tap-highlight-color:transparent]"
						role="button"
						tabindex="0"
						fill={hover?.key === feat.name || highlighted ? 'var(--map-pin)' : fillForPin(pin)}
						stroke={highlighted ? 'var(--foreground)' : 'color-mix(in oklch, var(--map-pin) 54%, transparent)'}
						stroke-width={highlightAllFeatures ? 0.72 : 0.45 / zoom}
						stroke-linejoin="round"
						stroke-linecap="round"
						vector-effect="non-scaling-stroke"
						onmouseenter={() => enter(pin, feat.name)}
						onmouseleave={leave}
						onclick={() => onselect(pin)}
						onkeydown={(e) => e.key === 'Enter' && onselect(pin)}
					/>
				{:else}
					<path d={feat.d} fill="var(--map-land)" stroke="color-mix(in oklch, var(--foreground) 9%, transparent)" stroke-width={0.35 / zoom} stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
				{/if}
			{/each}
		</g>

		{#if showFeatureLabels}
			<g class="pointer-events-none select-none">
				{#each features as feat}
					{#if feat.label}
						<text
							x={feat.labelX}
							y={feat.labelY}
							text-anchor="middle"
							dominant-baseline="central"
							fill="color-mix(in oklch, var(--foreground) 82%, var(--primary))"
							stroke="color-mix(in oklch, var(--card) 88%, white)"
							stroke-width={1.45}
							vector-effect="non-scaling-stroke"
							paint-order="stroke"
							font-size="3.2"
							font-weight="800"
						>{feat.label}</text>
					{/if}
				{/each}
			</g>
		{/if}

		<!-- pins for data locations without a country polygon (small islands) -->
		<g>
			{#each pinsAsDots as p}
				{@const key = `dot:${p.cohortId}`}
				<g class="cursor-pointer outline-none focus:outline-none [-webkit-tap-highlight-color:transparent]" role="button" tabindex="0" onmouseenter={() => enter(p, key)} onmouseleave={leave} onclick={() => onselect(p)} onkeydown={(e) => e.key === 'Enter' && onselect(p)}>
					<circle cx={projX(p.lon)} cy={projY(p.lat)} r={(dotR + 2 / zoom) * dotScale * (0.6 + 0.6 * Math.sqrt(p.sampleCount / maxSamples))} fill="var(--map-pin)" opacity={hover?.key === key ? 0.25 : 0.1} />
					<circle cx={projX(p.lon)} cy={projY(p.lat)} r={dotR * dotScale * (0.7 + 0.6 * Math.sqrt(p.sampleCount / maxSamples))} fill={fillForPin(p)} opacity="0.92" stroke="white" stroke-width={0.7 / zoom} />
				</g>
			{/each}
		</g>

		{#if showLabels}
			<g>
				{#each pins as p}
					{@const key = `label:${p.cohortId}`}
					{@const dxdy = labelOffset(p)}
					{@const anchor = labelAnchor(p)}
					{@const x = projX(anchor[1])}
					{@const y = projY(anchor[0])}
					{@const lx = x + dxdy[0]}
					{@const ly = y + dxdy[1]}
					{@const w = labelWidth(p)}
					<g class="cursor-pointer outline-none focus:outline-none [-webkit-tap-highlight-color:transparent]" role="button" tabindex="0" onmouseenter={() => enter(p, key)} onmouseleave={leave} onclick={() => onselect(p)} onkeydown={(e) => e.key === 'Enter' && onselect(p)}>
						<circle cx={x} cy={y} r={4.2} fill="transparent" style="pointer-events: all;" />
						<path d={`M${x.toFixed(2)} ${y.toFixed(2)}L${lx.toFixed(2)} ${ly.toFixed(2)}`} fill="none" stroke="color-mix(in oklch, var(--foreground) 28%, transparent)" stroke-width={0.16} vector-effect="non-scaling-stroke" />
						<rect x={lx} y={ly - 3.2 * labelScale} width={w} height={5.2 * labelScale} rx={1.3 * labelScale} fill="var(--card)" opacity="0.94" stroke={p.color ?? 'var(--map-pin)'} stroke-width={0.32} vector-effect="non-scaling-stroke" />
						<text x={lx + 1.7 * labelScale} y={ly + 0.35 * labelScale} fill="var(--foreground)" font-size={2.75 * labelScale} font-weight="700">{labelText(p)}</text>
						<text x={lx + w - 1.8 * labelScale} y={ly + 0.35 * labelScale} fill={p.color ?? 'var(--map-pin)'} font-size={2.6 * labelScale} font-weight="800" text-anchor="end">{p.sampleCount}</text>
					</g>
				{/each}
			</g>
		{/if}

		{#if !showDots && !showLabels}
			<g>
				{#each pins as p}
					{@const key = `hit:${p.cohortId}`}
					<circle
						class="cursor-pointer outline-none focus:outline-none [-webkit-tap-highlight-color:transparent]"
						cx={projX(p.lon)}
						cy={projY(p.lat)}
						r={10}
						fill="transparent"
						role="button"
						tabindex="0"
						style="pointer-events: all;"
						onmouseenter={() => enter(p, key)}
						onmouseleave={leave}
						onclick={() => onselect(p)}
						onkeydown={(e) => e.key === 'Enter' && onselect(p)}
					/>
				{/each}
			</g>
		{/if}
	</svg>

	{#if showTooltip && hover}
		<div class={tooltipClass()}>
			<div class="font-semibold text-popover-foreground">{hover.label}</div>
			<div class="mt-1 flex gap-3 text-popover-foreground">
				<span>{hover.samples.toLocaleString()} samples</span>
				<span>{hover.variants.toLocaleString()} variants</span>
			</div>
		</div>
	{/if}
</div>
