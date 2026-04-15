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
</script>

{#if browser}
	<Chart.Container config={config()} class="mx-auto h-24 w-24 overflow-visible">
		<PieChart
			data={data}
			key="label"
			label="label"
			value="value"
			c={(row: Row) => row.color}
			height={96}
			width={96}
			placement="center"
			center={true}
			innerRadius={24}
			outerRadius={42}
			cornerRadius={2}
			padAngle={0.45}
			legend={false}
			tooltipContext={false}
		/>
	</Chart.Container>
{:else}
	<div class="flex items-center justify-center">
		<div class="grid grid-cols-3 gap-1">
			{#each data as row}
				<span class="size-3 rounded-full" style={`background:${row.color};`}></span>
			{/each}
		</div>
	</div>
{/if}
