<script lang="ts">
	import { browser } from '$app/environment';
	import { BarChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart';

	let { data } = $props<{
		data: Array<{ label: string; value: number; display: string; color: string }>;
	}>();

	type Row = { label: string; value: number; display: string; color: string };

	const chartData = () => data.map((row: Row) => ({
		...row
	}));

	const config = () => ({
		storage: {
			label: 'Storage volume',
			color: 'var(--chart-3)'
		}
	});
</script>

{#if browser}
	<Chart.Container config={config()} class="max-h-[240px] w-full">
		<BarChart
			data={chartData()}
			x="label"
			y="value"
			tooltipContext={false}
			props={{
				bars: {
					radius: 12
				}
			}}
		/>
	</Chart.Container>
{:else}
	<div class="grid grid-cols-3 gap-2">
		{#each data as row}
			<div class="rounded-xl border border-border/60 bg-background/60 px-3 py-4 text-center">
				<p class="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{row.label}</p>
				<p class="mt-2 text-sm font-medium text-foreground">{row.display}</p>
			</div>
		{/each}
	</div>
{/if}
