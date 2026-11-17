import { App, PluginSettingTab, SecretComponent, Setting, type SettingDefinitionItem } from 'obsidian';
import { DEFAULT_MODEL } from './ai/analyze';
import type PhraseVaultPlugin from './main';

interface SettingRow {
	name: string;
	desc: string;
	/** Adds the control to an already named row; shared by both rendering paths. */
	build?: (setting: Setting) => void;
}

const PRIVACY_TEXT =
	'“Analiz et” düğmesine bastığınızda yalnızca önizlemede gördüğünüz ekran görüntüsü ve sabit bir talimat metni Anthropic API’ye gönderilir. Kasanızdaki diğer notlar hiçbir zaman gönderilmez.';
const COST_TEXT =
	'API kullanımı Claude Pro aboneliğine dahil değildir; Anthropic Console üzerinden ön ödemeli kredi gerekir. Tahmini maliyet ekran görüntüsü başına yaklaşık 0,001–0,002 ABD dolarıdır.';

export class PhraseVaultSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: PhraseVaultPlugin,
	) {
		super(app, plugin);
	}

	private mainRows(): SettingRow[] {
		return [
			{
				name: 'Anthropic API anahtarı',
				desc: 'Anahtar, Obsidian’ın gizli anahtar deposunda saklanır. Eklenti ayarlarında yalnızca anahtarın adı tutulur; anahtarın kendisi hiçbir dosyaya yazılmaz.',
				build: (setting) =>
					setting.addComponent((el) =>
						new SecretComponent(this.app, el).setValue(this.plugin.settings.apiKeySecretName).onChange(async (value) => {
							this.plugin.settings.apiKeySecretName = value ?? '';
							await this.plugin.saveSettings();
						}),
					),
			},
			{
				name: 'Model',
				desc: `Kullanılacak Claude modeli. Varsayılan: ${DEFAULT_MODEL}`,
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
			{ name: 'Gönderilen veriler', desc: PRIVACY_TEXT },
			{ name: 'Maliyet', desc: COST_TEXT },
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
			{ type: 'group', heading: 'Gizlilik ve maliyet', items: this.infoRows().map(toDefinition) },
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
		new Setting(containerEl).setName('Gizlilik ve maliyet').setHeading();
		this.infoRows().forEach(add);
	}
}
