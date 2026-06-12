<script lang="ts">
	import { tenantContent, loc } from '$lib/content';
	import { lang, tr } from '$lib/i18n';
	let { data } = $props();
	const contact = $derived(tenantContent(data.tenant.slug)?.contact ?? null);

	let values = $state<Record<string, string>>({});
	let errors = $state<Record<string, string>>({});
	let submitted = $state(false);

	const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	const PHONE = /^[+()0-9.\-\s]{6,}$/;

	function validate(): boolean {
		const next: Record<string, string> = {};
		for (const f of contact?.fields ?? []) {
			const v = (values[f.name] ?? '').trim();
			if (f.required && !v) next[f.name] = tr($lang, 'formRequired');
			else if (v && f.type === 'email' && !EMAIL.test(v)) next[f.name] = tr($lang, 'formEmailInvalid');
			else if (v && f.type === 'tel' && !PHONE.test(v)) next[f.name] = tr($lang, 'formPhoneInvalid');
		}
		errors = next;
		return Object.keys(next).length === 0;
	}

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		submitted = false;
		if (validate()) {
			// sending is intentionally disabled for now — just confirm validation passed
			submitted = true;
		}
	}
</script>

<svelte:head><title>{tr($lang, 'contact')} · {data.tenant.name}</title></svelte:head>

<div class="mx-auto max-w-2xl py-6">
	<h1 class="text-3xl font-bold tracking-tight">{tr($lang, 'contact')}</h1>

	{#if contact}
		<p class="mt-3 text-muted-foreground">{loc(contact.intro, $lang)}</p>

		<form onsubmit={onSubmit} novalidate class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
			{#each contact.fields as f}
				<div class:sm:col-span-2={f.type === 'textarea'}>
					<label for={`f-${f.name}`} class="mb-1 block text-xs font-medium text-muted-foreground">
						{loc(f.label, $lang)}
						{#if f.required}<span class="text-primary">*</span>{:else}<span class="font-normal text-muted-foreground/70">({tr($lang, 'optional')})</span>{/if}
					</label>
					{#if f.type === 'textarea'}
						<textarea
							id={`f-${f.name}`}
							rows="6"
							bind:value={values[f.name]}
							oninput={() => { if (errors[f.name]) validate(); submitted = false; }}
							class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
							class:border-red-400={errors[f.name]}
						></textarea>
					{:else}
						<input
							id={`f-${f.name}`}
							type={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}
							bind:value={values[f.name]}
							oninput={() => { if (errors[f.name]) validate(); submitted = false; }}
							class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
							class:border-red-400={errors[f.name]}
						/>
					{/if}
					{#if errors[f.name]}<p class="mt-1 text-xs text-red-500">{errors[f.name]}</p>{/if}
				</div>
			{/each}

			<div class="sm:col-span-2">
				<button type="submit" class="brand-gradient rounded-md px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow-md">
					{tr($lang, 'formSend')}
				</button>
				{#if submitted}
					<p class="mt-3 text-sm text-primary">{tr($lang, 'formSuccess')}</p>
				{/if}
			</div>
		</form>
	{:else}
		<p class="mt-3 text-muted-foreground">{tr($lang, 'contactSubtitle', { name: data.tenant.name })}</p>
		<div class="card-surface mt-6 p-6 text-sm text-muted-foreground">
			<p>This page is a placeholder. Add contact details, a form, or data-access request info here.</p>
		</div>
	{/if}
</div>
