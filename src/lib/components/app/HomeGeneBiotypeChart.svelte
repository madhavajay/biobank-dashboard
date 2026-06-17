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

	let { data } = $props<{
		data: Row[];
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
						'rounded-[1.25rem] border border-white/50 bg-white/60 px-4 py-3 text-foreground shadow-[0_18px_44px_rgba(31,49,87,0.14)]'
				}
			},
			item: {
				classes: {
					root: 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2',
					label: 'text-sm font-medium text-foreground',
					value: 'font-heading text-xl leading-none tracking-[-0.04em] text-foreground',
					color: 'size-3'
				}
			}
		}
	};
</script>

{#if browser}
	<Chart.Container config={config()} class="mx-auto h-[180px] w-[180px] max-w-full overflow-visible">
		<PieChart
			data={data}
			key="label"
			label="label"
			value="value"
			c={(row: Row) => row.color}
			height={180}
			width={180}
			placement="center"
			center={true}
			innerRadius={38}
			outerRadius={72}
			cornerRadius={0}
			padAngle={0}
			legend={false}
			tooltipContext={true}
			props={chartProps}
		/>
	</Chart.Container>
{:else}
	<div class="grid gap-2">
		{#each data as row}
			<div class="flex items-center gap-3">
				<div class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
					<div
						class="h-full rounded-full"
						style={`width:${Math.max(10, (row.value / Math.max(...data.map((item: Row) => item.value), 1)) * 100)}%; background:${row.color};`}
					></div>
				</div>
			</div>
		{/each}
	</div>
{/if}
