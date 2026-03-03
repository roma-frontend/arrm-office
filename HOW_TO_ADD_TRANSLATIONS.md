# 📋 Инструкция по добавлению переводов

## Что нужно сделать:

Добавить переводы из файлов `TRANSLATIONS_TO_ADD_*.json` в основные файлы локализации.

---

## ⏱️ Время: 3-5 минут

---

## 📝 Пошаговая инструкция:

### Шаг 1: Английский (en.json)

1. Откройте файл: `TRANSLATIONS_TO_ADD_EN.json`
2. Скопируйте **всё содержимое** секции `"superadmin": {...}` (строки 3-113)
3. Откройте файл: `src/i18n/locales/en.json`
4. Найдите строку `"security": {` (примерно строка 2407)
5. **Замените** всю секцию `"security"` на скопированную секцию `"superadmin"`
6. Убедитесь, что структура правильная:
   ```json
   {
     ...
     "planGate": { ... },
     "superadmin": {
       "organizations": { ... },
       "subscriptions": { ... },
       "stripe": { ... },
       "security": { ... }
     }
   }
   ```
7. Сохраните файл

---

### Шаг 2: Русский (ru.json)

1. Откройте файл: `TRANSLATIONS_TO_ADD_RU.json`
2. Скопируйте секцию `"superadmin": {...}`
3. Откройте файл: `src/i18n/locales/ru.json`
4. Найдите строку `"security": {` (примерно строка 4760)
5. **Замените** всю секцию `"security"` на скопированную секцию `"superadmin"`
6. Сохраните файл

---

### Шаг 3: Армянский (hy.json)

1. Откройте файл: `TRANSLATIONS_TO_ADD_HY.json`
2. Скопируйте секцию `"superadmin": {...}`
3. Откройте файл: `src/i18n/locales/hy.json`
4. Найдите строку `"security": {` (примерно строка 2795)
5. **Замените** всю секцию `"security"` на скопированную секцию `"superadmin"`
6. Сохраните файл

---

## ✅ Проверка:

После добавления переводов, запустите:

```bash
npm run dev
```

Если есть ошибка JSON:
```bash
node -e "const fs = require('fs'); JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')); console.log('✅ EN OK');"
node -e "const fs = require('fs'); JSON.parse(fs.readFileSync('src/i18n/locales/ru.json', 'utf8')); console.log('✅ RU OK');"
node -e "const fs = require('fs'); JSON.parse(fs.readFileSync('src/i18n/locales/hy.json', 'utf8')); console.log('✅ HY OK');"
```

---

## 🔍 Что добавится:

### Organizations (55 ключей):
- Управление организациями
- Создание организации
- Редактирование
- Планы и настройки

### Subscriptions (30 ключей):
- Управление подписками
- Создание подписки
- Статусы

### Stripe (25 ключей):
- Dashboard
- Метрики
- Команды
- Отчёты

### Security (уже есть, но теперь внутри superadmin):
- Все существующие ключи безопасности

---

## 🎯 После добавления:

1. Удалите временные файлы:
   ```bash
   rm TRANSLATIONS_TO_ADD_*.json
   rm temp_superadmin_en.json
   ```

2. Зафиксируйте изменения:
   ```bash
   git add src/i18n/locales/*.json
   git commit -m "feat: add superadmin translations (organizations, subscriptions, stripe)"
   git push origin main
   ```

---

## 💡 Подсказка:

Если используете VS Code:
1. Ctrl+F (найти)
2. Введите: `"security": {`
3. Выделите от `"security": {` до закрывающей `}`
4. Вставьте новый код

---

**Готово! Переводы будут работать автоматически.** 🎉
