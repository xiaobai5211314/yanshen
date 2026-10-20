/**
 * 纯净盐神 (YanShen Pure) - Hexo Fluid 经典纯净引擎
 * 1:1 复刻 https://onehu.xyz/ 经典排版与交互体验
 */

class ArticleDB {
  constructor() {
    this.dbName = 'yanshen_cache_v2';
    this.storeName = 'articles';
    this.db = null;
  }

  async init() {
    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      request.onerror = () => resolve(null);
    });
  }

  async get(id) {
    if (!this.db) await this.init();
    if (!this.db) return null;
    return new Promise((resolve) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const req = tx.objectStore(this.storeName).get(Number(id));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async set(article) {
    if (!this.db) await this.init();
    if (!this.db) return false;
    return new Promise((resolve) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).put(article);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }
}

class FluidYanShenApp {
  constructor() {
    this.db = new ArticleDB();
    this.allArticles = [];
    this.presets = {};
    this.categoriesMap = new Map();
    this.currentView = 'home';
    this.currentArticleId = null;
    this.pageSize = 15;
    this.theme = localStorage.getItem('fluid_theme') || 'light';
    this.progress = JSON.parse(localStorage.getItem('fluid_progress') || '{}');

    this.initElements();
    this.initTheme();
    this.bindEvents();
    this.loadData();
  }

  initElements() {
    this.els = {
      navbar: document.getElementById('navbar'),
      banner: document.getElementById('banner'),
      bannerTitle: document.getElementById('bannerTitle'),
      bannerSubtitle: document.getElementById('bannerSubtitle'),
      bannerMeta: document.getElementById('bannerMeta'),
      board: document.getElementById('board'),
      topProgressBar: document.getElementById('topProgressBar'),
      searchModal: document.getElementById('searchModal'),
      searchInput: document.getElementById('searchInput'),
      searchResults: document.getElementById('searchResults'),
      btnOpenSearch: document.getElementById('btnOpenSearch'),
      btnCloseSearch: document.getElementById('btnCloseSearch'),
      btnToggleTheme: document.getElementById('btnToggleTheme'),
      themeIcon: document.getElementById('themeIcon'),
      toast: document.getElementById('toastNotice'),
      navHome: document.getElementById('navHome'),
      navCategories: document.getElementById('navCategories'),
      navPresets: document.getElementById('navPresets'),
    };
  }

  initTheme() {
    document.documentElement.setAttribute('data-user-color-scheme', this.theme);
    if (this.els.themeIcon) {
      this.els.themeIcon.textContent = this.theme === 'dark' ? '☀️' : '🌓';
    }
  }

  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('fluid_theme', this.theme);
    this.initTheme();
    this.showToast(`已切换至${this.theme === 'dark' ? '暗黑' : '明亮'}模式`);
  }

  showToast(msg, duration = 2000) {
    if (!this.els.toast) return;
    this.els.toast.textContent = msg;
    this.els.toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.els.toast.classList.remove('show');
    }, duration);
  }

  async loadData() {
    try {
      const CDN_BASE = 'https://guzhicdn.21212121.xyz/yanshen/';
      const fetchWithFallback = async (relPath) => {
        try {
          const res = await fetch(relPath);
          if (res.ok) return await res.json();
        } catch (_) {}
        try {
          const cdnRes = await fetch(CDN_BASE + relPath);
          if (cdnRes.ok) return await cdnRes.json();
        } catch (_) {}
        return null;
      };

      const [indexRes, presetsRes] = await Promise.all([
        fetchWithFallback('data/index.json'),
        fetchWithFallback('data/presets.json')
      ]);

      this.allArticles = Array.isArray(indexRes) ? indexRes : [];
      this.presets = (presetsRes && typeof presetsRes === 'object') ? presetsRes : {};

      // 统计所有专栏分类
      this.categoriesMap.clear();
      this.allArticles.forEach(a => {
        const cat = a.cat || '其它';
        this.categoriesMap.set(cat, (this.categoriesMap.get(cat) || 0) + 1);
      });

      console.log(`[我不是盐神·纯净版] 加载完成: ${this.allArticles.length} 篇小说, ${this.categoriesMap.size} 个专栏。`);

      // 路由派发
      this.handleRoute();
    } catch (err) {
      console.error(err);
      this.els.board.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: var(--sec-text-color);">
          <div style="font-size: 32px; margin-bottom: 12px;">⚠️</div>
          <div>加载小说库失败，请检查网络或刷新重试。</div>
          <button class="page-btn" style="margin-top: 15px;" onclick="window.app.loadData()">重新载入</button>
        </div>
      `;
    }
  }

  setNavActive(name) {
    [this.els.navHome, this.els.navCategories, this.els.navPresets].forEach(el => {
      el?.classList.remove('active');
    });
    if (name === 'home') this.els.navHome?.classList.add('active');
    if (name === 'categories') this.els.navCategories?.classList.add('active');
    if (name === 'presets') this.els.navPresets?.classList.add('active');
  }

  resetBanner(title = '我不是盐神', subtitle = '知乎盐选小说免费阅读 · 0 广告纯净版', meta = null) {
    this.els.bannerTitle.textContent = title;
    this.els.bannerSubtitle.textContent = subtitle;
    if (meta) {
      this.els.bannerMeta.innerHTML = meta;
      this.els.bannerMeta.style.display = 'flex';
    } else {
      this.els.bannerMeta.innerHTML = `
        <span>收录 ${this.allArticles.length.toLocaleString()} 篇</span>
        <span>·</span>
        <span>${this.categoriesMap.size} 专栏分类</span>
        <span>·</span>
        <span>离线秒开</span>
      `;
      this.els.bannerMeta.style.display = 'flex';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  renderHome(page = 1) {
    this.currentView = 'home';
    this.setNavActive('home');
    this.resetBanner('我不是盐神', '知乎盐选小说免费阅读 · 0 广告纯净版');

    const total = this.allArticles.length;
    const totalPages = Math.ceil(total / this.pageSize) || 1;
    const start = (page - 1) * this.pageSize;
    const slice = this.allArticles.slice(start, start + this.pageSize);

    let html = slice.map(art => {
      const isPreset = !!this.presets[art.id];
      let excerpt = '';
      if (isPreset && this.presets[art.id].content) {
        excerpt = this.stripHtml(this.presets[art.id].content).slice(0, 160) + '...';
      } else {
        excerpt = `知乎盐选专栏精选小说《${art.title}》，所属专栏分类【${art.cat}】。点击进入纯净免广告阅读模式，即点即看。`;
      }

      return `
        <div class="index-card">
          <h2 class="index-header">
            <a onclick="window.app.navigate('article', ${art.id})">${this.escapeHtml(art.title)}</a>
          </h2>
          <div class="index-excerpt">
            ${this.escapeHtml(excerpt)}
          </div>
          <div class="post-metas">
            <div class="post-meta-item">
              <span>📅</span>
              <time>${art.date || '近期'}</time>
            </div>
            <div class="post-meta-item">
              <span>📂</span>
              <a class="category-tag" onclick="window.app.navigate('category', '${this.escapeHtml(art.cat)}')">${this.escapeHtml(art.cat)}</a>
            </div>
            ${isPreset ? '<span class="preset-badge">离线精选</span>' : ''}
          </div>
        </div>
      `;
    }).join('');

    // 分页
    html += this.renderPagination(page, totalPages, 'home');
    this.els.board.innerHTML = html;
  }

  renderCategoryList() {
    this.currentView = 'categories';
    this.setNavActive('categories');
    this.resetBanner('专栏分类', `涵盖全网 ${this.categoriesMap.size} 个热门知乎专栏分类`);

    // 按数量降序
    const sortedCats = Array.from(this.categoriesMap.entries()).sort((a, b) => b[1] - a[1]);

    let html = `
      <div class="category-header-title">📚 全部分类 (${sortedCats.length})</div>
      <div class="category-grid">
    `;

    html += sortedCats.map(([cat, count]) => `
      <div class="category-card" onclick="window.app.navigate('category', '${this.escapeHtml(cat)}')">
        <span class="category-name">${this.escapeHtml(cat)}</span>
        <span class="category-badge-count">${count} 篇</span>
      </div>
    `).join('');

    html += `</div>`;
    this.els.board.innerHTML = html;
  }

  renderCategoryView(catName, page = 1) {
    this.currentView = 'category';
    this.setNavActive('categories');
    const filtered = this.allArticles.filter(a => a.cat === catName);
    this.resetBanner(catName, `【${catName}】专栏共收录 ${filtered.length} 篇精选小说`);

    const total = filtered.length;
    const totalPages = Math.ceil(total / this.pageSize) || 1;
    const start = (page - 1) * this.pageSize;
    const slice = filtered.slice(start, start + this.pageSize);

    let html = `
      <div style="margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
        <span style="font-weight: 700; font-size: 1.1rem; color: var(--post-heading-color);">专栏文章列表 (${total} 篇)</span>
        <a onclick="window.app.navigate('categories')" style="font-size: 13px; color: var(--link-hover-color); cursor: pointer;">← 返回全部分类</a>
      </div>
    `;

    html += slice.map(art => {
      const isPreset = !!this.presets[art.id];
      let excerpt = `知乎盐选专栏精选小说《${art.title}》，所属专栏分类【${art.cat}】。点击进入纯净免广告阅读模式。`;
      if (isPreset && this.presets[art.id].content) {
        excerpt = this.stripHtml(this.presets[art.id].content).slice(0, 160) + '...';
      }

      return `
        <div class="index-card">
          <h2 class="index-header">
            <a onclick="window.app.navigate('article', ${art.id})">${this.escapeHtml(art.title)}</a>
          </h2>
          <div class="index-excerpt">${this.escapeHtml(excerpt)}</div>
          <div class="post-metas">
            <div class="post-meta-item"><span>📅</span><time>${art.date || '近期'}</time></div>
            <div class="post-meta-item"><span>📂</span><span>${this.escapeHtml(art.cat)}</span></div>
            ${isPreset ? '<span class="preset-badge">离线精选</span>' : ''}
          </div>
        </div>
      `;
    }).join('');

    html += this.renderPagination(page, totalPages, 'category', catName);
    this.els.board.innerHTML = html;
  }

  renderPresets(page = 1) {
    this.currentView = 'presets';
    this.setNavActive('presets');
    const presetIds = new Set(Object.keys(this.presets).map(Number));
    const presetArticles = this.allArticles.filter(a => presetIds.has(a.id));
    this.resetBanner('离线爆款精选', `已预置打包 ${presetArticles.length} 篇超火知乎盐选代表作全文，断网无阻秒开`);

    const total = presetArticles.length;
    const totalPages = Math.ceil(total / this.pageSize) || 1;
    const start = (page - 1) * this.pageSize;
    const slice = presetArticles.slice(start, start + this.pageSize);

    let html = slice.map(art => {
      const p = this.presets[art.id];
      const excerpt = p && p.content ? this.stripHtml(p.content).slice(0, 160) + '...' : '';
      return `
        <div class="index-card">
          <h2 class="index-header">
            <a onclick="window.app.navigate('article', ${art.id})">${this.escapeHtml(art.title)}</a>
          </h2>
          <div class="index-excerpt">${this.escapeHtml(excerpt)}</div>
          <div class="post-metas">
            <div class="post-meta-item"><span>📅</span><time>${art.date || '近期'}</time></div>
            <div class="post-meta-item"><span>📂</span><a class="category-tag" onclick="window.app.navigate('category', '${this.escapeHtml(art.cat)}')">${this.escapeHtml(art.cat)}</a></div>
            <span class="preset-badge">离线全文</span>
          </div>
        </div>
      `;
    }).join('');

    html += this.renderPagination(page, totalPages, 'presets');
    this.els.board.innerHTML = html;
  }

  async renderArticle(id) {
    const meta = this.allArticles.find(a => a.id === Number(id));
    if (!meta) return;

    this.currentView = 'article';
    this.currentArticleId = Number(id);

    // Banner 显示大标题和元数据
    this.resetBanner(
      meta.title,
      `专栏分类：${meta.cat}`,
      `<span>📅 ${meta.date || '近期'}</span> <span>·</span> <span>纯净阅读</span> <span>·</span> <span>0 广告</span>`
    );

    this.els.board.innerHTML = `
      <div style="text-align: center; padding: 50px 20px; color: var(--sec-text-color);">
        <div style="font-size: 30px; margin-bottom: 10px;">📖</div>
        <div>正在载入纯净正文...</div>
      </div>
    `;

    try {
      let content = null;
      // 1. 优先读取预置
      if (this.presets[id]) {
        content = this.presets[id].content;
      }

      // 2. 检查本地 IndexedDB
      if (!content) {
        const cached = await this.db.get(id);
        if (cached && cached.content) content = cached.content;
      }

      // 3. 在线抓取清洗
      if (!content) {
        const res = await fetch('https://onehu.xyz' + meta.url);
        const html = await res.text();
        content = this.cleanHtml(html);
        if (content && content.length > 50) {
          await this.db.set({
            id: meta.id,
            title: meta.title,
            cat: meta.cat,
            date: meta.date,
            url: meta.url,
            content: content
          });
        }
      }

      if (!content) throw new Error('未获取到正文');

      // 获取上一篇、下一篇
      const idx = this.allArticles.findIndex(a => a.id === meta.id);
      const prev = idx > 0 ? this.allArticles[idx - 1] : null;
      const next = idx >= 0 && idx < this.allArticles.length - 1 ? this.allArticles[idx + 1] : null;

      const wordsEstimate = Math.round(content.length * 0.7);

      this.els.board.innerHTML = `
        <div class="article-view">
          <div style="margin-bottom: 1.8rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 14px;">
            <div style="font-size: 13px; color: var(--sec-text-color);">
              <a onclick="window.history.back()" style="cursor: pointer; color: var(--link-hover-color);">← 返回列表</a>
              <span style="margin: 0 6px;">·</span>
              <span>约 ${wordsEstimate.toLocaleString()} 字</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="page-btn" onclick="window.app.copyArticleText()">📋 复制正文</button>
              <button class="page-btn" onclick="window.app.shareArticle(${meta.id})">🔗 分享链接</button>
            </div>
          </div>

          <article class="markdown-body" id="articleBody">
            ${content}
          </article>

          <nav class="post-nav">
            ${prev ? `
              <div class="post-nav-btn" onclick="window.app.navigate('article', ${prev.id})">
                <span class="post-nav-direction">← 上一篇</span>
                <span class="post-nav-title">${this.escapeHtml(prev.title)}</span>
              </div>
            ` : '<div style="flex:1;"></div>'}

            ${next ? `
              <div class="post-nav-btn" style="text-align: right;" onclick="window.app.navigate('article', ${next.id})">
                <span class="post-nav-direction">下一篇 →</span>
                <span class="post-nav-title">${this.escapeHtml(next.title)}</span>
              </div>
            ` : '<div style="flex:1;"></div>'}
          </nav>
        </div>
      `;

      // 恢复阅读进度
      this.restoreScroll(meta.id);
    } catch (err) {
      console.error(err);
      this.els.board.innerHTML = `
        <div style="text-align: center; padding: 50px 20px; color: var(--sec-text-color);">
          <div style="font-size: 32px; margin-bottom: 10px;">⚠️</div>
          <div>正文载入遇到阻碍，原站连接超时或被拦截。</div>
          <div style="margin-top: 15px;">
            <button class="page-btn" onclick="window.app.renderArticle(${id})">重新加载</button>
            <button class="page-btn" onclick="window.app.navigate('home')">返回主页</button>
          </div>
        </div>
      `;
    }
  }

  renderPagination(page, totalPages, viewType, extra = '') {
    if (totalPages <= 1) return '';
    let buttons = [];

    const makeBtn = (p, text, active = false, disabled = false) => `
      <button class="page-btn ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}" 
        onclick="window.app.gotoPage('${viewType}', ${p}, '${this.escapeHtml(extra)}')">
        ${text}
      </button>
    `;

    // 上一页
    buttons.push(makeBtn(page - 1, '‹ 上一页', false, page <= 1));

    // 页码算法
    let startPage = Math.max(1, page - 2);
    let endPage = Math.min(totalPages, page + 2);

    if (startPage > 1) {
      buttons.push(makeBtn(1, '1'));
      if (startPage > 2) buttons.push('<span style="padding: 4px;">...</span>');
    }

    for (let p = startPage; p <= endPage; p++) {
      buttons.push(makeBtn(p, p, p === page));
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) buttons.push('<span style="padding: 4px;">...</span>');
      buttons.push(makeBtn(totalPages, totalPages));
    }

    // 下一页
    buttons.push(makeBtn(page + 1, '下一页 ›', false, page >= totalPages));

    return `
      <div class="pagination">
        ${buttons.join('')}
      </div>
    `;
  }

  gotoPage(viewType, page, extra) {
    if (viewType === 'home') this.navigate('home', page);
    else if (viewType === 'category') this.navigate('category', extra, page);
    else if (viewType === 'presets') this.navigate('presets', page);
  }

  navigate(view, param1 = null, param2 = 1) {
    if (view === 'home') {
      const page = param1 || 1;
      window.location.hash = page === 1 ? '#/' : `#/page/${page}`;
    } else if (view === 'categories') {
      window.location.hash = '#/categories';
    } else if (view === 'category') {
      const cat = param1;
      const page = param2 || 1;
      window.location.hash = page === 1 ? `#/category/${encodeURIComponent(cat)}` : `#/category/${encodeURIComponent(cat)}/page/${page}`;
    } else if (view === 'presets') {
      const page = param1 || 1;
      window.location.hash = page === 1 ? '#/presets' : `#/presets/page/${page}`;
    } else if (view === 'article') {
      window.location.hash = `#/article/${param1}`;
    }
  }

  handleRoute() {
    const hash = window.location.hash || '#/';

    let match = hash.match(/^#\/article\/(\d+)/);
    if (match) {
      this.renderArticle(Number(match[1]));
      return;
    }

    match = hash.match(/^#\/category\/([^\/]+)(?:\/page\/(\d+))?/);
    if (match) {
      const cat = decodeURIComponent(match[1]);
      const page = Number(match[2] || 1);
      this.renderCategoryView(cat, page);
      return;
    }

    if (hash === '#/categories') {
      this.renderCategoryList();
      return;
    }

    match = hash.match(/^#\/presets(?:\/page\/(\d+))?/);
    if (match) {
      const page = Number(match[1] || 1);
      this.renderPresets(page);
      return;
    }

    match = hash.match(/^#\/page\/(\d+)/);
    if (match) {
      this.renderHome(Number(match[1]));
      return;
    }

    // 默认首页
    this.renderHome(1);
  }

  // 搜索处理
  openSearch() {
    this.els.searchModal.style.display = 'flex';
    this.els.searchInput.value = '';
    this.els.searchResults.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--sec-text-color); font-size: 13px;">输入小说标题或专栏关键词...</div>';
    setTimeout(() => this.els.searchInput.focus(), 100);
  }

  closeSearch() {
    this.els.searchModal.style.display = 'none';
  }

  handleSearchInput(q) {
    const query = q.trim().toLowerCase();
    if (!query) {
      this.els.searchResults.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--sec-text-color); font-size: 13px;">输入小说标题或专栏关键词...</div>';
      return;
    }

    const matches = this.allArticles.filter(a => 
      a.title.toLowerCase().includes(query) || 
      a.cat.toLowerCase().includes(query)
    ).slice(0, 30);

    if (matches.length === 0) {
      this.els.searchResults.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--sec-text-color); font-size: 13px;">未找到匹配小说，换个词试试</div>';
      return;
    }

    this.els.searchResults.innerHTML = matches.map(art => `
      <div class="search-item" onclick="window.app.navigate('article', ${art.id}); window.app.closeSearch();">
        <div class="search-item-title">${this.escapeHtml(art.title)}</div>
        <div class="search-item-meta">${this.escapeHtml(art.cat)} · ${art.date || ''}</div>
      </div>
    `).join('');
  }

  cleanHtml(htmlStr) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlStr, 'text/html');
    doc.querySelectorAll('script, ins, .license-box, section.comments, footer, #comments').forEach(el => el.remove());
    const body = doc.querySelector('.markdown-body');
    if (!body) return '';
    body.querySelectorAll('a[href*="pagead"], a[href*="google"]').forEach(a => a.remove());
    return body.innerHTML.trim();
  }

  stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  copyArticleText() {
    const body = document.getElementById('articleBody');
    if (!body) return;
    navigator.clipboard.writeText(body.innerText || '').then(() => {
      this.showToast('全文纯文本已复制到剪贴板！');
    });
  }

  shareArticle(id) {
    const url = `${window.location.origin}${window.location.pathname}#/article/${id}`;
    navigator.clipboard.writeText(url).then(() => {
      this.showToast('直达链接已复制，可直接粘贴分享！');
    });
  }

  restoreScroll(id) {
    const saved = this.progress[id];
    if (saved && saved > 0) {
      setTimeout(() => {
        const docH = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: docH * (saved / 100), behavior: 'smooth' });
        this.showToast(`已续读至 ${saved}%`);
      }, 150);
    }
  }

  bindEvents() {
    // 滚动监听
    window.addEventListener('scroll', () => {
      const top = window.scrollY;
      if (top > 50) {
        this.els.navbar?.classList.add('scrolled');
      } else {
        this.els.navbar?.classList.remove('scrolled');
      }

      // 顶部阅读进度条
      if (this.currentView === 'article') {
        const docH = document.documentElement.scrollHeight - window.innerHeight;
        if (docH > 0) {
          const pct = Math.min(100, Math.max(0, Math.round((top / docH) * 100)));
          if (this.els.topProgressBar) this.els.topProgressBar.style.width = `${pct}%`;
          if (this.currentArticleId) {
            this.progress[this.currentArticleId] = pct;
            localStorage.setItem('fluid_progress', JSON.stringify(this.progress));
          }
        }
      } else {
        if (this.els.topProgressBar) this.els.topProgressBar.style.width = '0%';
      }
    });

    // 搜索事件
    this.els.btnOpenSearch?.addEventListener('click', () => this.openSearch());
    this.els.btnCloseSearch?.addEventListener('click', () => this.closeSearch());
    this.els.searchModal?.addEventListener('click', (e) => {
      if (e.target === this.els.searchModal) this.closeSearch();
    });

    this.els.searchInput?.addEventListener('input', (e) => {
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => this.handleSearchInput(e.target.value), 120);
    });

    // 主题切换
    this.els.btnToggleTheme?.addEventListener('click', () => this.toggleTheme());

    // 路由
    window.addEventListener('hashchange', () => this.handleRoute());

    // 快捷键
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== this.els.searchInput) {
        e.preventDefault();
        this.openSearch();
      }
      if (e.key === 'Escape') {
        this.closeSearch();
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new FluidYanShenApp();
});
