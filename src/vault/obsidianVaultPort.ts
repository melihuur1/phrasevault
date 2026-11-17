import { App, normalizePath, TFile, TFolder } from 'obsidian';
import type { EntryKind, VaultPort } from './vaultPort';

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
		getFrontmatter(path) {
			const file = vault.getFileByPath(normalizePath(path));
			if (file === null) return null;
			const frontmatter: unknown = metadataCache.getFileCache(file)?.frontmatter;
			return typeof frontmatter === 'object' && frontmatter !== null ? (frontmatter as Record<string, unknown>) : null;
		},
	};
}
