import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import emailUtils from '../utils/email-utils';
import verifyUtils from '../utils/verify-utils';

export const MAX_BATCH_SIZE = 50;
export const DEFAULT_MAX_CHARS = 20000;

/**
 * AI 邮件请求参数规整、校验与轻量化响应格式化工具。
 */
const aiMailHelper = {

	/** 将单个邮箱、逗号分隔串或字符串数组统一为去重后的邮箱数组。 */
	normalizeEmailArray(input, { required = false } = {}) {
		const rawItems = Array.isArray(input)
			? input
			: (typeof input === 'string' ? input.split(/[,;\n]+/) : (input == null ? [] : [input]));

		const list = [];
		const seen = new Set();

		for (const item of rawItems) {
			const address = String(item ?? '').trim();
			if (!address) continue;
			if (!verifyUtils.isEmail(address)) {
				throw new BizError(`${t('notEmail')}: ${address}`, 400);
			}
			const lower = address.toLowerCase();
			if (seen.has(lower)) continue;
			seen.add(lower);
			list.push(address);
		}

		if (required && list.length === 0) {
			throw new BizError(t('emptyRecipient'), 400);
		}
		return list;
	},

	/** 解析并校验批量操作邮件 ID（支持数字、逗号字符串或数组，上限 50）。 */
	normalizeEmailIds(input, maxCount = MAX_BATCH_SIZE) {
		const rawItems = Array.isArray(input)
			? input
			: (typeof input === 'string' ? input.split(/[,，\s]+/) : (input == null ? [] : [input]));

		const ids = [];
		const seen = new Set();

		for (const item of rawItems) {
			const str = String(item ?? '').trim();
			if (!str) continue;
			const num = Number(str);
			if (!Number.isInteger(num) || num <= 0) {
				throw new BizError(`${t('emailIdsInvalid')}: ${str}`, 400);
			}
			if (seen.has(num)) continue;
			seen.add(num);
			ids.push(num);
		}

		if (ids.length === 0) {
			throw new BizError(t('emailIdsRequired'), 400);
		}
		if (ids.length > maxCount) {
			throw new BizError(t('emailIdsLimit'), 400);
		}
		return ids;
	},

	/** 转义纯文本中的 HTML 特殊字符。 */
	escapeHtml(str) {
		return String(str)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	},

	/** 补全发送邮件所需的纯文本与 HTML 正文，确保两者均非空且合法。 */
	buildSendBody(rawText, rawHtml) {
		const textStr = typeof rawText === 'string' ? rawText : '';
		const htmlStr = typeof rawHtml === 'string' ? rawHtml : '';

		if (!textStr.trim() && !htmlStr.trim()) {
			throw new BizError(t('emptyEmailContent'), 400);
		}

		const content = htmlStr.trim()
			? htmlStr
			: `<p>${this.escapeHtml(textStr).replace(/\r?\n/g, '<br/>')}</p>`;

		const text = textStr.trim() ? textStr : emailUtils.htmlToText(content);
		return { text, content };
	},

	/** 解析并限制分页参数范围。 */
	normalizePageParams(params = {}, defaultSize = 20, maxSize = 50) {
		let num = Number(params.num);
		let size = Number(params.size);
		if (!Number.isInteger(num) || num < 1) num = 1;
		if (!Number.isInteger(size) || size < 1) size = defaultSize;
		if (size > maxSize) size = maxSize;
		return { num, size, offset: (num - 1) * size };
	},

	/** 截断超长正文字段，防止大邮件撑爆 AI 上下文。 */
	truncateText(value, maxChars = DEFAULT_MAX_CHARS) {
		if (typeof value !== 'string') return '';
		const limit = Math.min(Math.max(Number(maxChars) || DEFAULT_MAX_CHARS, 200), 100000);
		if (value.length <= limit) return value;
		return `${value.slice(0, limit)}\n...[truncated]`;
	},

	/** 安全解析 JSON 格式地址列表。 */
	parseAddressJson(raw) {
		if (!raw || typeof raw !== 'string') return [];
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	},

	/** 提取列表页单封邮件的轻量摘要字段。 */
	formatEmailSummary(row) {
		const rawText = emailUtils.formatText(row.text) || emailUtils.htmlToText(row.content);
		const snippet = rawText.replace(/\s+/g, ' ').trim().slice(0, 300);
		return {
			emailId: row.emailId,
			sendEmail: row.sendEmail || '',
			name: row.name || '',
			toEmail: row.toEmail || '',
			recipient: this.parseAddressJson(row.recipient),
			subject: row.subject || '',
			code: row.code || '',
			snippet,
			type: row.type,
			unread: row.unread,
			status: row.status,
			createTime: row.createTime,
			isDel: row.isDel
		};
	},

	/** 提取邮件详情及精简附件元数据。 */
	formatEmailDetail(row, attList = [], maxChars = DEFAULT_MAX_CHARS) {
		return {
			emailId: row.emailId,
			accountId: row.accountId,
			sendEmail: row.sendEmail || '',
			name: row.name || '',
			toEmail: row.toEmail || '',
			toName: row.toName || '',
			recipient: this.parseAddressJson(row.recipient),
			cc: this.parseAddressJson(row.cc),
			bcc: this.parseAddressJson(row.bcc),
			subject: row.subject || '',
			code: row.code || '',
			text: this.truncateText(row.text || '', maxChars),
			content: this.truncateText(row.content || '', maxChars),
			type: row.type,
			status: row.status,
			message: row.message || '',
			unread: row.unread,
			createTime: row.createTime,
			isDel: row.isDel,
			attachments: attList.map(att => ({
				attId: att.attId,
				filename: att.filename || '',
				mimeType: att.mimeType || '',
				size: att.size || 0
			}))
		};
	}
};

export default aiMailHelper;
