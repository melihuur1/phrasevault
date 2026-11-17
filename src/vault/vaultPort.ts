// The small slice of the Obsidian Vault API that PhraseVault needs.
// main.ts adapts app.vault to this interface; tests use an in-memory fake.
// All paths are vault-relative.

export type EntryKind = 'file' | 'folder';

export interface VaultPort {
	/** What exists at `path`, or null. */
	kind(path: string): EntryKind | null;
	/** Current text of a file. */
	read(path: string): Promise<string>;
	/** Creates a new text file. Must throw if anything already exists at `path`. */
	create(path: string, data: string): Promise<void>;
	/** Creates a new binary file. Must throw if anything already exists at `path`. */
	createBinary(path: string, data: ArrayBuffer): Promise<void>;
	/** Atomically reads, transforms, and writes a text file. If `fn` throws, nothing is written. */
	process(path: string, fn: (current: string) => string): Promise<string>;
	createFolder(path: string): Promise<void>;
	/** Names of the files directly inside `folder` (empty if it does not exist). */
	listFileNames(folder: string): string[];
	/**
	 * Parsed frontmatter of a Markdown file, or null if it has none. Must also
	 * work for files the metadata cache has not indexed yet.
	 */
	getFrontmatter(path: string): Promise<Record<string, unknown> | null>;
}

/** Persists the highest number ever issued (guards against reusing a deleted entry's number). */
export interface HighWaterMark {
	get(): number;
	set(n: number): Promise<void>;
}
