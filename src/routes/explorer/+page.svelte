<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { portalMeta } from '$lib/data/biobank';
	import { Badge } from '$lib/components/ui/badge';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import * as Pagination from '$lib/components/ui/pagination';
	import * as Table from '$lib/components/ui/table';

	let { data } = $props<{
		data: {
			q: string;
			page: number;
			pageSize: number;
			sort: 'position' | 'af_desc' | 'gene';
			variantClassFilter: 'all' | 'SNV' | 'INS' | 'DEL';
			stateFilter: 'all' | 'SP' | 'RJ' | 'MG' | 'ES';
			tagFilter: string;
			totalRows: number;
			totalPages: number;
			totalVariants: number;
			totalSubjects: number;
			totalGenes: number;
			stateOptions: Array<{ code: string; name: string }>;
			tagOptions: string[];
			rows: Array<{
				id: string;
				dnaChange: string;
				stateCode: string;
				variantClass: string;
				consequence: string;
				afLabel: string;
				geneCount: number;
				subjectCount: number;
				impact: string;
				dbSnp: string;
				tag: string;
				genotypeQuality: number;
				gene: string;
			}>;
		};
	}>();

	const startRow = () => (data.totalRows === 0 ? 0 : (data.page - 1) * data.pageSize + 1);
	const endRow = () => Math.min(data.page * data.pageSize, data.totalRows);
	const buildPageHref = (page: number) => {
		const params = new URLSearchParams();
		if (data.q) params.set('q', data.q);
		if (data.sort !== 'position') params.set('sort', data.sort);
		if (data.variantClassFilter !== 'all') params.set('class', data.variantClassFilter);
		if (data.stateFilter !== 'all') params.set('state', data.stateFilter);
		if (data.tagFilter !== 'all') params.set('tag', data.tagFilter);
		if (data.pageSize !== 20) params.set('pageSize', String(data.pageSize));
		if (page > 1) params.set('page', String(page));
		const query = params.toString();
		return query ? `/explorer?${query}` : '/explorer';
	};
	const buildFilterHref = (next: {
		sort?: 'position' | 'af_desc' | 'gene';
		variantClassFilter?: 'all' | 'SNV' | 'INS' | 'DEL';
		pageSize?: number;
		stateFilter?: 'all' | 'SP' | 'RJ' | 'MG' | 'ES';
		tagFilter?: string;
	}) => {
		const params = new URLSearchParams();
		if (data.q) params.set('q', data.q);
		const sort = next.sort ?? data.sort;
		const variantClassFilter = next.variantClassFilter ?? data.variantClassFilter;
		const pageSize = next.pageSize ?? data.pageSize;
		const stateFilter = next.stateFilter ?? data.stateFilter;
		const tagFilter = next.tagFilter ?? data.tagFilter;
		if (sort !== 'position') params.set('sort', sort);
		if (variantClassFilter !== 'all') params.set('class', variantClassFilter);
		if (stateFilter !== 'all') params.set('state', stateFilter);
		if (tagFilter !== 'all') params.set('tag', tagFilter);
		if (pageSize !== 20) params.set('pageSize', String(pageSize));
		const query = params.toString();
		return query ? `/explorer?${query}` : '/explorer';
	};
	const impactVariant = (impact: string) => {
		if (impact === 'HIGH') return 'destructive';
		if (impact === 'MR') return 'secondary';
		return 'outline';
	};
	const currentSortLabel = () =>
		data.sort === 'position' ? 'Genomic position ↑' : data.sort === 'af_desc' ? 'Highest AF ↓' : 'Gene A-Z';
	const handlePageChange = (nextPage: number) => {
		if (!browser || nextPage === data.page) return;
		void goto(buildPageHref(nextPage), {
			keepFocus: true,
			noScroll: true
		});
	};
</script>

<svelte:head>
	<title>Exploration | {portalMeta.title}</title>
</svelte:head>

<section class="flex flex-col gap-6 pt-2 sm:pt-3">
	<div class="space-y-4">
		<Breadcrumb.Root>
			<Breadcrumb.List class="text-[13px] text-muted-foreground">
				<Breadcrumb.Item><Breadcrumb.Link href="/">Home</Breadcrumb.Link></Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item><Breadcrumb.Page>Exploration</Breadcrumb.Page></Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<div class="space-y-2">
			<div class="flex flex-wrap items-center gap-3">
				<Badge variant="outline" class="rounded-full px-3 py-1 text-[11px] tracking-[0.18em] uppercase">
					{portalMeta.explorerProject}
				</Badge>
				<p class="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Data browser</p>
			</div>
			<div class="space-y-2">
				<h1 class="font-heading text-3xl leading-none tracking-[-0.06em] text-foreground sm:text-[3.6rem]">Exploration</h1>
				<p class="max-w-4xl text-sm leading-6 text-muted-foreground sm:text-base">
					Browse the seeded cohort with variant-first scanning, cohort filters, and paginated result sets.
				</p>
			</div>
		</div>
	</div>

	<Card.Root class="border-border/70 bg-white/76 shadow-[0_12px_28px_rgba(22,52,79,0.06)] ring-1 ring-[#d6e4ea] backdrop-blur-sm">
		<Card.Content class="p-0">
			<div class="space-y-4">
				<div class="px-6 py-4">
					<div class="grid gap-4">
						<form method="GET" data-sveltekit-noscroll>
							<input type="hidden" name="sort" value={data.sort} />
							<input type="hidden" name="class" value={data.variantClassFilter} />
							<input type="hidden" name="state" value={data.stateFilter} />
							<input type="hidden" name="tag" value={data.tagFilter} />
							<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
								<div class="space-y-2">
									<p class="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Search</p>
									<div class="flex w-full gap-2">
										<Input
											type="search"
											name="q"
											value={data.q}
											placeholder={portalMeta.searchPlaceholder}
											class="h-11 rounded-xl border-border/70 bg-white/80"
										/>
										<Button type="submit" class="h-11 rounded-xl px-4">Search</Button>
									</div>
								</div>
								<div class="space-y-2">
									<p class="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Rows per page</p>
									<div class="flex items-center gap-2">
										{#each [20, 50, 100] as size}
											<Button
												href={buildFilterHref({ pageSize: size })}
												variant={data.pageSize === size ? 'default' : 'outline'}
												size="sm"
												class="rounded-full"
											>
												{size}
											</Button>
										{/each}
									</div>
								</div>
							</div>
						</form>

						<details data-sveltekit-noscroll class="group rounded-2xl border border-border/60 bg-background/45 open:bg-background/55">
							<summary class="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-medium text-foreground marker:content-none">
								<span>
									<span class="md:hidden">Filters</span>
									<span class="hidden md:inline">Advanced filters</span>
								</span>
								<span class="text-xs tracking-[0.14em] uppercase text-muted-foreground">
									<span class="group-open:hidden">Show</span>
									<span class="hidden group-open:inline">Hide</span>
								</span>
							</summary>
							<div class="grid gap-4 border-t border-border/60 p-4 md:grid-cols-2">
								<div class="space-y-2">
									<p class="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Variant class</p>
									<div class="flex flex-wrap gap-2">
										{#each [
											['all', 'All classes'],
											['SNV', 'SNV'],
											['INS', 'INS'],
											['DEL', 'DEL']
										] as [value, label]}
											<Button
												href={buildFilterHref({ variantClassFilter: value as 'all' | 'SNV' | 'INS' | 'DEL' })}
												variant={data.variantClassFilter === value ? 'default' : 'outline'}
												size="sm"
												class="rounded-full"
											>
												{label}
											</Button>
										{/each}
									</div>
								</div>
								<div class="space-y-2">
									<p class="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Sort by</p>
									<div class="flex flex-wrap gap-2">
										{#each [
											['position', 'Genomic position'],
											['af_desc', 'Highest AF'],
											['gene', 'Gene']
										] as [value, label]}
											<Button
												href={buildFilterHref({ sort: value as 'position' | 'af_desc' | 'gene' })}
												variant={data.sort === value ? 'default' : 'outline'}
												size="sm"
												class="rounded-full"
											>
												{label}
											</Button>
										{/each}
									</div>
								</div>
								<div class="space-y-2">
									<p class="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">State</p>
									<div class="flex flex-wrap gap-2">
										<Button href={buildFilterHref({ stateFilter: 'all' })} variant={data.stateFilter === 'all' ? 'default' : 'outline'} size="sm" class="rounded-full">All states</Button>
										{#each data.stateOptions as state}
											<Button
												href={buildFilterHref({ stateFilter: state.code as 'SP' | 'RJ' | 'MG' | 'ES' })}
												variant={data.stateFilter === state.code ? 'default' : 'outline'}
												size="sm"
												class="rounded-full"
											>
												{state.code}
											</Button>
										{/each}
									</div>
								</div>
								<div class="space-y-2">
									<p class="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Tag</p>
									<div class="flex flex-wrap gap-2">
										<Button href={buildFilterHref({ tagFilter: 'all' })} variant={data.tagFilter === 'all' ? 'default' : 'outline'} size="sm" class="rounded-full">All tags</Button>
										{#each data.tagOptions as tag}
											<Button
												href={buildFilterHref({ tagFilter: tag })}
												variant={data.tagFilter === tag ? 'default' : 'outline'}
												size="sm"
												class="rounded-full"
											>
												{tag}
											</Button>
										{/each}
									</div>
								</div>
							</div>
						</details>
					</div>
				</div>

				<div class="overflow-x-auto">
					<Table.Root class="min-w-[1040px] text-sm">
						<Table.Header>
							<Table.Row class="bg-transparent hover:bg-transparent">
								<Table.Head class="h-9 w-12 text-[11px] tracking-[0.12em] uppercase">#</Table.Head>
								<Table.Head class="h-9 text-[11px] tracking-[0.12em] uppercase">
									<a href={buildFilterHref({ sort: 'position' })} class="inline-flex items-center gap-1 underline-offset-4 hover:underline">
										DNA Change
										{#if data.sort === 'position'}<span class="text-xs text-muted-foreground">↑</span>{/if}
									</a>
								</Table.Head>
								<Table.Head class="h-9 text-[11px] tracking-[0.12em] uppercase">Class</Table.Head>
								<Table.Head class="h-9 text-[11px] tracking-[0.12em] uppercase">Consequence</Table.Head>
								<Table.Head class="h-9 text-[11px] tracking-[0.12em] uppercase">
									<a href={buildFilterHref({ sort: 'af_desc' })} class="inline-flex items-center gap-1 underline-offset-4 hover:underline">
										AF
										{#if data.sort === 'af_desc'}<span class="text-xs text-muted-foreground">↓</span>{/if}
									</a>
								</Table.Head>
								<Table.Head class="h-9 text-[11px] tracking-[0.12em] uppercase">Tag</Table.Head>
								<Table.Head class="h-9 text-[11px] tracking-[0.12em] uppercase">Subjects</Table.Head>
								<Table.Head class="h-9 text-[11px] tracking-[0.12em] uppercase">Genes</Table.Head>
								<Table.Head class="h-9 text-[11px] tracking-[0.12em] uppercase">Impact</Table.Head>
								<Table.Head class="h-9 text-[11px] tracking-[0.12em] uppercase">dbSNP</Table.Head>
								<Table.Head class="h-9 text-[11px] tracking-[0.12em] uppercase">GQ</Table.Head>
								<Table.Head class="h-9 text-[11px] tracking-[0.12em] uppercase">
									<a href={buildFilterHref({ sort: 'gene' })} class="inline-flex items-center gap-1 underline-offset-4 hover:underline">
										Gene / State
										{#if data.sort === 'gene'}<span class="text-xs text-muted-foreground">A-Z</span>{/if}
									</a>
								</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#if data.rows.length === 0}
								<Table.Row>
									<Table.Cell colspan={12} class="py-10 text-center text-sm text-muted-foreground">
										No rows match that search.
									</Table.Cell>
								</Table.Row>
							{:else}
								{#each data.rows as row, index}
									<Table.Row>
										<Table.Cell class="py-2 text-xs text-muted-foreground">{startRow() + index}</Table.Cell>
									<Table.Cell class="py-2">
										<a href={`/variant/${row.id}`} class="font-mono text-[13px] font-medium text-primary underline-offset-4 hover:underline">
											<span class="inline-flex items-center rounded-md bg-primary/8 px-2.5 py-1 text-[13px] font-semibold text-primary ring-1 ring-primary/18 transition-colors hover:bg-primary/14 hover:ring-primary/28">
												{row.dnaChange.replace('chr', '')}
											</span>
										</a>
									</Table.Cell>
									<Table.Cell class="py-2"><Badge variant="outline" class="rounded-full px-2 py-0 text-[10px]">{row.variantClass}</Badge></Table.Cell>
									<Table.Cell class="py-2 text-[13px] text-muted-foreground">{row.consequence.replaceAll('_', ' ')}</Table.Cell>
									<Table.Cell class="py-2 font-mono text-[13px]">{row.afLabel}</Table.Cell>
									<Table.Cell class="py-2"><Badge variant="outline" class="rounded-full px-2 py-0 text-[10px]">{row.tag}</Badge></Table.Cell>
									<Table.Cell class="py-2 text-[13px]">{row.subjectCount}</Table.Cell>
									<Table.Cell class="py-2 text-[13px]">{row.geneCount}</Table.Cell>
									<Table.Cell class="py-2">
										<Badge variant={impactVariant(row.impact)} class="rounded-full px-2 py-0 text-[10px]">{row.impact}</Badge>
									</Table.Cell>
									<Table.Cell class="py-2 font-mono text-[13px] text-muted-foreground">{row.dbSnp}</Table.Cell>
									<Table.Cell class="py-2 text-[13px] text-muted-foreground">{row.genotypeQuality}</Table.Cell>
									<Table.Cell class="py-2">
										<div class="space-y-0.5">
											<p class="font-medium text-foreground">{row.gene}</p>
											<p class="text-[11px] tracking-[0.08em] text-muted-foreground uppercase">{row.stateCode}</p>
										</div>
									</Table.Cell>
								</Table.Row>
							{/each}
						{/if}
						</Table.Body>
					</Table.Root>
				</div>

				<div class="flex flex-col gap-4 border-t px-6 py-4 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
					<p class="whitespace-nowrap">Page {data.page} of {data.totalPages}</p>
					<Pagination.Root count={data.totalRows} perPage={data.pageSize} page={data.page} onPageChange={handlePageChange}>
						{#snippet children({ pages, currentPage })}
							<Pagination.Content>
								<Pagination.Item>
									<Pagination.PrevButton />
								</Pagination.Item>
								{#each pages as page (page.key)}
									<Pagination.Item>
										{#if page.type === 'ellipsis'}
											<Pagination.Ellipsis />
										{:else}
											<Pagination.Link {page} isActive={currentPage === page.value} />
										{/if}
									</Pagination.Item>
								{/each}
								<Pagination.Item>
									<Pagination.NextButton />
								</Pagination.Item>
							</Pagination.Content>
						{/snippet}
					</Pagination.Root>
				</div>
			</div>
		</Card.Content>
	</Card.Root>
</section>
