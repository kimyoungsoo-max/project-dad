// =============================================
// app.js — 메인 컨트롤러 v4
// 화면 전환 · 카드 렌더링 · 필터 · 진행 현황
// 아버님 돌발 행동 대응:
//   - 더블탭 0.8초 잠금
//   - popstate 뒤로가기 대응
//   - 이미지 로드 실패 → placeholder 자동 대체
//   - 카메라 popstate 이중 발화 방지
// =============================================

(() => {

  // ── 상태 ─────────────────────────────────────
  let _allData       = [];
  let _regionSpots   = [];
  let _filtered      = [];
  let _currentRegion = '';
  let _currentFilter = '전체';
  let _visitLock     = false;
  let _photoURLs     = {};

  // ── DOM ──────────────────────────────────────
  const screenMain   = document.getElementById('screen-main');
  const screenDetail = document.getElementById('screen-detail');
  const regionGrid   = document.getElementById('region-grid');
  const detailTitle  = document.getElementById('detail-title');
  const filterRow    = document.getElementById('filter-row');
  const cardList     = document.getElementById('card-list');
  const btnBack      = document.getElementById('btn-back');
  const toastEl      = document.getElementById('toast');

  const progressLabel       = document.getElementById('progress-label');
  const progressVisited     = document.getElementById('progress-visited');
  const progressTotal       = document.getElementById('progress-total');
  const progressFill        = document.getElementById('progress-fill');
  const progressPct         = document.getElementById('progress-pct');
  const progressCompleteMsg = document.getElementById('progress-complete-msg');

  const sheetOverlay  = document.getElementById('bottom-sheet-overlay');
  const sheetTitle    = document.getElementById('sheet-title');
  const sheetDesc     = document.getElementById('sheet-desc');
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

  // ── 지역 버튼 렌더링 — 옵션 B 구조 ───────────
  function renderRegionGrid() {
    regionGrid.innerHTML = '';
    REGIONS.forEach(r => {
      const btn = document.createElement('button');
      btn.className = 'btn-region' + (r.jeju ? ' jeju' : '');
      btn.innerHTML = `
        <span class="btn-region-emoji">${r.emoji}</span>
        <span class="btn-region-name">${r.name}</span>
      `;
      btn.addEventListener('click', () => goDetail(r.name));
      regionGrid.appendChild(btn);
    });
  }

  // ── 상세화면 진입 ─────────────────────────────
  async function goDetail(region) {
    _currentRegion = region;
    _currentFilter = '전체';

    _regionSpots = _allData.filter(d => d.tourist_region === region);
    _filtered    = [..._regionSpots];

    screenMain.classList.remove('active');
    screenDetail.classList.add('active');
    detailTitle.textContent = region;

    document.querySelectorAll('.btn-filter').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === '전체');
    });

    await Map.loadMap();
    Map.renderPins(_regionSpots);

    await renderCards();
    updateProgress();

    history.pushState({ screen: 'detail', region }, '');
    document.querySelector('.detail-body').scrollTop = 0;
  }

  // ── 카드 렌더링 ───────────────────────────────
  async function renderCards() {
    Object.values(_photoURLs).forEach(url => Storage.revokeURL(url));
    _photoURLs     = {};
    cardList.innerHTML = '';

    if (_filtered.length === 0) {
      cardList.innerHTML = '<div class="empty-msg">이 지역에 해당 카테고리 명소가 없어요 🙏</div>';
      return;
    }
    for (const spot of _filtered) {
      const card = await buildCard(spot);
      cardList.appendChild(card);
    }
  }

  // ── 카드 DOM 생성 — 옵션 B 구조 ──────────────
  async function buildCard(spot) {
    const visited = Storage.isVisited(spot.tourist_id);

    let imgSrc = './icons/placeholder.svg';
    if (visited) {
      const photoURL = await Storage.getPhotoURL(spot.tourist_id);
      if (photoURL) {
        imgSrc = photoURL;
        _photoURLs[spot.tourist_id] = photoURL;
      }
    }

    const desc      = spot.tourist_description || '';
    const isLong    = desc.length > 20;
    const shortDesc = isLong ? desc.slice(0, 15) : desc;

    const card = document.createElement('div');
    card.className = 'spot-card' + (visited ? ' visited-card' : '');
    card.dataset.id = spot.tourist_id;

    card.innerHTML = `
      <div class="card-img-wrap">
        <img
          class="card-img ${visited ? '' : 'grayscale'}"
          src="${imgSrc}"
          alt="${spot.tourist_name}"
          onerror="this.src='./icons/placeholder.svg'"
        />
        <div class="card-category-badge">${spot.tourist_category || ''}</div>
        <div class="stamp-overlay ${visited ? 'visible' : ''}">
          <div class="stamp-fallback"><span>방문<br>완료</span></div>
        </div>
      </div>
      <div class="card-content">
        <div class="card-name">${spot.tourist_name}</div>
        <div class="card-address">${spot.tourist_address || ''}</div>
        <div class="card-desc">
          ${shortDesc}${isLong
            ? `<button class="btn-more" data-id="${spot.tourist_id}">...더보기</button>`
            : ''}
        </div>
      </div>
      <div class="card-divider"></div>
      <div class="card-actions">
        <button class="btn-card btn-youtube"
          data-query="${encodeURIComponent(spot.youtube_query || spot.tourist_name)}">
          <span class="btn-card-icon">🎬</span>
          <span class="btn-card-label">유튜브</span>
        </button>
        <button class="btn-card btn-naver"
          data-name="${encodeURIComponent(spot.tourist_name)}">
          <span class="btn-card-icon">🗺️</span>
          <span class="btn-card-label">지도</span>
        </button>
        <button
          class="btn-card btn-visit ${visited ? 'visited' : ''}"
          data-id="${spot.tourist_id}"
          ${visited ? 'disabled' : ''}>
          <span class="btn-card-icon">✅</span>
          <span class="btn-card-label">${visited ? '다녀왔어요' : '방문완료'}</span>
        </button>
      </div>
    `;

    card.addEventListener('click', () => Map.highlightPin(spot.tourist_id));

    const btnMore = card.querySelector('.btn-more');
    if (btnMore) {
      btnMore.addEventListener('click', e => {
        e.stopPropagation();
        openSheet(spot.tourist_name, desc);
      });
    }

    card.querySelector('.btn-youtube').addEventListener('click', e => {
      e.stopPropagation();
      window.open(
        `https://www.youtube.com/results?search_query=${e.currentTarget.dataset.query}`,
        '_blank'
      );
    });

    card.querySelector('.btn-naver').addEventListener('click', e => {
      e.stopPropagation();
      window.open(
        `https://map.naver.com/search?query=${e.currentTarget.dataset.name}`,
        '_blank'
      );
    });

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
    _visitLock   = true;
    btn.disabled = true;

    Camera.open(spot.tourist_id, async (result) => {

      if (result.status === 'cancelled') {
        btn.disabled = false;
        _visitLock   = false;
        return;
      }

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

      Storage.setVisited(spot.tourist_id);

      const imgEl   = card.querySelector('.card-img');
      const stampEl = card.querySelector('.stamp-overlay');
      imgEl.classList.remove('grayscale');
      stampEl.classList.add('visible');
      card.classList.add('visited-card');
      btn.innerHTML = '<span class="btn-card-icon">✅</span><span class="btn-card-label">다녀왔어요</span>';
      btn.classList.add('visited');
      btn.disabled = true;

      Map.markPinVisited(spot.tourist_id);
      updateProgress();
      showToast(`${spot.tourist_name} 방문 완료! 🎉`);

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
      progressLabel.textContent         = `${visited}곳 완주! 🏆`;
      progressFill.classList.add('complete');
      progressCompleteMsg.style.display = 'block';
      progressCompleteMsg.textContent   = `${visited}곳 완주! 🏆 대단해요 아버님!`;
    } else {
      progressLabel.textContent         = `${visited}곳 다녀왔어요!`;
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

  // ── 토스트 ────────────────────────────────────
  let _toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
  }

  // ── 이벤트 바인딩 ─────────────────────────────
  function bindEvents() {

    btnBack.addEventListener('click', goBack);

    filterRow.addEventListener('click', e => {
      const btn = e.target.closest('.btn-filter');
      if (!btn) return;
      document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilter(btn.dataset.cat);
    });

    btnSheetClose.addEventListener('click', closeSheet);
    sheetOverlay.addEventListener('click', e => {
      if (e.target === sheetOverlay) closeSheet();
    });

    // ✅ 카메라 popstate 이중 발화 방지
    window.addEventListener('popstate', e => {
      const camOverlay = document.getElementById('camera-overlay');
      if (camOverlay.classList.contains('open')) return;

      if (sheetOverlay.classList.contains('open')) {
        closeSheet();
        return;
      }
      if (screenDetail.classList.contains('active')) {
        goBack();
      }
    });
  }

  // ── 뒤로가기 ─────────────────────────────────
  function goBack() {
    Object.values(_photoURLs).forEach(url => Storage.revokeURL(url));
    _photoURLs     = {};
    Map.resetPins();
    screenDetail.classList.remove('active');
    screenMain.classList.add('active');
    _regionSpots   = [];
    _filtered      = [];
    _currentRegion = '';
  }

  // ── 서비스 워커 ───────────────────────────────
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('[SW] 등록 완료'))
        .catch(err => console.error('[SW] 등록 실패:', err));
    }
  }

  init();

})();
