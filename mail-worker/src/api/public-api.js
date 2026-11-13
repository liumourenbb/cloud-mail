import app from '../hono/hono';
import result from '../model/result';
import publicService from '../service/public-service';
import aiMailManager from '../manager/ai-mail-manager';

app.post('/public/genToken', async (c) => {
	const data = await publicService.genToken(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/public/emailList', async (c) => {
	const list = await publicService.emailList(c, await c.req.json());
	return c.json(result.ok(list));
});

app.post('/public/addUser', async (c) => {
	await publicService.addUser(c, await c.req.json());
	return c.json(result.ok());
});

app.post('/public/accountList', async (c) => {
	const data = await aiMailManager.listAccounts(c, await c.req.json().catch(() => ({})));
	return c.json(result.ok(data));
});

app.post('/public/aiEmailList', async (c) => {
	const data = await aiMailManager.listEmails(c, await c.req.json().catch(() => ({})));
	return c.json(result.ok(data));
});

app.post('/public/emailDetail', async (c) => {
	const data = await aiMailManager.getEmailDetail(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/public/sendEmail', async (c) => {
	const data = await aiMailManager.sendEmail(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/public/deleteEmail', async (c) => {
	const data = await aiMailManager.deleteEmails(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/public/markRead', async (c) => {
	const data = await aiMailManager.markRead(c, await c.req.json());
	return c.json(result.ok(data));
});
