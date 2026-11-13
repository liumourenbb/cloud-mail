import { and, asc, count, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import orm from '../entity/orm';
import email from '../entity/email';
import account from '../entity/account';
import { emailBriefColumns } from '../lib/email-list-columns';
import { emailConst, isDel } from '../const/entity-const';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import verifyUtils from '../utils/verify-utils';
import accountService from '../service/account-service';
import emailService from '../service/email-service';
import attService from '../service/att-service';
import aiMailHelper from '../helper/ai-mail-helper';

/**
 * 构建邮件列表过滤条件列表（供 listEmails 复用）。
 */
function buildEmailListConditions(params) {
	const targetIsDel = Number(params.isDel) === isDel.DELETE ? isDel.DELETE : isDel.NORMAL;
	const conditions = [eq(email.isDel, targetIsDel), ne(email.status, emailConst.status.SAVING)];

	if (params.accountId !== undefined && params.accountId !== null && params.accountId !== '') {
		const accountIdNum = Number(params.accountId);
		if (Number.isInteger(accountIdNum) && accountIdNum > 0) {
			conditions.push(eq(email.accountId, accountIdNum));
		}
	}

	if (params.type !== undefined && params.type !== null && params.type !== '') {
		const typeVal = params.type === 'send' ? emailConst.type.SEND : (params.type === 'receive' ? emailConst.type.RECEIVE : Number(params.type));
		if (typeVal === emailConst.type.RECEIVE || typeVal === emailConst.type.SEND) {
			conditions.push(eq(email.type, typeVal));
		}
	}

	if (params.unread !== undefined && params.unread !== null && params.unread !== '') {
		const unreadVal = Number(params.unread) === 1 ? emailConst.unread.READ : emailConst.unread.UNREAD;
		conditions.push(eq(email.unread, unreadVal));
	}

	if (params.toEmail && String(params.toEmail).trim()) {
		const pattern = `%${String(params.toEmail).trim()}%`;
		conditions.push(or(
			sql`coalesce(${email.toEmail}, '') COLLATE NOCASE LIKE ${pattern}`,
			sql`coalesce(${email.recipient}, '') COLLATE NOCASE LIKE ${pattern}`
		));
	}

	if (params.sendEmail && String(params.sendEmail).trim()) {
		const pattern = `%${String(params.sendEmail).trim()}%`;
		conditions.push(sql`coalesce(${email.sendEmail}, '') COLLATE NOCASE LIKE ${pattern}`);
	}

	const kw = String(params.keyword || params.subject || '').trim();
	if (kw) {
		const pattern = `%${kw}%`;
		conditions.push(or(
			sql`coalesce(${email.subject}, '') COLLATE NOCASE LIKE ${pattern}`,
			sql`coalesce(${email.text}, '') COLLATE NOCASE LIKE ${pattern}`,
			sql`coalesce(${email.sendEmail}, '') COLLATE NOCASE LIKE ${pattern}`,
			sql`coalesce(${email.toEmail}, '') COLLATE NOCASE LIKE ${pattern}`
		));
	}

	return conditions;
}

/**
 * AI 邮件操作管理器：统一对外（MCP / Open API）提供邮箱查询、读信、发信、安全删信与已读状态变更。
 */
const aiMailManager = {

	/** 解析发件邮箱账号：显式指定则校验存在与未删；缺省时回退到系统管理员主邮箱。 */
	async resolveSenderAccount(c, fromEmail) {
		if (fromEmail && String(fromEmail).trim()) {
			const cleanEmail = String(fromEmail).trim();
			if (!verifyUtils.isEmail(cleanEmail)) {
				throw new BizError(`${t('notEmail')}: ${cleanEmail}`, 400);
			}
			const row = await accountService.selectByEmailIncludeDel(c, cleanEmail);
			if (!row || row.isDel !== isDel.NORMAL) {
				throw new BizError(t('fromAccountNotFound'), 404);
			}
			return row;
		}

		if (c.env.admin) {
			const adminAccount = await accountService.selectByEmailIncludeDel(c, c.env.admin);
			if (adminAccount && adminAccount.isDel === isDel.NORMAL) {
				return adminAccount;
			}
		}

		const fallback = await orm(c)
			.select()
			.from(account)
			.where(eq(account.isDel, isDel.NORMAL))
			.orderBy(asc(account.accountId))
			.limit(1)
			.get();

		if (!fallback) {
			throw new BizError(t('fromAccountNotFound'), 404);
		}
		return fallback;
	},

	/** 查询当前系统可用（未删除）的邮箱账号列表。 */
	async listAccounts(c, params = {}) {
		const { num, size, offset } = aiMailHelper.normalizePageParams(params, 50, 100);
		const conditions = [eq(account.isDel, isDel.NORMAL)];
		const emailFilter = String(params.email || '').trim();
		if (emailFilter) {
			conditions.push(sql`${account.email} COLLATE NOCASE LIKE ${`%${emailFilter}%`}`);
		}

		const whereClause = and(...conditions);
		const [list, totalRow] = await Promise.all([
			orm(c)
				.select({
					accountId: account.accountId,
					email: account.email,
					name: account.name,
					userId: account.userId,
					createTime: account.createTime
				})
				.from(account)
				.where(whereClause)
				.orderBy(asc(account.sort), asc(account.accountId))
				.limit(size)
				.offset(offset)
				.all(),
			orm(c).select({ total: count() }).from(account).where(whereClause).get()
		]);

		return { total: totalRow?.total || 0, num, size, list };
	},

	/** 分页搜索收发件摘要列表。 */
	async listEmails(c, params = {}) {
		const { num, size, offset } = aiMailHelper.normalizePageParams(params, 20, 50);
		const conditions = buildEmailListConditions(params);
		const whereClause = and(...conditions);
		const orderExpr = params.timeSort === 'asc' || params.timeSort === 1
			? asc(email.emailId)
			: desc(email.emailId);

		const [rows, totalRow] = await Promise.all([
			orm(c)
				.select(emailBriefColumns)
				.from(email)
				.where(whereClause)
				.orderBy(orderExpr)
				.limit(size)
				.offset(offset)
				.all(),
			orm(c).select({ total: count() }).from(email).where(whereClause).get()
		]);

		return {
			total: totalRow?.total || 0,
			num,
			size,
			list: rows.map(row => aiMailHelper.formatEmailSummary(row))
		};
	},

	/** 读取单封邮件完整内容与附件清单（支持读取回收站中的邮件）。 */
	async getEmailDetail(c, params = {}) {
		const emailId = Number(params.emailId);
		if (!Number.isInteger(emailId) || emailId <= 0) {
			throw new BizError(t('emailIdsInvalid'), 400);
		}

		const row = await orm(c).select().from(email).where(eq(email.emailId, emailId)).get();
		if (!row) {
			throw new BizError(t('emailNotExist'), 404);
		}

		const attList = await attService.selectByEmailIds(c, [emailId]);
		return aiMailHelper.formatEmailDetail(row, attList, params.maxChars);
	},

	/** 发送或回复邮件（复用原有邮件渠道分发、防刷、发件统计与持久化链路）。 */
	async sendEmail(c, params = {}) {
		const subject = String(params.subject || '').trim();
		if (!subject) {
			throw new BizError(t('emptyEmailSubject'), 400);
		}

		const receiveEmail = aiMailHelper.normalizeEmailArray(params.to ?? params.receiveEmail, { required: true });
		const ccEmail = aiMailHelper.normalizeEmailArray(params.cc ?? params.ccEmail);
		const bccEmail = aiMailHelper.normalizeEmailArray(params.bcc ?? params.bccEmail);
		const { text, content } = aiMailHelper.buildSendBody(params.text, params.html ?? params.content);
		const senderAccount = await this.resolveSenderAccount(c, params.fromEmail);

		const sendPayload = {
			accountId: senderAccount.accountId,
			name: String(params.fromName || senderAccount.name || '').trim() || undefined,
			receiveEmail,
			ccEmail,
			bccEmail,
			subject,
			text,
			content,
			attachments: []
		};

		if (params.replyToEmailId !== undefined && params.replyToEmailId !== null && params.replyToEmailId !== '') {
			const replyId = Number(params.replyToEmailId);
			if (!Number.isInteger(replyId) || replyId <= 0) {
				throw new BizError(t('emailIdsInvalid'), 400);
			}
			sendPayload.sendType = 'reply';
			sendPayload.emailId = replyId;
		}

		const sendResult = await emailService.send(c, sendPayload, senderAccount.userId);
		const firstEmail = Array.isArray(sendResult) ? sendResult[0] : sendResult?.emails?.[0];

		return {
			emailId: firstEmail?.emailId ?? null,
			fromEmail: senderAccount.email,
			to: receiveEmail,
			cc: ccEmail,
			bcc: bccEmail,
			subject,
			status: 'sent'
		};
	},

	/** 删除指定邮件列表（默认安全软删除移入回收站；显式 permanent=true 才物理清除）。 */
	async deleteEmails(c, params = {}) {
		const ids = aiMailHelper.normalizeEmailIds(params.emailIds);
		const permanent = params.permanent === true || params.permanent === 'true';
		const rows = await orm(c)
			.select({ emailId: email.emailId })
			.from(email)
			.where(inArray(email.emailId, ids))
			.all();

		const existingIds = rows.map(row => row.emailId);
		if (existingIds.length === 0) {
			return { deletedCount: 0, permanent, emailIds: [] };
		}

		if (permanent) {
			await emailService.physicsDelete(c, { emailIds: existingIds.join(',') });
		} else {
			await orm(c).update(email).set({ isDel: isDel.DELETE }).where(inArray(email.emailId, existingIds)).run();
		}

		return {
			deletedCount: existingIds.length,
			permanent,
			emailIds: existingIds
		};
	},

	/** 批量标记邮件已读（unread=1）或未读（unread=0）。 */
	async markRead(c, params = {}) {
		const ids = aiMailHelper.normalizeEmailIds(params.emailIds);
		const markAsUnread = params.unread === 0 || params.unread === '0' || params.read === false;
		const unreadVal = markAsUnread ? emailConst.unread.UNREAD : emailConst.unread.READ;

		const rows = await orm(c)
			.select({ emailId: email.emailId })
			.from(email)
			.where(inArray(email.emailId, ids))
			.all();

		const existingIds = rows.map(row => row.emailId);
		if (existingIds.length === 0) {
			return { updatedCount: 0, unread: unreadVal, emailIds: [] };
		}

		await orm(c).update(email).set({ unread: unreadVal }).where(inArray(email.emailId, existingIds)).run();
		return {
			updatedCount: existingIds.length,
			unread: unreadVal,
			emailIds: existingIds
		};
	}
};

export default aiMailManager;
