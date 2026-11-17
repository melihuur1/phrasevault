import { App, ButtonComponent, Modal, Notice } from 'obsidian';
import type { IndexRepairPlan } from '../core/indexRepair';
import { formatNumber } from '../core/numbering';
import { describeRepairIssue, REPAIR } from '../i18n/tr';
import type { PhraseStore } from '../vault/vaultStore';

/**
 * Shows what "İndeksi onar" found: entries it can add safely, and problems
 * the user has to look at. Nothing is written until the user confirms.
 */
export class RepairModal extends Modal {
	private applying = false;

	constructor(
		app: App,
		private readonly store: PhraseStore,
		private readonly plan: IndexRepairPlan,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(REPAIR.title);
		this.modalEl.addClass('phrasevault-repair');
		const root = this.contentEl;
		root.addClass('phrasevault-content');
		const { additions, issues, indexExists } = this.plan;

		root.createEl('p', { cls: 'phrasevault-review-status', text: REPAIR.intro });
		if (!indexExists) root.createDiv({ cls: 'phrasevault-message phrasevault-message-info', text: REPAIR.indexMissing });

		if (additions.length > 0) {
			root.createEl('h4', { text: REPAIR.additionsHeading(additions.length) });
			const list = root.createEl('ul', { cls: 'phrasevault-repair-list' });
			for (const entry of additions) list.createEl('li', { text: `${formatNumber(entry.number)} — ${entry.alias}` });
		}

		if (issues.length > 0) {
			root.createEl('h4', { text: REPAIR.issuesHeading(issues.length) });
			root.createEl('p', { cls: 'phrasevault-review-status', text: REPAIR.issuesHelp });
			const list = root.createEl('ul', { cls: 'phrasevault-repair-list' });
			for (const issue of issues) list.createEl('li', { text: describeRepairIssue(issue) });
		}

		const actions = root.createDiv({ cls: 'phrasevault-actions' });
		const close = new ButtonComponent(actions).setButtonText(REPAIR.close).onClick(() => this.close());
		if (additions.length === 0) {
			close.setCta();
			close.buttonEl.focus();
			return;
		}
		const apply = new ButtonComponent(actions)
			.setButtonText(REPAIR.apply(additions.length))
			.setCta()
			.onClick(() => void this.apply(apply, close));
		apply.buttonEl.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async apply(apply: ButtonComponent, close: ButtonComponent): Promise<void> {
		if (this.applying) return;
		this.applying = true;
		apply.setDisabled(true).setButtonText(REPAIR.applying);
		close.setDisabled(true);
		try {
			const { added } = await this.store.applyIndexRepair(this.plan.additions);
			new Notice(added.length > 0 ? REPAIR.added(added.length) : REPAIR.alreadyAdded);
		} catch {
			new Notice(REPAIR.applyFailed);
		}
		this.close();
	}
}
