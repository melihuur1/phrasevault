import { describe, expect, it } from 'vitest';
import { ANALYSIS_JSON_SCHEMA, ANALYSIS_OUTPUT_FORMAT, ANALYSIS_STATUSES } from '../../src/ai/schema';
import { PHRASE_CATEGORIES } from '../../src/core/types';

type SchemaNode = { type?: string; properties?: Record<string, SchemaNode>; required?: readonly string[]; additionalProperties?: boolean; items?: SchemaNode; enum?: readonly string[] };

function objectNodes(node: SchemaNode): SchemaNode[] {
	const nested = [...Object.values(node.properties ?? {}), ...(node.items ? [node.items] : [])].flatMap(objectNodes);
	return node.type === 'object' ? [node, ...nested] : nested;
}

describe('ANALYSIS_JSON_SCHEMA (structured output requirements)', () => {
	it('closes every object and requires every property', () => {
		const objects = objectNodes(ANALYSIS_JSON_SCHEMA);
		expect(objects).toHaveLength(2);
		for (const node of objects) {
			expect(node.additionalProperties).toBe(false);
			expect([...(node.required ?? [])].sort()).toEqual(Object.keys(node.properties ?? {}).sort());
		}
	});

	it('restricts status and category to the known values', () => {
		const schema = ANALYSIS_JSON_SCHEMA as unknown as SchemaNode;
		expect(schema.properties?.['status']?.enum).toEqual([...ANALYSIS_STATUSES]);
		expect(schema.properties?.['suggestions']?.items?.properties?.['category']?.enum).toEqual([...PHRASE_CATEGORIES]);
	});

	it('is sent as a json_schema output format', () => {
		expect(ANALYSIS_OUTPUT_FORMAT.type).toBe('json_schema');
		expect(ANALYSIS_OUTPUT_FORMAT.schema).toBe(ANALYSIS_JSON_SCHEMA);
	});
});
