class Reader {
    constructor() {
        this.currentChapter = 1;
        this.chaptersData = {};
        this.chapters = [];
        this.baseUrl = 'https://www.doupocangqiong.org/shuku/81974/';
        this.corsProxy = 'https://api.allorigins.win/raw?url=';
        this.isLoading = false;
        this.totalChapters = 0;
        this.lastLoadedChapter = null;
        this.loadedChapters = new Set();
        
        this.init();
    }

    async init() {
        try {
            await this.loadChapterList();
            this.loadProgress();
            await this.initTOC();
            this.bindEvents();
            this.initTheme();
            this.initInfiniteScroll();
        } catch (error) {
            console.error('初始化失败:', error);
            this.showError('初始化失败，请刷新重试');
        }
    }

    async fetchWithProxy(url) {
        try {
            const response = await fetch(this.corsProxy + encodeURIComponent(url));
            if (!response.ok) throw new Error('Network response was not ok');
            
            const buffer = await response.arrayBuffer();
            const decoder = new TextDecoder('gbk');
            return decoder.decode(buffer);
        } catch (error) {
            console.error('Fetch error:', error);
            throw error;
        }
    }

    async loadChapterList() {
        try {
            const html = await this.fetchWithProxy(this.baseUrl);
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const sectionList = doc.querySelector('#section-list');
            if (!sectionList) {
                throw new Error('未找到章节列表');
            }

            const chapterLinks = Array.from(sectionList.querySelectorAll('li a'))
                .filter(link => {
                    const title = link.textContent.trim();
                    return title && !title.includes('undefined') && !title.includes('最新章节');
                });

            this.chapters = chapterLinks.map((link, index) => {
                const href = link.getAttribute('href');
                const title = link.textContent.trim();
                return {
                    index: index + 1,
                    url: new URL(href, this.baseUrl).href,
                    title: title
                };
            });

            this.totalChapters = this.chapters.length;
            console.log(`成功加载章节列表，共${this.totalChapters}章`);

        } catch (error) {
            console.error('加载章节列表失败:', error);
            throw error;
        }
    }

    async parseChapterContent(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // 获取章节标题
        const titleElement = doc.querySelector('.bookname h1, .title');
        const title = titleElement ? titleElement.textContent.trim() : '';
        
        // 获取章节内容
        const content = doc.querySelector('#content, .chapter-content, .article-content');
        if (!content) {
            throw new Error('未找到章节内容');
        }

        // 清理内容
        let text = content.innerHTML
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/&nbsp;/g, ' ')
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, '')
            .trim();

        // 格式化段落
        const paragraphs = text.split('\n')
            .filter(p => p.trim())
            .map(p => `<p>${p.trim()}</p>`)
            .join('');

        return { title, content: paragraphs };
    }

    async loadChapter(chapterNum, append = false) {
        if (chapterNum < 1 || chapterNum > this.totalChapters) {
            this.showError('章节不存在');
            return;
        }

        if (this.isLoading) return;

        try {
            this.isLoading = true;
            this.showLoading(true);

            const chapter = this.chapters[chapterNum - 1];
            if (!this.chaptersData[chapterNum]) {
                const html = await this.fetchWithProxy(chapter.url);
                const { title, content } = await this.parseChapterContent(html);
                this.chaptersData[chapterNum] = { title, content };
            }

            const chapterData = this.chaptersData[chapterNum];
            
            if (append) {
                const contentDiv = document.createElement('div');
                contentDiv.className = 'chapter';
                contentDiv.dataset.chapterNum = chapterNum;
                contentDiv.innerHTML = `
                    <div class="chapter-separator">
                        <h2 class="chapter-title">${chapterData.title}</h2>
                    </div>
                    ${chapterData.content}
                `;
                
                document.querySelector('.chapter-content').appendChild(contentDiv);
                this.loadedChapters.add(chapterNum);
            } else {
                document.querySelector('.chapter-title').textContent = chapterData.title;
                const contentDiv = document.querySelector('.chapter-content');
                contentDiv.innerHTML = `
                    <div class="chapter" data-chapter-num="${chapterNum}">
                        ${chapterData.content}
                    </div>
                `;
                this.loadedChapters = new Set([chapterNum]);
            }

            this.currentChapter = chapterNum;
            this.lastLoadedChapter = chapterNum;
            this.saveProgress();
            this.updateActiveChapter();
            this.updateNavButtons();

            if (!append) {
                window.scrollTo(0, 0);
            }

            // 在加载完当前章节后，预加载下一章
            const nextChapter = chapterNum + 1;
            if (nextChapter <= this.totalChapters && !this.chaptersData[nextChapter]) {
                this.fetchWithProxy(this.chapters[nextChapter - 1].url)
                    .then(html => this.parseChapterContent(html))
                    .then(({ title, content }) => {
                        this.chaptersData[nextChapter] = { title, content };
                    })
                    .catch(error => console.error('预加载失败:', error));
            }

        } catch (error) {
            console.error('加载章节失败:', error);
            this.showError('加载章节失败，请重试');
        } finally {
            this.isLoading = false;
            this.showLoading(false);
        }
    }

    initInfiniteScroll() {
        // 预加载下一章的函数
        const preloadNextChapter = async () => {
            if (this.isLoading) return;
            
            const nextChapter = this.lastLoadedChapter + 1;
            if (nextChapter <= this.totalChapters && !this.chaptersData[nextChapter]) {
                try {
                    const chapter = this.chapters[nextChapter - 1];
                    const html = await this.fetchWithProxy(chapter.url);
                    const { title, content } = await this.parseChapterContent(html);
                    this.chaptersData[nextChapter] = { title, content };
                } catch (error) {
                    console.error('预加载失败:', error);
                }
            }
        };

        // 检查是否需要显示预加载的内容
        const checkShowNext = () => {
            if (this.isLoading) return;
            
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            const scrollTop = window.scrollY || document.documentElement.scrollTop;
            
            // 当滚动到 50% 时显示下一章
            if ((scrollTop + windowHeight) / documentHeight > 0.5) {
                const nextChapter = this.lastLoadedChapter + 1;
                if (nextChapter <= this.totalChapters && !this.loadedChapters.has(nextChapter)) {
                    this.loadChapter(nextChapter, true);
                    // 预加载再下一章
                    preloadNextChapter();
                }
            }
        };

        // 使用节流函数来限制检查频率
        let timeout;
        const throttledCheck = () => {
            if (!timeout) {
                timeout = setTimeout(() => {
                    checkShowNext();
                    timeout = null;
                }, 200);
            }
        };

        // 监听滚动事件
        window.addEventListener('scroll', throttledCheck);

        // 初始预加载下一章
        preloadNextChapter();
    }

    saveProgress() {
        localStorage.setItem('currentChapter', this.currentChapter.toString());
        this.showProgress();
    }

    loadProgress() {
        const saved = localStorage.getItem('currentChapter');
        if (saved) {
            this.currentChapter = parseInt(saved);
        }
    }

    initTheme() {
        const themeToggle = document.getElementById('themeToggle');
        const savedTheme = localStorage.getItem('theme');
        
        if (savedTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeToggle.checked = true;
        }

        themeToggle.addEventListener('change', () => {
            if (themeToggle.checked) {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('theme', 'light');
            }
        });
    }

    async initTOC() {
        const toc = document.getElementById('toc');
        toc.innerHTML = '';

        this.chapters.forEach(chapter => {
            const link = document.createElement('a');
            link.href = '#' + chapter.index;
            link.className = 'chapter-link';
            link.textContent = chapter.title;
            link.onclick = (e) => {
                e.preventDefault();
                this.loadChapter(chapter.index);
            };
            toc.appendChild(link);
        });

        if (this.currentChapter) {
            await this.loadChapter(this.currentChapter);
        }
    }

    bindEvents() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                this.loadChapter(this.currentChapter - 1);
            } else if (e.key === 'ArrowRight') {
                this.loadChapter(this.currentChapter + 1);
            }
        });

        let timeout;
        document.addEventListener('scroll', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                this.saveProgress();
            }, 1000);
        });

        const prevBtn = document.getElementById('prevChapter');
        const nextBtn = document.getElementById('nextChapter');
        
        prevBtn.onclick = () => this.loadChapter(this.currentChapter - 1);
        nextBtn.onclick = () => this.loadChapter(this.currentChapter + 1);
    }

    updateNavButtons() {
        const prevBtn = document.getElementById('prevChapter');
        const nextBtn = document.getElementById('nextChapter');
        
        prevBtn.disabled = this.currentChapter <= 1;
        nextBtn.disabled = this.currentChapter >= this.totalChapters;
    }

    updateActiveChapter() {
        document.querySelectorAll('.chapter-link').forEach(link => {
            link.classList.remove('active');
        });
        const activeLink = document.querySelector(`[href="#${this.currentChapter}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
            activeLink.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    showLoading(show) {
        document.getElementById('loading').classList.toggle('show', show);
        document.querySelector('.infinite-scroll-loading').classList.toggle('show', show);
    }

    showError(message) {
        const error = document.getElementById('error');
        if (message) {
            error.textContent = message;
            error.classList.add('show');
            setTimeout(() => error.classList.remove('show'), 3000);
        } else {
            error.classList.remove('show');
        }
    }

    showProgress() {
        const progress = document.getElementById('progress');
        progress.classList.add('show');
        setTimeout(() => progress.classList.remove('show'), 2000);
    }
}

// 初始化阅读器
const reader = new Reader();