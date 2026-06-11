// =============================================
// app.js — 메인 컨트롤러
// 화면 전환 · 카드 렌더링 · 필터 · 진행 현황
// 아버님 돌발 행동 대응:
//   - 더블탭 0.8초 잠금
//   - popstate 뒤로가기 대응
//   - 이미지 로드 실패 → placeholder 자동 대체
// =============================================

(() => {

  // ── 상태 ─────────────────────────────────────
  let _allData      = [];   // 전체 258개 데이터
  let _regionSpots  = [];   // 현재 지역 명소
  let _filtered     = [];   // 필터 적용된 목록
  let _currentRegion = '';  // 현재 지역명
  let _currentFilter = '전체';
  let _visitLock    = false; // 방문완료 더블탭 잠금
  let _photoURLs    = {};   // 카드별 Object URL (메모리 해제용)

  // ── DOM ──────────────────────────────────────
  const screenMain   = document.getElementById('screen-main');
  const screenDetail = document.getElementById('screen-detail');
  const regionGrid   = document.getElementById('region-grid');
  const detailTitle  = document.getElementById('detail-title');
  const filterRow    = document.getElementById('filter-row');
  const cardList     = document.getElementById('card-list');
  const btnBack      = document.getElementById('btn-back');
  const toastEl      = document.getElementById('toast');

  // 진행 현황
  const progressLabel       = document.getElementById('progress-label');
  const progressVisited     = document.getElementById('progress-visited');
  const progressTotal       = document.getElementById('progress-total');
  const progressFill        = document.getElementById('progress-fill');
  const progressPct         = document.getElementById('progress-pct');
  const progressCompleteMsg = document.getElementById('progress-complete-msg');

  // Bottom Sheet
  const sheetOverlay = document.getElementById('bottom-sheet-overlay');
  const sheetTitle   = document.getElementById('sheet-title');
  const sheetDesc    = document.getElementById('sheet-desc');
  const btnSheetClose = document.getElementById('btn-sheet-close');

  // ── 지역 목록 ─────────────────────────────────
  const REGIONS = [
    { name: '경기도',   emoji: '🏙️' },
    { name: '강원도',   emoji: '🏔️' },
    { name: '충청북도', emoji: '🌲' },
    { name: '충청남도', emoji: '🌊' },
    { name: '전라북도', emoji: '🌾' },
    { name: '전라남도', emoji: '🐚' },
    { name: '경상북도', emoji: '🏯' },
    { name: '경상남도', emoji: '⛵' },
    { name: '제주도',   emoji: '🍊', jeju: true },
  ];

  // ── 초기화 ────────────────────────────────────
  async function init() {
    await Storage.initDB();
    await loadData();
    renderRegionGrid();
    bindEvents();
    registerSW();
  }

  // ── 데이터 로드 ───────────────────────────────
  async function loadData() {
    try {
      const res = await fetch('./data/dataset.json');
      _allData  = await res.json();
    } catch (err) {
      console.error('[App] 데이터 로드 실패:', err);
      showToast('데이터를 불러오지 못했어요 😢');
    }
  }

  // ── 지역 버튼 렌더링 ──────────────────────────
  function renderRegionGrid() {
    regionGrid.innerHTML = '';

    REGIONS.forEach(r => {
      const btn = document.createElement('button');
      btn.className = 'btn-region' + (r.jeju ? ' jeju' : '');
      btn.innerHTML = `${r.emoji} ${r.name}`;

      btn.addEventListener('click', () => goDetail(r.name));
      regionGrid.appendChild(btn);
    });
  }

  // ── 상세화면 진입 ─────────────────────────────
  async function goDetail(region) {
    _currentRegion = region;
    _currentFilter = '전체';

    // 해당 지역 데이터 필터
    _regionSpots = _allData.filter(d => d.tourist_region === region);
    _filtered    = [..._regionSpots];

    // 화면 전환
    screenMain.classList.remove('active');
    screenDetail.classList.add('active');
    detailTitle.textContent = region;

    // 필터 버튼 초기화
    document.querySelectorAll('.btn-filter').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === '전체');
    });

    // 지도 로드 + 핀 렌더링
    await Map.loadMap();
    Map.renderPins(_regionSpots);

    // 카드 + 진행 현황 렌더링
    await renderCards();
    updateProgress();

    // 히스토리 추가 → 뒤로가기 대응
    history.pushState({ screen: 'detail', region }, '');

    // 스크롤 상단으로
    document.querySelector('.detail-body').scrollTop = 0;
  }

  // ── 카드 렌더링 ───────────────────────────────
  async function renderCards() {
    // 기존 Object URL 메모리 해제
    Object.values(_photoURLs).forEach(url => Storage.revokeURL(url));
    _photoURLs = {};

    cardList.innerHTML = '';

    if (_filtered.length === 0) {
      cardList.innerHTML =
        '<div class="empty-msg">이 지역에 해당 카테고리 명소가 없어요 🙏</div>';
      return;
    }

    for (const spot of _filtered) {
      const card = await buildCard(spot);
      cardList.appendChild(card);
    }
  }

  // ── 카드 DOM 생성 ─────────────────────────────
  async function buildCard(spot) {
    const visited = Storage.isVisited(spot.tourist_id);

    // 이미지 URL 결정
    let imgSrc = './icons/placeholder.svg';
    if (visited) {
      const photoURL = await Storage.getPhotoURL(spot.tourist_id);
      if (photoURL) {
        imgSrc = photoURL;
        _photoURLs[spot.tourist_id] = photoURL; // 나중에 해제용
      }
    }

    // 설명글 15자 + 더보기
    const desc     = spot.tourist_description || '';
    const SHORT_LEN = 15;
    const isLong   = desc.length > SHORT_LEN;
    const shortDesc = isLong ? desc.slice(0, SHORT_LEN) : desc;

    const card = document.createElement('div');
    card.className = 'spot-card';
    card.dataset.id = spot.tourist_id;

    card.innerHTML = `
      <div class="card-img-wrap">
        <img
          class="card-img ${visited ? '' : 'grayscale'}"
          src="${imgSrc}"
          alt="${spot.tourist_name}"
          onerror="this.src='./icons/placeholder.svg'"
        />
        <div class="stamp-overlay ${visited ? 'visible' : ''}">✅</div>
      </div>
      <div class="card-content">
        <div class="card-name">${spot.tourist_name}</div>
        <div class="card-desc">
          ${shortDesc}${isLong
            ? `<button class="btn-more" data-id="${spot.tourist_id}">...더보기</button>`
            : ''}
        </div>
      </div>
      <div class="card-actions">
        <button class="btn-card btn-youtube"
          data-query="${encodeURIComponent(spot.youtube_query || spot.tourist_name)}">
          🎬<br>유튜브
        </button>
        <button class="btn-card btn-naver"
          data-name="${encodeURIComponent(spot.tourist_name)}">
          🗺️<br>지도
        </button>
        <button
          class="btn-card btn-visit ${visited ? 'visited' : ''}"
          data-id="${spot.tourist_id}"
          ${visited ? 'disabled' : ''}>
          ✅<br>${visited ? '다녀왔어요' : '방문완료'}
        </button>
      </div>
    `;

    // 카드 터치 → 핀 강조
    card.addEventListener('click', () => {
      Map.highlightPin(spot.tourist_id);
    });

    // 더보기 버튼
    const btnMore = card.querySelector('.btn-more');
    if (btnMore) {
      btnMore.addEventListener('click', e => {
        e.stopPropagation();
        openSheet(spot.tourist_name, desc);
      });
    }

    // 유튜브 버튼
    const btnYT = card.querySelector('.btn-youtube');
    btnYT.addEventListener('click', e => {
      e.stopPropagation();
      const query = btnYT.dataset.query;
      window.open(
        `https://www.youtube.com/results?search_query=${query}`,
        '_blank'
      );
    });

    // 네이버 지도 버튼
    const btnNaver = card.querySelector('.btn-naver');
    btnNaver.addEventListener('click', e => {
      e.stopPropagation();
      const name = btnNaver.dataset.name;
      window.open(
        `https://map.naver.com/search?query=${name}`,
        '_blank'
      );
    });

    // 방문완료 버튼
    const btnVisit = card.querySelector('.btn-visit');
    if (btnVisit && !visited) {
      btnVisit.addEventListener('click', e => {
        e.stopPropagation();
        handleVisit(spot, card, btnVisit);
      });
    }

    return card;
  }

  // ── 방문완료 처리 ─────────────────────────────
  function handleVisit(spot, card, btn) {
    if (_visitLock) return;
    _visitLock = true;
    btn.disabled = true;

    // 카메라 모달 열기 (2단계 분리)
    Camera.open(spot.tourist_id, async (result) => {

      // ✅ 취소 (뒤로가기 / 바깥 터치) → 방문완료 처리 안 함
      if (result.status === 'cancelled') {
        btn.disabled = false;
        _visitLock   = false;
        return;
      }

      // 사진 저장 (촬영한 경우만)
      if (result.status === 'captured' && result.blob) {
        try {
          await Storage.savePhoto(spot.tourist_id, result.blob);
          const imgEl = card.querySelector('.card-img');
          const url   = URL.createObjectURL(result.blob);
          _photoURLs[spot.tourist_id] = url;
          imgEl.src = url;
        } catch (err) {
          console.error('[App] 사진 저장 실패:', err);
        }
      }

      // 방문 완료 저장 (촬영 or 건너뜀 둘 다 처리)
      Storage.setVisited(spot.tourist_id);

      // 카드 UI 업데이트
      const imgEl   = card.querySelector('.card-img');
      const stampEl = card.querySelector('.stamp-overlay');
      imgEl.classList.remove('grayscale');
      stampEl.classList.add('visible');
      btn.innerHTML = '✅<br>다녀왔어요';
      btn.classList.add('visited');
      btn.disabled  = true;

      // 핀 색상 초록으로
      Map.markPinVisited(spot.tourist_id);

      // 진행 현황 바 업데이트
      updateProgress();

      // 토스트
      showToast(`${spot.tourist_name} 방문 완료! 🎉`);

      // 0.8초 후 잠금 해제
      setTimeout(() => { _visitLock = false; }, 800);
    });
  }
  
  // ── 진행 현황 업데이트 ────────────────────────
  function updateProgress() {
    const total   = _regionSpots.length;
    const visited = Storage.countVisited(_regionSpots);
    const pct     = total > 0 ? Math.round((visited / total) * 100) : 0;

    progressVisited.textContent = visited;
    progressTotal.textContent   = total;
    progressFill.style.width    = `${pct}%`;
    progressPct.textContent     = `${pct}%`;

    if (visited === total && total > 0) {
      // 완주!
      progressLabel.textContent = `${visited}곳 완주! 🏆`;
      progressFill.classList.add('complete');
      progressCompleteMsg.style.display = 'block';
      progressCompleteMsg.textContent   =
        `${visited}곳 완주! 🏆 대단해요 아버님!`;
    } else {
      progressLabel.textContent = `${visited}곳 다녀왔어요!`;
      progressFill.classList.remove('complete');
      progressCompleteMsg.style.display = 'none';
    }
  }

  // ── 필터 ─────────────────────────────────────
  function applyFilter(cat) {
    _currentFilter = cat;
    _filtered = cat === '전체'
      ? [..._regionSpots]
      : _regionSpots.filter(s => s.tourist_category === cat);

    renderCards();
    Map.renderPins(_filtered);
  }

  // ── Bottom Sheet ──────────────────────────────
  function openSheet(name, desc) {
    sheetTitle.textContent = name;
    sheetDesc.textContent  = desc;
    sheetOverlay.classList.add('open');
    history.pushState({ modal: 'sheet' }, '');
  }

  function closeSheet() {
    sheetOverlay.classList.remove('open');
  }

  // ── 토스트 메시지 ─────────────────────────────
  let _toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2500);
  }

  // ── 이벤트 바인딩 ─────────────────────────────
  function bindEvents() {

    // 뒤로가기 버튼
    btnBack.addEventListener('click', goBack);

    // 필터 버튼
    filterRow.addEventListener('click', e => {
      const btn = e.target.closest('.btn-filter');
      if (!btn) return;
      document.querySelectorAll('.btn-filter')
        .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilter(btn.dataset.cat);
    });

    // Bottom Sheet 닫기
    btnSheetClose.addEventListener('click', closeSheet);
    sheetOverlay.addEventListener('click', e => {
      if (e.target === sheetOverlay) closeSheet();
    });

    // 뒤로가기 (브라우저/물리 버튼)
    window.addEventListener('popstate', e => {
      // 카메라 모달은 camera.js에서 처리
      if (document.getElementById('camera-overlay')
            .classList.contains('open')) return;

      // Bottom Sheet 열려 있으면 닫기
      if (sheetOverlay.classList.contains('open')) {
        closeSheet();
        return;
      }

      // 상세화면 → 메인화면
      if (screenDetail.classList.contains('active')) {
        goBack();
      }
    });
  }

  // ── 뒤로가기 처리 ─────────────────────────────
  function goBack() {
    // Object URL 메모리 해제
    Object.values(_photoURLs).forEach(url => Storage.revokeURL(url));
    _photoURLs = {};

    Map.resetPins();

    screenDetail.classList.remove('active');
    screenMain.classList.add('active');

    _regionSpots  = [];
    _filtered     = [];
    _currentRegion = '';
  }

  // ── 서비스 워커 등록 ──────────────────────────
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('[SW] 등록 완료'))
        .catch(err => console.error('[SW] 등록 실패:', err));
    }
  }

  // ── 앱 시작 ───────────────────────────────────
  init();

})();