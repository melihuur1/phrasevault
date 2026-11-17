import { App, ButtonComponent, Modal, Notice } from 'obsidian';
import { AnalyzeError, analyzeScreenshot, createAnthropicSender } from '../ai/analyze';
import { parseAnalysisText, type AnalysisResult } from '../ai/validate';
import { blobToBytes, classifyPaste, pickImageFile, readImageFromClipboard } from '../clipboard';
import { extensionOf, importImageBytes, toArrayBuffer, type ImageBytes, type ImportedImage } from '../core/imageInput';
import { formatLocalDate } from '../core/noteMarkdown';
import { formatNumber } from '../core/numbering';
import type { KnownPhrase } from '../core/types';
import { SAMPLE_UI, sampleAnalysisJson } from '../dev/sampleAnalysis';
import {
	ANALYZE_ERRORS,
	CLIPBOARD_PROBLEMS,
	DONE,
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
import type { SaveReport } from '../vault/vaultStore';
import { blankCard, cardsFromAnalysis, evaluateCards, planSave, type CardState } from './reviewModel';
import { SuggestionCard } from './SuggestionCard';

export type ImportSource = 'clipboard' | 'file' | 'none';

type Phase = 'empty' | 'preview' | 'analyzing' | 'review' | 'saving';

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
	private closed = false;
	private busyLoading = false;

	// Review state
	private cards: CardState[] = [];
	private cardViews = new Map<number, SuggestionCard>();
	private known: KnownPhrase[] = [];
	private attemptedSave = false;
	private saveButton: ButtonComponent | null = null;
	private reviewMessageEl: HTMLElement | null = null;
	private nextCardId = 1;

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

	private get isBusy(): boolean {
		return this.phase === 'analyzing' || this.phase === 'saving' || this.busyLoading;
	}

	/** Called by commands; a second import while open loads into this window. */
	async handleImportRequest(source: ImportSource): Promise<void> {
		if (source === 'none') return;
		if (this.isBusy) {
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
		if (this.isBusy) {
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
		this.clearReview();
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
		this.clearReview();
		this.phase = 'empty';
		this.message = null;
		this.render();
	}

	private backToPreview(): void {
		this.clearReview();
		this.analysis = null;
		this.phase = this.image === null ? 'empty' : 'preview';
		this.message = null;
		this.render();
	}

	// ── Analysis ─────────────────────────────────────────────────────────────

	private async analyze(options: { force: boolean }): Promise<void> {
		const image = this.image;
		if (image === null || this.isBusy) return;

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
		this.clearReview();
		this.cards = cardsFromAnalysis(result, () => this.nextCardId++);
		this.phase = 'review';
		this.message = __DEV__ && isSample ? { kind: 'info', text: SAMPLE_UI.notice } : null;
		this.render();
		void this.loadKnownPhrases();
	}

	// ── Review ───────────────────────────────────────────────────────────────

	private clearReview(): void {
		this.cards = [];
		this.cardViews.clear();
		this.known = [];
		this.attemptedSave = false;
		this.saveButton = null;
		this.reviewMessageEl = null;
	}

	private startManualEntry(): void {
		if (this.phase !== 'review') {
			this.clearReview();
			this.analysis = null;
			this.phase = 'review';
			this.message = null;
			this.cards = [blankCard(this.nextCardId++)];
			this.render();
			void this.loadKnownPhrases();
			this.cardViews.get(this.cards[0]?.id ?? -1)?.focus();
			return;
		}
		this.addManualCard();
	}

	private addManualCard(): void {
		const card = blankCard(this.nextCardId++);
		this.cards.push(card);
		this.render();
		this.cardViews.get(card.id)?.focus();
	}

	private removeCard(view: SuggestionCard): void {
		this.cards = this.cards.filter((card) => card.id !== view.state.id);
		this.render();
	}

	private async loadKnownPhrases(): Promise<void> {
		try {
			const known = await this.plugin.store.knownPhrases();
			if (this.closed || this.phase !== 'review') return;
			this.known = known;
			this.refreshReview();
		} catch {
			// Duplicate warnings are best-effort; saving never overwrites anything anyway.
		}
	}

	/** Re-evaluates every card and updates warnings and the save button in place. */
	private refreshReview(): void {
		const issues = evaluateCards(this.cards, this.known);
		this.cards.forEach((card, i) => {
			const view = this.cardViews.get(card.id);
			const issue = issues[i];
			if (view !== undefined && issue !== undefined) view.update(issue, this.attemptedSave);
		});
		const selected = this.cards.filter((card) => card.selected).length;
		this.saveButton?.setButtonText(REVIEW.save(selected)).setDisabled(selected === 0 || this.phase === 'saving');
	}

	private setReviewMessage(message: StatusMessage | null): void {
		const el = this.reviewMessageEl;
		if (el === null) return;
		el.empty();
		el.className = '';
		if (message === null) return;
		el.addClass('phrasevault-message', `phrasevault-message-${message.kind}`);
		el.setText(message.text);
		el.setAttr('role', message.kind === 'error' ? 'alert' : 'status');
	}

	private async save(): Promise<void> {
		if (this.isBusy) return;
		this.attemptedSave = true;
		const plan = planSave(this.cards, this.known);
		if (!plan.ok) {
			this.refreshReview();
			this.setReviewMessage({ kind: 'error', text: plan.reason === 'nothing_selected' ? REVIEW.nothingSelected : REVIEW.fixBeforeSaving });
			if (plan.reason === 'blocked') this.cardViews.get(plan.blockedIds[0] ?? -1)?.focus();
			return;
		}

		this.phase = 'saving';
		this.setReviewMessage({ kind: 'info', text: DONE.saving });
		for (const view of this.cardViews.values()) view.setDisabled(true);
		this.refreshReview();

		const image = this.image;
		let report: SaveReport;
		try {
			report = await this.plugin.store.saveBatch({
				image: image === null ? null : { bytes: toArrayBuffer(image.bytes), extension: extensionOf(image.format), hash: image.hash },
				drafts: plan.drafts,
				createdDate: formatLocalDate(new Date()),
			});
		} catch {
			// saveBatch reports failures itself; this only guards against the unexpected.
			if (this.closed) return;
			this.phase = 'review';
			this.render();
			this.setReviewMessage({ kind: 'error', text: DONE.failure.note_write_failed });
			return;
		}
		if (this.closed) return;

		const savedCount = report.saved.length + report.notIndexed.length;
		if (savedCount > 0) new Notice(DONE.savedHeading(savedCount));
		if (report.failure === null) {
			this.resetToEmpty();
			return;
		}
		// Keep the unsaved cards so the user can fix and retry; saved ones are removed.
		const savedIds = new Set(plan.cardIds.slice(0, savedCount));
		this.cards = this.cards.filter((card) => !savedIds.has(card.id));
		this.phase = 'review';
		this.render();
		this.setReviewMessage({ kind: 'error', text: DONE.failure[report.failure.reason] });
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
			case 'saving':
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

	private renderImage(root: HTMLElement, image: ImportedImage, compact = false): void {
		const frame = root.createDiv({ cls: ['phrasevault-preview', compact ? 'is-compact' : 'is-full'] });
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
		new ButtonComponent(actions).setButtonText(UI.changeImage).onClick(() => this.resetToEmpty());
		new ButtonComponent(actions).setButtonText(REVIEW.addManual).onClick(() => this.startManualEntry());
		if (__DEV__) new ButtonComponent(actions).setButtonText(SAMPLE_UI.button).onClick(() => this.runSampleAnalysis());
		const hasCache = this.plugin.getCachedAnalysis(image.hash) !== undefined;
		if (hasCache) new ButtonComponent(actions).setButtonText(UI.analyzeAgain).onClick(() => void this.analyze({ force: true }));
		new ButtonComponent(actions)
			.setButtonText(hasCache ? UI.useCachedAnalysis : UI.analyze)
			.setCta()
			.onClick(() => void this.analyze({ force: false }));
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
		if (this.image !== null) this.renderImage(root, this.image, true);
		this.renderMessage(root);

		const analysis = this.analysis;
		root.createEl('h3', { cls: 'phrasevault-review-heading', text: REVIEW.heading(this.cards.length) });
		if (analysis === null) root.createEl('p', { cls: 'phrasevault-review-status', text: REVIEW.manualOnly });
		else {
			root.createEl('p', { cls: 'phrasevault-review-status', text: REVIEW.status[analysis.status] });
			if (analysis.suggestions.length === 0) root.createEl('p', { cls: 'phrasevault-review-status', text: REVIEW.noSuggestions });
		}

		const list = root.createDiv({ cls: 'phrasevault-cards' });
		this.cardViews.clear();
		for (const card of this.cards) {
			const view = new SuggestionCard(list, card, {
				onChange: () => {
					this.setReviewMessage(null);
					this.refreshReview();
				},
				onRemove: (removed) => this.removeCard(removed),
			});
			this.cardViews.set(card.id, view);
		}

		const addRow = root.createDiv({ cls: 'phrasevault-actions is-start' });
		new ButtonComponent(addRow).setButtonText(REVIEW.addManual).onClick(() => this.addManualCard());

		this.reviewMessageEl = root.createDiv();
		const footer = root.createDiv({ cls: 'phrasevault-footer' });
		this.renderNextNumber(footer);
		const actions = footer.createDiv({ cls: 'phrasevault-actions' });
		new ButtonComponent(actions).setButtonText(UI.backToPreview).onClick(() => this.backToPreview());
		this.saveButton = new ButtonComponent(actions).setCta().onClick(() => void this.save());

		const saving = this.phase === 'saving';
		if (saving) for (const view of this.cardViews.values()) view.setDisabled(true);
		this.refreshReview();
	}
}
