import { App, ButtonComponent, Modal } from 'obsidian';
import { makeDestructive } from './buttons';

export interface ConfirmOptions {
	title: string;
	message: string;
	/** The destructive choice. */
	confirmText: string;
	/** The safe choice; it has the focus, so Enter keeps everything as it is. */
	cancelText: string;
}

class ConfirmModal extends Modal {
	private confirmed = false;

	constructor(
		app: App,
		private readonly options: ConfirmOptions,
		private readonly resolve: (confirmed: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(this.options.title);
		this.modalEl.addClass('phrasevault-confirm');
		this.contentEl.createEl('p', { text: this.options.message });
		const actions = this.contentEl.createDiv({ cls: 'phrasevault-actions' });
		makeDestructive(new ButtonComponent(actions))
			.setButtonText(this.options.confirmText)
			.onClick(() => {
				this.confirmed = true;
				this.close();
			});
		const cancel = new ButtonComponent(actions)
			.setButtonText(this.options.cancelText)
			.setCta()
			.onClick(() => this.close());
		cancel.buttonEl.focus();
	}

	onClose(): void {
		this.contentEl.empty();
		this.resolve(this.confirmed);
	}
}

/** Asks before something is lost. Escape, a click outside, or the safe button all resolve to false. */
export function confirmAction(app: App, options: ConfirmOptions): Promise<boolean> {
	return new Promise((resolve) => new ConfirmModal(app, options, resolve).open());
}
