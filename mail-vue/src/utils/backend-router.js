const STORAGE_KEY = 'active_backend_origin';

const DEFAULT_MULTI_BACKENDS = [
	{ suffix: '@xvuvx.com', origin: 'https://mail.xvuvx.com' },
	{ suffix: '@redmi.edu.kg', origin: 'https://mail.redmi.edu.kg' }
];

function normalizeSuffix(suffix) {
	const raw = String(suffix || '').trim().toLowerCase();
	if (!raw) return '';
	return raw.startsWith('@') ? raw : `@${raw}`;
}

function normalizeOrigin(origin) {
	return String(origin || '').trim().replace(/\/+$/, '');
}

function parseConfiguredBackends() {
	const raw = import.meta.env.VITE_MULTI_BACKENDS;
	if (!raw) return DEFAULT_MULTI_BACKENDS;
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed) && parsed.length > 0) {
			return parsed;
		}
	} catch (error) {
		console.warn('Invalid VITE_MULTI_BACKENDS config, falling back to defaults', error);
	}
	return DEFAULT_MULTI_BACKENDS;
}

const BACKEND_ENTRIES = parseConfiguredBackends()
	.map(item => ({
		suffix: normalizeSuffix(item?.suffix),
		origin: normalizeOrigin(item?.origin)
	}))
	.filter(item => item.suffix && item.origin);

function getCurrentWindowOrigin() {
	return typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
}

function extractSuffix(suffixOrEmail) {
	const text = String(suffixOrEmail || '').trim().toLowerCase();
	const atIndex = text.lastIndexOf('@');
	if (atIndex === -1) return '';
	return text.slice(atIndex);
}

export function getMultiBackendEntries() {
	return BACKEND_ENTRIES;
}

export function getLoginDomainList(fallbackList = []) {
	if (BACKEND_ENTRIES.length > 0) {
		return BACKEND_ENTRIES.map(item => item.suffix);
	}
	return Array.isArray(fallbackList) ? fallbackList : [];
}

export function getActiveBackendOrigin() {
	if (BACKEND_ENTRIES.length === 0) return '';
	const saved = normalizeOrigin(typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : '');
	if (saved && BACKEND_ENTRIES.some(item => item.origin === saved)) {
		return saved;
	}
	const currentOrigin = normalizeOrigin(getCurrentWindowOrigin());
	const matched = BACKEND_ENTRIES.find(item => item.origin === currentOrigin);
	return matched ? matched.origin : BACKEND_ENTRIES[0].origin;
}

export function getActiveSuffix() {
	const origin = getActiveBackendOrigin();
	const matched = BACKEND_ENTRIES.find(item => item.origin === origin);
	return matched ? matched.suffix : '';
}

export function resolveApiBaseUrl(origin = getActiveBackendOrigin()) {
	const defaultBase = import.meta.env.VITE_BASE_URL || '/api';
	if (!origin) return defaultBase;
	const currentOrigin = normalizeOrigin(getCurrentWindowOrigin());
	if (currentOrigin && origin === currentOrigin) {
		return defaultBase;
	}
	return `${origin}/api`;
}

export function switchBackendBySuffix(suffixOrEmail) {
	const suffix = extractSuffix(suffixOrEmail);
	if (!suffix) return { origin: getActiveBackendOrigin(), changed: false };
	const matched = BACKEND_ENTRIES.find(item => item.suffix === suffix);
	if (!matched) return { origin: getActiveBackendOrigin(), changed: false };
	const previous = getActiveBackendOrigin();
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, matched.origin);
	}
	return { origin: matched.origin, changed: previous !== matched.origin };
}

export function buildBackendAssetUrl(key) {
	const cleanKey = String(key || '').replace(/^\/+/, '');
	const origin = getActiveBackendOrigin();
	const currentOrigin = normalizeOrigin(getCurrentWindowOrigin());
	if (origin && currentOrigin && origin !== currentOrigin) {
		return `${origin}/${cleanKey}`;
	}
	return `/${cleanKey}`;
}
