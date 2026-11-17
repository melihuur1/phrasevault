// In-memory VaultPort used by the tests. It mirrors the Obsidian behaviors that
// matter for safety: create* throws when the path exists, and process() is atomic.

import { parse as parseYaml } from 'yaml';
import type { EntryKind, HighWaterMark, VaultPort } from '../../src/vault/vaultPort';

type Entry = { kind: 'folder' } | { kind: 'file'; text: string } | { kind: 'binary'; data: ArrayBuffer };

export class FakeVault implements VaultPort {
	private entries = new Map<string, Entry>();

	/** Called before each write; throw to simulate a failure, or mutate the vault to simulate a race. */
	beforeCreate: ((path: string) => void) | null = null;
	beforeProcess: ((path: string) => void) | null = null;

	readonly writes: string[] = [];

	constructor(initial: Record<string, string> = {}) {
		for (const [path, text] of Object.entries(initial)) this.seedFile(path, text);
	}

	/** Adds a file (and its parent folders) without counting it as a plugin write. */
	seedFile(path: string, text: string): void {
		this.ensureParents(path);
		this.entries.set(path, { kind: 'file', text });
	}

	seedFolder(path: string): void {
		this.ensureParents(path);
		this.entries.set(path, { kind: 'folder' });
	}

	delete(path: string): void {
		this.entries.delete(path);
	}

	private ensureParents(path: string): void {
		const parts = path.split('/');
		for (let i = 1; i < parts.length; i++) {
			const folder = parts.slice(0, i).join('/');
			if (!this.entries.has(folder)) this.entries.set(folder, { kind: 'folder' });
		}
	}

	private requireParent(path: string): void {
		const parent = path.split('/').slice(0, -1).join('/');
		if (parent !== '' && this.entries.get(parent)?.kind !== 'folder') {
			throw new Error(`Parent folder does not exist: ${parent}`);
		}
	}

	text(path: string): string | undefined {
		const entry = this.entries.get(path);
		return entry?.kind === 'file' ? entry.text : undefined;
	}

	binary(path: string): ArrayBuffer | undefined {
		const entry = this.entries.get(path);
		return entry?.kind === 'binary' ? entry.data : undefined;
	}

	paths(): string[] {
		return [...this.entries.keys()].sort();
	}

	kind(path: string): EntryKind | null {
		const entry = this.entries.get(path);
		if (entry === undefined) return null;
		return entry.kind === 'folder' ? 'folder' : 'file';
	}

	read(path: string): Promise<string> {
		const entry = this.entries.get(path);
		if (entry?.kind !== 'file') return Promise.reject(new Error(`File not found: ${path}`));
		return Promise.resolve(entry.text);
	}

	create(path: string, data: string): Promise<void> {
		try {
			this.beforeCreate?.(path);
			if (this.entries.has(path)) throw new Error('File already exists.');
			this.requireParent(path);
		} catch (error) {
			return Promise.reject(error instanceof Error ? error : new Error(String(error)));
		}
		this.entries.set(path, { kind: 'file', text: data });
		this.writes.push(`create ${path}`);
		return Promise.resolve();
	}

	createBinary(path: string, data: ArrayBuffer): Promise<void> {
		try {
			this.beforeCreate?.(path);
			if (this.entries.has(path)) throw new Error('File already exists.');
			this.requireParent(path);
		} catch (error) {
			return Promise.reject(error instanceof Error ? error : new Error(String(error)));
		}
		this.entries.set(path, { kind: 'binary', data });
		this.writes.push(`createBinary ${path}`);
		return Promise.resolve();
	}

	process(path: string, fn: (current: string) => string): Promise<string> {
		try {
			this.beforeProcess?.(path);
			const entry = this.entries.get(path);
			if (entry?.kind !== 'file') throw new Error(`File not found: ${path}`);
			const next = fn(entry.text); // if fn throws, nothing is written
			this.entries.set(path, { kind: 'file', text: next });
			this.writes.push(`process ${path}`);
			return Promise.resolve(next);
		} catch (error) {
			return Promise.reject(error instanceof Error ? error : new Error(String(error)));
		}
	}

	createFolder(path: string): Promise<void> {
		if (this.entries.has(path)) return Promise.reject(new Error('Folder already exists.'));
		this.ensureParents(path);
		this.entries.set(path, { kind: 'folder' });
		this.writes.push(`createFolder ${path}`);
		return Promise.resolve();
	}

	listFileNames(folder: string): string[] {
		const prefix = `${folder}/`;
		return [...this.entries.entries()]
			.filter(([path, entry]) => entry.kind !== 'folder' && path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
			.map(([path]) => path.slice(prefix.length));
	}

	getFrontmatter(path: string): Promise<Record<string, unknown> | null> {
		const text = this.text(path);
		const match = text === undefined ? null : /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
		if (!match?.[1]) return Promise.resolve(null);
		try {
			const parsed: unknown = parseYaml(match[1]);
			return Promise.resolve(typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null);
		} catch {
			return Promise.resolve(null);
		}
	}
}

export class MemoryHighWater implements HighWaterMark {
	failOnSet = false;
	constructor(public value = 0) {}
	get(): number {
		return this.value;
	}
	set(n: number): Promise<void> {
		if (this.failOnSet) return Promise.reject(new Error('saveData failed'));
		this.value = n;
		return Promise.resolve();
	}
}
