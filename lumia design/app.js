/**
 * Lumia Photobooth - Main Application Controller
 * SPA State Management, Camera Stream, Studio Compositor & PNG Exporter.
 */

document.addEventListener('DOMContentLoaded', () => {

  // State Management
  const state = {
    currentScreen: 1,
    photoCount: 4,
    capturedPhotos: [],
    selectedFrameId: 'frame-lumia-classic',
    selectedFilterId: 'filter-normal',
    isCapturing: false,
    cameraStream: null,
    mockAnimationId: null
  };

  // Filter Definitions
  const FILTERS = [
    { id: 'filter-normal', name: 'Normal', css: 'none' },
    { id: 'filter-vintage', name: 'Vintage Warm', css: 'sepia(0.35) contrast(1.1) brightness(1.05) saturate(1.2)' },
    { id: 'filter-bw', name: 'Monochrome', css: 'grayscale(1) contrast(1.2) brightness(0.95)' },
    { id: 'filter-pastel', name: 'Soft Pastel', css: 'saturate(1.3) brightness(1.1) hue-rotate(-10deg)' },
    { id: 'filter-cyber', name: 'Cyber Neon', css: 'hue-rotate(190deg) saturate(1.8) contrast(1.1)' },
    { id: 'filter-sepia', name: 'Retro Sepia', css: 'sepia(0.85) contrast(1.1) brightness(0.95)' },
    { id: 'filter-sharp', name: 'Vibrant Pop', css: 'contrast(1.35) saturate(1.5)' }
  ];

  // DOM Elements
  const DOM = {
    stepLabel: document.getElementById('step-label'),
    stepDotsContainer: document.getElementById('step-dots'),
    globalResetBtn: document.getElementById('btn-global-reset'),

    // Page Buttons
    startSessionBtn: document.getElementById('btn-start-session'),
    countCards: document.querySelectorAll('.count-card'),
    confirmCountBtn: document.getElementById('btn-confirm-count'),
    startCameraBtn: document.getElementById('btn-start-camera'),

    // Camera DOM
    cameraVideo: document.getElementById('camera-video'),
    cameraMockCanvas: document.getElementById('camera-mock-canvas'),
    hudPhotoCounter: document.getElementById('hud-photo-counter'),
    capturedCountLabel: document.getElementById('captured-count'),
    totalCountTargetLabel: document.getElementById('total-count-target'),
    thumbSlotsContainer: document.getElementById('thumb-slots-container'),
    countdownOverlay: document.getElementById('countdown-overlay'),
    countdownNumber: document.getElementById('countdown-number'),
    flashOverlay: document.getElementById('flash-overlay'),
    triggerShutterBtn: document.getElementById('btn-trigger-shutter'),

    // Results DOM
    resultsGalleryGrid: document.getElementById('results-gallery-grid'),
    retakePhotosBtn: document.getElementById('btn-retake-photos'),
    proceedToStudioBtn: document.getElementById('btn-proceed-to-studio'),

    // Studio DOM
    studioCanvas: document.getElementById('studio-composite-canvas'),
    studioTabBtns: document.querySelectorAll('.studio-tab-btn'),
    studioTabContents: document.querySelectorAll('.studio-tab-content'),
    framesOptionsGrid: document.getElementById('frames-options-grid'),
    filtersOptionsGrid: document.getElementById('filters-options-grid'),
    proceedToFinalBtn: document.getElementById('btn-proceed-to-final'),

    // Final DOM
    finalCanvas: document.getElementById('final-composite-canvas'),
    downloadPngBtn: document.getElementById('btn-download-png'),
    restartAppBtn: document.getElementById('btn-restart-app')
  };

  // Router
  function goToScreen(screenNumber) {
    if (screenNumber < 1 || screenNumber > 7) return;

    document.querySelectorAll('.screen-page').forEach(sec => sec.classList.remove('active'));

    const targetSection = document.getElementById(`screen-${screenNumber}`);
    if (targetSection) {
      targetSection.classList.add('active');
    }

    state.currentScreen = screenNumber;
    updateHeaderUI();
    onScreenEnter(screenNumber);
  }

  function updateHeaderUI() {
    if (DOM.stepLabel) DOM.stepLabel.textContent = `PAGE ${state.currentScreen} OF 7`;
    if (DOM.stepDotsContainer) {
      const dots = DOM.stepDotsContainer.querySelectorAll('.step-dot');
      dots.forEach((dot, idx) => {
        dot.classList.remove('active', 'completed');
        if (idx + 1 === state.currentScreen) {
          dot.classList.add('active');
        } else if (idx + 1 < state.currentScreen) {
          dot.classList.add('completed');
        }
      });
    }
  }

  function onScreenEnter(screenNumber) {
    switch (screenNumber) {
      case 4:
        initCameraScreen();
        break;
      case 5:
        stopCameraStream();
        renderResultsGallery();
        break;
      case 6:
        renderStudioControls();
        renderStudioComposite();
        break;
      case 7:
        renderFinalComposite();
        break;
      default:
        stopCameraStream();
        break;
    }
  }

  // Camera & Mock Engine
  async function initCameraScreen() {
    state.capturedPhotos = [];
    DOM.capturedCountLabel.textContent = '0';
    DOM.totalCountTargetLabel.textContent = state.photoCount;
    DOM.hudPhotoCounter.textContent = `Foto 1 dari ${state.photoCount}`;

    renderThumbSlots();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' },
        audio: false
      });
      state.cameraStream = stream;
      DOM.cameraVideo.srcObject = stream;
      DOM.cameraVideo.style.display = 'block';
      DOM.cameraMockCanvas.style.display = 'none';
    } catch (err) {
      console.warn('Webcam unavailable. Starting mock camera.', err);
      startMockCamera();
    }
  }

  function stopCameraStream() {
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(track => track.stop());
      state.cameraStream = null;
    }
    if (state.mockAnimationId) {
      cancelAnimationFrame(state.mockAnimationId);
      state.mockAnimationId = null;
    }
  }

  function startMockCamera() {
    DOM.cameraVideo.style.display = 'none';
    DOM.cameraMockCanvas.style.display = 'block';

    const canvas = DOM.cameraMockCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = 640;
    canvas.height = 480;

    let time = 0;
    function drawMock() {
      time += 0.03;
      ctx.fillStyle = '#FFF5E4';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = 'rgba(255, 82, 50, 0.15)';
      ctx.beginPath();
      ctx.arc(320 + Math.sin(time) * 40, 240 + Math.cos(time) * 30, 180, 0, Math.PI * 2);
      ctx.fill();

      // Avatar placeholder
      ctx.fillStyle = '#1E1E1E';
      ctx.beginPath();
      ctx.arc(320, 200, 60, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(320, 380, 120, 100, 0, 0, Math.PI * 2);
      ctx.fill();

      // Badge
      ctx.fillStyle = '#FF5232';
      ctx.font = 'bold 16px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('📸 DEMO MOCK CAMERA FEED', 320, 50);

      state.mockAnimationId = requestAnimationFrame(drawMock);
    }
    drawMock();
  }

  function renderThumbSlots() {
    DOM.thumbSlotsContainer.innerHTML = '';
    for (let i = 0; i < state.photoCount; i++) {
      const slot = document.createElement('div');
      slot.className = `thumb-slot ${state.capturedPhotos[i] ? 'captured' : ''}`;
      if (state.capturedPhotos[i]) {
        const img = document.createElement('img');
        img.src = state.capturedPhotos[i];
        slot.appendChild(img);
      } else {
        slot.textContent = `#${i + 1}`;
      }
      DOM.thumbSlotsContainer.appendChild(slot);
    }
  }

  async function startCaptureSequence() {
    if (state.isCapturing) return;
    state.isCapturing = true;

    for (let photoIdx = state.capturedPhotos.length; photoIdx < state.photoCount; photoIdx++) {
      DOM.hudPhotoCounter.textContent = `Foto ${photoIdx + 1} dari ${state.photoCount}`;

      await runCountdown(3);
      triggerFlashEffect();

      const photoDataUrl = captureCurrentFrame();
      state.capturedPhotos.push(photoDataUrl);

      DOM.capturedCountLabel.textContent = state.capturedPhotos.length;
      renderThumbSlots();

      if (photoIdx < state.photoCount - 1) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    state.isCapturing = false;
    setTimeout(() => goToScreen(5), 800);
  }

  function runCountdown(seconds) {
    return new Promise(resolve => {
      let count = seconds;
      DOM.countdownOverlay.classList.add('active');
      DOM.countdownNumber.textContent = count;

      const timer = setInterval(() => {
        count--;
        if (count > 0) {
          DOM.countdownNumber.textContent = count;
        } else {
          clearInterval(timer);
          DOM.countdownOverlay.classList.remove('active');
          resolve();
        }
      }, 900);
    });
  }

  function triggerFlashEffect() {
    DOM.flashOverlay.classList.add('active');
    setTimeout(() => DOM.flashOverlay.classList.remove('active'), 350);
  }

  function captureCurrentFrame() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 800;
    tempCanvas.height = 600;
    const ctx = tempCanvas.getContext('2d');

    ctx.translate(tempCanvas.width, 0);
    ctx.scale(-1, 1);

    if (state.cameraStream && DOM.cameraVideo.style.display !== 'none') {
      ctx.drawImage(DOM.cameraVideo, 0, 0, tempCanvas.width, tempCanvas.height);
    } else {
      ctx.drawImage(DOM.cameraMockCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
    }

    return tempCanvas.toDataURL('image/jpeg', 0.92);
  }

  // Results Gallery
  function renderResultsGallery() {
    DOM.resultsGalleryGrid.innerHTML = '';
    state.capturedPhotos.forEach(photoUrl => {
      const item = document.createElement('div');
      item.className = 'result-card-item';
      const img = document.createElement('img');
      img.src = photoUrl;
      item.appendChild(img);
      DOM.resultsGalleryGrid.appendChild(item);
    });
  }

  // Studio & Compositor
  function renderStudioControls() {
    DOM.framesOptionsGrid.innerHTML = '';
    window.LUMIA_FRAMES.forEach(frame => {
      const card = document.createElement('div');
      card.className = `option-card ${state.selectedFrameId === frame.id ? 'selected' : ''}`;
      card.onclick = () => {
        state.selectedFrameId = frame.id;
        renderStudioControls();
        renderStudioComposite();
      };

      const prevBox = document.createElement('div');
      prevBox.className = 'option-preview-box';
      prevBox.style.background = frame.bgColor;
      prevBox.style.color = frame.textColor;
      prevBox.style.border = `2px solid ${frame.borderColor}`;
      prevBox.textContent = frame.name;

      const title = document.createElement('div');
      title.className = 'option-title';
      title.textContent = frame.name;

      card.appendChild(prevBox);
      card.appendChild(title);
      DOM.framesOptionsGrid.appendChild(card);
    });

    DOM.filtersOptionsGrid.innerHTML = '';
    FILTERS.forEach(filter => {
      const card = document.createElement('div');
      card.className = `option-card ${state.selectedFilterId === filter.id ? 'selected' : ''}`;
      card.onclick = () => {
        state.selectedFilterId = filter.id;
        renderStudioControls();
        renderStudioComposite();
      };

      const prevBox = document.createElement('div');
      prevBox.className = 'option-preview-box';
      prevBox.style.background = '#FFF5E4';
      prevBox.style.filter = filter.css;
      prevBox.textContent = '✨';

      const title = document.createElement('div');
      title.className = 'option-title';
      title.textContent = filter.name;

      card.appendChild(prevBox);
      card.appendChild(title);
      DOM.filtersOptionsGrid.appendChild(card);
    });
  }

  function renderStudioComposite() {
    drawCompositeOnCanvas(DOM.studioCanvas);
  }

  function renderFinalComposite() {
    drawCompositeOnCanvas(DOM.finalCanvas);
  }

  function drawCompositeOnCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const width = 600;
    const height = 800;
    canvas.width = width;
    canvas.height = height;

    const currentFrame = window.LUMIA_FRAMES.find(f => f.id === state.selectedFrameId) || window.LUMIA_FRAMES[0];
    const currentFilter = FILTERS.find(f => f.id === state.selectedFilterId) || FILTERS[0];

    // Frame Background
    ctx.fillStyle = currentFrame.bgColor;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = currentFrame.borderColor;
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, width - 14, height - 14);

    // Photos Grid
    const padding = 24;
    const photos = state.capturedPhotos;
    const count = Math.min(photos.length, state.photoCount);

    ctx.filter = currentFilter.css;

    if (count === 1) {
      const photoW = width - (padding * 2);
      const photoH = height - (padding * 2) - 60;
      drawSinglePhoto(ctx, photos[0], padding, padding, photoW, photoH);
    } else if (count === 2) {
      const photoW = width - (padding * 2);
      const photoH = (height - (padding * 3) - 60) / 2;
      drawSinglePhoto(ctx, photos[0], padding, padding, photoW, photoH);
      drawSinglePhoto(ctx, photos[1], padding, padding * 2 + photoH, photoW, photoH);
    } else if (count === 3) {
      const photoW = width - (padding * 2);
      const photoH = (height - (padding * 4) - 60) / 3;
      for (let i = 0; i < 3; i++) {
        drawSinglePhoto(ctx, photos[i], padding, padding + i * (photoH + padding), photoW, photoH);
      }
    } else if (count === 6) {
      const gap = 12;
      const photoW = (width - (padding * 2) - gap) / 2;
      const photoH = (height - (padding * 2) - (gap * 2) - 60) / 3;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 2; c++) {
          const idx = r * 2 + c;
          if (photos[idx]) {
            drawSinglePhoto(ctx, photos[idx], padding + c * (photoW + gap), padding + r * (photoH + gap), photoW, photoH);
          }
        }
      }
    } else {
      const gap = 16;
      const photoW = (width - (padding * 2) - gap) / 2;
      const photoH = (height - (padding * 2) - gap - 60) / 2;
      drawSinglePhoto(ctx, photos[0], padding, padding, photoW, photoH);
      drawSinglePhoto(ctx, photos[1], padding + photoW + gap, padding, photoW, photoH);
      drawSinglePhoto(ctx, photos[2], padding, padding + photoH + gap, photoW, photoH);
      drawSinglePhoto(ctx, photos[3], padding + photoW + gap, padding + photoH + gap, photoW, photoH);
    }

    ctx.filter = 'none';

    // Branding Footer
    ctx.fillStyle = currentFrame.textColor;
    ctx.font = '800 18px Plus Jakarta Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(currentFrame.watermark, width / 2, height - 26);
  }

  function drawSinglePhoto(ctx, dataUrl, x, y, w, h) {
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 12);
      ctx.clip();
      ctx.drawImage(img, x, y, w, h);
      ctx.restore();
    };
    img.src = dataUrl;
  }

  // Event Listeners
  function setupEventListeners() {
    DOM.startSessionBtn.addEventListener('click', () => goToScreen(2));

    DOM.countCards.forEach(card => {
      card.addEventListener('click', () => {
        DOM.countCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        state.photoCount = parseInt(card.dataset.count, 10);
      });
    });

    DOM.confirmCountBtn.addEventListener('click', () => goToScreen(3));
    DOM.startCameraBtn.addEventListener('click', () => goToScreen(4));
    DOM.triggerShutterBtn.addEventListener('click', startCaptureSequence);

    DOM.retakePhotosBtn.addEventListener('click', () => {
      state.capturedPhotos = [];
      goToScreen(4);
    });

    DOM.proceedToStudioBtn.addEventListener('click', () => goToScreen(6));

    DOM.studioTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        DOM.studioTabBtns.forEach(b => b.classList.remove('active'));
        DOM.studioTabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
      });
    });

    DOM.proceedToFinalBtn.addEventListener('click', () => goToScreen(7));

    DOM.downloadPngBtn.addEventListener('click', () => {
      const link = document.createElement('a');
      link.download = `Lumia_Photobooth_${Date.now()}.png`;
      link.href = DOM.finalCanvas.toDataURL('image/png');
      link.click();
    });

    if (DOM.globalResetBtn) DOM.globalResetBtn.addEventListener('click', resetApp);
    if (DOM.restartAppBtn) DOM.restartAppBtn.addEventListener('click', resetApp);

    document.querySelectorAll('.btn-back').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetScreen = parseInt(btn.dataset.to, 10);
        if (targetScreen) goToScreen(targetScreen);
      });
    });
  }

  function resetApp() {
    state.capturedPhotos = [];
    state.selectedFrameId = 'frame-lumia-classic';
    state.selectedFilterId = 'filter-normal';
    stopCameraStream();
    goToScreen(1);
  }

  setupEventListeners();
  goToScreen(1);
});
