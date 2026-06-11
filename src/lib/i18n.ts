import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Lang = 'en' | 'pt';

const initial: Lang = browser && localStorage.getItem('lang') === 'pt' ? 'pt' : 'en';
export const lang = writable<Lang>(initial);
if (browser) lang.subscribe((v) => localStorage.setItem('lang', v));

export const LANGS: { code: Lang; label: string; flag: string }[] = [
	{ code: 'en', label: 'English', flag: '🇬🇧' },
	{ code: 'pt', label: 'Português', flag: '🇧🇷' }
];

const S: Record<string, [string, string]> = {
	// [en, pt]
	stateAtlas: ['Atlas', 'Atlas'],
	byCoverage: ['{region} by sample coverage', '{region} por cobertura de amostras'],
	legend: ['Legend', 'Legenda'],
	coreStats: ['Core stats', 'Estatísticas'],
	databaseTotals: ['Database totals', 'Totais do banco de dados'],
	participants: ['Participants', 'Participantes'],
	datasets: ['Datasets', 'Conjuntos de dados'],
	variants: ['Variants', 'Variantes'],
	populations: ['Populations', 'Populações'],
	common: ['Common', 'Comuns'],
	lowFreq: ['Low frequency', 'Baixa frequência'],
	rare: ['Rare', 'Raras'],
	noSamples: ['No samples', 'Sem amostras'],
	search: ['Search by rsID, region, or position…', 'Pesquise por rsID, região ou posição…'],
	explore: ['Explore', 'Explorar'],
	dataset: ['Dataset', 'Conjunto de dados'],
	assay: ['Assay', 'Ensaio'],
	platform: ['Platform', 'Plataforma'],
	build: ['Genome build', 'Montagem do genoma'],
	access: ['Access', 'Acesso'],
	contact: ['Contact', 'Contato'],
	release: ['Release', 'Versão'],
	variantBrowser: ['Variant browser', 'Navegador de variantes']
};

export function tr(l: Lang, key: keyof typeof S, vars?: Record<string, string>): string {
	let s = (S[key]?.[l === 'pt' ? 1 : 0] ?? String(key)) as string;
	if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
	return s;
}
