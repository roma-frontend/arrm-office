/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as aiChat from "../aiChat.js";
import type * as aiChatMutations from "../aiChatMutations.js";
import type * as aiEvaluator from "../aiEvaluator.js";
import type * as aiSiteEditor from "../aiSiteEditor.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as auth_module_index from "../auth_module/index.js";
import type * as auth_module_main from "../auth_module/main.js";
import type * as automation from "../automation.js";
import type * as automationActions from "../automationActions.js";
import type * as automationMutations from "../automationMutations.js";
import type * as backups from "../backups.js";
import type * as birthdays from "../birthdays.js";
import type * as calendarEvents from "../calendarEvents.js";
import type * as careers from "../careers.js";
import type * as chat from "../chat.js";
import type * as chatAction from "../chatAction.js";
import type * as chat_calls from "../chat/calls.js";
import type * as chat_index from "../chat/index.js";
import type * as chat_mutations from "../chat/mutations.js";
import type * as chat_presence from "../chat/presence.js";
import type * as chat_queries from "../chat/queries.js";
import type * as compensation from "../compensation.js";
import type * as compliance from "../compliance.js";
import type * as conflicts from "../conflicts.js";
import type * as conflicts_index from "../conflicts/index.js";
import type * as conflicts_main from "../conflicts/main.js";
import type * as corporate from "../corporate.js";
import type * as departments from "../departments.js";
import type * as documents from "../documents.js";
import type * as driverAI from "../driverAI.js";
import type * as drivers from "../drivers.js";
import type * as drivers_calendar_mutations from "../drivers/calendar_mutations.js";
import type * as drivers_calendar_queries from "../drivers/calendar_queries.js";
import type * as drivers_driver_operations from "../drivers/driver_operations.js";
import type * as drivers_driver_registration from "../drivers/driver_registration.js";
import type * as drivers_queries from "../drivers/queries.js";
import type * as drivers_recurring_trips from "../drivers/recurring_trips.js";
import type * as drivers_requests_mutations from "../drivers/requests_mutations.js";
import type * as drivers_requests_queries from "../drivers/requests_queries.js";
import type * as drivers_shifts_mutations from "../drivers/shifts_mutations.js";
import type * as emailValidation from "../emailValidation.js";
import type * as employeeNotes from "../employeeNotes.js";
import type * as employeeProfiles from "../employeeProfiles.js";
import type * as events from "../events.js";
import type * as expenses from "../expenses.js";
import type * as faceRecognition from "../faceRecognition.js";
import type * as goals from "../goals.js";
import type * as hrCronJobs from "../hrCronJobs.js";
import type * as http from "../http.js";
import type * as learning from "../learning.js";
import type * as leaves from "../leaves.js";
import type * as leaves_helpers from "../leaves/helpers.js";
import type * as leaves_index from "../leaves/index.js";
import type * as leaves_mutations from "../leaves/mutations.js";
import type * as leaves_queries from "../leaves/queries.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_date from "../lib/date.js";
import type * as lib_getAuthCaller from "../lib/getAuthCaller.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_payrollCalculator from "../lib/payrollCalculator.js";
import type * as lib_rbac from "../lib/rbac.js";
import type * as lib_sanitize from "../lib/sanitize.js";
import type * as lib_userProfile from "../lib/userProfile.js";
import type * as messenger_calls from "../messenger/calls.js";
import type * as messenger_conversations from "../messenger/conversations.js";
import type * as messenger_index from "../messenger/index.js";
import type * as messenger_messages from "../messenger/messages.js";
import type * as messenger_search from "../messenger/search.js";
import type * as messenger_threads from "../messenger/threads.js";
import type * as messenger_typing from "../messenger/typing.js";
import type * as messenger_unread from "../messenger/unread.js";
import type * as migrations from "../migrations.js";
import type * as newsletter from "../newsletter.js";
import type * as notifications from "../notifications.js";
import type * as offboarding from "../offboarding.js";
import type * as onboarding from "../onboarding.js";
import type * as organizationJoinRequests from "../organizationJoinRequests.js";
import type * as organizationRequests from "../organizationRequests.js";
import type * as organizations from "../organizations.js";
import type * as organizations_index from "../organizations/index.js";
import type * as organizations_main from "../organizations/main.js";
import type * as orgchart from "../orgchart.js";
import type * as pagination from "../pagination.js";
import type * as payroll_actions from "../payroll/actions.js";
import type * as payroll_index from "../payroll/index.js";
import type * as payroll_mutations from "../payroll/mutations.js";
import type * as payroll_queries from "../payroll/queries.js";
import type * as performance from "../performance.js";
import type * as positions from "../positions.js";
import type * as productivity from "../productivity.js";
import type * as recognition from "../recognition.js";
import type * as recruitment from "../recruitment.js";
import type * as recruitmentEmails from "../recruitmentEmails.js";
import type * as schema_ai from "../schema/ai.js";
import type * as schema_analytics from "../schema/analytics.js";
import type * as schema_automation from "../schema/automation.js";
import type * as schema_backups from "../schema/backups.js";
import type * as schema_calendar from "../schema/calendar.js";
import type * as schema_chat from "../schema/chat.js";
import type * as schema_compensation from "../schema/compensation.js";
import type * as schema_compliance from "../schema/compliance.js";
import type * as schema_conflicts from "../schema/conflicts.js";
import type * as schema_corporate from "../schema/corporate.js";
import type * as schema_departments from "../schema/departments.js";
import type * as schema_documents from "../schema/documents.js";
import type * as schema_drivers from "../schema/drivers.js";
import type * as schema_employees from "../schema/employees.js";
import type * as schema_events from "../schema/events.js";
import type * as schema_expenses from "../schema/expenses.js";
import type * as schema_goals from "../schema/goals.js";
import type * as schema_index from "../schema/index.js";
import type * as schema_learning from "../schema/learning.js";
import type * as schema_leaves from "../schema/leaves.js";
import type * as schema_messenger from "../schema/messenger.js";
import type * as schema_newsletter from "../schema/newsletter.js";
import type * as schema_notifications from "../schema/notifications.js";
import type * as schema_offboarding from "../schema/offboarding.js";
import type * as schema_onboarding from "../schema/onboarding.js";
import type * as schema_organizations from "../schema/organizations.js";
import type * as schema_orgchart from "../schema/orgchart.js";
import type * as schema_payroll from "../schema/payroll.js";
import type * as schema_performance from "../schema/performance.js";
import type * as schema_positions from "../schema/positions.js";
import type * as schema_productivity from "../schema/productivity.js";
import type * as schema_recognition from "../schema/recognition.js";
import type * as schema_recruitment from "../schema/recruitment.js";
import type * as schema_security from "../schema/security.js";
import type * as schema_settings from "../schema/settings.js";
import type * as schema_signatures from "../schema/signatures.js";
import type * as schema_sla from "../schema/sla.js";
import type * as schema_surveys from "../schema/surveys.js";
import type * as schema_tasks from "../schema/tasks.js";
import type * as schema_tickets from "../schema/tickets.js";
import type * as schema_userProfiles from "../schema/userProfiles.js";
import type * as schema_userSettings from "../schema/userSettings.js";
import type * as schema_users from "../schema/users.js";
import type * as scripts_createTestAutomationData from "../scripts/createTestAutomationData.js";
import type * as scripts_createTestTicket from "../scripts/createTestTicket.js";
import type * as security from "../security.js";
import type * as settings from "../settings.js";
import type * as sharepointSync from "../sharepointSync.js";
import type * as signatures from "../signatures.js";
import type * as sla from "../sla.js";
import type * as subscriptions from "../subscriptions.js";
import type * as subscriptions_admin from "../subscriptions_admin.js";
import type * as superadmin from "../superadmin.js";
import type * as superadmin_accessTokens from "../superadmin/accessTokens.js";
import type * as superadmin_emergency from "../superadmin/emergency.js";
import type * as superadmin_impersonation from "../superadmin/impersonation.js";
import type * as superadmin_index from "../superadmin/index.js";
import type * as superadmin_search from "../superadmin/search.js";
import type * as superadmin_user360 from "../superadmin/user360.js";
import type * as supervisorRatings from "../supervisorRatings.js";
import type * as surveys from "../surveys.js";
import type * as tasks from "../tasks.js";
import type * as tickets from "../tickets.js";
import type * as timeTracking from "../timeTracking.js";
import type * as translations from "../translations.js";
import type * as updateSuperadminPlan from "../updateSuperadminPlan.js";
import type * as userPreferences from "../userPreferences.js";
import type * as userStats from "../userStats.js";
import type * as users from "../users.js";
import type * as users_admin from "../users/admin.js";
import type * as users_auth from "../users/auth.js";
import type * as users_index from "../users/index.js";
import type * as users_mutations from "../users/mutations.js";
import type * as users_queries from "../users/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  aiChat: typeof aiChat;
  aiChatMutations: typeof aiChatMutations;
  aiEvaluator: typeof aiEvaluator;
  aiSiteEditor: typeof aiSiteEditor;
  analytics: typeof analytics;
  auth: typeof auth;
  "auth_module/index": typeof auth_module_index;
  "auth_module/main": typeof auth_module_main;
  automation: typeof automation;
  automationActions: typeof automationActions;
  automationMutations: typeof automationMutations;
  backups: typeof backups;
  birthdays: typeof birthdays;
  calendarEvents: typeof calendarEvents;
  careers: typeof careers;
  chat: typeof chat;
  chatAction: typeof chatAction;
  "chat/calls": typeof chat_calls;
  "chat/index": typeof chat_index;
  "chat/mutations": typeof chat_mutations;
  "chat/presence": typeof chat_presence;
  "chat/queries": typeof chat_queries;
  compensation: typeof compensation;
  compliance: typeof compliance;
  conflicts: typeof conflicts;
  "conflicts/index": typeof conflicts_index;
  "conflicts/main": typeof conflicts_main;
  corporate: typeof corporate;
  departments: typeof departments;
  documents: typeof documents;
  driverAI: typeof driverAI;
  drivers: typeof drivers;
  "drivers/calendar_mutations": typeof drivers_calendar_mutations;
  "drivers/calendar_queries": typeof drivers_calendar_queries;
  "drivers/driver_operations": typeof drivers_driver_operations;
  "drivers/driver_registration": typeof drivers_driver_registration;
  "drivers/queries": typeof drivers_queries;
  "drivers/recurring_trips": typeof drivers_recurring_trips;
  "drivers/requests_mutations": typeof drivers_requests_mutations;
  "drivers/requests_queries": typeof drivers_requests_queries;
  "drivers/shifts_mutations": typeof drivers_shifts_mutations;
  emailValidation: typeof emailValidation;
  employeeNotes: typeof employeeNotes;
  employeeProfiles: typeof employeeProfiles;
  events: typeof events;
  expenses: typeof expenses;
  faceRecognition: typeof faceRecognition;
  goals: typeof goals;
  hrCronJobs: typeof hrCronJobs;
  http: typeof http;
  learning: typeof learning;
  leaves: typeof leaves;
  "leaves/helpers": typeof leaves_helpers;
  "leaves/index": typeof leaves_index;
  "leaves/mutations": typeof leaves_mutations;
  "leaves/queries": typeof leaves_queries;
  "lib/auth": typeof lib_auth;
  "lib/date": typeof lib_date;
  "lib/getAuthCaller": typeof lib_getAuthCaller;
  "lib/limits": typeof lib_limits;
  "lib/payrollCalculator": typeof lib_payrollCalculator;
  "lib/rbac": typeof lib_rbac;
  "lib/sanitize": typeof lib_sanitize;
  "lib/userProfile": typeof lib_userProfile;
  "messenger/calls": typeof messenger_calls;
  "messenger/conversations": typeof messenger_conversations;
  "messenger/index": typeof messenger_index;
  "messenger/messages": typeof messenger_messages;
  "messenger/search": typeof messenger_search;
  "messenger/threads": typeof messenger_threads;
  "messenger/typing": typeof messenger_typing;
  "messenger/unread": typeof messenger_unread;
  migrations: typeof migrations;
  newsletter: typeof newsletter;
  notifications: typeof notifications;
  offboarding: typeof offboarding;
  onboarding: typeof onboarding;
  organizationJoinRequests: typeof organizationJoinRequests;
  organizationRequests: typeof organizationRequests;
  organizations: typeof organizations;
  "organizations/index": typeof organizations_index;
  "organizations/main": typeof organizations_main;
  orgchart: typeof orgchart;
  pagination: typeof pagination;
  "payroll/actions": typeof payroll_actions;
  "payroll/index": typeof payroll_index;
  "payroll/mutations": typeof payroll_mutations;
  "payroll/queries": typeof payroll_queries;
  performance: typeof performance;
  positions: typeof positions;
  productivity: typeof productivity;
  recognition: typeof recognition;
  recruitment: typeof recruitment;
  recruitmentEmails: typeof recruitmentEmails;
  "schema/ai": typeof schema_ai;
  "schema/analytics": typeof schema_analytics;
  "schema/automation": typeof schema_automation;
  "schema/backups": typeof schema_backups;
  "schema/calendar": typeof schema_calendar;
  "schema/chat": typeof schema_chat;
  "schema/compensation": typeof schema_compensation;
  "schema/compliance": typeof schema_compliance;
  "schema/conflicts": typeof schema_conflicts;
  "schema/corporate": typeof schema_corporate;
  "schema/departments": typeof schema_departments;
  "schema/documents": typeof schema_documents;
  "schema/drivers": typeof schema_drivers;
  "schema/employees": typeof schema_employees;
  "schema/events": typeof schema_events;
  "schema/expenses": typeof schema_expenses;
  "schema/goals": typeof schema_goals;
  "schema/index": typeof schema_index;
  "schema/learning": typeof schema_learning;
  "schema/leaves": typeof schema_leaves;
  "schema/messenger": typeof schema_messenger;
  "schema/newsletter": typeof schema_newsletter;
  "schema/notifications": typeof schema_notifications;
  "schema/offboarding": typeof schema_offboarding;
  "schema/onboarding": typeof schema_onboarding;
  "schema/organizations": typeof schema_organizations;
  "schema/orgchart": typeof schema_orgchart;
  "schema/payroll": typeof schema_payroll;
  "schema/performance": typeof schema_performance;
  "schema/positions": typeof schema_positions;
  "schema/productivity": typeof schema_productivity;
  "schema/recognition": typeof schema_recognition;
  "schema/recruitment": typeof schema_recruitment;
  "schema/security": typeof schema_security;
  "schema/settings": typeof schema_settings;
  "schema/signatures": typeof schema_signatures;
  "schema/sla": typeof schema_sla;
  "schema/surveys": typeof schema_surveys;
  "schema/tasks": typeof schema_tasks;
  "schema/tickets": typeof schema_tickets;
  "schema/userProfiles": typeof schema_userProfiles;
  "schema/userSettings": typeof schema_userSettings;
  "schema/users": typeof schema_users;
  "scripts/createTestAutomationData": typeof scripts_createTestAutomationData;
  "scripts/createTestTicket": typeof scripts_createTestTicket;
  security: typeof security;
  settings: typeof settings;
  sharepointSync: typeof sharepointSync;
  signatures: typeof signatures;
  sla: typeof sla;
  subscriptions: typeof subscriptions;
  subscriptions_admin: typeof subscriptions_admin;
  superadmin: typeof superadmin;
  "superadmin/accessTokens": typeof superadmin_accessTokens;
  "superadmin/emergency": typeof superadmin_emergency;
  "superadmin/impersonation": typeof superadmin_impersonation;
  "superadmin/index": typeof superadmin_index;
  "superadmin/search": typeof superadmin_search;
  "superadmin/user360": typeof superadmin_user360;
  supervisorRatings: typeof supervisorRatings;
  surveys: typeof surveys;
  tasks: typeof tasks;
  tickets: typeof tickets;
  timeTracking: typeof timeTracking;
  translations: typeof translations;
  updateSuperadminPlan: typeof updateSuperadminPlan;
  userPreferences: typeof userPreferences;
  userStats: typeof userStats;
  users: typeof users;
  "users/admin": typeof users_admin;
  "users/auth": typeof users_auth;
  "users/index": typeof users_index;
  "users/mutations": typeof users_mutations;
  "users/queries": typeof users_queries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
