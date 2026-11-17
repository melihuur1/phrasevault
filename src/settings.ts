import { App, Notice, PluginSettingTab, SecretComponent, Setting, type SettingDefinitionItem } from 'obsidian';
import { DEFAULT_MODEL } from './ai/analyze';
import { formatUsd, PRICING_VERIFIED_ON } from './core/cost';
import { COST, formatDate, formatDateTime, SETTINGS } from './i18n/tr';
import type PhraseVaultPlugin from './main';
import { makeDestructive } from './ui/buttons';
import { confirmAction } from './ui/ConfirmModal';

/** Recent analyses listed in the settings; the full (small) history stays in data.json. */
const RECENT_SHOWN = 5;

interface SettingRow {
	name: string;
	desc: string;
	/** Adds the control to an already named row; shared by both rendering paths. */
	build?: (setting: Setting) => void;
}

export class PhraseVaultSettingTab extends PluginSettingTab {
	/** Rows that show usage data, refreshed in place after a reset. */
	private usageRows: { total: Setting | null; recent: Setting | null } = { total: null, recent: null };

	constructor(
		app: App,
		private readonly plugin: PhraseVaultPlugin,
	) {
		super(app, plugin);
	}

	private mainRows(): SettingRow[] {
		return [
			{
				name: SETTINGS.apiKeyName,
				desc: SETTINGS.apiKeyDesc,
				build: (setting) =>
					setting.addComponent((el) =>
						new SecretComponent(this.app, el).setValue(this.plugin.settings.apiKeySecretName).onChange(async (value) => {
							this.plugin.settings.apiKeySecretName = value ?? '';
							await this.plugin.saveSettings();
						}),
					),
			},
			{
				name: SETTINGS.modelName,
				desc: SETTINGS.modelDesc(DEFAULT_MODEL),
				build: (setting) =>
					setting.addText((text) =>
						text
							.setPlaceholder(DEFAULT_MODEL)
							.setValue(this.plugin.settings.model)
							.onChange(async (value) => {
								this.plugin.settings.model = value.trim() === '' ? DEFAULT_MODEL : value.trim();
								await this.plugin.saveSettings();
							}),
					),
			},
		];
	}

	private infoRows(): SettingRow[] {
		return [
			{ name: SETTINGS.privacyName, desc: SETTINGS.privacyDesc },
			{ name: SETTINGS.costName, desc: SETTINGS.costDesc },
		];
	}

	private usageSummary(): string {
		const usage = this.plugin.settings.usage;
		if (usage.since === null) return SETTINGS.usageEmpty;
		return SETTINGS.usageTotal(formatUsd(usage.totalPicoUsd), usage.pricedCount, usage.unpricedCount, formatDate(usage.since));
	}

	private recentUsage(): DocumentFragment {
		const fragment = createFragment();
		fragment.createDiv({ text: SETTINGS.usageRecentDesc });
		const records = this.plugin.settings.usage.recent.slice(-RECENT_SHOWN).reverse();
		if (records.length === 0) {
			fragment.createDiv({ text: SETTINGS.usageRecentEmpty });
			return fragment;
		}
		const list = fragment.createEl('ul', { cls: 'phrasevault-usage-list' });
		for (const record of records) {
			const amount = record.costPicoUsd === null ? COST.unavailable : formatUsd(record.costPicoUsd);
			list.createEl('li', {
				text: SETTINGS.usageRecord(formatDateTime(record.at), record.model, record.inputTokens, record.outputTokens, amount),
			});
		}
		return fragment;
	}

	private refreshUsageRows(): void {
		this.usageRows.total?.setDesc(this.usageSummary());
		this.usageRows.recent?.setDesc(this.recentUsage());
	}

	private async resetUsage(): Promise<void> {
		const confirmed = await confirmAction(this.app, {
			title: SETTINGS.resetTitle,
			message: SETTINGS.resetMessage,
			confirmText: SETTINGS.resetConfirm,
			cancelText: SETTINGS.resetCancel,
		});
		if (!confirmed) return;
		await this.plugin.resetUsage();
		this.refreshUsageRows();
		new Notice(SETTINGS.resetDone);
	}

	private usageRowsList(): SettingRow[] {
		return [
			{
				name: SETTINGS.usageTotalName,
				desc: SETTINGS.usageEmpty,
				build: (setting) => {
					this.usageRows.total = setting;
					setting.setDesc(this.usageSummary());
					setting.addButton((button) =>
						makeDestructive(button)
							.setButtonText(SETTINGS.resetButton)
							.onClick(() => void this.resetUsage()),
					);
				},
			},
			{
				name: SETTINGS.usageRecentName,
				desc: SETTINGS.usageRecentDesc,
				build: (setting) => {
					this.usageRows.recent = setting;
					setting.setDesc(this.recentUsage());
				},
			},
			{ name: SETTINGS.usageDisclaimerName, desc: SETTINGS.usageDisclaimer(PRICING_VERIFIED_ON) },
		];
	}

	/** Obsidian 1.13+: declarative definitions (also makes the settings searchable). */
	getSettingDefinitions(): SettingDefinitionItem[] {
		const toDefinition = (row: SettingRow) => {
			const { build } = row;
			return build === undefined ? { name: row.name, desc: row.desc } : { name: row.name, desc: row.desc, render: (setting: Setting) => build(setting) };
		};
		return [
			{ type: 'group', items: this.mainRows().map(toDefinition) },
			{ type: 'group', heading: SETTINGS.usageHeading, items: this.usageRowsList().map(toDefinition) },
			{ type: 'group', heading: SETTINGS.privacyHeading, items: this.infoRows().map(toDefinition) },
		];
	}

	/** Fallback for Obsidian 1.11.4–1.12, which do not support declarative settings. */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const add = (row: SettingRow) => {
			const setting = new Setting(containerEl).setName(row.name).setDesc(row.desc);
			row.build?.(setting);
		};
		this.mainRows().forEach(add);
		new Setting(containerEl).setName(SETTINGS.usageHeading).setHeading();
		this.usageRowsList().forEach(add);
		new Setting(containerEl).setName(SETTINGS.privacyHeading).setHeading();
		this.infoRows().forEach(add);
	}
}
