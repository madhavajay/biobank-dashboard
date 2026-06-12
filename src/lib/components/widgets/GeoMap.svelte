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
		color?: string; // choropleth fill (coverage ramp)
	}
	interface GeoFeature {
		geometry: {
			type: 'Polygon' | 'MultiPolygon';
			coordinates: unknown;
		};
		properties?: { name?: string };
	}

	let {
		pins = [],
		center = [10, -20] as [number, number],
		zoom = 1.4,
		showMatchedDots = false,
		framed = true,
		onselect = (_p: Pin) => {}
	}: {
		pins?: Pin[];
		center?: [number, number];
		zoom?: number;
		showMatchedDots?: boolean;
		framed?: boolean;
		onselect?: (p: Pin) => void;
	} = $props();

	const W = 1000;
	const H = 500;
	let features = $state<{ name: string; d: string }[]>([]);
	let hover = $state<{ key: string; label: string; samples: number; variants: number } | null>(null);

	const projX = (lon: number) => ((lon + 180) / 360) * W;
	const projY = (lat: number) => ((90 - lat) / 180) * H;

	function ringToPath(ring: number[][]): string {
		return ring.map(([lon, lat], i) => `${i ? 'L' : 'M'}${projX(lon).toFixed(1)} ${projY(lat).toFixed(1)}`).join('') + 'Z';
	}

	// population.country -> geojson feature name
	const ALIAS: Record<string, string> = {
		Bahamas: 'The Bahamas',
		'Trinidad and Tobago': 'Trinidad and Tobago',
		'United States': 'United States of America'
	};
	const featureName = (country: string) => ALIAS[country] ?? country;

	const pinByFeature = $derived(new Map(pins.map((p) => [featureName(p.country), p])));
	const pinsAsDots = $derived(
		showMatchedDots ? pins : pins.filter((p) => !features.some((f) => f.name === featureName(p.country)))
	);

	onMount(async () => {
		try {
			const geo = (await fetch('/world.geo.json').then((r) => r.json())) as { features: GeoFeature[] };
			const out: { name: string; d: string }[] = [];
			for (const f of geo.features) {
				const g = f.geometry;
				let d = '';
				if (g.type === 'Polygon') d = (g.coordinates as number[][][]).map(ringToPath).join('');
				else if (g.type === 'MultiPolygon') d = (g.coordinates as number[][][][]).map((poly) => poly.map(ringToPath).join('')).join('');
				if (d) out.push({ name: f.properties?.name ?? '', d });
			}
			features = out;
		} catch {
			features = [];
		}
	});

	const vw = $derived(W / zoom);
	const vh = $derived(H / zoom);
	const cx = $derived(Math.min(Math.max(projX(center[1]), vw / 2), W - vw / 2));
	const cy = $derived(Math.min(Math.max(projY(center[0]), vh / 2), H - vh / 2));
	const viewBox = $derived(`${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`);
	const dotR = $derived(Math.max(2.4, 7 / Math.sqrt(zoom)));
	const dotScale = $derived(showMatchedDots ? 0.68 : 1);
	const maxSamples = $derived(Math.max(1, ...pins.map((p) => p.sampleCount)));

	function enter(p: Pin, key: string) {
		hover = { key, label: p.name, samples: p.sampleCount, variants: p.variantCount };
	}
</script>

<div
	class={[
		'relative h-full w-full overflow-hidden',
		framed ? 'rounded-[var(--radius)] border' : 'rounded-none border-0'
	]}
	style="background: color-mix(in oklch, var(--brand-from) 8%, var(--card));"
>
	<svg {viewBox} class="block h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Biobank map">
		<g>
			{#each features as feat}
				{@const pin = pinByFeature.get(feat.name)}
				{#if pin}
					<path
						d={feat.d}
						class="cursor-pointer outline-none focus:outline-none [-webkit-tap-highlight-color:transparent]"
						role="button"
						tabindex="0"
						fill={hover?.key === feat.name ? 'var(--map-pin)' : (pin.color ?? 'color-mix(in oklch, var(--map-pin) 38%, var(--map-land))')}
						stroke="color-mix(in oklch, var(--map-pin) 70%, transparent)"
						stroke-width={0.6 / zoom}
						onmouseenter={() => enter(pin, feat.name)}
						onmouseleave={() => (hover = null)}
						onclick={() => onselect(pin)}
						onkeydown={(e) => e.key === 'Enter' && onselect(pin)}
					/>
				{:else}
					<path d={feat.d} fill="var(--map-land)" stroke="color-mix(in oklch, var(--foreground) 12%, transparent)" stroke-width={0.4 / zoom} />
				{/if}
			{/each}
		</g>

		<!-- pins for data locations without a country polygon (small islands) -->
		<g>
			{#each pinsAsDots as p}
				{@const key = `dot:${p.cohortId}`}
				<g class="cursor-pointer outline-none focus:outline-none [-webkit-tap-highlight-color:transparent]" role="button" tabindex="0" onmouseenter={() => enter(p, key)} onmouseleave={() => (hover = null)} onclick={() => onselect(p)} onkeydown={(e) => e.key === 'Enter' && onselect(p)}>
					<circle cx={projX(p.lon)} cy={projY(p.lat)} r={(dotR + 2 / zoom) * dotScale * (0.6 + 0.6 * Math.sqrt(p.sampleCount / maxSamples))} fill="var(--map-pin)" opacity={hover?.key === key ? 0.25 : 0.1} />
					<circle cx={projX(p.lon)} cy={projY(p.lat)} r={dotR * dotScale * (0.7 + 0.6 * Math.sqrt(p.sampleCount / maxSamples))} fill="var(--map-pin)" opacity="0.9" stroke="white" stroke-width={0.7 / zoom} />
				</g>
			{/each}
		</g>
	</svg>

	{#if hover}
		<div class="pointer-events-none absolute left-3 top-3 rounded-lg border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
			<div class="font-semibold text-popover-foreground">{hover.label}</div>
			<div class="mt-1 flex gap-3 text-popover-foreground">
				<span>{hover.samples.toLocaleString()} samples</span>
				<span>{hover.variants.toLocaleString()} variants</span>
			</div>
		</div>
	{/if}
</div>
