<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLTableSectionElement>> = $props();
</script>

<thead
	bind:this={ref}
	data-slot="table-header"
	class={cn("bg-[#eef5f6]/88 [&_tr]:border-b [&_tr]:border-[#dbe7eb]", className)}
	{...restProps}
>
	{@render children?.()}
</thead>
