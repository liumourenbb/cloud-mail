import { describe, it, expect } from 'vitest';
import aiMailHelper from '../../src/helper/ai-mail-helper';

describe('aiMailHelper', () => {
	it('normalizes email addresses from string, delimited string, or array and deduplicates', () => {
		expect(aiMailHelper.normalizeEmailArray('alice@example.com')).toEqual(['alice@example.com']);
		expect(aiMailHelper.normalizeEmailArray('alice@example.com, bob@example.com; Alice@example.com'))
			.toEqual(['alice@example.com', 'bob@example.com']);
		expect(aiMailHelper.normalizeEmailArray(['a@x.io', ' b@x.io ', 'A@X.IO'])).toEqual(['a@x.io', 'b@x.io']);
		expect(() => aiMailHelper.normalizeEmailArray('not-an-email')).toThrow();
		expect(() => aiMailHelper.normalizeEmailArray('', { required: true })).toThrow();
	});

	it('validates emailIds cleanly and enforces the 50-item batch ceiling', () => {
		expect(aiMailHelper.normalizeEmailIds(42)).toEqual([42]);
		expect(aiMailHelper.normalizeEmailIds('1, 2, 2, 3')).toEqual([1, 2, 3]);
		expect(aiMailHelper.normalizeEmailIds([10, '20'])).toEqual([10, 20]);

		expect(() => aiMailHelper.normalizeEmailIds([])).toThrow();
		expect(() => aiMailHelper.normalizeEmailIds('0')).toThrow();
		expect(() => aiMailHelper.normalizeEmailIds('-5')).toThrow();
		expect(() => aiMailHelper.normalizeEmailIds('12.5')).toThrow();
		expect(() => aiMailHelper.normalizeEmailIds('abc')).toThrow();

		const fiftyOne = Array.from({ length: 51 }, (_, i) => i + 1);
		expect(() => aiMailHelper.normalizeEmailIds(fiftyOne)).toThrow();
	});

	it('builds escaped HTML from plain text and plain text from HTML', () => {
		const fromText = aiMailHelper.buildSendBody('Hello <AI>\nLine 2', '');
		expect(fromText.text).toBe('Hello <AI>\nLine 2');
		expect(fromText.content).toBe('<p>Hello &lt;AI&gt;<br/>Line 2</p>');

		const fromHtml = aiMailHelper.buildSendBody('', '<div><b>Hello</b> World</div>');
		expect(fromHtml.content).toBe('<div><b>Hello</b> World</div>');
		expect(fromHtml.text).toContain('Hello');

		expect(() => aiMailHelper.buildSendBody('  ', '')).toThrow();
	});

	it('truncates oversized body text safely in email detail', () => {
		const longText = 'x'.repeat(500);
		const detail = aiMailHelper.formatEmailDetail({
			emailId: 7,
			accountId: 1,
			text: longText,
			content: `<p>${longText}</p>`,
			recipient: '[{"address":"to@x.io","name":""}]'
		}, [{ attId: 9, filename: 'a.pdf', mimeType: 'application/pdf', size: 123 }], 250);

		expect(detail.text).toContain('...[truncated]');
		expect(detail.recipient).toEqual([{ address: 'to@x.io', name: '' }]);
		expect(detail.attachments).toEqual([{ attId: 9, filename: 'a.pdf', mimeType: 'application/pdf', size: 123 }]);
	});
});
