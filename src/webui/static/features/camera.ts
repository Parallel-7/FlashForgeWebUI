/**
 * @fileoverview Camera streaming helpers for the WebUI client using go2rtc.
 *
 * Unified camera streaming uses go2rtc as the streaming gateway. All camera
 * types (MJPEG and RTSP) are handled through go2rtc, which provides
 * WebRTC/MSE/MJPEG fallback for browser playback.
 */

import type { CameraProxyConfigResponse } from '../app.js';
import { state } from '../core/AppState.js';
import { apiRequest } from '../core/Transport.js';
import { $, hideElement, showElement } from '../shared/dom.js';

interface VideoRTCElement extends HTMLElement {
  src: string;
  mode: string;
  media: string;
}

let videoRtcElement: VideoRTCElement | null = null;
let showFpsOverlay = false;

function updateFpsDisplay(): void {
  const overlay = $('camera-fps-overlay');
  if (!overlay) {
    return;
  }

  if (!showFpsOverlay) {
    overlay.classList.add('hidden');
    return;
  }

  overlay.classList.remove('hidden');
  overlay.textContent = videoRtcElement ? 'Streaming' : 'Offline';
}

function destroyVideoRtcPlayer(): void {
  if (videoRtcElement) {
    try {
      videoRtcElement.remove();
    } catch (error) {
      console.warn('[Camera] Failed to destroy video-rtc player:', error);
    } finally {
      videoRtcElement = null;
    }
  }
}

export function teardownCameraStreamElements(): void {
  showFpsOverlay = false;
  destroyVideoRtcPlayer();

  const placeholder = $('camera-placeholder');
  if (placeholder) {
    placeholder.textContent = 'Camera offline';
  }
  showElement('camera-placeholder');

  updateFpsDisplay();
}

function createVideoRtcElement(wsUrl: string, mode: string): VideoRTCElement {
  const element = document.createElement('video-rtc') as VideoRTCElement;

  element.src = wsUrl;
  element.mode = mode;
  element.media = 'video';

  element.style.width = '100%';
  element.style.height = '100%';
  element.style.objectFit = 'cover';
  element.style.display = 'block';

  return element;
}

export async function loadCameraStream(): Promise<void> {
  const cameraPlaceholder = $('camera-placeholder');
  const cameraContainer = $('camera-container');

  if (!cameraPlaceholder || !cameraContainer) {
    console.error('[Camera] Required DOM elements not found');
    return;
  }

  if (state.authRequired && !state.authToken) {
    console.warn('[Camera] Skipping stream load due to missing auth token');
    teardownCameraStreamElements();
    return;
  }

  try {
    const config = await apiRequest<CameraProxyConfigResponse>('/api/camera/proxy-config');

    if (!config.success) {
      throw new Error(config.error || 'Failed to get camera configuration');
    }

    if (!config.wsUrl) {
      throw new Error('No WebSocket URL provided for camera stream');
    }

    destroyVideoRtcPlayer();
    hideElement('camera-placeholder');

    showFpsOverlay = config.showCameraFps ?? false;

    const mode = config.mode || 'webrtc,mse,mjpeg';
    videoRtcElement = createVideoRtcElement(config.wsUrl, mode);
    cameraContainer.appendChild(videoRtcElement);

    console.log(`[Camera] go2rtc stream started: ${config.wsUrl} (mode: ${mode})`);
    updateFpsDisplay();
  } catch (error) {
    console.error('[Camera] Failed to load camera stream:', error);

    teardownCameraStreamElements();

    if (cameraPlaceholder) {
      const errorMessage = error instanceof Error ? error.message : 'Camera Configuration Error';
      cameraPlaceholder.textContent = errorMessage;
    }
    showElement('camera-placeholder');
  }
}

export function initializeCamera(): void {
  if (!state.printerFeatures?.hasCamera) {
    teardownCameraStreamElements();
    return;
  }

  void loadCameraStream();
}
