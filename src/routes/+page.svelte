<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import HomeGeneBiotypeChart from '$lib/components/app/HomeGeneBiotypeChart.svelte';
	import HomeVariantConsequencesChart from '$lib/components/app/HomeVariantConsequencesChart.svelte';

	let { data } = $props<{
		data: {
			portalMeta: {
				title: string;
				description: string;
				productLabel: string;
				searchPlaceholder: string;
			};
			homeMetrics: Array<{
				label: string;
				value: string;
				details: Array<{ label: string; value: number; display: string; color: string }>;
			}>;
			geneBiotype: Array<{ label: string; value: number; display: string; color: string }>;
			variantConsequences: Array<{ label: string; value: number; display: string; color: string }>;
			mapLegend: Array<{ label: string; color: string }>;
			homeSummary: { samplesByState: number; statesRepresented: number };
			states: Array<{
				code: string;
				name: string;
				region: string;
				samples: number;
				individuals: number;
				variants: number;
			}>;
			brazilMapSvg: string;
		};
	}>();

	type HoverState = {
		code: string;
		name: string;
		region: string;
		samples: string;
		individuals: string;
		variants: string;
		x: number;
		y: number;
	};

	let hoveredState = $state<HoverState | null>(null);
	let mapElement: HTMLDivElement | null = null;
	let useTapTooltip = $state(false);

	onMount(() => {
		if (!browser) return;
		useTapTooltip = window.matchMedia('(hover: none), (pointer: coarse)').matches;
	});

	const buildHoverState = (target: HTMLElement, event: MouseEvent): HoverState => {
		const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
		return {
			code: target.dataset.stateCode ?? '',
			name: target.dataset.stateName ?? target.dataset.stateCode ?? '',
			region: target.dataset.stateRegion ?? '',
			samples: Number(target.dataset.stateSamples ?? 0).toLocaleString(),
			individuals: Number(target.dataset.stateIndividuals ?? 0).toLocaleString(),
			variants: Number(target.dataset.stateVariants ?? 0).toLocaleString(),
			x: event.clientX - bounds.left,
			y: event.clientY - bounds.top
		};
	};

	const updateHoveredPath = (code: string | null) => {
		if (!browser || !mapElement) return;
		for (const area of Array.from(mapElement.querySelectorAll('[data-state-code]'))) {
			area.classList.toggle(
				'is-hovered',
				Boolean(code) && (area as HTMLElement).dataset.stateCode === code
			);
		}
	};

	const updateMapHover = (event: MouseEvent) => {
		if (!browser || useTapTooltip) return;
		const target = event.target as HTMLElement | null;
		const link = target?.closest('[data-state-code]') as HTMLElement | null;

		if (!link) {
			hoveredState = null;
			updateHoveredPath(null);
			return;
		}

		hoveredState = buildHoverState(link, event);
		updateHoveredPath(link.dataset.stateCode ?? null);
	};

	const clearMapHover = () => {
		if (useTapTooltip) return;
		hoveredState = null;
		updateHoveredPath(null);
	};

	const handleMapPress = (event: MouseEvent) => {
		if (!browser || !useTapTooltip) return;
		const target = event.target as HTMLElement | null;
		const link = target?.closest('[data-state-code]') as HTMLElement | null;

		if (!link) {
			hoveredState = null;
			updateHoveredPath(null);
			return;
		}

		const code = link.dataset.stateCode ?? null;
		if (hoveredState?.code === code) {
			hoveredState = null;
			updateHoveredPath(null);
			return;
		}

		hoveredState = buildHoverState(link, event);
		updateHoveredPath(code);
	};
</script>

<svelte:head>
	<title>{data.portalMeta.title}</title>
	<meta name="description" content={data.portalMeta.description} />
</svelte:head>

<section class="home-shell">
	<div class="map-layout">
		<section class="panel panel--map">
			<div class="panel-head">
				<div>
					<p class="eyebrow">State Atlas</p>
					<h2>Brazil by sample coverage</h2>
				</div>
				<div class="map-legend map-legend--header">
					<p class="eyebrow">Legend</p>
					<div class="legend-ramp" aria-hidden="true" style={`grid-template-columns: repeat(${data.mapLegend.length}, minmax(0, 1fr));`}>
						{#each data.mapLegend as item}
							<span style={`background:${item.color};`}></span>
						{/each}
					</div>
					<div class="legend-list legend-list--compact">
						{#each data.mapLegend as item}
							<div class="legend-row">
								<span class="legend-row__swatch" style={`background:${item.color};`}></span>
								<span>{item.label}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="map-stage"
				bind:this={mapElement}
				role="img"
				aria-label="Brazil map"
				onmousemove={updateMapHover}
				onclick={handleMapPress}
				onmouseleave={clearMapHover}
			>
				{@html data.brazilMapSvg}

				{#if hoveredState}
					<div
						class="map-tooltip"
						style={`left:${Math.min(hoveredState.x + 18, 540)}px; top:${Math.max(hoveredState.y - 18, 24)}px;`}
					>
						<h3>{hoveredState.name}</h3>
						<p>{hoveredState.region}</p>
						<dl>
							<div>
								<dt>Samples</dt>
								<dd>{hoveredState.samples}</dd>
							</div>
							<div>
								<dt>Individuals</dt>
								<dd>{hoveredState.individuals}</dd>
							</div>
							<div>
								<dt>Variants</dt>
								<dd>{hoveredState.variants}</dd>
							</div>
						</dl>
					</div>
				{/if}
			</div>
		</section>

		<aside class="panel panel--sidebar">
			<div class="panel-head panel-head--sidebar">
				<div class="sidebar-heading">
					<div>
					<p class="eyebrow">Core stats</p>
					<h2>Database totals</h2>
					</div>
					<div class="coverage-badge">
						<span>{data.homeSummary.statesRepresented}/27 states represented</span>
					</div>
				</div>
			</div>
			<div class="summary-grid">
				{#each data.homeMetrics as metric}
					<article class="summary-stat">
						<div class="summary-stat__head">
							<p class="summary-stat__label">{metric.label}</p>
							<p class="summary-stat__value">{metric.value}</p>
						</div>
						<div class="summary-stat__details">
							{#each metric.details as detail}
								<div class="summary-stat__detail">
									<div class="summary-stat__detail-label">
										<span class="summary-stat__dot" style={`background:${detail.color};`}></span>
										<span>{detail.label}</span>
									</div>
									<strong>{detail.display}</strong>
								</div>
							{/each}
						</div>
					</article>
				{/each}
			</div>
			<div class="totals-secondary">
				<section class="totals-sidecard">
					<div class="totals-sidecard__head">
						<p class="eyebrow">Gene biotype</p>
					</div>
					<div class="chart-sidecard">
						<div class="chart-sidecard__viz">
							<HomeGeneBiotypeChart data={data.geneBiotype} />
						</div>
						<div class="rank-list">
							{#each data.geneBiotype as entry}
								<div class="rank-row">
									<div class="rank-row__label">
										<span class="rank-row__swatch" style={`background:${entry.color};`}></span>
										<span>{entry.label}</span>
									</div>
									<strong>{entry.display}</strong>
								</div>
							{/each}
						</div>
					</div>
				</section>

				<section class="totals-sidecard">
					<div class="totals-sidecard__head">
						<p class="eyebrow">Variant consequences</p>
					</div>
					<div class="chart-sidecard">
						<div class="chart-sidecard__viz">
							<HomeVariantConsequencesChart data={data.variantConsequences} />
						</div>
						<div class="rank-list">
							{#each data.variantConsequences as entry}
								<div class="rank-row">
									<div class="rank-row__label">
										<span class="rank-row__swatch" style={`background:${entry.color};`}></span>
										<span>{entry.label}</span>
									</div>
									<strong>{entry.display}</strong>
								</div>
							{/each}
						</div>
					</div>
				</section>
			</div>
		</aside>
	</div>

</section>

<style>
	.home-shell {
		display: grid;
		gap: 1.5rem;
		padding: 1rem 0 2.75rem;
	}

	.map-layout {
		display: grid;
		gap: 1rem;
		align-items: stretch;
	}

	.map-layout {
		align-items: start;
	}

	.panel {
		border: 1px solid rgba(34, 77, 103, 0.1);
		border-radius: 1.15rem;
		background: #f8fcfc;
		box-shadow:
			0 18px 40px rgba(29, 65, 90, 0.08),
			0 3px 0 rgba(34, 77, 103, 0.08);
	}

	.panel {
		position: relative;
		overflow: hidden;
	}

	.panel {
		padding: 1.15rem 1.3rem;
	}

	.panel h2 {
		font-family: var(--font-heading);
		letter-spacing: -0.06em;
	}

	.eyebrow {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #3e697f;
	}

	.panel-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.35rem;
	}

	.panel-head--sidebar {
		align-items: center;
	}

	.panel h2 {
		margin-top: 0.3rem;
		font-size: 1.55rem;
		line-height: 1;
	}

	.panel--map {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		height: 100%;
		padding: 1.15rem 1.3rem;
		background: #fff;
		overflow: visible;
		z-index: 1;
	}

	.map-stage {
		position: relative;
		height: 100%;
		border-radius: 1rem;
		background: transparent;
		padding: 0;
		min-height: 0;
		overflow: visible;
	}

	:global(.map-stage svg) {
		display: block;
		width: 100%;
		height: auto;
	}

	:global(.map-stage [data-state-code] path) {
		transition:
			transform 180ms ease,
			filter 180ms ease,
			stroke 180ms ease;
		transform-origin: center;
		cursor: default;
	}

	:global(.map-stage [data-state-code]:hover path),
	:global(.map-stage [data-state-code].is-hovered path) {
		stroke: #143464;
		stroke-width: 2;
		filter: drop-shadow(0 12px 14px rgba(29, 63, 119, 0.18));
	}

	.map-legend {
		width: min(28rem, 100%);
		padding: 0.1rem 0;
	}

	.map-legend--header {
		flex: 0 0 min(28rem, 100%);
	}

	.panel--sidebar {
		display: grid;
		gap: 1rem;
		align-content: start;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(240, 248, 248, 0.94));
		height: 100%;
	}

	.sidebar-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		width: 100%;
	}

	.coverage-badge {
		display: inline-flex;
		align-items: center;
		padding: 0;
		white-space: nowrap;
	}

	.coverage-badge span {
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.01em;
		color: color-mix(in srgb, var(--foreground) 76%, white);
	}

	.legend-list {
		display: grid;
		gap: 0.75rem;
	}

	.legend-list--compact {
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.25rem 1rem;
		max-height: none;
		overflow: visible;
		padding-right: 0;
	}

	.legend-ramp {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		height: 0.7rem;
		margin-bottom: 0.7rem;
		border-radius: 999px;
		overflow: hidden;
		box-shadow: inset 0 0 0 1px rgba(34, 77, 103, 0.08);
	}

	.legend-ramp span {
		display: block;
		height: 100%;
	}

	.map-tooltip {
		position: absolute;
		z-index: 3;
		width: min(15rem, calc(100% - 2rem));
		padding: 0.85rem 0.95rem;
		border: 1px solid rgba(31, 49, 87, 0.08);
		border-radius: 0.95rem;
		background: rgba(255, 255, 255, 0.96);
		box-shadow: 0 18px 36px rgba(20, 52, 100, 0.12);
		backdrop-filter: blur(12px);
		pointer-events: none;
		transform: translate3d(0, -100%, 0);
	}

	.map-tooltip h3 {
		font-size: 1rem;
		font-weight: 700;
		line-height: 1.1;
	}

	.map-tooltip p {
		margin-top: 0.2rem;
		font-size: 0.78rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.map-tooltip dl {
		display: grid;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.map-tooltip dl div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.9rem;
		font-size: 0.9rem;
	}

	.map-tooltip dt {
		color: color-mix(in srgb, var(--foreground) 72%, white);
	}

	.map-tooltip dd {
		font-weight: 700;
		color: var(--foreground);
	}

	.legend-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.legend-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.45rem;
		font-size: 0.72rem;
		color: color-mix(in srgb, var(--foreground) 78%, white);
	}

	.legend-row__swatch {
		width: 0.72rem;
		height: 0.72rem;
		border-radius: 999px;
		border: 1px solid rgba(31, 49, 87, 0.08);
	}

	.summary-grid,
	.rank-list {
		display: grid;
		gap: 0.85rem;
	}

	.totals-secondary {
		display: grid;
		gap: 1rem;
	}

	.summary-stat {
		display: grid;
		gap: 0.55rem;
		padding: 0.7rem 0.8rem;
		border-radius: 0.95rem;
		box-shadow: inset 0 0 0 1px rgba(34, 77, 103, 0.06);
	}

	.summary-grid .summary-stat:nth-child(1) {
		background: #dff2f1;
	}

	.summary-grid .summary-stat:nth-child(2) {
		background: #f8f3cc;
	}

	.summary-grid .summary-stat:nth-child(3) {
		background: #eef6ff;
	}

	.summary-grid .summary-stat:nth-child(4) {
		background: #2e4968;
		color: #f7fcfd;
	}

	.summary-grid .summary-stat:nth-child(4) .summary-stat__label,
	.summary-grid .summary-stat:nth-child(4) .summary-stat__detail-label {
		color: rgba(247, 252, 253, 0.76);
	}

	.summary-grid .summary-stat:nth-child(4) .summary-stat__detail strong,
	.summary-grid .summary-stat:nth-child(4) .summary-stat__value {
		color: #fff;
	}

	.summary-stat__head {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.summary-stat__label {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.summary-stat__value {
		font-family: var(--font-heading);
		font-size: 1.4rem;
		line-height: 1;
		letter-spacing: -0.06em;
		text-align: right;
	}

	.summary-stat__details {
		display: grid;
		gap: 0.35rem;
		padding-top: 0.5rem;
	}

	.summary-stat__detail,
	.rank-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.9rem;
		font-size: 0.8rem;
	}

	.summary-stat__detail-label,
	.rank-row__label {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		min-width: 0;
		color: color-mix(in srgb, var(--foreground) 78%, white);
	}

	.summary-stat__dot,
	.rank-row__swatch {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 999px;
		flex: 0 0 auto;
	}

	.totals-sidecard {
		padding: 0.9rem 0.95rem;
		border-radius: 0.95rem;
		box-shadow: inset 0 0 0 1px rgba(34, 77, 103, 0.06);
	}

	.totals-sidecard:first-child {
		background: #e2f5f4;
	}

	.totals-sidecard:last-child {
		background: #f8f3cc;
	}

	.totals-sidecard__head {
		margin-bottom: 0.75rem;
	}

	.chart-sidecard {
		display: grid;
		gap: 0.8rem;
		align-items: center;
	}

	.chart-sidecard__viz {
		display: grid;
		place-items: center;
		padding: 0.1rem 0;
		min-width: 0;
	}

	:global(.chart-sidecard__viz [data-slot='chart-container']) {
		width: min(100%, 180px);
	}

	.rank-list {
		gap: 0.1rem;
		min-width: 0;
		align-self: center;
	}

	.rank-row {
		padding: 0.4rem 0;
	}

	.rank-row__label span:last-child {
		min-width: 0;
	}

	.rank-list .rank-row:first-child {
		padding-top: 0;
	}

	@media (min-width: 700px) {
		.map-layout {
			grid-template-columns: minmax(0, 1.5fr) minmax(22rem, 0.98fr);
		}
	}

	@media (min-width: 900px) {
		.summary-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.85rem;
		}

		.chart-sidecard {
			grid-template-columns: 160px minmax(0, 1fr);
			gap: 1rem;
		}
	}

	@media (max-width: 699px) {
		.home-shell {
			gap: 1rem;
		}

		.panel {
			padding: 1rem;
			border-radius: 1.35rem;
		}

		.sidebar-heading {
			align-items: start;
			flex-direction: column;
		}

		.map-stage {
			min-height: auto;
			padding: 0.6rem;
		}

		.map-legend {
			position: static;
			width: 100%;
			margin-bottom: 0.75rem;
		}

		.legend-list--compact {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.35rem 0.8rem;
		}

		.map-tooltip {
			left: 0.6rem !important;
			right: 0.6rem;
			bottom: 0.6rem;
			top: auto !important;
			width: auto;
			transform: none;
		}

	}
</style>
