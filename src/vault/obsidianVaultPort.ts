import { App, getFrontMatterInfo, normalizePath, parseYaml, TFile, TFolder } from 'obsidian';
import type { EntryKind, VaultPort } from './vaultPort';

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Parses the frontmatter block of a note's text; invalid YAML counts as none. */
function parseFrontmatter(content: string): Record<string, unknown> | null {
	const info = getFrontMatterInfo(content);
	if (!info.exists) return null;
	try {
		return asRecord(parseYaml(info.frontmatter));
	} catch {
		return null;
	}
}

/** Adapts Obsidian's Vault API to the minimal VaultPort used by PhraseStore. */
export function createObsidianVaultPort(app: App): VaultPort {
	const { vault, metadataCache } = app;

	const requireFile = (path: string): TFile => {
		const file = vault.getFileByPath(normalizePath(path));
		if (file === null) throw new Error(`File not found: ${path}`);
		return file;
	};

	return {
		kind(path: string): EntryKind | null {
			const entry = vault.getAbstractFileByPath(normalizePath(path));
			if (entry instanceof TFile) return 'file';
			if (entry instanceof TFolder) return 'folder';
			return null;
		},
		read: (path) => vault.cachedRead(requireFile(path)),
		async create(path, data) {
			await vault.create(normalizePath(path), data);
		},
		async createBinary(path, data) {
			await vault.createBinary(normalizePath(path), data);
		},
		process: (path, fn) => vault.process(requireFile(path), fn),
		async createFolder(path) {
			await vault.createFolder(normalizePath(path));
		},
		listFileNames(folder) {
			const dir = vault.getFolderByPath(normalizePath(folder));
			if (dir === null) return [];
			return dir.children.filter((child): child is TFile => child instanceof TFile).map((child) => child.name);
		},
		async getFrontmatter(path) {
			const file = vault.getFileByPath(normalizePath(path));
			if (file === null) return null;
			// The metadata cache is fast but may not have indexed a file yet (just
			// created, or right after startup); then read the file itself.
			const cached = metadataCache.getFileCache(file);
			if (cached !== null) return asRecord(cached.frontmatter);
			return parseFrontmatter(await vault.cachedRead(file));
		},
	};
}
