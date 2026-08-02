import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

export interface DepartmentOption {
  _id: Id<'departments'>;
  name: string;
}

export interface PositionOption {
  _id: Id<'positions'>;
  title: string;
  departmentId?: Id<'departments'>;
}

/**
 * Отделы и должности организации для выпадающих списков.
 *
 * Единственный источник правды — записи, которыми управляют на
 * /employees/departments и /employees/positions. Раньше формы сотрудника брали
 * отделы из захардкоженного массива, поэтому выбранное значение не совпадало
 * ни с одним реальным отделом.
 *
 * `departmentId` сужает список должностей до выбранного отдела: должности без
 * отдела остаются видимыми, иначе общие роли (например «Менеджер») пропадали бы
 * из списка.
 */
export function useOrgUnits(
  organizationId: Id<'organizations'> | string | null | undefined,
  departmentId?: Id<'departments'> | string | null,
) {
  const orgId = organizationId ? (organizationId as Id<'organizations'>) : null;

  const departments = useQuery(
    api.departments.options,
    orgId ? { organizationId: orgId } : 'skip',
  ) as DepartmentOption[] | undefined;

  const allPositions = useQuery(
    api.positions.options,
    orgId ? { organizationId: orgId } : 'skip',
  ) as PositionOption[] | undefined;

  const positions = departmentId
    ? allPositions?.filter((p) => !p.departmentId || p.departmentId === departmentId)
    : allPositions;

  return {
    departments,
    positions,
    allPositions,
    isLoading: orgId != null && (departments === undefined || allPositions === undefined),
  };
}
