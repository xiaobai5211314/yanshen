/**
 * 纯净盐神 (YanShen Pure) - Claude 优雅主题与微软雅黑核心引擎
 */

class ArticleDB {
  constructor() {
    this.dbName = 'yanshen_cache_v3';
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

class ClaudeYanShenApp {
  constructor() {
    this.db = new ArticleDB();
    this.allArticles = [];
    this.presets = {};
    this.categoriesMap = new Map();
    this.pageSize = 15;
    this.currentCategory = 'all';
    this.theme = localStorage.getItem('claude_theme') || 'light';
    this.progress = JSON.parse(localStorage.getItem('claude_progress') || '{}');

    this.topFilterCategories = [
      '全部', '🔥 热门精选', '知乎精选', '高赞回答', '脑洞故事盒：从不做人开始',
      '黑镜规则怪谈', '白夜暗涌：人性的双杀游戏', '江湖庙堂与市井，都是不省油的灯',
      '事不过三：爽文女主不干了', '摆烂后，我突然一夜爆红了', '红男绿女：真爱没有结局'
    ];

    this.initElements();
    this.initTheme();
    this.bindEvents();
    this.loadData();
  }

  initElements() {
    this.els = {
      mainWrapper: document.getElementById('mainWrapper'),
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
    localStorage.setItem('claude_theme', this.theme);
    this.initTheme();
    this.showToast(`已切换至${this.theme === 'dark' ? '暗黑夜间' : '温暖日间'}模式`);
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

      // 统计专栏
      this.categoriesMap.clear();
      this.allArticles.forEach(a => {
        const cat = a.cat || '其它';
        this.categoriesMap.set(cat, (this.categoriesMap.get(cat) || 0) + 1);
      });

      console.log(`[纯净盐神 · Claude UI] 加载就绪: ${this.allArticles.length} 篇小说, ${this.categoriesMap.size} 个专栏。`);

      this.handleRoute();
    } catch (err) {
      console.error(err);
      this.els.mainWrapper.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: var(--t3);">
          <div style="font-size: 32px; margin-bottom: 12px;">⚠️</div>
          <div>加载小说库失败，请检查网络后刷新重试。</div>
          <button class="claude-page-btn" style="margin-top: 15px;" onclick="window.app.loadData()">重新载入</button>
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

  renderHome(page = 1, category = 'all') {
    this.setNavActive('home');
    this.currentCategory = category;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    let list = this.allArticles;
    if (category === '🔥 热门精选') {
      const presetIds = new Set(Object.keys(this.presets).map(Number));
      list = list.filter(a => presetIds.has(a.id));
    } else if (category !== 'all') {
      list = list.filter(a => a.cat === category);
    }

    const total = list.length;
    const totalPages = Math.ceil(total / this.pageSize) || 1;
    const start = (page - 1) * this.pageSize;
    const slice = list.slice(start, start + this.pageSize);

    // 1. 顶部 Hero 卡片
    let html = `
      <section class="claude-hero">
        <h2 class="hero-title">
          <span>纯净盐神 · 知乎盐选小说阅读站</span>
          <span class="clean-pill">0 广告·纯净版</span>
        </h2>
        <p class="hero-desc">
          基于 Claude 雅致陶土设计语言重构，全量采用微软雅黑字体排版。
          彻底剥离第三方搬运站所有穿透广告、浮窗与弹窗干扰，还您最舒适沉浸的阅读体验。
        </p>
        <div class="hero-meta-row">
          <div class="hero-meta-item">
            <span>📚 收录专栏:</span>
            <strong>${this.allArticles.length.toLocaleString()} 篇</strong>
          </div>
          <div class="hero-meta-item">
            <span>📂 涵盖分类:</span>
            <strong>${this.categoriesMap.size} 个</strong>
          </div>
          <div class="hero-meta-item">
            <span>⚡ 秒开精选:</span>
            <strong>${Object.keys(this.presets).length} 篇 (本地内置)</strong>
          </div>
          <div class="hero-meta-item">
            <span>🚫 广告与追踪:</span>
            <strong style="color: #10b981;">0 干扰</strong>
          </div>
        </div>
      </section>

      <!-- 快捷搜索条 -->
      <div class="search-bar-claude" onclick="window.app.openSearch()">
        <span class="search-icon-claude">🔍</span>
        <input type="text" class="search-input-claude" placeholder="搜索 8,300+ 篇小说、专栏名、关键词..." readonly>
        <span class="search-shortcut-hint">按 / 键即搜</span>
      </div>

      <!-- 常用分类标签选择 -->
      <div class="category-filter-bar">
        ${this.topFilterCategories.map(cat => {
          const isActive = (cat === '全部' && this.currentCategory === 'all') || this.currentCategory === cat;
          return `
            <div class="filter-chip ${isActive ? 'active' : ''}" onclick="window.app.filterByCategory('${this.escapeHtml(cat)}')">
              ${this.escapeHtml(cat)}
            </div>
          `;
        }).join('')}
      </div>

      <!-- 文章卡片列表流 -->
      <div class="articles-stream">
    `;

    if (slice.length === 0) {
      html += `
        <div style="text-align: center; padding: 50px 20px; color: var(--t3);">
          该分类下暂无文章，请切换其他分类浏览。
        </div>
      `;
    } else {
      html += slice.map(art => {
        const isPreset = !!this.presets[art.id];
        let excerpt = '';
        if (isPreset && this.presets[art.id].content) {
          excerpt = this.stripHtml(this.presets[art.id].content).slice(0, 140) + '...';
        } else {
          excerpt = `知乎盐选专栏精选小说《${art.title}》，收录于【${art.cat}】专栏。纯净排版，点击即开即读。`;
        }

        return `
          <article class="claude-card" onclick="window.app.navigate('article', ${art.id})">
            <div class="card-title-row">
              <h3 class="card-article-title">${this.escapeHtml(art.title)}</h3>
              ${isPreset ? '<span class="card-tag-pill tag-preset">⚡ 秒开精选</span>' : ''}
            </div>
            <div class="card-excerpt-text">${this.escapeHtml(excerpt)}</div>
            <div class="card-bottom-row">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="card-tag-pill" onclick="event.stopPropagation(); window.app.navigate('category', '${this.escapeHtml(art.cat)}')">${this.escapeHtml(art.cat)}</span>
                <span>${art.date || '近期'}</span>
              </div>
              <span style="color: var(--brand-1); font-weight: 500;">阅读全文 →</span>
            </div>
          </article>
        `;
      }).join('');
    }

    html += `</div>`;

    // 分页器
    html += this.renderPagination(page, totalPages, 'home', this.currentCategory);
    this.els.mainWrapper.innerHTML = html;
  }

  filterByCategory(cat) {
    if (cat === '全部') {
      this.navigate('home', 1);
    } else if (cat === '🔥 热门精选') {
      this.navigate('presets', 1);
    } else {
      this.navigate('category', cat, 1);
    }
  }

  renderCategories() {
    this.setNavActive('categories');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const sortedCats = Array.from(this.categoriesMap.entries()).sort((a, b) => b[1] - a[1]);

    let html = `
      <div style="margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between;">
        <h2 style="font-size: 20px; font-weight: 700; color: var(--t1);">📂 全站专栏分类 (${sortedCats.length} 个)</h2>
        <a onclick="window.app.navigate('home')" style="color: var(--brand-1); font-size: 13.5px; cursor: pointer;">← 返回主页</a>
      </div>
      <div class="categories-grid">
    `;

    html += sortedCats.map(([cat, count]) => `
      <div class="cat-box" onclick="window.app.navigate('category', '${this.escapeHtml(cat)}')">
        <span class="cat-box-name">${this.escapeHtml(cat)}</span>
        <span class="cat-box-count">${count} 篇</span>
      </div>
    `).join('');

    html += `</div>`;
    this.els.mainWrapper.innerHTML = html;
  }

  renderCategoryView(catName, page = 1) {
    this.setNavActive('categories');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const filtered = this.allArticles.filter(a => a.cat === catName);
    const total = filtered.length;
    const totalPages = Math.ceil(total / this.pageSize) || 1;
    const start = (page - 1) * this.pageSize;
    const slice = filtered.slice(start, start + this.pageSize);

    let html = `
      <div style="margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--divider); padding-bottom: 14px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 700; color: var(--t1); margin-bottom: 4px;">📂 ${this.escapeHtml(catName)}</h2>
          <span style="font-size: 13px; color: var(--t3);">共收录 ${total} 篇专栏小说</span>
        </div>
        <a onclick="window.app.navigate('categories')" style="color: var(--brand-1); font-size: 13.5px; cursor: pointer;">← 查看全部分类</a>
      </div>

      <div class="articles-stream">
    `;

    html += slice.map(art => {
      const isPreset = !!this.presets[art.id];
      let excerpt = `知乎盐选专栏精选小说《${art.title}》，收录于【${art.cat}】专栏。纯净排版，点击即开即读。`;
      if (isPreset && this.presets[art.id].content) {
        excerpt = this.stripHtml(this.presets[art.id].content).slice(0, 140) + '...';
      }

      return `
        <article class="claude-card" onclick="window.app.navigate('article', ${art.id})">
          <div class="card-title-row">
            <h3 class="card-article-title">${this.escapeHtml(art.title)}</h3>
            ${isPreset ? '<span class="card-tag-pill tag-preset">⚡ 秒开精选</span>' : ''}
          </div>
          <div class="card-excerpt-text">${this.escapeHtml(excerpt)}</div>
          <div class="card-bottom-row">
            <span>📅 ${art.date || '近期'}</span>
            <span style="color: var(--brand-1); font-weight: 500;">阅读全文 →</span>
          </div>
        </article>
      `;
    }).join('');

    html += `</div>`;
    html += this.renderPagination(page, totalPages, 'category', catName);
    this.els.mainWrapper.innerHTML = html;
  }

  renderPresets(page = 1) {
    this.setNavActive('presets');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const presetIds = new Set(Object.keys(this.presets).map(Number));
    const presetArticles = this.allArticles.filter(a => presetIds.has(a.id));
    const total = presetArticles.length;
    const totalPages = Math.ceil(total / this.pageSize) || 1;
    const start = (page - 1) * this.pageSize;
    const slice = presetArticles.slice(start, start + this.pageSize);

    let html = `
      <section class="claude-hero" style="background: var(--bg-soft); border-left: 4px solid #10b981;">
        <h2 class="hero-title" style="color: var(--t1);">
          <span>🔥 热门精选（本地内置秒开书架）</span>
          <span class="clean-pill" style="color: #10b981; border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.1);">35+ 篇离线正文</span>
        </h2>
        <p class="hero-desc">
          💡 <strong>什么是“离线/秒开”？</strong><br>
          这些高赞代表作已将<strong>全本文字直接下载并存放在您的服务器与本地工程中</strong>。<br>
          即使第三方网站断网、改版、甚至被封打不开，这批小说也<strong>永远保存在您的书架里，无需等待外部网络，100% 毫秒级秒开</strong>！
        </p>
      </section>

      <div class="articles-stream">
    `;

    html += slice.map(art => {
      const p = this.presets[art.id];
      const excerpt = p && p.content ? this.stripHtml(p.content).slice(0, 140) + '...' : '';
      return `
        <article class="claude-card" onclick="window.app.navigate('article', ${art.id})">
          <div class="card-title-row">
            <h3 class="card-article-title">${this.escapeHtml(art.title)}</h3>
            <span class="card-tag-pill tag-preset">⚡ 本地内置秒开</span>
          </div>
          <div class="card-excerpt-text">${this.escapeHtml(excerpt)}</div>
          <div class="card-bottom-row">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="card-tag-pill">${this.escapeHtml(art.cat)}</span>
              <span>${art.date || '近期'}</span>
            </div>
            <span style="color: var(--brand-1); font-weight: 500;">阅读全文 →</span>
          </div>
        </article>
      `;
    }).join('');

    html += `</div>`;
    html += this.renderPagination(page, totalPages, 'presets');
    this.els.mainWrapper.innerHTML = html;
  }

  async renderArticle(id) {
    const meta = this.allArticles.find(a => a.id === Number(id));
    if (!meta) return;

    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.els.mainWrapper.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--t3);">
        <div style="font-size: 30px; margin-bottom: 12px;">📖</div>
        <div>正在为您整理纯净正文...</div>
      </div>
    `;

    try {
      let content = null;
      // 1. 优先本地预置
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

      if (!content) throw new Error('未能解析到小说文本');

      const idx = this.allArticles.findIndex(a => a.id === meta.id);
      const prev = idx > 0 ? this.allArticles[idx - 1] : null;
      const next = idx >= 0 && idx < this.allArticles.length - 1 ? this.allArticles[idx + 1] : null;
      const words = Math.round(content.length * 0.7);

      this.els.mainWrapper.innerHTML = `
        <div class="article-detail-view">
          <div class="article-top-nav">
            <a class="back-link" onclick="window.history.back()">← 返回上一页</a>
            <div style="display: flex; gap: 8px;">
              <button class="claude-page-btn" onclick="window.app.copyText()">📋 复制正文</button>
              <button class="claude-page-btn" onclick="window.app.shareLink(${meta.id})">🔗 分享直达</button>
            </div>
          </div>

          <h1 class="article-main-title">${this.escapeHtml(meta.title)}</h1>

          <div class="article-header-meta">
            <span class="card-tag-pill">${this.escapeHtml(meta.cat)}</span>
            <span>📅 ${meta.date || '近期'}</span>
            <span>· 约 ${words.toLocaleString()} 字</span>
            <span class="clean-pill">0 广告阅读模式</span>
          </div>

          <article class="markdown-body" id="articleBody">
            ${content}
          </article>

          <nav class="post-switch-nav">
            ${prev ? `
              <div class="switch-nav-card" onclick="window.app.navigate('article', ${prev.id})">
                <span class="switch-label">← 上一篇</span>
                <span class="switch-title">${this.escapeHtml(prev.title)}</span>
              </div>
            ` : '<div style="flex:1;"></div>'}

            ${next ? `
              <div class="switch-nav-card" style="text-align: right;" onclick="window.app.navigate('article', ${next.id})">
                <span class="switch-label">下一篇 →</span>
                <span class="switch-title">${this.escapeHtml(next.title)}</span>
              </div>
            ` : '<div style="flex:1;"></div>'}
          </nav>
        </div>
      `;

      this.restoreScroll(meta.id);
    } catch (err) {
      console.error(err);
      this.els.mainWrapper.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: var(--t3);">
          <div style="font-size: 32px; margin-bottom: 12px;">⚠️</div>
          <div>正文载入遇到阻碍，原站连接超时或被拦截。</div>
          <div style="margin-top: 15px;">
            <button class="claude-page-btn" onclick="window.app.renderArticle(${id})">重新加载</button>
            <button class="claude-page-btn" onclick="window.app.navigate('home')">返回主页</button>
          </div>
        </div>
      `;
    }
  }

  renderPagination(page, totalPages, viewType, extra = '') {
    if (totalPages <= 1) return '';
    let buttons = [];

    const makeBtn = (p, text, active = false, disabled = false) => `
      <button class="claude-page-btn ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}" 
        onclick="window.app.gotoPage('${viewType}', ${p}, '${this.escapeHtml(extra)}')">
        ${text}
      </button>
    `;

    buttons.push(makeBtn(page - 1, '‹ 上一页', false, page <= 1));

    let startPage = Math.max(1, page - 1);
    let endPage = Math.min(totalPages, page + 1);

    if (startPage > 1) {
      buttons.push(makeBtn(1, '1'));
      if (startPage > 2) buttons.push('<span style="padding: 2px 4px; color: var(--t3); font-size: 11px;">...</span>');
    }

    for (let p = startPage; p <= endPage; p++) {
      buttons.push(makeBtn(p, p, p === page));
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) buttons.push('<span style="padding: 2px 4px; color: var(--t3); font-size: 11px;">...</span>');
      buttons.push(makeBtn(totalPages, totalPages));
    }

    buttons.push(makeBtn(page + 1, '下一页 ›', false, page >= totalPages));

    return `<div class="pagination-row">${buttons.join('')}</div>`;
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
      this.renderCategories();
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

    this.renderHome(1);
  }

  openSearch() {
    this.els.searchModal.style.display = 'flex';
    this.els.searchInput.value = '';
    this.els.searchResults.innerHTML = '<div style="text-align: center; padding: 26px; color: var(--t3); font-size: 13.5px;">输入小说名或专栏关键词，即刻秒级模糊检索</div>';
    setTimeout(() => this.els.searchInput.focus(), 100);
  }

  closeSearch() {
    this.els.searchModal.style.display = 'none';
  }

  handleSearchInput(q) {
    const query = q.trim().toLowerCase();
    if (!query) {
      this.els.searchResults.innerHTML = '<div style="text-align: center; padding: 26px; color: var(--t3); font-size: 13.5px;">输入小说名或专栏关键词，即刻秒级模糊检索</div>';
      return;
    }

    const matches = this.allArticles.filter(a => 
      a.title.toLowerCase().includes(query) || 
      a.cat.toLowerCase().includes(query)
    ).slice(0, 30);

    if (matches.length === 0) {
      this.els.searchResults.innerHTML = '<div style="text-align: center; padding: 26px; color: var(--t3); font-size: 13.5px;">未找到匹配小说，换个搜索词试试</div>';
      return;
    }

    this.els.searchResults.innerHTML = matches.map(art => `
      <div class="search-result-item" onclick="window.app.navigate('article', ${art.id}); window.app.closeSearch();">
        <div class="result-title">${this.escapeHtml(art.title)}</div>
        <div class="result-meta">${this.escapeHtml(art.cat)} · ${art.date || ''}</div>
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

  copyText() {
    const body = document.getElementById('articleBody');
    if (!body) return;
    navigator.clipboard.writeText(body.innerText || '').then(() => {
      this.showToast('全文纯文本已复制到剪贴板！');
    });
  }

  shareLink(id) {
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
    window.addEventListener('scroll', () => {
      const top = window.scrollY;
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      if (docH > 0) {
        const pct = Math.min(100, Math.max(0, Math.round((top / docH) * 100)));
        if (this.els.topProgressBar) this.els.topProgressBar.style.width = `${pct}%`;
      }
    });

    this.els.btnOpenSearch?.addEventListener('click', () => this.openSearch());
    this.els.btnCloseSearch?.addEventListener('click', () => this.closeSearch());
    this.els.searchModal?.addEventListener('click', (e) => {
      if (e.target === this.els.searchModal) this.closeSearch();
    });

    this.els.searchInput?.addEventListener('input', (e) => {
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => this.handleSearchInput(e.target.value), 120);
    });

    this.els.btnToggleTheme?.addEventListener('click', () => this.toggleTheme());

    window.addEventListener('hashchange', () => this.handleRoute());

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
  window.app = new ClaudeYanShenApp();
});
