import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/manager/ai-mail-manager', () => ({
	default: {
		listAccounts: vi.fn(),
		listEmails: vi.fn(),
		getEmailDetail: vi.fn(),
		sendEmail: vi.fn(),
		deleteEmails: vi.fn(),
		markRead: vi.fn()
	}
}));

import aiMailManager from '../../src/manager/ai-mail-manager';
import mcpManager from '../../src/manager/mcp-manager';

function createJsonContext(rawBody) {
	const responses = [];
	return {
		req: {
			json: async () => {
				if (rawBody instanceof Error) throw rawBody;
				return rawBody;
			}
		},
		json: (body, status = 200) => ({ status, body, responses }),
		body: (val, status = 202) => ({ status, body: val })
	};
}

describe('mcpManager', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('handles initialize negotiation, ping, and initialized notification', async () => {
		const initRes = await mcpManager.handlePost(createJsonContext({
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: { protocolVersion: '2025-03-26' }
		}));
		expect(initRes.status).toBe(200);
		expect(initRes.body.result.protocolVersion).toBe('2025-03-26');
		expect(initRes.body.result.serverInfo.name).toBe('cloud-mail-mcp');

		const notifyRes = await mcpManager.handlePost(createJsonContext({
			jsonrpc: '2.0',
			method: 'notifications/initialized'
		}));
		expect(notifyRes.status).toBe(202);

		const pingRes = await mcpManager.handlePost(createJsonContext({
			jsonrpc: '2.0',
			id: 2,
			method: 'ping'
		}));
		expect(pingRes.body).toEqual({ jsonrpc: '2.0', id: 2, result: {} });
	});

	it('lists all 6 registered tools and routes tools/call to aiMailManager', async () => {
		const listRes = await mcpManager.handlePost(createJsonContext({
			jsonrpc: '2.0',
			id: 3,
			method: 'tools/list'
		}));
		const toolNames = listRes.body.result.tools.map(t => t.name);
		expect(toolNames).toEqual([
			'list_accounts',
			'list_emails',
			'get_email',
			'send_email',
			'delete_emails',
			'mark_emails_read'
		]);

		aiMailManager.sendEmail.mockResolvedValue({ emailId: 101, status: 'sent' });
		const sendRes = await mcpManager.handlePost(createJsonContext({
			jsonrpc: '2.0',
			id: 4,
			method: 'tools/call',
			params: {
				name: 'send_email',
				arguments: { to: 'u@example.com', subject: 'Hi', text: 'Body' }
			}
		}));
		expect(aiMailManager.sendEmail).toHaveBeenCalledTimes(1);
		expect(sendRes.body.result.isError).toBe(false);
		expect(sendRes.body.result.content[0].text).toContain('"emailId": 101');

		aiMailManager.deleteEmails.mockRejectedValue(new Error('单次最多操作 50 封邮件'));
		const errRes = await mcpManager.handlePost(createJsonContext({
			jsonrpc: '2.0',
			id: 5,
			method: 'tools/call',
			params: {
				name: 'delete_emails',
				arguments: { emailIds: [1, 2] }
			}
		}));
		expect(errRes.status).toBe(200);
		expect(errRes.body.result.isError).toBe(true);
		expect(errRes.body.result.content[0].text).toContain('50');
	});

	it('returns JSON-RPC parse error and method-not-found cleanly', async () => {
		const parseErr = await mcpManager.handlePost(createJsonContext(new SyntaxError('bad json')));
		expect(parseErr.status).toBe(400);
		expect(parseErr.body.error.code).toBe(-32700);

		const methodErr = await mcpManager.handlePost(createJsonContext({
			jsonrpc: '2.0',
			id: 6,
			method: 'unknown/method'
		}));
		expect(methodErr.status).toBe(200);
		expect(methodErr.body.error.code).toBe(-32601);
	});
});
