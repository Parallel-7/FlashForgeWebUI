/**
 * @fileoverview Time conversion, formatting, and calculation utilities for human-readable
 * duration display, print time estimation, and ETA calculations.
 */

/**
 * Convert seconds to minutes
 */
export function secondsToMinutes(seconds: number): number {
  return Math.round(seconds / 60);
}

/**
 * Convert minutes to seconds
 */
export function minutesToSeconds(minutes: number): number {
  return minutes * 60;
}

/**
 * Format seconds as human-readable duration
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${minutes}m`;
}

/**
 * Format minutes as human-readable duration
 */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Format job elapsed time as mm:ss or HH:mm:ss
 */
export function formatJobTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }

  return `${mm}:${ss}`;
}

/**
 * Format timestamp as time string
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Format date as short date string
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Format date and time together
 */
export function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}

/**
 * Calculate elapsed time from start
 */
export function calculateElapsed(startTime: Date, endTime: Date = new Date()): number {
  return Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
}

/**
 * Calculate remaining time
 */
export function calculateRemaining(elapsed: number, total: number): number {
  return Math.max(0, total - elapsed);
}

/**
 * Calculate ETA based on progress and elapsed time
 */
export function calculateETA(progress: number, elapsedSeconds: number): number {
  if (progress <= 0) {
    return 0;
  }

  return Math.round((elapsedSeconds / progress) * 100);
}

/**
 * Format ETA as date/time string
 */
export function formatETA(etaSeconds: number): string {
  const eta = new Date(Date.now() + etaSeconds * 1000);
  const now = new Date();

  // If ETA is today, show time only
  if (eta.toDateString() === now.toDateString()) {
    return formatTime(eta);
  }

  // If ETA is tomorrow, show "Tomorrow HH:MM"
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (eta.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow ${formatTime(eta)}`;
  }

  // Otherwise show full date and time
  return formatDateTime(eta);
}

/**
 * Parse duration string to seconds
 */
export function parseDuration(duration: string): number {
  const parts = duration.toLowerCase().match(/(\d+)\s*([hms])/g);
  if (!parts) {
    return 0;
  }

  let seconds = 0;

  for (const part of parts) {
    const match = part.match(/(\d+)\s*([hms])/);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];

      switch (unit) {
        case 'h':
          seconds += value * 3600;
          break;
        case 'm':
          seconds += value * 60;
          break;
        case 's':
          seconds += value;
          break;
      }
    }
  }

  return seconds;
}

/**
 * Check if a date is within a time range
 */
export function isWithinRange(date: Date, startDate: Date, endDate: Date): boolean {
  return date >= startDate && date <= endDate;
}

/**
 * Get time until next occurrence of a specific time
 */
export function getTimeUntil(targetHour: number, targetMinute = 0): number {
  const now = new Date();
  const target = new Date();

  target.setHours(targetHour, targetMinute, 0, 0);

  // If target time has passed today, set it for tomorrow
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  return Math.floor((target.getTime() - now.getTime()) / 1000);
}
