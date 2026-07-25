/**
 * Tests for telegram.ts — sendTelegramNotification.
 */
import { sendTelegramNotification } from '@/lib/telegram';

describe('sendTelegramNotification', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns false when token is missing', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_CHAT_ID = '123';
    expect(await sendTelegramNotification('test')).toBe(false);
  });

  it('returns false when chatId is missing', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'token';
    delete process.env.TELEGRAM_CHAT_ID;
    expect(await sendTelegramNotification('test')).toBe(false);
  });

  it('returns false when both are missing', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    expect(await sendTelegramNotification('test')).toBe(false);
  });

  it('returns true when API call succeeds', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = 'test-chat';
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

    const result = await sendTelegramNotification('Hello!');
    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Hello!'),
      }),
    );
  });

  it('returns false when API call fails', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = 'test-chat';
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

    expect(await sendTelegramNotification('test')).toBe(false);
  });

  it('returns false when fetch throws', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = 'test-chat';
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    expect(await sendTelegramNotification('test')).toBe(false);
  });

  it('sends HTML parse mode', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'token';
    process.env.TELEGRAM_CHAT_ID = 'chat';
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

    await sendTelegramNotification('<b>bold</b>');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('HTML'),
      }),
    );
  });
});
