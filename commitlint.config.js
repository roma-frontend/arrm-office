/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // Новая функциональность
        'fix', // Исправление бага
        'docs', // Документация
        'style', // Форматирование, semicolons и т.д.
        'refactor', // Рефакторинг кода
        'perf', // Улучшение производительности
        'test', // Тесты
        'build', // Сборка, зависимости
        'ci', // CI/CD конфигурация
        'chore', // Прочее, не меняющее src
        'revert', // Откат коммита
      ],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'subject-case': [0],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 100],
  },
};
