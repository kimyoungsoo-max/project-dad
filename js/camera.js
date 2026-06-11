// =============================================
// camera.js — 카메라 모달 모듈
// 2단계 분리: 방문완료 버튼 → 카메라 모달 열림
// 아버님 돌발 행동 대응:
//   - 카메라 권한 거부 → "사진 없이 완료하기" 자동 안내
//   - 더블탭 0.8초 잠금
//   - 뒤로가기(popstate) 시 모달 자동 닫힘
// =============================================

const Camera = (() => {

  let _stream       = null;  // MediaStream 객체
  let _currentId    = null;  // 현재 촬영 중인 tourist_id
  let _onComplete   = null;  // 완료 콜백 (app.js에서 주입)
  let _isLocked     = false; // 더블탭 잠금 플래그

  const overlay   = document.getElementById('camera-overlay');
  const video     = document.getElementById('camera-video');
  const btnShutter     = document.getElementById('btn-shutter');
  const btnSkip        = document.getElementById('btn-skip-photo');

  /**
   * 카메라 모달 열기
   * @param {string}   id         - tourist_id
   * @param {Function} onComplete - 완료 시 콜백 (blob | null)
   */
  async function open(id, onComplete) {
    if (_isLocked) return;   // 더블탭 방지

    _currentId  = id;
    _onComplete = onComplete;
    overlay.classList.add('open');

    // 히스토리 스택에 추가 → 뒤로가기로 모달 닫힘
    history.pushState({ modal: 'camera' }, '');

    await _startCamera();
  }

  /**
   * 카메라 스트림 시작
   * 실패(권한 거부 등) 시 촬영 버튼 숨기고 "사진 없이 완료" 강조
   */
  async function _startCamera() {
    try {
      _stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // 후면 카메라 우선
        audio: false
      });
      video.srcObject = _stream;
      btnShutter.style.display = 'flex';

    } catch (err) {
      console.warn('[Camera] 카메라 권한 거부 또는 없음:', err);

      // 카메라 없어도 앱이 멈추면 안 됨 — 사진 없이 완료 강조
      btnShutter.style.display = 'none';
      video.style.display = 'none';

      // 안내 문구 추가
      const guide = overlay.querySelector('.camera-guide');
      if (guide) {
        guide.textContent = '사진 없이 완료할게요 📋';
      }
      const guideSub = overlay.querySelector('.camera-guide-sub');
      if (guideSub) {
        guideSub.textContent = '아래 버튼을 눌러 방문을 완료해 주세요';
      }
    }
  }

  /**
   * 사진 촬영 → Blob 반환
   */
  function _capture() {
    if (!_stream) return null;

    const canvas  = document.createElement('canvas');
    const track   = _stream.getVideoTracks()[0];
    const settings = track.getSettings();

    // 카메라 원본 해상도 사용 (단, 최대 1280px로 제한 — 용량 절약)
    const maxW = 1280;
    const ratio = Math.min(1, maxW / (settings.width || 1280));
    canvas.width  = Math.round((settings.width  || 1280) * ratio);
    canvas.height = Math.round((settings.height || 720)  * ratio);

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
    });
  }

  /**
   * 카메라 스트림 중지 + 모달 닫기
   */
  function close() {
    if (_stream) {
      _stream.getTracks().forEach(t => t.stop());
      _stream = null;
    }
    video.srcObject = null;
    video.style.display  = '';
    btnShutter.style.display = 'flex';

    // 안내 문구 원상복구
    const guide = overlay.querySelector('.camera-guide');
    if (guide) guide.innerHTML = '📷 지금 사진을<br>찍어주세요!';
    const guideSub = overlay.querySelector('.camera-guide-sub');
    if (guideSub) guideSub.textContent = '아래 버튼을 누르면 촬영돼요';

    overlay.classList.remove('open');
  }

// ── 이벤트 바인딩 ────────────────────────────

  // 📸 촬영 버튼
  btnShutter.addEventListener('click', async () => {
    if (_isLocked) return;
    _isLocked = true;
    btnShutter.disabled = true;

    const blob = await _capture();
    close();

    if (_onComplete) _onComplete({ status: 'captured', blob });

    setTimeout(() => {
      _isLocked = false;
      btnShutter.disabled = false;
    }, 800);
  });

  // 사진 없이 완료하기
  btnSkip.addEventListener('click', () => {
    if (_isLocked) return;
    _isLocked = true;

    close();
    if (_onComplete) _onComplete({ status: 'skipped', blob: null });

    setTimeout(() => { _isLocked = false; }, 800);
  });

  // 뒤로가기(물리 버튼 or 브라우저) → 취소 처리
  window.addEventListener('popstate', () => {
    if (overlay.classList.contains('open')) {
      close();
      if (_onComplete) _onComplete({ status: 'cancelled', blob: null });
    }
  });

  // 오버레이 바깥 터치 → 취소 처리
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
      if (_onComplete) _onComplete({ status: 'cancelled', blob: null });
    }
  });
  
  return { open, close };
})();