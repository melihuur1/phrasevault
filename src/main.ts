import { Notice, Plugin } from 'obsidian';

export default class PhraseVaultPlugin extends Plugin {
	async onload(): Promise<void> {
		// Placeholder command for the scaffold phase; replaced by the real import commands in Milestone B.
		this.addCommand({
			id: 'check-installation',
			name: 'Kurulumu kontrol et',
			callback: () => {
				new Notice('PhraseVault yüklendi ve çalışıyor.');
			},
		});
	}
}
