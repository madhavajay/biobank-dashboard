import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Snippet } from 'svelte';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export type WithElementRef<T> = T & {
	ref?: any;
};

export type WithoutChildren<T> = Omit<T, 'children'> & {
	children?: never;
};

export type WithoutChild<T> = Omit<T, 'child'> & {
	child?: never;
};

export type WithoutChildrenOrChild<T> = Omit<T, 'children' | 'child'> & {
	children?: never;
	child?: never;
};

export type WithChildren<T = Record<string, never>> = T & {
	children?: Snippet;
};
