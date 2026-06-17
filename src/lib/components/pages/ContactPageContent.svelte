<script lang="ts">
	import { tenantContent, loc } from '$lib/content'
	import { lang, tr } from '$lib/i18n'

	let { data } = $props()
	const contact = $derived(tenantContent(data.tenant.slug)?.contact ?? null)

	let values = $state<Record<string, string>>({})
	let errors = $state<Record<string, string>>({})
	let submitted = $state(false)

	const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
	const PHONE = /^[+()0-9.\-\s]{6,}$/

	function validate(): boolean {
		const next: Record<string, string> = {}
		for (const f of contact?.fields ?? []) {
			const v = (values[f.name] ?? '').trim()
			if (f.required && !v) next[f.name] = tr($lang, 'formRequired')
			else if (v && f.type === 'email' && !EMAIL.test(v)) next[f.name] = tr($lang, 'formEmailInvalid')
			else if (v && f.type === 'tel' && !PHONE.test(v)) next[f.name] = tr($lang, 'formPhoneInvalid')
		}
		errors = next
		return Object.keys(next).length === 0
	}

	function onSubmit(e: SubmitEvent) {
		e.preventDefault()
		submitted = false
		if (validate()) submitted = true
	}
</script>

<h1 class="site-modal-title">{tr($lang, 'contact')}</h1>

{#if contact}
	<p class="site-modal-lead">{loc(contact.intro, $lang)}</p>

	<form onsubmit={onSubmit} novalidate class="site-modal-form">
		{#each contact.fields as f}
			<div class:site-modal-field-wide={f.type === 'textarea'}>
				<label for={`f-${f.name}`} class="site-modal-label">
					{loc(f.label, $lang)}
					{#if f.required}<span class="text-primary">*</span>{:else}<span>({tr($lang, 'optional')})</span
						>{/if}
				</label>
				{#if f.type === 'textarea'}
					<textarea
						id={`f-${f.name}`}
						rows="6"
						bind:value={values[f.name]}
						oninput={() => {
							if (errors[f.name]) validate()
							submitted = false
						}}
						class="site-modal-input"
						class:border-red-400={errors[f.name]}
					></textarea>
				{:else}
					<input
						id={`f-${f.name}`}
						type={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}
						bind:value={values[f.name]}
						oninput={() => {
							if (errors[f.name]) validate()
							submitted = false
						}}
						class="site-modal-input"
						class:border-red-400={errors[f.name]}
					/>
				{/if}
				{#if errors[f.name]}<p class="site-modal-error">{errors[f.name]}</p>{/if}
			</div>
		{/each}

		<div class="site-modal-field-wide">
			<button type="submit" class="brand-gradient site-modal-submit">
				{tr($lang, 'formSend')}
			</button>
			{#if submitted}
				<p class="site-modal-success">{tr($lang, 'formSuccess')}</p>
			{/if}
		</div>
	</form>
{:else}
	<p class="site-modal-lead">{tr($lang, 'contactSubtitle', { name: data.tenant.name })}</p>
	<div class="card-surface site-modal-placeholder">
		<p>This page is a placeholder. Add contact details, a form, or data-access request info here.</p>
	</div>
{/if}
