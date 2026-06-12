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
	variantBrowser: ['Variant browser', 'Navegador de variantes'],
	navHome: ['Home', 'Início'],
	navExplore: ['Explore', 'Explorar'],
	navAbout: ['About', 'Sobre'],
	navTeam: ['Team', 'Equipe'],
	navContact: ['Contact', 'Contato'],
	navApi: ['API', 'API'],
	aboutHeading: ['About', 'Sobre'],
	researchCenters: ['Research Centers', 'Centros de Pesquisa'],
	references: ['References', 'Referências'],
	contactSubtitle: ['Get in touch with the {name} team.', 'Entre em contato com a equipe {name}.'],
	formSend: ['Send Message', 'Enviar mensagem'],
	formRequired: ['This field is required', 'Este campo é obrigatório'],
	formEmailInvalid: ['Enter a valid email address', 'Insira um endereço de email válido'],
	formPhoneInvalid: ['Enter a valid phone number', 'Insira um número de telefone válido'],
	formSuccess: ['Thanks! Your message passed validation. Sending is not enabled yet.', 'Obrigado! Sua mensagem passou na validação. O envio ainda não está ativado.'],
	optional: ['optional', 'opcional'],

	// explore + variant table
	exploreScopeOne: ['Variants for this biobank.', 'Variantes deste biobanco.'],
	exploreScopeAll: ['Variants across the whole network.', 'Variantes em toda a rede.'],
	vbSubtitle: ['Search by rsID, region (chr7), or position (1:100000723).', 'Pesquise por rsID, região (chr7) ou posição (1:100000723).'],
	biobanks: ['Biobanks', 'Biobancos'],
	match: ['Match', 'Correspondência'],
	either: ['Either', 'Qualquer um'],
	matchAll: ['All', 'Todos'],
	tryLabel: ['Try:', 'Tente:'],
	go: ['Go', 'Buscar'],
	gene: ['Gene', 'Gene'],
	alleleFreq: ['Allele freq', 'Freq. alélica'],
	alleleCount: ['Allele count', 'Contagem alélica'],
	perPage: ['Per page', 'Por página'],
	reset: ['Reset', 'Limpar'],
	copyCurl: ['copy curl', 'copiar curl'],
	copiedLabel: ['copied!', 'copiado!'],
	noVariants: ['No variants match.', 'Nenhuma variante corresponde.'],
	colVariant: ['Variant', 'Variante'],
	colPopulation: ['Population', 'População'],
	variantsLower: ['variants', 'variantes'],
	loadingLabel: ['Loading…', 'Carregando…'],
	prev: ['Prev', 'Anterior'],
	next: ['Next', 'Próximo'],

	// API page
	apiIntro: ['Public, read-only JSON API (CORS-open). Try a query below, or call it from anywhere against', 'API JSON pública e somente leitura (CORS aberto). Teste uma consulta abaixo ou chame de qualquer lugar em'],
	apiTryIt: ['Try it', 'Teste'],
	apiRun: ['Run', 'Executar'],
	apiRespPlaceholder: ['// response will appear here', '// a resposta aparecerá aqui'],
	apiExListBiobanks: ['List biobanks', 'Listar biobancos'],
	apiExSearchRsid: ['Search rsID', 'Buscar rsID'],
	apiExSearchGene: ['Search gene', 'Buscar gene'],
	apiExRegion: ['Region query', 'Consulta por região']
};

export function tr(l: Lang, key: keyof typeof S, vars?: Record<string, string>): string {
	let s = (S[key]?.[l === 'pt' ? 1 : 0] ?? String(key)) as string;
	if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
	return s;
}
