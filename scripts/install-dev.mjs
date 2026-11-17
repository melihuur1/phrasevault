// Copies the built plugin into the disposable development vault (./dev-vault).
//
// Safety: the destination is hard-coded inside this repository and is
// re-checked after resolving symlinks/junctions, so this script can never write
// into a real Obsidian vault elsewhere on disk.

import { copyFileSync, existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ID = 'phrasevault';
const repoRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const devVault = join(repoRoot, 'dev-vault');
const pluginDir = join(devVault, '.obsidian', 'plugins', PLUGIN_ID);

function assertInsideRepo(path) {
	const rel = relative(repoRoot, path);
	if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
		throw new Error(`[install-dev] Refusing to write outside the repository: ${path}`);
	}
}

export function installToDevVault() {
	assertInsideRepo(pluginDir);
	mkdirSync(pluginDir, { recursive: true });
	// Re-check after creation: a junction/symlink could point elsewhere.
	assertInsideRepo(realpathSync(pluginDir));

	for (const file of ['main.js', 'manifest.json', 'styles.css']) {
		const source = join(repoRoot, file);
		if (existsSync(source)) copyFileSync(source, join(pluginDir, file));
	}

	// Pre-enable the plugin in the dev vault (Obsidian still asks you to turn on community plugins once).
	const communityPlugins = join(devVault, '.obsidian', 'community-plugins.json');
	if (!existsSync(communityPlugins)) {
		writeFileSync(communityPlugins, JSON.stringify([PLUGIN_ID], null, '\t'));
	}

	console.log(`[install-dev] Copied build to ${relative(repoRoot, pluginDir)}`);
}

const invokedDirectly =
	process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) installToDevVault();
