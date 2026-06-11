import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	// allow previewing the real hostnames locally (prod on Cloudflare has no such guard)
	server: { allowedHosts: ['.biovault.net', '.localhost'] }
});
