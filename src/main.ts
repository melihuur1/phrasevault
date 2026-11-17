import { Notice, Plugin } from 'obsidian';
import type { AnalysisResult } from './ai/validate';
import { addUsageRecord, createUsageRecord, emptyUsageLog, type ResponseBilling, type UsageRecord } from './core/usageLog';
import { COMMANDS, STRUCTURE } from './i18n/tr';
import { PhraseVaultSettingTab } from './settings';
import { DEFAULT_SETTINGS, sanitizeSettings, type PhraseVaultSettings } from './settingsData';
import { ImportModal, type ImportSource } from './ui/ImportModal';
import { createObsidianVaultPort } from './vault/obsidianVaultPort';
import type { HighWaterMark } from './vault/vaultPort';
import { PhraseStore } from './vault/vaultStore';

/** Analyses kept in memory for this session so re-opening the same screenshot never bills twice. */
const ANALYSIS_CACHE_LIMIT = 20;

export interface CachedAnalysis {
	analysis: AnalysisResult;
	/** The usage record of the request that produced it (shown again, never counted again). */
	usage: UsageRecord;
}

export default class PhraseVaultPlugin extends Plugin {
	settings: PhraseVaultSettings = { ...DEFAULT_SETTINGS };
	store!: PhraseStore;
	private activeImport: ImportModal | null = null;
	private readonly analysisCache = new Map<string, CachedAnalysis>();

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

		this.addCommand({
			id: 'import-from-clipboard',
			name: COMMANDS.importClipboard,
			callback: () => this.openImport('clipboard'),
		});
		this.addCommand({
			id: 'import-from-file',
			name: COMMANDS.importFile,
			callback: () => this.openImport('file'),
		});
		this.addCommand({
			id: 'prepare-structure',
			name: COMMANDS.prepareStructure,
			callback: () => void this.prepareStructure(),
		});
		this.addRibbonIcon('image-plus', COMMANDS.ribbon, () => this.openImport('clipboard'));
	}

	onunload(): void {
		this.analysisCache.clear();
	}

	/** Opens the import window, or reuses the one that is already open. */
	openImport(source: ImportSource): void {
		if (this.activeImport !== null) {
			void this.activeImport.handleImportRequest(source);
			return;
		}
		const modal = new ImportModal(this.app, this, source);
		this.activeImport = modal;
		modal.open();
	}

	onImportModalClosed(modal: ImportModal): void {
		if (this.activeImport === modal) this.activeImport = null;
	}

	getCachedAnalysis(hash: string): CachedAnalysis | undefined {
		return this.analysisCache.get(hash);
	}

	rememberAnalysis(hash: string, result: CachedAnalysis): void {
		this.analysisCache.delete(hash);
		this.analysisCache.set(hash, result);
		while (this.analysisCache.size > ANALYSIS_CACHE_LIMIT) {
			const oldest = this.analysisCache.keys().next().value;
			if (oldest === undefined) break;
			this.analysisCache.delete(oldest);
		}
	}

	/**
	 * Adds the estimated cost of one received API response to the local history.
	 * A response that is already recorded (same message ID) is never counted again.
	 */
	recordUsage(billing: ResponseBilling): UsageRecord {
		const record = createUsageRecord(billing);
		const { log, added } = addUsageRecord(this.settings.usage, record);
		if (added) {
			this.settings.usage = log;
			// Non-fatal if it fails: the estimate is still shown for this analysis.
			this.saveSettings().catch(() => undefined);
		}
		return record;
	}

	async resetUsage(): Promise<void> {
		this.settings.usage = emptyUsageLog();
		await this.saveSettings();
	}

	private async prepareStructure(): Promise<void> {
		try {
			const { indexCreated } = await this.store.prepare();
			new Notice(indexCreated ? STRUCTURE.created : STRUCTURE.ready);
		} catch {
			new Notice(STRUCTURE.failed);
		}
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
