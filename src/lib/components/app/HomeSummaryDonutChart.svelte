<script lang="ts">
	import { browser } from '$app/environment';
	import { PieChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart';

	type Row = {
		label: string;
		value: number;
		display: string;
		color: string;
	};

	let { data, size = 150 } = $props<{
		data: Row[];
		size?: number;
	}>();

	const config = () =>
		Object.fromEntries(
			data.map((row: Row) => [
				row.label,
				{
					label: row.label,
					color: row.color
				}
			])
		);

	const chartProps = {
		tooltip: {
			root: {
				variant: 'none' as const,
				classes: {
					root: 'z-30',
					content:
						'rounded-[1rem] border border-white/50 bg-white/70 px-3 py-2 text-foreground shadow-[0_16px_36px_rgba(31,49,87,0.14)]'
				}
			}
		}
	};
</script>

{#if browser}
	<Chart.Container
		config={config()}
		class="mx-auto overflow-visible"
		style={`height:${size}px; width:${size}px;`}
	>
		<PieChart
			data={data}
			key="label"
			label="label"
			value="value"
			c={(row: Row) => row.color}
			height={size}
			width={size}
			placement="center"
			center={true}
			innerRadius={size * 0.26}
			outerRadius={size * 0.4}
			cornerRadius={0}
			padAngle={0}
			legend={true}
			tooltipContext={true}
			props={chartProps}		
		/>
	</Chart.Container>
{:else}
	<div class="grid gap-2">
		{#each data as row}
			<div class="h-2 overflow-hidden rounded-full bg-muted">
				<div
					class="h-full rounded-full"
					style={`width:${(row.value / Math.max(...data.map((item: Row) => item.value), 1)) * 100}%; background:${row.color};`}
				></div>
			</div>
		{/each}
	</div>
{/if}
