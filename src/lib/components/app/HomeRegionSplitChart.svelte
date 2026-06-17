<script lang="ts">
	import { browser } from '$app/environment';
	import { PieChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart';

	type Row = {
		label: string;
		value: string;
		color: string;
	};

	let { data } = $props<{
		data: Row[];
	}>();

	const chartData = () =>
		data.map((row: Row) => ({
			...row,
			amount: Number.parseInt(row.value.replace(/,/g, ''), 10) || 0
		}));

	const maxAmount = () => Math.max(...chartData().map((item: { amount: number }) => item.amount), 1);

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
	<Chart.Container config={config()} class="mx-auto h-[190px] w-[190px] max-w-full overflow-visible">
		<PieChart
			data={chartData()}
			key="label"
			label="label"
			value="amount"
			c={(row: { color: string }) => row.color}
			height={190}
			width={190}
			placement="center"
			center={true}
			innerRadius={0}
			outerRadius={80}
			cornerRadius={0}
			padAngle={0}
			legend={false}
			tooltipContext={true}
			props={chartProps}
		/>
	</Chart.Container>
{:else}
	<div class="space-y-3">
		{#each chartData() as row}
			<div class="space-y-1.5">
				<div class="flex items-center justify-between gap-3 text-xs">
					<div class="flex items-center gap-2">
						<span class="size-2.5 rounded-full" style={`background:${row.color};`}></span>
						<span class="text-muted-foreground">{row.label}</span>
					</div>
					<strong class="font-medium text-foreground">{row.value}</strong>
				</div>
				<div class="h-2 overflow-hidden rounded-full bg-muted">
					<div
						class="h-full rounded-full"
						style={`width:${(row.amount / maxAmount()) * 100}%; background:${row.color};`}
					></div>
				</div>
			</div>
		{/each}
	</div>
{/if}
