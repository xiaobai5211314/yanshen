/**
 * 纯净盐神 (YanShen Pure) - 核心阅读引擎
 */

// 1. IndexedDB 轻量封装
class ArticleDB {
  constructor() {
    this.dbName = 'yanshen_cache_v1';
    this.storeName = 'articles';
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
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
      request.onerror = (e) => reject(e);
    });
  }

  async get(id) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.get(Number(id));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async set(article) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put(article);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  async clear() {
    if (!this.db) await this.init();
    const tx = this.db.transaction(this.storeName, 'readwrite');
    tx.objectStore(this.storeName).clear();
  }
}

// 2. 主应用
class YanShenApp {
  constructor() {
    this.db = new ArticleDB();
    this.allArticles = [];
    this.presets = {};
    this.filteredArticles = [];
    this.currentArticle = null;
    
    this.state = {
      search: '',
      category: 'all',
      sort: 'default', // 'default', 'latest', 'preset'
      theme: localStorage.getItem('ys_theme') || 'paper',
      fontFamily: localStorage.getItem('ys_font') || 'sans',
      fontSize: parseInt(localStorage.getItem('ys_fontsize') || '17', 10),
      bookmarks: JSON.parse(localStorage.getItem('ys_bookmarks') || '[]'),
      history: JSON.parse(localStorage.getItem('ys_history') || '[]'),
      progress: JSON.parse(localStorage.getItem('ys_progress') || '{}'),
      renderedCount: 60,
    };

    this.topCategories = [
      '全部', '离线精选', '知乎精选', '高赞回答', '红男绿女：真爱没有结局', 
      '脑洞故事盒：从不做人开始', '黑镜规则怪谈', '白夜暗涌：人性的双杀游戏',
      '江湖庙堂与市井，都是不省油的灯', '摆烂后，我突然一夜爆红了',
      '事不过三：爽文女主不干了', '甜爆，校霸他今天哄女朋友了吗', '低调厚爱：请星星捎信告白'
    ];

    this.initElements();
    this.initThemes();
    this.bindEvents();
    this.loadData();
  }

  initElements() {
    this.els = {
      sidebar: document.getElementById('sidebar'),
      sidebarBackdrop: document.getElementById('sidebarBackdrop'),
      mobileToggleBtn: document.getElementById('mobileToggleBtn'),
      searchInput: document.getElementById('searchInput'),
      clearSearchBtn: document.getElementById('clearSearchBtn'),
      catChips: document.getElementById('catChips'),
      articleList: document.getElementById('articleList'),
      totalCountSpan: document.getElementById('totalCountSpan'),
      readerContainer: document.getElementById('readerContainer'),
      progressBar: document.getElementById('readingProgressBar'),
      toast: document.getElementById('toastNotice'),
      settingsModal: document.getElementById('settingsModal'),
      historyModal: document.getElementById('historyModal'),
      bookmarksModal: document.getElementById('bookmarksModal'),
    };
  }

  initThemes() {
    document.documentElement.setAttribute('data-theme', this.state.theme);
    this.applyTypography();
  }

  applyTypography() {
    const root = document.documentElement;
    root.style.setProperty('--font-size', `${this.state.fontSize}px`);
    let fontVal = 'var(--font-sans)';
    if (this.state.fontFamily === 'serif') fontVal = 'var(--font-serif)';
    if (this.state.fontFamily === 'kaiti') fontVal = 'var(--font-kaiti)';
    root.style.setProperty('--current-font', fontVal);
  }

  showToast(msg, duration = 2200) {
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
      // 1. 并行加载全量索引和精选预置
      const [indexRes, presetsRes] = await Promise.all([
        fetch('data/index.json').then(r => r.json()),
        fetch('data/presets.json').then(r => r.json()).catch(() => ({}))
      ]);

      this.allArticles = indexRes || [];
      this.presets = presetsRes || {};

      this.renderCategoryChips();
      this.applyFilter();
      this.renderWelcomeHero();
      
      // 检查 URL 路由
      this.handleRoute();
    } catch (err) {
      console.error('加载数据失败:', err);
      this.showToast('加载索引失败，请检查网络或刷新');
    }
  }

  renderCategoryChips() {
    if (!this.els.catChips) return;
    this.els.catChips.innerHTML = '';
    this.topCategories.forEach(cat => {
      const chip = document.createElement('div');
      chip.className = `cat-chip ${this.state.category === cat || (cat === '全部' && this.state.category === 'all') ? 'active' : ''}`;
      chip.textContent = cat;
      chip.addEventListener('click', () => {
        if (cat === '全部') {
          this.state.category = 'all';
        } else {
          this.state.category = cat;
        }
        document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.applyFilter();
        if (window.innerWidth < 768) {
          // 不关侧栏，方便继续点选
        }
      });
      this.els.catChips.appendChild(chip);
    });
  }

  applyFilter() {
    let list = this.allArticles;
    
    // 分类筛选
    if (this.state.category === '离线精选') {
      const presetIds = new Set(Object.keys(this.presets).map(Number));
      list = list.filter(a => presetIds.has(a.id));
    } else if (this.state.category !== 'all') {
      list = list.filter(a => a.cat === this.state.category);
    }

    // 关键词搜索
    if (this.state.search.trim()) {
      const q = this.state.search.trim().toLowerCase();
      list = list.filter(a => 
        a.title.toLowerCase().includes(q) || 
        a.cat.toLowerCase().includes(q)
      );
    }

    this.filteredArticles = list;
    this.state.renderedCount = 60;
    this.renderArticleList();

    if (this.els.totalCountSpan) {
      this.els.totalCountSpan.textContent = `共 ${this.filteredArticles.length} 篇`;
    }
  }

  renderArticleList() {
    if (!this.els.articleList) return;
    const slice = this.filteredArticles.slice(0, this.state.renderedCount);
    
    if (slice.length === 0) {
      this.els.articleList.innerHTML = `
        <div style="text-align:center; padding: 40px 10px; color: var(--text-muted); font-size: 13px;">
          未找到匹配小说，换个搜索词试试吧
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    slice.forEach(art => {
      const card = document.createElement('div');
      const isCurrent = this.currentArticle && this.currentArticle.id === art.id;
      const isPreset = !!this.presets[art.id];
      const prog = this.state.progress[art.id];

      card.className = `article-card ${isCurrent ? 'active' : ''}`;
      card.innerHTML = `
        <div class="card-title">${this.escapeHtml(art.title)}</div>
        <div class="card-meta">
          <span class="card-cat">${this.escapeHtml(art.cat)}${isPreset ? '<span class="preset-tag">离线</span>' : ''}</span>
          <span>${prog ? `<span style="color:var(--accent-color)">已读 ${prog}%</span> · ` : ''}${art.date || ''}</span>
        </div>
      `;
      card.addEventListener('click', () => {
        this.openArticle(art.id);
        if (window.innerWidth < 768) {
          this.closeSidebar();
        }
      });
      fragment.appendChild(card);
    });

    this.els.articleList.innerHTML = '';
    this.els.articleList.appendChild(fragment);

    // 滚动加载更多
    if (this.state.renderedCount < this.filteredArticles.length) {
      const loadMore = document.createElement('div');
      loadMore.style.cssText = 'text-align:center; padding: 15px; color: var(--text-muted); font-size: 12px; cursor: pointer;';
      loadMore.textContent = `加载更多 (${this.state.renderedCount}/${this.filteredArticles.length})...`;
      loadMore.addEventListener('click', () => {
        this.state.renderedCount += 60;
        this.renderArticleList();
      });
      this.els.articleList.appendChild(loadMore);
    }
  }

  async openArticle(id) {
    const artMeta = this.allArticles.find(a => a.id === Number(id));
    if (!artMeta) return;

    window.location.hash = `#/article/${id}`;
    this.currentArticle = artMeta;
    this.updateActiveCard();

    // 显示加载中占位
    this.els.readerContainer.innerHTML = `
      <div class="reader-content-box" style="padding-top: 60px; text-align: center;">
        <div style="font-size: 28px; margin-bottom: 12px;">📖</div>
        <h3 style="color: var(--text-primary); margin-bottom: 8px;">正在加载纯净正文...</h3>
        <p style="color: var(--text-muted); font-size: 13px;">${this.escapeHtml(artMeta.title)}</p>
      </div>
    `;

    try {
      let content = null;

      // 1. 优先从离线预置读取
      if (this.presets[id]) {
        content = this.presets[id].content;
      }

      // 2. 检查 IndexedDB 离线缓存
      if (!content) {
        const cached = await this.db.get(id);
        if (cached && cached.content) {
          content = cached.content;
        }
      }

      // 3. 在线智能拉取并自动持久化
      if (!content) {
        const targetUrl = 'https://onehu.xyz' + artMeta.url;
        const res = await fetch(targetUrl);
        const html = await res.text();
        content = this.cleanHtml(html);

        // 存入 IndexedDB
        if (content && content.length > 50) {
          await this.db.set({
            id: artMeta.id,
            title: artMeta.title,
            cat: artMeta.cat,
            date: artMeta.date,
            url: artMeta.url,
            content: content
          });
        }
      }

      if (content) {
        this.renderArticleContent(artMeta, content);
        this.recordHistory(artMeta);
      } else {
        throw new Error('未能解析到正文内容');
      }
    } catch (err) {
      console.error(err);
      this.els.readerContainer.innerHTML = `
        <div class="reader-content-box" style="padding-top: 60px; text-align: center;">
          <div style="font-size: 32px; margin-bottom: 14px;">⚠️</div>
          <h3 style="color: var(--text-primary); margin-bottom: 8px;">文章内容加载遇到阻碍</h3>
          <p style="color: var(--text-muted); font-size: 13px; max-width: 400px; margin: 0 auto 16px;">
            原站连接超时或被拦截，建议切换网络重试，或阅读预置好的 35+ 篇离线爆款小说。
          </p>
          <button class="action-btn" onclick="window.app.openArticle(${id})">重新尝试</button>
        </div>
      `;
    }
  }

  cleanHtml(htmlStr) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlStr, 'text/html');

    // 剔除所有脚本、广告、无用节点
    doc.querySelectorAll('script, ins, .license-box, section.comments, footer, #comments').forEach(el => el.remove());

    const body = doc.querySelector('.markdown-body');
    if (!body) return '';

    // 移除正文内可能含有的外链广告
    body.querySelectorAll('a[href*="pagead"], a[href*="google"]').forEach(a => a.remove());
    return body.innerHTML.trim();
  }

  renderArticleContent(meta, contentHtml) {
    const isBookmarked = this.state.bookmarks.includes(meta.id);
    const currIndex = this.filteredArticles.findIndex(a => a.id === meta.id);
    const prevArt = currIndex > 0 ? this.filteredArticles[currIndex - 1] : null;
    const nextArt = currIndex >= 0 && currIndex < this.filteredArticles.length - 1 ? this.filteredArticles[currIndex + 1] : null;

    this.els.readerContainer.innerHTML = `
      <div class="reader-content-box">
        <header class="article-header">
          <div class="article-header-meta">
            <span class="card-cat">${this.escapeHtml(meta.cat)}</span>
            <span>${meta.date || ''}</span>
            <span>· 纯净无广告</span>
          </div>
          <h1 class="article-title">${this.escapeHtml(meta.title)}</h1>
          
          <div class="article-tools">
            <div class="tool-buttons-group">
              <button class="tool-btn" id="btnBookmark">
                <span>${isBookmarked ? '★ 已收藏' : '☆ 加入书签'}</span>
              </button>
              <button class="tool-btn" id="btnCopyText">
                <span>📋 复制全文</span>
              </button>
              <button class="tool-btn" id="btnShareLink">
                <span>🔗 分享直达</span>
              </button>
            </div>
            <div style="font-size:12px; color:var(--text-muted);" id="wordCountLabel">
              估算字数: ${Math.round(contentHtml.length * 0.7):,} 字
            </div>
          </div>
        </header>

        <article class="article-body markdown-body" id="articleBody">
          ${contentHtml}
        </article>

        <nav class="article-footer-nav">
          ${prevArt ? `
            <div class="nav-link-btn" onclick="window.app.openArticle(${prevArt.id})">
              <span class="nav-link-direction">← 上一篇</span>
              <span class="nav-link-title">${this.escapeHtml(prevArt.title)}</span>
            </div>
          ` : '<div style="flex:1;"></div>'}
          
          ${nextArt ? `
            <div class="nav-link-btn" style="text-align: right;" onclick="window.app.openArticle(${nextArt.id})">
              <span class="nav-link-direction">下一篇 →</span>
              <span class="nav-link-title">${this.escapeHtml(nextArt.title)}</span>
            </div>
          ` : '<div style="flex:1;"></div>'}
        </nav>
      </div>
    `;

    // 绑定顶部工具按钮
    document.getElementById('btnBookmark')?.addEventListener('click', () => this.toggleBookmark(meta.id));
    document.getElementById('btnCopyText')?.addEventListener('click', () => this.copyArticleText());
    document.getElementById('btnShareLink')?.addEventListener('click', () => this.shareArticleLink(meta.id));

    // 恢复阅读滚动进度
    this.restoreProgress(meta.id);
  }

  renderWelcomeHero() {
    const totalArticles = this.allArticles.length || 8303;
    const presetList = Object.values(this.presets).slice(0, 6);
    const lastRead = this.state.history.length > 0 ? this.state.history[0] : null;

    this.els.readerContainer.innerHTML = `
      <div class="reader-content-box welcome-hero">
        <div class="hero-banner">
          <h2>纯净盐神 · Zhihu Salt Reader</h2>
          <p>
            专为热爱深度故事与脑洞小说的读者打造。彻底净化所有穿透式弹窗与广告骚扰，
            收录全网知乎盐选专栏、高赞回答与爽文合集，全站离线支持、即搜即看。
          </p>
          ${lastRead ? `
            <div style="margin-top: 16px; padding: 12px 16px; background: var(--bg-primary); border-radius: 10px; display: flex; align-items: center; justify-content: space-between;">
              <div>
                <div style="font-size: 11px; color: var(--text-muted);">继续上次阅读</div>
                <div style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin-top: 2px;">
                  ${this.escapeHtml(lastRead.title)}
                </div>
              </div>
              <button class="action-btn active" onclick="window.app.openArticle(${lastRead.id})">继续阅读</button>
            </div>
          ` : ''}
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${totalArticles.toLocaleString()}</div>
            <div class="stat-label">已收录专栏文章</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">180+</div>
            <div class="stat-label">涵盖专栏分类</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">35+ 篇</div>
            <div class="stat-label">离线秒开爆款预置</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">0</div>
            <div class="stat-label">广告·弹窗·追踪</div>
          </div>
        </div>

        <div class="featured-section">
          <h3><span>🔥</span> 今日爆款精选推荐</h3>
          <div class="featured-grid">
            ${presetList.map(item => `
              <div class="featured-card" onclick="window.app.openArticle(${item.id})">
                <div class="featured-title">${this.escapeHtml(item.title)}</div>
                <div class="featured-desc">${this.escapeHtml(item.cat)} · 离线秒开</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  updateActiveCard() {
    if (!this.currentArticle) return;
    document.querySelectorAll('.article-card').forEach(c => {
      c.classList.remove('active');
    });
    // 重新渲染高亮
    const activeIndex = this.filteredArticles.findIndex(a => a.id === this.currentArticle.id);
    if (activeIndex >= 0) {
      const cards = this.els.articleList.querySelectorAll('.article-card');
      if (cards[activeIndex]) {
        cards[activeIndex].classList.add('active');
      }
    }
  }

  recordHistory(art) {
    let hist = this.state.history.filter(h => h.id !== art.id);
    hist.unshift({
      id: art.id,
      title: art.title,
      cat: art.cat,
      time: Date.now()
    });
    if (hist.length > 50) hist = hist.slice(0, 50);
    this.state.history = hist;
    localStorage.setItem('ys_history', JSON.stringify(hist));
  }

  toggleBookmark(id) {
    let bms = this.state.bookmarks;
    const exists = bms.includes(id);
    if (exists) {
      bms = bms.filter(x => x !== id);
      this.showToast('已取消收藏');
    } else {
      bms.push(id);
      this.showToast('已成功加入书签');
    }
    this.state.bookmarks = bms;
    localStorage.setItem('ys_bookmarks', JSON.stringify(bms));

    const btn = document.getElementById('btnBookmark');
    if (btn) {
      btn.innerHTML = `<span>${!exists ? '★ 已收藏' : '☆ 加入书签'}</span>`;
    }
  }

  copyArticleText() {
    const body = document.getElementById('articleBody');
    if (!body) return;
    const text = body.innerText || '';
    navigator.clipboard.writeText(text).then(() => {
      this.showToast('全文文本已成功复制到剪贴板！');
    }).catch(() => {
      this.showToast('复制失败，请手动选取');
    });
  }

  shareArticleLink(id) {
    const url = `${window.location.origin}${window.location.pathname}#/article/${id}`;
    navigator.clipboard.writeText(url).then(() => {
      this.showToast('直达链接已复制，可直接粘贴分享！');
    }).catch(() => {
      this.showToast(`直达链接: ${url}`);
    });
  }

  restoreProgress(id) {
    const saved = this.state.progress[id];
    if (saved && saved > 0) {
      setTimeout(() => {
        const container = this.els.readerContainer;
        const targetScroll = (container.scrollHeight - container.clientHeight) * (saved / 100);
        container.scrollTo({ top: targetScroll, behavior: 'smooth' });
        this.showToast(`已自动跳转到上次阅读进度 ${saved}%`);
      }, 100);
    }
  }

  handleScroll() {
    const container = this.els.readerContainer;
    const maxScroll = container.scrollHeight - container.clientHeight;
    if (maxScroll <= 0) {
      if (this.els.progressBar) this.els.progressBar.style.width = '0%';
      return;
    }
    const current = container.scrollTop;
    const pct = Math.min(100, Math.max(0, Math.round((current / maxScroll) * 100)));

    if (this.els.progressBar) {
      this.els.progressBar.style.width = `${pct}%`;
    }

    if (this.currentArticle) {
      this.state.progress[this.currentArticle.id] = pct;
      localStorage.setItem('ys_progress', JSON.stringify(this.state.progress));
    }
  }

  bindEvents() {
    // 滚动监听
    this.els.readerContainer?.addEventListener('scroll', () => this.handleScroll());

    // 搜索监听
    this.els.searchInput?.addEventListener('input', (e) => {
      this.state.search = e.target.value;
      if (this.els.clearSearchBtn) {
        this.els.clearSearchBtn.style.display = this.state.search ? 'block' : 'none';
      }
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => this.applyFilter(), 150);
    });

    this.els.clearSearchBtn?.addEventListener('click', () => {
      this.els.searchInput.value = '';
      this.state.search = '';
      this.els.clearSearchBtn.style.display = 'none';
      this.applyFilter();
    });

    // 移动端菜单抽屉
    this.els.mobileToggleBtn?.addEventListener('click', () => {
      this.toggleSidebar();
    });

    this.els.sidebarBackdrop?.addEventListener('click', () => {
      this.closeSidebar();
    });

    // Hash 路由监听
    window.addEventListener('hashchange', () => this.handleRoute());

    // 快捷键
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== this.els.searchInput) {
        e.preventDefault();
        this.els.searchInput?.focus();
      }
      if (e.key === 'Escape') {
        this.closeModals();
        this.closeSidebar();
      }
    });
  }

  toggleSidebar() {
    this.els.sidebar?.classList.toggle('open');
    this.els.sidebarBackdrop?.classList.toggle('show');
  }

  closeSidebar() {
    this.els.sidebar?.classList.remove('open');
    this.els.sidebarBackdrop?.classList.remove('show');
  }

  closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
  }

  handleRoute() {
    const hash = window.location.hash;
    const match = hash.match(/#\/article\/(\d+)/);
    if (match) {
      const id = Number(match[1]);
      if (!this.currentArticle || this.currentArticle.id !== id) {
        this.openArticle(id);
      }
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

// 挂载全局
document.addEventListener('DOMContentLoaded', () => {
  window.app = new YanShenApp();
});
