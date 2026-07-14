/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as habitActions from "../habitActions.js";
import type * as habits from "../habits.js";
import type * as http from "../http.js";
import type * as memory from "../memory.js";
import type * as store from "../store.js";
import type * as telegram from "../telegram.js";
import type * as web from "../web.js";
import type * as webAccess from "../webAccess.js";
import type * as webAuth from "../webAuth.js";
import type * as webIdentity from "../webIdentity.js";
import type * as webPreview from "../webPreview.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  auth: typeof auth;
  crons: typeof crons;
  habitActions: typeof habitActions;
  habits: typeof habits;
  http: typeof http;
  memory: typeof memory;
  store: typeof store;
  telegram: typeof telegram;
  web: typeof web;
  webAccess: typeof webAccess;
  webAuth: typeof webAuth;
  webIdentity: typeof webIdentity;
  webPreview: typeof webPreview;
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
