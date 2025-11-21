/**
 * @fileoverview Type definitions for WebUI server and client communication
 *
 * Defines TypeScript interfaces for the WebUI HTTP API and WebSocket protocol.
 * Includes authentication tokens, WebSocket messages, and API request/response types.
 *
 * @module types/webui
 */

/**
 * Authentication token with expiration
 */
export interface AuthToken {
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

/**
 * WebSocket message types (Server → Client)
 */
export type WebSocketMessageType =
  | 'AUTH_SUCCESS'
  | 'STATUS_UPDATE'
  | 'SPOOLMAN_UPDATE'
  | 'COMMAND_RESULT'
  | 'ERROR'
  | 'PONG';

/**
 * WebSocket command types (Client → Server)
 */
export type WebSocketCommandType =
  | 'REQUEST_STATUS'
  | 'EXECUTE_GCODE'
  | 'PING';

/**
 * WebSocket message from server to client
 */
export interface WebSocketServerMessage {
  type: WebSocketMessageType;
  data?: any;
  error?: string;
}

/**
 * WebSocket command from client to server
 */
export interface WebSocketClientMessage {
  type: WebSocketCommandType;
  data?: any;
}

/**
 * Authentication login request
 */
export interface LoginRequest {
  password: string;
  rememberMe?: boolean;
}

/**
 * Authentication login response
 */
export interface LoginResponse {
  success: boolean;
  token?: string;
  expiresAt?: number;
  error?: string;
}

/**
 * Authentication status response
 */
export interface AuthStatusResponse {
  required: boolean;
  authenticated: boolean;
}

/**
 * Generic API error response
 */
export interface ApiErrorResponse {
  error: string;
  details?: any;
}

/**
 * Generic API success response
 */
export interface ApiSuccessResponse {
  success: boolean;
  message?: string;
  data?: any;
}
