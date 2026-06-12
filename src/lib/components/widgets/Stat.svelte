<script lang="ts">
	let { label, value, sub = '' }: { label: string; value: string | number; sub?: string } = $props();
</script>

<div class="card-surface px-4 py-3">
	<div class="text-2xl font-bold tracking-tight brand-text">{value}</div>
	<div class="text-xs font-medium text-foreground">{label}</div>
	{#if sub}<div class="text-[11px] text-muted-foreground">{sub}</div>{/if}
</div>
