# 🚀 Enterprise Subscription Setup - Complete Guide

## ✅ Что было сделано

### 1. **Добавлена переменная окружения для Enterprise плана**
   - `.env.local` - добавлена `STRIPE_PRICE_ENTERPRISE=price_1T5nbKER7YhFpiUxABCDEFGH`
   - `.env.example` - добавлен шаблон `STRIPE_PRICE_ENTERPRISE=price_...`

### 2. **Обновлен API для Stripe Checkout**
   - Файл: `src/app/api/stripe/checkout/route.ts`
   - Добавлена поддержка плана `enterprise` в объект `PLANS`

### 3. **Добавлена кнопка в Sidebar для доступа к /admin/subscriptions**
   - Файл: `src/components/layout/Sidebar.tsx`
   - Добавлена навигационная кнопка "Subscriptions" (доступна только для admin)
   - Добавлены переводы во все языковые файлы (en, ru, hy)

### 4. **Страница управления подписками готова**
   - Файл: `src/app/(dashboard)/admin/subscriptions/page.tsx`
   - Уже поддерживает создание Enterprise подписок
   - Возможность ручного назначения с кастомной ценой

---

## 📋 Настройка через Stripe (Рекомендуется)

### Шаг 1: Создайте Enterprise Price в Stripe Dashboard

1. Перейдите в [Stripe Dashboard](https://dashboard.stripe.com/)
2. Выберите **Products** → **Add product**
3. Заполните данные:
   - **Name**: Enterprise Plan
   - **Description**: Custom enterprise plan with unlimited features
   - **Pricing**: Recurring (Monthly/Yearly)
   - **Price**: Custom или фиксированная цена (например, $299/месяц)

4. Сохраните и скопируйте **Price ID** (начинается с `price_...`)

### Шаг 2: Обновите .env.local

Замените тестовый Price ID на реальный:

```bash
STRIPE_PRICE_ENTERPRISE=price_ВАШ_РЕАЛЬНЫЙ_ID
```

### Шаг 3: Перезапустите сервер

```bash
npm run dev
```

---

## 🎯 Как использовать

### Вариант 1: Автоматическая оплата через Stripe

Клиент выбирает Enterprise план на странице pricing и оплачивает через Stripe Checkout:

1. Клиент нажимает "Get Started" на Enterprise карточке
2. Перенаправляется в Stripe Checkout
3. Оплачивает подписку
4. Webhook автоматически активирует Enterprise доступ

### Вариант 2: Ручное назначение (для кастомных контрактов)

Для индивидуальных договоренностей:

1. Войдите как **Admin**
2. Перейдите в **Subscriptions** (новая кнопка в Sidebar)
3. Нажмите **Add Manual Subscription**
4. Выберите:
   - **User**: Пользователь для назначения
   - **Plan**: Enterprise (Custom)
   - **Custom Price**: Индивидуальная цена (опционально)
   - **Internal Notes**: Детали контракта
5. Нажмите **Create Subscription**

---

## 💡 Отправка платежной ссылки клиенту

### Вариант 1: Прямая ссылка на Checkout

```javascript
const checkoutUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/stripe/checkout?plan=enterprise&email=${clientEmail}`;
```

Отправьте эту ссылку клиенту по email.

### Вариант 2: Создайте Payment Link в Stripe

1. В Stripe Dashboard → **Payment Links**
2. Создайте новую ссылку для Enterprise Price
3. Отправьте эту ссылку клиенту

---

## 🔧 Файлы, которые были изменены

```
✅ Desktop/office/.env.local
✅ Desktop/office/.env.example
✅ Desktop/office/src/app/api/stripe/checkout/route.ts
✅ Desktop/office/src/components/layout/Sidebar.tsx
✅ Desktop/office/src/i18n/locales/en.json
✅ Desktop/office/src/i18n/locales/ru.json
✅ Desktop/office/src/i18n/locales/hy.json
✅ Desktop/office/src/app/(dashboard)/admin/subscriptions/page.tsx (уже была готова)
```

---

## ✨ Готово!

Теперь у вас есть полная поддержка Enterprise подписок:
- ✅ Автоматическая оплата через Stripe
- ✅ Ручное назначение администратором
- ✅ Кастомные цены для индивидуальных контрактов
- ✅ Удобная навигация через Sidebar

**Следующий шаг**: Создайте реальный Enterprise Price в Stripe и обновите `.env.local`!
