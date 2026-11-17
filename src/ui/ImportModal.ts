import { App, ButtonComponent, Modal, Notice } from 'obsidian';
import { AnalyzeError, analyzeScreenshot, createAnthropicSender } from '../ai/analyze';
import { parseAnalysisText, type AnalysisResult } from '../ai/validate';
import { blobToBytes, classifyPaste, pickImageFile, readImageFromClipboard } from '../clipboard';
import { importImageBytes, type ImageBytes, type ImportedImage } from '../core/imageInput';
import { formatNumber } from '../core/numbering';
import { SAMPLE_UI, sampleAnalysisJson } from '../dev/sampleAnalysis';
import {
	ANALYZE_ERRORS,
	CLIPBOARD_PROBLEMS,
	formatBytes,
	IMAGE_PROBLEMS,
	MISSING_KEY,
	PASTE_UNSUPPORTED,
	PREPARE_PROBLEMS,
	REVIEW,
	UI,
} from '../i18n/tr';
import { prepareApiImage } from '../imagePrep';
import type PhraseVaultPlugin from '../main';

export type ImportSource = 'clipboard' | 'file' | 'none';

type Phase = 'empty' | 'preview' | 'analyzing' | 'review';

interface StatusMessage {
	kind: 'error' | 'info';
	text: string;
}

/**
 * The main PhraseVault window. The screenshot is only sent to the AI when the
 * user clicks "Analiz et"; importing and previewing never touch the network.
 */
export class ImportModal extends Modal {
	private phase: Phase = 'empty';
	private image: ImportedImage | null = null;
	private previewUrl: string | null = null;
	private message: StatusMessage | null = null;
	private abortController: AbortController | null = null;
	private analysis: AnalysisResult | null = null;
	private analysisIsSample = false;
	private closed = false;
	private busyLoading = false;

	constructor(
		app: App,
		private readonly plugin: PhraseVaultPlugin,
		private readonly initialSource: ImportSource,
	) {
		super(app);
		this.setTitle(UI.modalTitle);
	}

	onOpen(): void {
		this.modalEl.addClass('phrasevault-modal');
		this.modalEl.doc.addEventListener('paste', this.onPaste);
		this.render();
		void this.handleImportRequest(this.initialSource);
	}

	onClose(): void {
		this.closed = true;
		this.abortController?.abort();
		this.modalEl.doc.removeEventListener('paste', this.onPaste);
		this.revokePreview();
		this.contentEl.empty();
		this.plugin.onImportModalClosed(this);
	}

	/** Called by commands; a second import while open loads into this window. */
	async handleImportRequest(source: ImportSource): Promise<void> {
		if (source === 'none') return;
		if (this.phase === 'analyzing' || this.busyLoading) {
			new Notice(UI.busy);
			return;
		}
		if (this.phase === 'review') {
			new Notice(UI.finishReviewFirst);
			return;
		}
		if (source === 'clipboard') await this.importFromClipboard();
		else await this.importFromFile();
	}

	// ── Image input ──────────────────────────────────────────────────────────

	private onPaste = (event: ClipboardEvent): void => {
		if (this.closed) return;
		const content = classifyPaste(event.clipboardData);
		if (content.kind === 'other') return; // ordinary text paste into a field
		event.preventDefault();
		if (this.phase === 'analyzing' || this.busyLoading) {
			new Notice(UI.busy);
			return;
		}
		if (this.phase === 'review') {
			new Notice(UI.finishReviewFirst);
			return;
		}
		if (content.kind === 'unsupported_image') {
			this.showMessage({ kind: 'error', text: PASTE_UNSUPPORTED });
			return;
		}
		void blobToBytes(content.blob).then((bytes) => this.loadBytes(bytes));
	};

	private async importFromClipboard(): Promise<void> {
		const result = await readImageFromClipboard(this.modalEl.win.navigator.clipboard);
		if (this.closed) return;
		if (!result.ok) {
			this.showMessage({ kind: 'error', text: CLIPBOARD_PROBLEMS[result.problem] });
			return;
		}
		await this.loadBytes(result.bytes);
	}

	private async importFromFile(): Promise<void> {
		const file = await pickImageFile(this.modalEl.doc);
		if (this.closed || file === null) return;
		await this.loadBytes(await blobToBytes(file));
	}

	private async loadBytes(bytes: ImageBytes): Promise<void> {
		this.busyLoading = true;
		try {
			const result = await importImageBytes(bytes);
			if (this.closed) return;
			if (!result.ok) {
				// Keep any previously loaded image; just explain the problem.
				this.showMessage({ kind: 'error', text: IMAGE_PROBLEMS[result.problem] });
				return;
			}
			this.setImage(result.image);
		} finally {
			this.busyLoading = false;
		}
	}

	private setImage(image: ImportedImage): void {
		this.revokePreview();
		this.image = image;
		this.previewUrl = URL.createObjectURL(new Blob([image.bytes], { type: image.format === 'png' ? 'image/png' : 'image/jpeg' }));
		this.analysis = null;
		this.analysisIsSample = false;
		this.phase = 'preview';
		this.message = this.plugin.getCachedAnalysis(image.hash) ? { kind: 'info', text: UI.cachedInfo } : null;
		this.render();
	}

	private revokePreview(): void {
		if (this.previewUrl !== null) URL.revokeObjectURL(this.previewUrl);
		this.previewUrl = null;
	}

	private resetToEmpty(): void {
		this.revokePreview();
		this.image = null;
		this.analysis = null;
		this.phase = 'empty';
		this.message = null;
		this.render();
	}

	// ── Analysis ─────────────────────────────────────────────────────────────

	private async analyze(options: { force: boolean }): Promise<void> {
		const image = this.image;
		if (image === null || this.phase === 'analyzing') return;

		const cached = options.force ? undefined : this.plugin.getCachedAnalysis(image.hash);
		if (cached !== undefined) {
			this.showAnalysis(cached, false);
			return;
		}

		const apiKey = this.plugin.getApiKey();
		if (apiKey === null) {
			this.showMessage({ kind: 'error', text: MISSING_KEY });
			return;
		}

		const controller = new AbortController();
		this.abortController = controller;
		this.phase = 'analyzing';
		this.message = null;
		this.render();

		try {
			const prepared = await prepareApiImage(image, this.modalEl.doc);
			if (this.closed || controller.signal.aborted) {
				this.afterCancel(controller);
				return;
			}
			if (!prepared.ok) {
				this.phase = 'preview';
				this.showMessage({ kind: 'error', text: PREPARE_PROBLEMS[prepared.reason] });
				return;
			}

			const result = await analyzeScreenshot(createAnthropicSender(apiKey), prepared.image, {
				model: this.plugin.settings.model,
				signal: controller.signal,
			});
			if (this.closed || this.image !== image) return;
			this.plugin.rememberAnalysis(image.hash, result);
			this.showAnalysis(result, false);
		} catch (error) {
			if (this.closed || this.image !== image) return;
			const code = error instanceof AnalyzeError ? error.code : 'unknown';
			this.phase = 'preview';
			this.showMessage(code === 'aborted' ? { kind: 'info', text: UI.analysisCancelled } : { kind: 'error', text: ANALYZE_ERRORS[code] });
		} finally {
			if (this.abortController === controller) this.abortController = null;
		}
	}

	private afterCancel(controller: AbortController): void {
		if (this.closed || this.abortController !== controller) return;
		this.phase = 'preview';
		this.showMessage({ kind: 'info', text: UI.analysisCancelled });
	}

	private cancelAnalysis(): void {
		this.abortController?.abort();
	}

	private runSampleAnalysis(): void {
		// The __DEV__ guard lets production builds drop the sample data entirely.
		if (__DEV__) this.showAnalysis(parseAnalysisText(sampleAnalysisJson()), true);
	}

	private showAnalysis(result: AnalysisResult, isSample: boolean): void {
		this.analysis = result;
		this.analysisIsSample = isSample;
		this.phase = 'review';
		this.message = __DEV__ && isSample ? { kind: 'info', text: SAMPLE_UI.notice } : null;
		this.render();
	}

	// ── Rendering ────────────────────────────────────────────────────────────

	private showMessage(message: StatusMessage): void {
		this.message = message;
		this.render();
	}

	private render(): void {
		if (this.closed) return;
		const root = this.contentEl;
		root.empty();
		root.addClass('phrasevault-content');

		switch (this.phase) {
			case 'empty':
				this.renderEmpty(root);
				break;
			case 'preview':
				this.renderPreview(root);
				break;
			case 'analyzing':
				this.renderAnalyzing(root);
				break;
			case 'review':
				this.renderReview(root);
				break;
		}
	}

	private renderMessage(root: HTMLElement): void {
		if (this.message === null) return;
		root.createDiv({
			cls: ['phrasevault-message', `phrasevault-message-${this.message.kind}`],
			text: this.message.text,
			attr: { role: this.message.kind === 'error' ? 'alert' : 'status' },
		});
	}

	private renderImage(root: HTMLElement, image: ImportedImage): void {
		const frame = root.createDiv({ cls: 'phrasevault-preview' });
		if (this.previewUrl !== null) frame.createEl('img', { attr: { src: this.previewUrl, alt: 'Ekran görüntüsü önizlemesi' } });
		root.createDiv({
			cls: 'phrasevault-meta',
			text: UI.imageMeta(image.width, image.height, image.format.toUpperCase(), formatBytes(image.byteLength)),
		});
	}

	private renderNextNumber(root: HTMLElement): void {
		const el = root.createDiv({ cls: 'phrasevault-next-number' });
		void this.plugin.store.peekNextNumber().then(
			(n) => el.setText(UI.nextNumber(formatNumber(n))),
			() => el.remove(),
		);
	}

	private renderEmpty(root: HTMLElement): void {
		const drop = root.createDiv({ cls: 'phrasevault-empty' });
		drop.createEl('p', { cls: 'phrasevault-empty-hint', text: UI.emptyHint });
		drop.createEl('p', { cls: 'phrasevault-empty-subhint', text: UI.emptySubHint });
		this.renderMessage(root);
		const actions = root.createDiv({ cls: 'phrasevault-actions' });
		new ButtonComponent(actions).setButtonText(UI.pasteFromClipboard).setCta().onClick(() => void this.importFromClipboard());
		new ButtonComponent(actions).setButtonText(UI.chooseFile).onClick(() => void this.importFromFile());
	}

	private renderPreview(root: HTMLElement): void {
		const image = this.image;
		if (image === null) return this.renderEmpty(root);
		this.renderImage(root, image);
		this.renderMessage(root);
		root.createEl('p', { cls: 'phrasevault-privacy', text: UI.privacy });

		const actions = root.createDiv({ cls: 'phrasevault-actions' });
		const hasCache = this.plugin.getCachedAnalysis(image.hash) !== undefined;
		new ButtonComponent(actions)
			.setButtonText(hasCache ? UI.useCachedAnalysis : UI.analyze)
			.setCta()
			.onClick(() => void this.analyze({ force: false }));
		if (hasCache) new ButtonComponent(actions).setButtonText(UI.analyzeAgain).onClick(() => void this.analyze({ force: true }));
		if (__DEV__) new ButtonComponent(actions).setButtonText(SAMPLE_UI.button).onClick(() => this.runSampleAnalysis());
		new ButtonComponent(actions).setButtonText(UI.pasteFromClipboard).onClick(() => void this.importFromClipboard());
		new ButtonComponent(actions).setButtonText(UI.chooseFile).onClick(() => void this.importFromFile());
		this.renderNextNumber(root);
	}

	private renderAnalyzing(root: HTMLElement): void {
		if (this.image !== null) this.renderImage(root, this.image);
		const status = root.createDiv({ cls: 'phrasevault-analyzing', attr: { role: 'status' } });
		status.createDiv({ cls: 'phrasevault-spinner', attr: { 'aria-hidden': 'true' } });
		status.createSpan({ text: UI.analyzing });
		const actions = root.createDiv({ cls: 'phrasevault-actions' });
		new ButtonComponent(actions).setButtonText(UI.cancel).onClick(() => this.cancelAnalysis());
	}

	private renderReview(root: HTMLElement): void {
		const analysis = this.analysis;
		if (this.image !== null) this.renderImage(root, this.image);
		this.renderMessage(root);
		if (analysis === null) return;

		root.createEl('h3', { text: REVIEW.heading(analysis.suggestions.length) });
		root.createEl('p', { cls: 'phrasevault-review-status', text: REVIEW.status[analysis.status] });
		if (analysis.suggestions.length === 0) root.createEl('p', { text: REVIEW.noSuggestions });
		const list = root.createEl('ul');
		for (const suggestion of analysis.suggestions) {
			list.createEl('li', { text: `${suggestion.phrase} — ${suggestion.turkishMeaning}` });
		}

		const actions = root.createDiv({ cls: 'phrasevault-actions' });
		new ButtonComponent(actions).setButtonText(UI.newImage).onClick(() => this.resetToEmpty());
		new ButtonComponent(actions).setButtonText(UI.close).onClick(() => this.close());
	}
}
