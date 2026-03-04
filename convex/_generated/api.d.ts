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
import type * as aiEvaluator from "../aiEvaluator.js";
import type * as aiSiteEditor from "../aiSiteEditor.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as employeeNotes from "../employeeNotes.js";
import type * as employeeProfiles from "../employeeProfiles.js";
import type * as faceRecognition from "../faceRecognition.js";
import type * as leaves from "../leaves.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as organizationRequests from "../organizationRequests.js";
import type * as organizations from "../organizations.js";
import type * as productivity from "../productivity.js";
import type * as security from "../security.js";
import type * as sla from "../sla.js";
import type * as subscriptions from "../subscriptions.js";
import type * as subscriptions_admin from "../subscriptions_admin.js";
import type * as supervisorRatings from "../supervisorRatings.js";
import type * as tasks from "../tasks.js";
import type * as timeTracking from "../timeTracking.js";
import type * as updateSuperadminPlan from "../updateSuperadminPlan.js";
import type * as userPreferences from "../userPreferences.js";
import type * as userStats from "../userStats.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  aiEvaluator: typeof aiEvaluator;
  aiSiteEditor: typeof aiSiteEditor;
  analytics: typeof analytics;
  auth: typeof auth;
  chat: typeof chat;
  employeeNotes: typeof employeeNotes;
  employeeProfiles: typeof employeeProfiles;
  faceRecognition: typeof faceRecognition;
  leaves: typeof leaves;
  migrations: typeof migrations;
  notifications: typeof notifications;
  organizationRequests: typeof organizationRequests;
  organizations: typeof organizations;
  productivity: typeof productivity;
  security: typeof security;
  sla: typeof sla;
  subscriptions: typeof subscriptions;
  subscriptions_admin: typeof subscriptions_admin;
  supervisorRatings: typeof supervisorRatings;
  tasks: typeof tasks;
  timeTracking: typeof timeTracking;
  updateSuperadminPlan: typeof updateSuperadminPlan;
  userPreferences: typeof userPreferences;
  userStats: typeof userStats;
  users: typeof users;
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
