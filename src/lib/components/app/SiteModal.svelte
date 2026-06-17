<script lang="ts">
	import type { Snippet } from 'svelte'
	import { onMount } from 'svelte'

	let {
		onclose,
		wide = false,
		label,
		children,
	}: {
		onclose: () => void
		wide?: boolean
		label: string
		children?: Snippet
	} = $props()

	let panel: HTMLDivElement | undefined = $state()

	onMount(() => {
		const previousOverflow = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		panel?.focus()

		const onKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onclose()
		}
		window.addEventListener('keydown', onKeydown)

		return () => {
			document.body.style.overflow = previousOverflow
			window.removeEventListener('keydown', onKeydown)
		}
	})
</script>

<div class="site-modal-root">
	<button type="button" class="site-modal-backdrop" aria-label="Close" onclick={onclose}></button>
	<div
		bind:this={panel}
		class="site-modal-panel"
		class:wide
		role="dialog"
		aria-modal="true"
		aria-label={label}
		tabindex="-1"
	>
		<button type="button" class="site-modal-close" aria-label="Close" onclick={onclose}>×</button>
		<div class="site-modal-body">
			{@render children?.()}
		</div>
	</div>
</div>

<style>
	.site-modal-root {
		position: fixed;
		inset: 0;
		z-index: 120;
		display: grid;
		place-items: center;
		padding: clamp(16px, 3vw, 32px);
		pointer-events: none;
	}

	.site-modal-backdrop {
		position: absolute;
		inset: 0;
		border: 0;
		background: rgb(23 22 29 / 0.42);
		backdrop-filter: blur(3px);
		pointer-events: auto;
		cursor: default;
	}

	.site-modal-panel {
		position: relative;
		z-index: 1;
		display: flex;
		width: min(100%, 42rem);
		max-height: min(88vh, 920px);
		flex-direction: column;
		overflow: hidden;
		border: 0;
		border-radius: 12px;
		background: color-mix(in srgb, #ffffff 94%, transparent);
		box-shadow: 0 24px 64px rgb(46 43 59 / 0.18);
		pointer-events: auto;
	}

	.site-modal-panel.wide {
		width: min(100%, 56rem);
	}

	.site-modal-close {
		position: absolute;
		z-index: 2;
		top: 12px;
		right: 12px;
		display: grid;
		width: 32px;
		height: 32px;
		place-items: center;
		border: 0;
		border-radius: 8px;
		background: color-mix(in srgb, #f7f6f9 82%, transparent);
		font-size: 22px;
		line-height: 1;
		color: #464257;
		cursor: pointer;
	}

	.site-modal-close:hover {
		background: #ecebef;
		color: #272532;
	}

	.site-modal-body {
		overflow: auto;
		padding: clamp(20px, 3vw, 32px);
		padding-top: clamp(28px, 3vw, 36px);
	}
</style>
