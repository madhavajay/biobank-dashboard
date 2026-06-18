import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const hmr =
	process.env.VITE_HMR === '0'
		? false
		: {
				host: 'localhost',
				protocol: 'ws' as const,
				clientPort: Number(process.env.VITE_HMR_PORT ?? process.env.PORT ?? 8787)
			};

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	// allow previewing the real hostnames locally (prod on Cloudflare has no such guard)
	server: { allowedHosts: ['.biovault.net', '.localhost'], hmr }
});
