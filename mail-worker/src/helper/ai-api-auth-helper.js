import { t } from '../i18n/i18n';
import constant from '../const/constant';
import KvConst from '../const/kv-const';
import { settingConst } from '../const/entity-const';
import orm from '../entity/orm';
import setting from '../entity/setting';
import settingService from '../service/setting-service';

const encoder = new TextEncoder();

/**
 * AI / MCP 接口认证与 API Key 管理辅助模块。
 */
const aiApiAuthHelper = {

	/** 生成带 `cm_ai_` 前缀的 48 位十六进制随机 API Key。 */
	generateKey() {
		const bytes = new Uint8Array(24);
		crypto.getRandomValues(bytes);
		const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
		return `cm_ai_${hex}`;
	},

	/** 对 API Key 进行界面展示脱敏。 */
	maskKey(key) {
		if (!key) return '';
		if (key.length <= 14) return `${key.slice(0, 4)}******`;
		return `${key.slice(0, 10)}******${key.slice(-4)}`;
	},

	/** 从 Authorization (支持 Bearer 前缀) 或 x-api-key 提取凭证。 */
	extractToken(c) {
		const authHeader = c.req.header(constant.TOKEN_HEADER) || '';
		const apiKeyHeader = c.req.header('x-api-key') || '';
		const raw = (authHeader || apiKeyHeader).trim();
		if (!raw) return '';
		return raw.replace(/^Bearer\s+/i, '').trim();
	},

	/** 常量时间字符串比对，避免签名/密钥验证产生计时侧信道。 */
	constantTimeEqual(a, b) {
		if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) {
			return false;
		}
		const bufA = encoder.encode(a);
		const bufB = encoder.encode(b);
		const maxLen = Math.max(bufA.length, bufB.length);
		let diff = bufA.length ^ bufB.length;
		for (let i = 0; i < maxLen; i++) {
			diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
		}
		return diff === 0;
	},

	/** 校验请求是否允许访问 `/mcp` 端点，返回结构化鉴权结果以输出标准 HTTP 状态码。 */
	async verifyMcpRequest(c) {
		const { aiApiStatus, aiApiKey } = await settingService.query(c);
		if (aiApiStatus !== settingConst.aiApiStatus.OPEN) {
			return { ok: false, status: 403, message: t('aiApiDisabled') };
		}
		if (!aiApiKey) {
			return { ok: false, status: 401, message: t('aiApiKeyEmpty') };
		}
		const token = this.extractToken(c);
		if (!this.constantTimeEqual(token, aiApiKey)) {
			return { ok: false, status: 401, message: t('publicTokenFail') };
		}
		return { ok: true };
	},

	/** 校验 `/public/*` 请求：兼容旧版 KV 临时令牌与新版持久化 AI API Key。 */
	async verifyPublicRequest(c) {
		const rawAuth = (c.req.header(constant.TOKEN_HEADER) || '').trim();
		const token = this.extractToken(c);
		if (!rawAuth && !token) return false;

		const kvToken = await c.env.kv.get(KvConst.PUBLIC_KEY);
		if (kvToken && (this.constantTimeEqual(rawAuth, kvToken) || this.constantTimeEqual(token, kvToken))) {
			return true;
		}

		const { aiApiStatus, aiApiKey } = await settingService.query(c);
		if (aiApiStatus !== settingConst.aiApiStatus.OPEN || !aiApiKey) {
			return false;
		}
		return this.constantTimeEqual(token, aiApiKey);
	},

	/** 轮换并持久化新的 AI API Key，同时刷新设置 KV 缓存。 */
	async rotateAiApiKey(c) {
		const aiApiKey = this.generateKey();
		await orm(c).update(setting).set({ aiApiKey }).run();
		await settingService.refresh(c);
		return { aiApiKey, maskedAiApiKey: this.maskKey(aiApiKey) };
	},

	/** 按需直接从数据库读取完整 AI API Key 与开关状态，避开缓存脱敏副本。 */
	async revealAiApiKey(c) {
		const row = await orm(c)
			.select({ aiApiKey: setting.aiApiKey, aiApiStatus: setting.aiApiStatus })
			.from(setting)
			.get();
		return {
			aiApiKey: row?.aiApiKey || '',
			aiApiStatus: row?.aiApiStatus ?? settingConst.aiApiStatus.CLOSE
		};
	}
};

export default aiApiAuthHelper;
