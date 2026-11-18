import { beforeEach, describe, expect, it, vi } from 'vitest';

function createStorageMock() {
	const store = new Map();
	return {
		getItem: key => (store.has(key) ? store.get(key) : null),
		setItem: (key, val) => store.set(key, String(val)),
		removeItem: key => store.delete(key),
		clear: () => store.clear()
	};
}

async function loadRouterWithOrigin(origin) {
	vi.resetModules();
	globalThis.window = { location: { origin } };
	globalThis.localStorage = createStorageMock();
	return import('../../../mail-vue/src/utils/backend-router.js');
}

describe('backend-router', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('exposes both @xvuvx.com and @redmi.edu.kg on login dropdown', async () => {
		const router = await loadRouterWithOrigin('https://mail.xvuvx.com');
		expect(router.getLoginDomainList(['@fallback.com'])).toEqual(['@xvuvx.com', '@redmi.edu.kg']);
		expect(router.getActiveBackendOrigin()).toBe('https://mail.xvuvx.com');
		expect(router.getActiveSuffix()).toBe('@xvuvx.com');
	});

	it('uses relative /api for same-origin backend and full URL for cross-origin backend', async () => {
		const router = await loadRouterWithOrigin('https://mail.xvuvx.com');
		expect(router.resolveApiBaseUrl()).toBe('/api');
		expect(router.buildBackendAssetUrl('/attachments/a.png')).toBe('/attachments/a.png');

		const res = router.switchBackendBySuffix('@redmi.edu.kg');
		expect(res).toEqual({ origin: 'https://mail.redmi.edu.kg', changed: true });
		expect(router.getActiveBackendOrigin()).toBe('https://mail.redmi.edu.kg');
		expect(router.resolveApiBaseUrl()).toBe('https://mail.redmi.edu.kg/api');
		expect(router.buildBackendAssetUrl('attachments/a.png')).toBe('https://mail.redmi.edu.kg/attachments/a.png');
	});

	it('switches backend from full email address and ignores unknown domains', async () => {
		const router = await loadRouterWithOrigin('https://mail.xvuvx.com');
		const switched = router.switchBackendBySuffix('admin@REDMI.EDU.KG');
		expect(switched).toEqual({ origin: 'https://mail.redmi.edu.kg', changed: true });

		const same = router.switchBackendBySuffix('user@redmi.edu.kg');
		expect(same).toEqual({ origin: 'https://mail.redmi.edu.kg', changed: false });

		const unknown = router.switchBackendBySuffix('user@unknown.org');
		expect(unknown).toEqual({ origin: 'https://mail.redmi.edu.kg', changed: false });
	});
});
