import { defineSchema } from 'convex/server';
import { organizations } from './organizations';
import { users } from './users';
import { leaves } from './leaves';
import { notifications } from './notifications';
import { tickets } from './tickets';
import { automation } from './automation';
import { security } from './security';
import { sla } from './sla';
import { employees } from './employees';
import { drivers } from './drivers';
import { tasks } from './tasks';
import { events } from './events';
import { chat } from './chat';
import { productivity } from './productivity';
import { messenger } from './messenger';
import { calendar } from './calendar';
import { analytics } from './analytics';
import { settings } from './settings';
import { corporate } from './corporate';
import { conflicts } from './conflicts';
import { ai } from './ai';
import { aiGovernance } from './aiGovernance';
import { payroll } from './payroll';
import { recognition } from './recognition';
import { surveys } from './surveys';
import { performance } from './performance';
import { signatures } from './signatures';
import { goals } from './goals';
import { recruitment } from './recruitment';
import { onboarding } from './onboarding';
import { offboarding } from './offboarding';
import { orgchart } from './orgchart';
import { learning } from './learning';
import { documents } from './documents';
import { backups } from './backups';
import { compensation } from './compensation';
import { departments } from './departments';
import { positions } from './positions';
import { compliance } from './compliance';
import { expenses } from './expenses';
import { userSettings } from './userSettings';
import { userProfiles } from './userProfiles';
import { newsletter } from './newsletter';

export default defineSchema({
  ...organizations,
  ...users,
  ...leaves,
  ...notifications,
  ...tickets,
  ...automation,
  ...security,
  ...sla,
  ...employees,
  ...drivers,
  ...tasks,
  ...events,
  ...chat,
  ...productivity,
  ...messenger,
  ...calendar,
  ...analytics,
  ...settings,
  ...corporate,
  ...conflicts,
  ...ai,
  ...aiGovernance,
  ...payroll,
  ...recognition,
  ...surveys,
  ...performance,
  ...signatures,
  ...goals,
  ...recruitment,
  ...onboarding,
  ...offboarding,
  ...orgchart,
  ...learning,
  ...documents,
  ...backups,
  ...compensation,
  ...departments,
  ...positions,
  ...compliance,
  ...expenses,
  ...userSettings,
  ...userProfiles,
  ...newsletter,
});

export {
  organizations,
  users,
  leaves,
  notifications,
  tickets,
  automation,
  security,
  sla,
  employees,
  drivers,
  tasks,
  events,
  chat,
  productivity,
  messenger,
  calendar,
  analytics,
  settings,
  corporate,
  conflicts,
  ai,
  aiGovernance,
  payroll,
  recognition,
  surveys,
  performance,
  signatures,
  goals,
  recruitment,
  onboarding,
  offboarding,
  orgchart,
  learning,
  documents,
  backups,
  compensation,
  departments,
  positions,
  compliance,
  expenses,
  userSettings,
  userProfiles,
  newsletter,
};
