import aiMailManager from '../manager/ai-mail-manager';

const TOOL_SPECS = [
	{
		definition: {
			name: 'list_accounts',
			description: 'List active email accounts/mailboxes available in Cloud Mail (useful for finding valid fromEmail sender addresses or target inbox addresses).',
			annotations: { readOnlyHint: true, idempotentHint: true },
			inputSchema: {
				type: 'object',
				properties: {
					email: { type: 'string', description: 'Optional case-insensitive partial email filter.' },
					num: { type: 'integer', minimum: 1, default: 1, description: 'Page number starting from 1.' },
					size: { type: 'integer', minimum: 1, maximum: 100, default: 50, description: 'Page size (1-100).' }
				}
			}
		},
		handler: (c, args) => aiMailManager.listAccounts(c, args)
	},
	{
		definition: {
			name: 'list_emails',
			description: 'Search and list emails with lightweight summaries. Supports filtering by inbox/recipient address, sender, keyword, folder type (0=received, 1=sent), unread status, and trash status (isDel=0 active, 1 trash).',
			annotations: { readOnlyHint: true, idempotentHint: true },
			inputSchema: {
				type: 'object',
				properties: {
					toEmail: { type: 'string', description: 'Filter by recipient mailbox address.' },
					sendEmail: { type: 'string', description: 'Filter by sender address.' },
					keyword: { type: 'string', description: 'Case-insensitive keyword matching subject, body text, sender, or recipient.' },
					type: { type: 'integer', enum: [0, 1], description: '0 = received inbox, 1 = sent outbox. Omit for both.' },
					unread: { type: 'integer', enum: [0, 1], description: '0 = unread only, 1 = read only. Omit for both.' },
					isDel: { type: 'integer', enum: [0, 1], default: 0, description: '0 = active emails (default), 1 = emails in trash.' },
					timeSort: { type: 'string', enum: ['desc', 'asc'], default: 'desc', description: 'Sort order by emailId.' },
					num: { type: 'integer', minimum: 1, default: 1, description: 'Page number starting from 1.' },
					size: { type: 'integer', minimum: 1, maximum: 50, default: 20, description: 'Page size (1-50).' }
				}
			}
		},
		handler: (c, args) => aiMailManager.listEmails(c, args)
	},
	{
		definition: {
			name: 'get_email',
			description: 'Read full content (text, HTML, recipients, and attachment metadata) of a single email by emailId.',
			annotations: { readOnlyHint: true, idempotentHint: true },
			inputSchema: {
				type: 'object',
				required: ['emailId'],
				properties: {
					emailId: { type: 'integer', minimum: 1, description: 'Numeric ID of the email to read.' },
					maxChars: { type: 'integer', minimum: 200, maximum: 100000, default: 20000, description: 'Maximum characters returned for text/content.' }
				}
			}
		},
		handler: (c, args) => aiMailManager.getEmailDetail(c, args)
	},
	{
		definition: {
			name: 'send_email',
			description: 'Send an email or reply to an existing email. Omit fromEmail to send from the primary admin mailbox; call list_accounts first if unsure which sender address to use.',
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
			inputSchema: {
				type: 'object',
				required: ['to', 'subject'],
				properties: {
					fromEmail: { type: 'string', description: 'Optional sender mailbox address owned in Cloud Mail; defaults to primary admin mailbox.' },
					fromName: { type: 'string', description: 'Optional sender display name.' },
					to: {
						oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
						description: 'Recipient email address(es). Accepts a single email, comma-separated string, or string array.'
					},
					cc: {
						oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
						description: 'Optional CC email address(es).'
					},
					bcc: {
						oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
						description: 'Optional BCC email address(es).'
					},
					subject: { type: 'string', description: 'Email subject line.' },
					text: { type: 'string', description: 'Plain text email body (provide text, html, or both).' },
					html: { type: 'string', description: 'HTML email body (provide text, html, or both).' },
					replyToEmailId: { type: 'integer', minimum: 1, description: 'Optional emailId to reply to (sets In-Reply-To / References headers).' }
				}
			}
		},
		handler: (c, args) => aiMailManager.sendEmail(c, args)
	},
	{
		definition: {
			name: 'delete_emails',
			description: 'Delete emails by explicit emailIds (max 50 per call). Soft-deletes into Trash by default; set permanent=true ONLY when the user explicitly requests irreversible permanent deletion.',
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
			inputSchema: {
				type: 'object',
				required: ['emailIds'],
				properties: {
					emailIds: {
						oneOf: [
							{ type: 'integer', minimum: 1 },
							{ type: 'string' },
							{ type: 'array', items: { type: 'integer', minimum: 1 }, maxItems: 50 }
						],
						description: 'Email ID(s) to delete (single ID, comma-separated string, or array of up to 50 IDs).'
					},
					permanent: {
						type: 'boolean',
						default: false,
						description: 'false (default) = soft delete to trash; true = permanently erase email records and attachments.'
					}
				}
			}
		},
		handler: (c, args) => aiMailManager.deleteEmails(c, args)
	},
	{
		definition: {
			name: 'mark_emails_read',
			description: 'Mark up to 50 emails as read (unread=1) or unread (unread=0).',
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
			inputSchema: {
				type: 'object',
				required: ['emailIds'],
				properties: {
					emailIds: {
						oneOf: [
							{ type: 'integer', minimum: 1 },
							{ type: 'string' },
							{ type: 'array', items: { type: 'integer', minimum: 1 }, maxItems: 50 }
						],
						description: 'Email ID(s) to update (max 50 per call).'
					},
					unread: {
						type: 'integer',
						enum: [0, 1],
						default: 1,
						description: '1 = mark as read (default), 0 = mark as unread.'
					}
				}
			}
		},
		handler: (c, args) => aiMailManager.markRead(c, args)
	}
];

const TOOL_MAP = new Map(TOOL_SPECS.map(item => [item.definition.name, item]));

/**
 * MCP 工具策略注册表（O(1) 映射路由，替代长分支判断）。
 */
const aiToolRegistry = {

	/** 返回暴露给 MCP 客户端的全部工具定义。 */
	getToolDefinitions() {
		return TOOL_SPECS.map(item => item.definition);
	},

	/** 根据工具名称查找执行处理器。 */
	getToolHandler(name) {
		return TOOL_MAP.get(name)?.handler || null;
	}
};

export default aiToolRegistry;
