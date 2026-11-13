import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/service/setting-service', () => ({
	default: {
		query: vi.fn(),
		refresh: vi.fn()
	}
}));

import settingService from '../../src/service/setting-service';
import aiApiAuthHelper from '../../src/helper/ai-api-auth-helper';

function createMockContext({ headers = {}, kvData = {} } = {}) {
	const normalizedHeaders = Object.fromEntries(
		Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
	);
	return {
		req: {
			header: (name) => normalizedHeaders[name.toLowerCase()]
		},
		env: {
			kv: {
				get: vi.fn(async (key) => kvData[key] ?? null)
			}
		}
	};
}

describe('aiApiAuthHelper', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('generates prefixed cm_ai_ key and masks it cleanly', () => {
		const key = aiApiAuthHelper.generateKey();
		expect(key).toMatch(/^cm_ai_[0-9a-f]{48}$/);
		expect(aiApiAuthHelper.maskKey(key)).toBe(`${key.slice(0, 10)}******${key.slice(-4)}`);
		expect(aiApiAuthHelper.maskKey('')).toBe('');
		expect(aiApiAuthHelper.maskKey('short')).toBe('shor******');
	});

	it('extracts Bearer token, bare Authorization token, or x-api-key header', () => {
		expect(aiApiAuthHelper.extractToken(createMockContext({ headers: { Authorization: 'Bearer cm_ai_123' } }))).toBe('cm_ai_123');
		expect(aiApiAuthHelper.extractToken(createMockContext({ headers: { Authorization: 'bearer   cm_ai_456  ' } }))).toBe('cm_ai_456');
		expect(aiApiAuthHelper.extractToken(createMockContext({ headers: { Authorization: 'cm_ai_raw' } }))).toBe('cm_ai_raw');
		expect(aiApiAuthHelper.extractToken(createMockContext({ headers: { 'x-api-key': 'cm_ai_xkey' } }))).toBe('cm_ai_xkey');
		expect(aiApiAuthHelper.extractToken(createMockContext())).toBe('');
	});

	it('verifies constant-time equality safely without false positives', () => {
		expect(aiApiAuthHelper.constantTimeEqual('abc', 'abc')).toBe(true);
		expect(aiApiAuthHelper.constantTimeEqual('abc', 'abd')).toBe(false);
		expect(aiApiAuthHelper.constantTimeEqual('abc', 'abcd')).toBe(false);
		expect(aiApiAuthHelper.constantTimeEqual('', '')).toBe(false);
	});

	it('enforces MCP enable status and API key match', async () => {
		settingService.query.mockResolvedValue({ aiApiStatus: 1, aiApiKey: 'cm_ai_secret' });
		expect(await aiApiAuthHelper.verifyMcpRequest(createMockContext({ headers: { Authorization: 'Bearer cm_ai_secret' } }))).toMatchObject({ ok: false, status: 403 });

		settingService.query.mockResolvedValue({ aiApiStatus: 0, aiApiKey: '' });
		expect(await aiApiAuthHelper.verifyMcpRequest(createMockContext({ headers: { Authorization: 'Bearer cm_ai_secret' } }))).toMatchObject({ ok: false, status: 401 });

		settingService.query.mockResolvedValue({ aiApiStatus: 0, aiApiKey: 'cm_ai_secret' });
		expect(await aiApiAuthHelper.verifyMcpRequest(createMockContext({ headers: { Authorization: 'Bearer wrong' } }))).toMatchObject({ ok: false, status: 401 });
		expect(await aiApiAuthHelper.verifyMcpRequest(createMockContext({ headers: { Authorization: 'Bearer cm_ai_secret' } }))).toEqual({ ok: true });
	});

	it('accepts either legacy KvConst PUBLIC_KEY or persistent aiApiKey on /public/*', async () => {
		settingService.query.mockResolvedValue({ aiApiStatus: 0, aiApiKey: 'cm_ai_secret' });
		const kvOnlyCtx = createMockContext({
			headers: { Authorization: 'legacy-uuid-token' },
			kvData: { 'public_key:': 'legacy-uuid-token' }
		});
		expect(await aiApiAuthHelper.verifyPublicRequest(kvOnlyCtx)).toBe(true);

		const aiKeyCtx = createMockContext({
			headers: { Authorization: 'Bearer cm_ai_secret' },
			kvData: {}
		});
		expect(await aiApiAuthHelper.verifyPublicRequest(aiKeyCtx)).toBe(true);

		const emptyCtx = createMockContext({ kvData: {} });
		expect(await aiApiAuthHelper.verifyPublicRequest(emptyCtx)).toBe(false);
	});
});
