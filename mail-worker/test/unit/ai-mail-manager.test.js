import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	selectRows: [],
	updateCalls: [],
	selectByEmailIncludeDel: vi.fn(),
	emailSend: vi.fn(),
	physicsDelete: vi.fn(),
	selectAttByEmailIds: vi.fn()
}));

vi.mock('../../src/entity/orm', () => ({
	default: vi.fn(() => ({
		select: () => ({
			from: () => ({
				where: () => ({
					all: async () => mocks.selectRows,
					get: async () => mocks.selectRows[0] ?? null,
					orderBy: () => ({ limit: () => ({ get: async () => mocks.selectRows[0] ?? null }) })
				})
			})
		}),
		update: () => ({
			set: (values) => {
				mocks.updateCalls.push(values);
				return { where: () => ({ run: async () => ({ success: true }) }) };
			}
		})
	}))
}));

vi.mock('../../src/service/account-service', () => ({
	default: { selectByEmailIncludeDel: mocks.selectByEmailIncludeDel }
}));

vi.mock('../../src/service/email-service', () => ({
	default: {
		send: mocks.emailSend,
		physicsDelete: mocks.physicsDelete
	}
}));

vi.mock('../../src/service/att-service', () => ({
	default: { selectByEmailIds: mocks.selectAttByEmailIds }
}));

import aiMailManager from '../../src/manager/ai-mail-manager';

describe('aiMailManager', () => {
	const mockCtx = { env: { admin: 'admin@example.com' } };

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.selectRows = [];
		mocks.updateCalls = [];
	});

	it('resolves default admin sender account and delegates sendEmail with reply params', async () => {
		mocks.selectByEmailIncludeDel.mockResolvedValue({
			accountId: 8,
			userId: 1,
			email: 'admin@example.com',
			name: 'Admin',
			isDel: 0
		});
		mocks.emailSend.mockResolvedValue([{ emailId: 99 }]);

		const res = await aiMailManager.sendEmail(mockCtx, {
			to: 'user@example.com',
			subject: 'Re: Test',
			text: 'Hello',
			replyToEmailId: 50
		});

		expect(mocks.selectByEmailIncludeDel).toHaveBeenCalledWith(mockCtx, 'admin@example.com');
		expect(mocks.emailSend).toHaveBeenCalledWith(mockCtx, expect.objectContaining({
			accountId: 8,
			receiveEmail: ['user@example.com'],
			subject: 'Re: Test',
			sendType: 'reply',
			emailId: 50
		}), 1);
		expect(res).toMatchObject({ emailId: 99, fromEmail: 'admin@example.com', status: 'sent' });
	});

	it('soft-deletes by default and calls physicsDelete only when permanent is true', async () => {
		mocks.selectRows = [{ emailId: 11 }, { emailId: 12 }];

		const softRes = await aiMailManager.deleteEmails(mockCtx, { emailIds: [11, 12] });
		expect(softRes).toEqual({ deletedCount: 2, permanent: false, emailIds: [11, 12] });
		expect(mocks.updateCalls).toEqual([{ isDel: 1 }]);
		expect(mocks.physicsDelete).not.toHaveBeenCalled();

		const hardRes = await aiMailManager.deleteEmails(mockCtx, { emailIds: '11,12', permanent: true });
		expect(hardRes).toEqual({ deletedCount: 2, permanent: true, emailIds: [11, 12] });
		expect(mocks.physicsDelete).toHaveBeenCalledWith(mockCtx, { emailIds: '11,12' });
	});

	it('updates unread state for existing emails and handles empty matches safely', async () => {
		mocks.selectRows = [{ emailId: 21 }];
		const readRes = await aiMailManager.markRead(mockCtx, { emailIds: [21, 22] });
		expect(readRes).toEqual({ updatedCount: 1, unread: 1, emailIds: [21] });
		expect(mocks.updateCalls).toEqual([{ unread: 1 }]);

		mocks.selectRows = [];
		const emptyRes = await aiMailManager.deleteEmails(mockCtx, { emailIds: [999] });
		expect(emptyRes).toEqual({ deletedCount: 0, permanent: false, emailIds: [] });
	});
});
