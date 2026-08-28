import {
  SERVICE_DEPARTMENT_PATTERNS,
  SERVICE_POSITION_PATTERNS,
} from '../../convex/lib/resolveServiceAssignee';

describe('SERVICE_DEPARTMENT_PATTERNS', () => {
  describe('HR pattern', () => {
    const hr = SERVICE_DEPARTMENT_PATTERNS.hr;

    it('matches "HR"', () => {
      expect(hr.test('HR')).toBe(true);
    });

    it('matches "Human Resources"', () => {
      expect(hr.test('Human Resources')).toBe(true);
    });

    it('matches "People Ops"', () => {
      expect(hr.test('People Ops')).toBe(true);
    });

    it('matches Armenian "Отдел кадров"', () => {
      expect(hr.test('Отдел кадров')).toBe(true);
    });

    it('matches "персонал"', () => {
      expect(hr.test('Отдел персонала')).toBe(true);
    });

    it('does not match "Sales"', () => {
      expect(hr.test('Sales')).toBe(false);
    });
  });

  describe('IT pattern', () => {
    const itPattern = SERVICE_DEPARTMENT_PATTERNS.it;

    it('matches "IT"', () => {
      expect(itPattern.test('IT')).toBe(true);
    });

    it('matches "Engineering"', () => {
      expect(itPattern.test('Engineering')).toBe(true);
    });

    it('matches "Software"', () => {
      expect(itPattern.test('Software Development')).toBe(true);
    });

    it('matches Armenian "информационный"', () => {
      expect(itPattern.test('Информационный отдел')).toBe(true);
    });

    it('matches "айти"', () => {
      expect(itPattern.test('Айти отдел')).toBe(true);
    });

    it('does not match "Marketing"', () => {
      expect(itPattern.test('Marketing')).toBe(false);
    });
  });
});

describe('SERVICE_POSITION_PATTERNS', () => {
  describe('HR pattern', () => {
    const hr = SERVICE_POSITION_PATTERNS.hr;

    it('matches "recruiter"', () => {
      expect(hr.test('Recruiter')).toBe(true);
    });

    it('matches "HR Manager"', () => {
      expect(hr.test('HR Manager')).toBe(true);
    });

    it('matches Armenian "рекрутер"', () => {
      expect(hr.test('Рекрутер')).toBe(true);
    });

    it('does not match "Developer"', () => {
      expect(hr.test('Developer')).toBe(false);
    });
  });

  describe('IT pattern', () => {
    const itPos = SERVICE_POSITION_PATTERNS.it;

    it('matches "sysadmin"', () => {
      expect(itPos.test('Sysadmin')).toBe(true);
    });

    it('matches "developer"', () => {
      expect(itPos.test('Software Developer')).toBe(true);
    });

    it('matches Armenian "программист"', () => {
      expect(itPos.test('Программист')).toBe(true);
    });

    it('matches "разработчик"', () => {
      expect(itPos.test('Разработчик')).toBe(true);
    });

    it('does not match "Accountant"', () => {
      expect(itPos.test('Accountant')).toBe(false);
    });
  });
});
