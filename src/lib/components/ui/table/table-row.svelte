<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLTableRowElement>> = $props();
</script>

<tr
	bind:this={ref}
	data-slot="table-row"
	class={cn("border-b border-[#dbe7eb] transition-colors hover:bg-[#edf5f6] data-[state=selected]:bg-[#e7f1f3]", className)}
	{...restProps}
>
	{@render children?.()}
</tr>
