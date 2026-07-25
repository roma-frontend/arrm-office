/**
 * Tests for AI Domain Agents (src/lib/ai/agents.ts)
 *
 * Coverage: routeToAgent routing, role-based restrictions,
 * buildAgentPrompt structure, agent definitions.
 */

import { routeToAgent, buildAgentPrompt, getAgentSystemInstruction, AGENTS } from '@/lib/ai/agents';
import type { UserContext } from '@/lib/aiAssistant';

// ── Mock User Context ────────────────────────────────────────────────────────

const mockUserContext: UserContext = {
  userId: 'user1',
  name: 'Test User',
  email: 'test@strata.com',
  role: 'admin',
  organizationId: 'org1',
  department: 'Engineering',
  position: 'Developer',
};

const mockEmployeeContext: UserContext = {
  ...mockUserContext,
  role: 'employee',
};

// ── routeToAgent tests ───────────────────────────────────────────────────────

describe('routeToAgent', () => {
  describe('recruitment routing', () => {
    const testCases = [
      { msg: 'вакансия', lang: 'ru' },
      { msg: 'кандидат на позицию', lang: 'ru' },
      { msg: 'собеседование завтра', lang: 'ru' },
      { msg: 'резюме нового сотрудника', lang: 'ru' },
      { msg: 'найм разработчика', lang: 'ru' },
      { msg: 'vacancy for senior dev', lang: 'en' },
      { msg: 'candidate pipeline status', lang: 'en' },
      { msg: 'job opening in marketing', lang: 'en' },
      { msg: 'interview schedule', lang: 'en' },
      { msg: 'resume review', lang: 'en' },
      { msg: 'hiring manager', lang: 'en' },
      { msg: 'текущие вакансии', lang: 'ru' },
      { msg: 'հավաքագրում', lang: 'hy' },
      { msg: 'աշխատանքի առաջարկ', lang: 'hy' },
    ];

    testCases.forEach(({ msg, lang }) => {
      it(`routes "${msg.substring(0, 30)}..." (${lang}) to recruitment`, () => {
        expect(routeToAgent(msg, 'admin')).toBe('recruitment');
      });
    });
  });

  describe('policy routing', () => {
    const testCases = [
      { msg: 'какие политики компании', lang: 'ru' },
      { msg: 'правила отпусков', lang: 'ru' },
      { msg: 'документы по комплаенс', lang: 'ru' },
      { msg: 'gdpr требования', lang: 'ru/en' },
      { msg: 'company policy on leave', lang: 'en' },
      { msg: 'compliance rules', lang: 'en' },
      { msg: 'data protection policy', lang: 'en' },
      { msg: 'employee handbook', lang: 'en' },
      { msg: 'privacy consent', lang: 'en' },
      { msg: 'политика конфиденциальности', lang: 'ru' },
      { msg: 'кодекс поведения', lang: 'ru' },
      { msg: 'трудовой кодекс', lang: 'ru' },
      { msg: 'персональные данные', lang: 'ru' },
      { msg: 'փաստաթուղթ', lang: 'hy' },
      { msg: 'քաղաքականություն', lang: 'hy' },
    ];

    testCases.forEach(({ msg }) => {
      it(`routes "${msg.substring(0, 30)}..." to policy`, () => {
        expect(routeToAgent(msg, 'admin')).toBe('policy');
      });
    });
  });

  describe('analytics routing', () => {
    const testCases = [
      { msg: 'покажи аналитику по отпускам', lang: 'ru' },
      { msg: 'отчёт за месяц', lang: 'ru' },
      { msg: 'статистика посещаемости', lang: 'ru' },
      { msg: 'тренды увольнений', lang: 'ru' },
      { msg: 'analytics dashboard', lang: 'en' },
      { msg: 'monthly report', lang: 'en' },
      { msg: 'leave trends', lang: 'en' },
      { msg: 'attendance statistics', lang: 'en' },
      { msg: 'employee turnover rate', lang: 'en' },
      { msg: 'data insights', lang: 'en' },
      { msg: 'վերլուծություն', lang: 'hy' },
      { msg: 'հաշվետվություն', lang: 'hy' },
    ];

    testCases.forEach(({ msg }) => {
      it(`routes "${msg.substring(0, 30)}..." to analytics`, () => {
        expect(routeToAgent(msg, 'admin')).toBe('analytics');
      });
    });
  });

  describe('kpi/goals routing', () => {
    const testCases = [
      { msg: 'мои цели на квартал', lang: 'ru' },
      { msg: 'okr компании', lang: 'ru' },
      { msg: 'прогресс по задачам', lang: 'ru' },
      { msg: 'стратегическая карта', lang: 'ru' },
      { msg: 'balanced scorecard', lang: 'en' },
      { msg: 'my objectives', lang: 'en' },
      { msg: 'key results progress', lang: 'en' },
      { msg: 'performance review', lang: 'en' },
      { msg: 'north star metric', lang: 'en' },
      { msg: 'стратегия развития', lang: 'ru' },
      { msg: 'kpi показатели', lang: 'ru' },
      { msg: 'նպատակ', lang: 'hy' },
      { msg: 'կատարողական', lang: 'hy' },
    ];

    testCases.forEach(({ msg }) => {
      it(`routes "${msg.substring(0, 30)}..." to kpi`, () => {
        expect(routeToAgent(msg, 'admin')).toBe('kpi');
      });
    });
  });

  describe('general fallback', () => {
    const testCases = [
      'hello',
      'как дела',
      'что ты умеешь',
      'помоги',
      'thanks',
      'good morning',
      'привет',
      'бարև',
    ];

    testCases.forEach((msg) => {
      it(`routes "${msg}" to general`, () => {
        expect(routeToAgent(msg, 'admin')).toBe('general');
      });
    });
  });

  describe('role-based restrictions', () => {
    it('allows admin to use analytics agent', () => {
      expect(routeToAgent('покажи аналитику', 'admin')).toBe('analytics');
    });

    it('allows supervisor to use analytics agent', () => {
      expect(routeToAgent('analytics report', 'supervisor')).toBe('analytics');
    });

    it('blocks employee from analytics agent (falls back to general)', () => {
      expect(routeToAgent('analytics report', 'employee')).toBe('general');
    });

    it('allows employee to use kpi agent', () => {
      expect(routeToAgent('my goals', 'employee')).toBe('kpi');
    });

    it('allows employee to use policy agent', () => {
      expect(routeToAgent('company policy', 'employee')).toBe('policy');
    });

    it('allows employee to use recruitment agent', () => {
      expect(routeToAgent('vacancy', 'employee')).toBe('recruitment');
    });
  });

  describe('edge cases', () => {
    it('handles empty string gracefully', () => {
      expect(routeToAgent('', 'admin')).toBe('general');
    });

    it('handles whitespace-only input', () => {
      expect(routeToAgent('   ', 'admin')).toBe('general');
    });

    it('handles special characters', () => {
      expect(routeToAgent('!!! ??? $$$', 'admin')).toBe('general');
    });

    it('handles very long input', () => {
      const longMsg = 'x'.repeat(10000);
      expect(routeToAgent(longMsg, 'admin')).toBe('general');
    });

    it('routes mixed domain keywords to best match', () => {
      // Even with mixed keywords, strongest domain should win
      const result = routeToAgent('analytics report about recruitment candidates', 'admin');
      // Both analytics and recruitment match, but 'analytics' should win with more keywords
      expect(['analytics', 'recruitment']).toContain(result);
    });
  });
});

// ── buildAgentPrompt tests ───────────────────────────────────────────────────

describe('buildAgentPrompt', () => {
  it('builds recruitment prompt with domain mention', () => {
    const prompt = buildAgentPrompt('recruitment', mockUserContext);
    expect(prompt).toContain('RECRUITMENT');
    expect(prompt).toContain('Talent Acquisition');
    expect(prompt).toContain('Vacancies');
    expect(prompt).toContain('Candidate');
    expect(prompt).toContain('Test User');
    expect(prompt).toContain('ADMIN');
  });

  it('builds policy prompt with domain mention', () => {
    const prompt = buildAgentPrompt('policy', mockUserContext);
    expect(prompt).toContain('POLICY');
    expect(prompt).toContain('Compliance');
    expect(prompt).toContain('GDPR');
    expect(prompt).toContain('Documents');
    expect(prompt).toContain('Test User');
  });

  it('builds analytics prompt with domain mention', () => {
    const prompt = buildAgentPrompt('analytics', mockUserContext);
    expect(prompt).toContain('ANALYTICS');
    expect(prompt).toContain('Analytics');
    expect(prompt).toContain('Reports');
    expect(prompt).toContain('Metrics');
    expect(prompt).toContain('Test User');
  });

  it('builds kpi prompt with domain mention', () => {
    const prompt = buildAgentPrompt('kpi', mockUserContext);
    expect(prompt).toContain('KPI');
    expect(prompt).toContain('Strategy');
    expect(prompt).toContain('Balanced Scorecard');
    expect(prompt).toContain('OKR');
    expect(prompt).toContain('Test User');
  });

  it('builds general prompt as base fallback', () => {
    const prompt = buildAgentPrompt('general', mockUserContext);
    expect(prompt).toContain('Test User');
    expect(prompt).toContain('ADMIN');
    expect(prompt).toContain('Strata AI');
    expect(prompt).not.toContain('RECRUITMENT');
    expect(prompt).not.toContain('POLICY');
    expect(prompt).not.toContain('ANALYTICS');
    expect(prompt).not.toContain('KPI');
  });

  it('includes live data when provided', () => {
    const liveData = 'SPECIAL_LIVE_DATA_12345';
    const prompt = buildAgentPrompt('kpi', mockUserContext, liveData);
    expect(prompt).toContain(liveData);
  });

  it('handles optional live data', () => {
    // Should not throw when liveData is undefined
    expect(() => buildAgentPrompt('recruitment', mockUserContext)).not.toThrow();
  });

  it('includes user context in all prompts', () => {
    for (const agent of ['recruitment', 'policy', 'analytics', 'kpi', 'general'] as const) {
      const prompt = buildAgentPrompt(agent, mockUserContext);
      expect(prompt).toContain('Test User');
      expect(prompt).toContain('ADMIN');
      expect(prompt).toContain('Engineering');
    }
  });

  it('respects employee role in prompt', () => {
    const prompt = buildAgentPrompt('general', mockEmployeeContext);
    expect(prompt).toContain('EMPLOYEE');
    expect(prompt).not.toContain('ADMIN');
  });
});

// ── getAgentSystemInstruction tests ──────────────────────────────────────────

describe('getAgentSystemInstruction', () => {
  it('returns instruction for specialized agents', () => {
    const instruction = getAgentSystemInstruction('recruitment');
    expect(instruction).toContain('Recruitment Agent');
    expect(instruction).toContain('Focus on');
  });

  it('returns empty string for general agent', () => {
    expect(getAgentSystemInstruction('general')).toBe('');
  });

  it('mentions redirect to general for out-of-domain questions', () => {
    const instruction = getAgentSystemInstruction('kpi');
    expect(instruction).toContain('redirect');
    expect(instruction).toContain('general');
  });
});

// ── Agent Definitions tests ──────────────────────────────────────────────────

describe('AGENTS', () => {
  it('defines all 5 agents', () => {
    expect(AGENTS).toHaveLength(5);
    const ids = AGENTS.map((a) => a.id);
    expect(ids).toContain('recruitment');
    expect(ids).toContain('policy');
    expect(ids).toContain('analytics');
    expect(ids).toContain('kpi');
    expect(ids).toContain('general');
  });

  it('each agent has required fields', () => {
    for (const agent of AGENTS) {
      expect(agent.id).toBeTruthy();
      expect(agent.name).toBeTruthy();
      expect(agent.shortName).toBeTruthy();
      expect(agent.icon).toBeTruthy();
      expect(agent.description).toBeTruthy();
      expect(agent.color).toContain('from-');
    }
  });

  it('general agent is last (fallback)', () => {
    expect(AGENTS[4]!.id).toBe('general');
  });
});
