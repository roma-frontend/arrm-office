import { NextResponse } from 'next/server';
import { sendTelegramNotification } from '@/lib/telegram';

export async function POST(req: Request) {
  try {
    const { type, data } = (await req.json()) as {
      type: string;
      data: {
        email?: string;
        name?: string;
        phone?: string;
        vacancy?: string;
        orgName?: string;
        department?: string;
        position?: string;
        role?: string;
      };
    };

    let message = '';

    switch (type) {
      case 'newsletter':
        message = `📬 <b>Новая подписка на рассылку</b>\n\n📧 Email: ${data.email}`;
        break;
      case 'career':
        message = `💼 <b>Новая заявка на вакансию</b>\n\n👤 Имя: ${data.name}\n📧 Email: ${data.email}${data.phone ? `\n📱 Тел: ${data.phone}` : ''}\n🏷 Вакансия: ${data.vacancy || '—'}`;
        break;
      case 'org_register':
        message = `🏢 <b>Запрос на регистрацию организации</b>\n\n🏷 Название: ${data.orgName}\n👤 Контакт: ${data.name}\n📧 Email: ${data.email}${data.phone ? `\n📱 Тел: ${data.phone}` : ''}`;
        break;
      case 'new_employee':
        message = `👤 <b>Новый сотрудник добавлен</b>\n\n👤 Имя: ${data.name}\n📧 Email: ${data.email}\n🏢 Отдел: ${data.department || '—'}\n💼 Должность: ${data.position || '—'}\n🔑 Роль: ${data.role || 'employee'}`;
        break;
      default:
        return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
    }

    await sendTelegramNotification(message);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
