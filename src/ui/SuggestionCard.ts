import { DropdownComponent, ExtraButtonComponent, TextAreaComponent, TextComponent } from 'obsidian';
import { formatNumber } from '../core/numbering';
import { PHRASE_CATEGORIES, isPhraseCategory } from '../core/types';
import { CATEGORY_LABELS, REVIEW } from '../i18n/tr';
import type { CardIssues, CardState } from './reviewModel';

export interface CardCallbacks {
	/** Any edit or selection change; the modal re-evaluates all cards. */
	onChange(): void;
	onRemove(card: SuggestionCard): void;
}

type TextKey = 'phrase' | 'originalText' | 'turkishMeaning';
type AreaKey = 'explanation' | 'sourceSentence';

/**
 * One editable suggestion. Inputs are created once and edit `state` directly;
 * update() only refreshes badges and warnings, so typing never loses focus.
 */
export class SuggestionCard {
	readonly el: HTMLDivElement;
	private readonly titleEl: HTMLSpanElement;
	private readonly badgesEl: HTMLDivElement;
	private readonly warningsEl: HTMLDivElement;
	private readonly selectInput: HTMLInputElement;
	private readonly controls: Array<TextComponent | TextAreaComponent | DropdownComponent> = [];
	private readonly requiredInputs = new Map<'phrase' | 'turkishMeaning', HTMLInputElement>();
	private disabled = false;

	constructor(
		parent: HTMLElement,
		readonly state: CardState,
		private readonly callbacks: CardCallbacks,
	) {
		this.el = parent.createDiv({ cls: 'phrasevault-card' });

		const header = this.el.createDiv({ cls: 'phrasevault-card-header' });
		const select = header.createEl('label', { cls: 'phrasevault-card-select' });
		this.selectInput = select.createEl('input', { type: 'checkbox' });
		this.selectInput.checked = state.selected;
		this.selectInput.addEventListener('change', () => {
			state.selected = this.selectInput.checked;
			callbacks.onChange();
		});
		select.createSpan({ text: REVIEW.select });

		this.titleEl = header.createSpan({ cls: 'phrasevault-card-title' });
		this.badgesEl = header.createDiv({ cls: 'phrasevault-badges' });
		if (state.manual) {
			new ExtraButtonComponent(header)
				.setIcon('trash-2')
				.setTooltip(REVIEW.remove)
				.onClick(() => {
					if (!this.disabled) callbacks.onRemove(this);
				});
		}

		this.warningsEl = this.el.createDiv({ cls: 'phrasevault-card-warnings' });

		const fields = this.el.createDiv({ cls: 'phrasevault-card-fields' });
		this.addText(fields, 'phrase', REVIEW.fields.phrase, REVIEW.placeholders.phrase);
		this.addText(fields, 'originalText', REVIEW.fields.originalText, REVIEW.placeholders.originalText);
		this.addCategory(fields);
		this.addText(fields, 'turkishMeaning', REVIEW.fields.turkishMeaning, REVIEW.placeholders.turkishMeaning);
		this.addArea(fields, 'explanation', REVIEW.fields.explanation, REVIEW.placeholders.explanation);
		this.addArea(fields, 'sourceSentence', REVIEW.fields.sourceSentence, REVIEW.placeholders.sourceSentence);
	}

	private field(parent: HTMLElement, key: string, label: string, wide: boolean): { container: HTMLElement; id: string } {
		const id = `phrasevault-card-${this.state.id}-${key}`;
		const container = parent.createDiv({ cls: ['phrasevault-field', wide ? 'is-wide' : 'is-narrow'] });
		container.createEl('label', { text: label, attr: { for: id } });
		return { container, id };
	}

	private addText(parent: HTMLElement, key: TextKey, label: string, placeholder: string): void {
		const { container, id } = this.field(parent, key, label, false);
		const text = new TextComponent(container)
			.setPlaceholder(placeholder)
			.setValue(this.state[key])
			.onChange((value) => {
				this.state[key] = value;
				this.callbacks.onChange();
			});
		text.inputEl.id = id;
		this.controls.push(text);
		if (key === 'phrase' || key === 'turkishMeaning') this.requiredInputs.set(key, text.inputEl);
	}

	private addArea(parent: HTMLElement, key: AreaKey, label: string, placeholder: string): void {
		const { container, id } = this.field(parent, key, label, true);
		const area = new TextAreaComponent(container)
			.setPlaceholder(placeholder)
			.setValue(this.state[key])
			.onChange((value) => {
				this.state[key] = value;
				this.callbacks.onChange();
			});
		area.inputEl.id = id;
		area.inputEl.rows = 2;
		this.controls.push(area);
	}

	private addCategory(parent: HTMLElement): void {
		const { container, id } = this.field(parent, 'category', REVIEW.fields.category, false);
		const dropdown = new DropdownComponent(container);
		for (const category of PHRASE_CATEGORIES) dropdown.addOption(category, CATEGORY_LABELS[category]);
		dropdown.setValue(this.state.category).onChange((value) => {
			if (isPhraseCategory(value)) this.state.category = value;
			this.callbacks.onChange();
		});
		dropdown.selectEl.id = id;
		this.controls.push(dropdown);
	}

	/** Refreshes badges and warnings. `showRequired` is set after the first save attempt. */
	update(issues: CardIssues, showRequired: boolean): void {
		const { state } = this;
		this.el.toggleClass('is-deselected', !state.selected);
		this.el.toggleClass('has-issue', state.selected && issues.blocking && (showRequired || issues.needsOverride));
		this.titleEl.setText(state.phrase.trim() || REVIEW.fields.phrase);

		this.badgesEl.empty();
		if (state.highlighted) this.badgesEl.createSpan({ cls: 'phrasevault-badge is-accent', text: REVIEW.badgeHighlighted });
		if (state.manual) this.badgesEl.createSpan({ cls: 'phrasevault-badge', text: REVIEW.badgeManual });
		if (issues.sourceMismatch) {
			this.badgesEl.createSpan({ cls: 'phrasevault-badge is-warning', text: REVIEW.badgeSourceMismatch, attr: { title: REVIEW.sourceMismatchHelp } });
		}

		this.warningsEl.empty();
		for (const match of issues.existing) {
			this.warningsEl.createDiv({ cls: 'phrasevault-warning', text: REVIEW.duplicateExisting(formatNumber(match.number), match.meaning) });
		}
		if (issues.batchDuplicate) this.warningsEl.createDiv({ cls: 'phrasevault-warning', text: REVIEW.duplicateInBatch });
		if (issues.needsOverride && state.selected) this.addOverrideToggle();
		if (issues.sourceMismatch) this.warningsEl.createDiv({ cls: 'phrasevault-hint', text: REVIEW.sourceMismatchHelp });
		const missingRequired = issues.missingPhrase || issues.missingMeaning;
		if (state.selected && showRequired && missingRequired) {
			this.warningsEl.createDiv({ cls: 'phrasevault-warning', text: REVIEW.requiredMissing });
		}

		this.requiredInputs.get('phrase')?.toggleClass('is-invalid', state.selected && showRequired && issues.missingPhrase);
		this.requiredInputs.get('turkishMeaning')?.toggleClass('is-invalid', state.selected && showRequired && issues.missingMeaning);
	}

	private addOverrideToggle(): void {
		const label = this.warningsEl.createEl('label', { cls: 'phrasevault-override' });
		const checkbox = label.createEl('input', { type: 'checkbox' });
		checkbox.checked = this.state.overrideDuplicate;
		checkbox.disabled = this.disabled;
		checkbox.addEventListener('change', () => {
			this.state.overrideDuplicate = checkbox.checked;
			this.callbacks.onChange();
		});
		label.createSpan({ text: REVIEW.duplicateOverride });
	}

	setDisabled(disabled: boolean): void {
		this.disabled = disabled;
		this.selectInput.disabled = disabled;
		for (const control of this.controls) control.setDisabled(disabled);
		this.warningsEl.querySelectorAll('input').forEach((input) => (input.disabled = disabled));
	}

	focus(): void {
		this.el.scrollIntoView({ block: 'nearest' });
		this.requiredInputs.get('phrase')?.focus();
	}
}
