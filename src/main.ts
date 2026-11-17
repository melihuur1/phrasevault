import { Notice, Plugin } from 'obsidian';
import { PhraseVaultSettingTab } from './settings';
import { DEFAULT_SETTINGS, sanitizeSettings, type PhraseVaultSettings } from './settingsData';
import { createObsidianVaultPort } from './vault/obsidianVaultPort';
import type { HighWaterMark } from './vault/vaultPort';
import { PhraseStore } from './vault/vaultStore';

export default class PhraseVaultPlugin extends Plugin {
	settings: PhraseVaultSettings = { ...DEFAULT_SETTINGS };
	store!: PhraseStore;

	async onload(): Promise<void> {
		await this.loadSettings();

		const highWater: HighWaterMark = {
			get: () => this.settings.lastIssuedNumber,
			set: async (n) => {
				this.settings.lastIssuedNumber = n;
				await this.saveSettings();
			},
		};
		this.store = new PhraseStore(createObsidianVaultPort(this.app), highWater);

		this.addSettingTab(new PhraseVaultSettingTab(this.app, this));

		// Placeholder command for Milestone A; the import commands arrive in Milestone B.
		this.addCommand({
			id: 'check-installation',
			name: 'Kurulumu kontrol et',
			callback: () => {
				const keyStatus = this.getApiKey() === null ? 'API anahtarı ayarlanmamış' : 'API anahtarı ayarlı';
				new Notice(`PhraseVault yüklendi. ${keyStatus}.`);
			},
		});
	}

	/** Reads the API key from SecretStorage at the moment it is needed. Never logged or stored elsewhere. */
	getApiKey(): string | null {
		const name = this.settings.apiKeySecretName;
		if (name === '') return null;
		const secret = this.app.secretStorage.getSecret(name);
		return secret !== null && secret.trim() !== '' ? secret.trim() : null;
	}

	async loadSettings(): Promise<void> {
		this.settings = sanitizeSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
