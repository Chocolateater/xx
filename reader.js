class Reader {
    constructor() {
        // 等待密码验证完成再初始化
        if (window.readerInitialized) {
            this.initReader();
        } else {
            document.addEventListener('passwordVerified', () => {
                this.initReader();
            });
        }
    }

    initReader() {
        this.currentChapter = 1;
        this.chaptersData = {};
        this.chapters = [];
        this.baseUrl = 'https://www.xbiquge0.com/txt/463962/';
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

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async fetchWithRetry(url, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(this.corsProxy + encodeURIComponent(url));
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return await response.text();
            } catch (error) {
                if (i === retries - 1) throw error;
                await this.sleep(1000);
            }
        }
    }

    async loadChapterList() {
        try {
            const html = await this.fetchWithRetry(this.baseUrl);
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const chapterList = doc.querySelector('#list');
            if (!chapterList) throw new Error('未找到章节列表');

            const chapters = Array.from(chapterList.querySelectorAll('dd'))
                .filter(dd => dd.querySelector('a'))
                .map((dd, index) => {
                    const link = dd.querySelector('a');
                    const href = link.getAttribute('href');
                    return {
                        index: index + 1,
                        title: link.textContent.trim(),
                        url: new URL(href, this.baseUrl).href
                    };
                });

            // 过滤掉无效章节
            this.chapters = chapters.filter(chapter => 
                chapter.title && 
                !chapter.title.includes('最新章节') &&
                chapter.url
            );

            this.totalChapters = this.chapters.length;
            console.log(`成功加载章节列表，共${this.totalChapters}章`);
            console.log('第一章URL:', this.chapters[0].url);
        } catch (error) {
            console.error('加载章节列表失败:', error);
            throw error;
        }
    }

    async loadChapterContent(chapterIndex) {
        const chapter = this.chapters[chapterIndex - 1];
        if (!chapter) return null;

        try {
            let fullContent = '';
            let pageNum = 1;
            let hasNextPage = true;

            while (hasNextPage && pageNum <= 30) {
                const pageUrl = chapter.url.replace('.html', `_${pageNum}.html`);
                console.log(`加载章节页面: ${pageUrl}`);
                
                await this.sleep(1000);

                const html = await this.fetchWithRetry(pageUrl);
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                const content = doc.querySelector('#content');
                if (!content || !content.textContent.trim()) {
                    console.log('页面内容为空，停止加载');
                    hasNextPage = false;
                    continue;
                }

                // 移除导航按钮和其他无关元素
                content.querySelectorAll('.bottem2, .bottem1, .chapter-nav').forEach(el => el.remove());

                let pageContent = content.innerHTML
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<[^>]+>/g, '')
                    .trim();

                // 清理特定的无关内容
                const removePatterns = [
                    /上一章\s*[←＜]?\s*章节目录\s*[→＞]?\s*下一章/g,
                    /加入书签/g,
                    /直达顶部/g,
                    /正在手打中，请稍等片刻，内容更新后，请重新刷新页面，即可获取最新更新！/g,
                    /《.*?》.*?笔趣阁.*?更新/g,
                    /牢记网址:\/\/www\.xbiquge0\.com\//g,
                    /下一页/g,
                    /上一页/g,
                    /《.*?》第\d+章.*?\n/g,
                    /\(https?:\/\/[^\)]+\)/g,
                    /记住本站[：:].*/g,
                    /访问下载最新.*/g,
                    /手机阅读.*/g,
                    /本章未完.*?下一页.*/g,
                    /温馨提示：.*/g
                ];

                removePatterns.forEach(pattern => {
                    pageContent = pageContent.replace(pattern, '');
                });

                // 检查内容有效性
                const cleanContent = pageContent.trim();
                if (cleanContent.length < 100 || 
                    cleanContent.includes('正在手打中') || 
                    cleanContent.includes('本站域名')) {
                    console.log('页面内容无效，停止加载');
                    hasNextPage = false;
                    continue;
                }

                // 格式化段落，忽略空行
                const paragraphs = cleanContent.split('\n')
                    .map(p => p.trim())
                    .filter(p => p && p.length > 2)
                    .map(p => `<p>${p}</p>`)
                    .join('');

                fullContent += paragraphs;

                // 检查是否有下一页
                const bottemLinks = Array.from(doc.querySelectorAll('.bottem2 a, .bottem1 a'));
                const hasNextPageLink = bottemLinks.some(link => 
                    link.textContent.includes('下一页') && 
                    !link.textContent.includes('下一章')
                );
                
                if (!hasNextPageLink) {
                    console.log(`第${pageNum}页是最后一页`);
                    hasNextPage = false;
                } else {
                    console.log(`存在下一页，继续加载`);
                }

                pageNum++;
            }

            // 最终的内容清理和验证
            if (!fullContent.trim() || fullContent.length < 200) {
                throw new Error('章节内容无效或太短');
            }

            console.log(`成功加载完整章节，共${pageNum-1}页`);
            return {
                title: chapter.title,
                content: fullContent
            };

        } catch (error) {
            console.error(`加载第${chapterIndex}章失败:`, error);
            throw error;
        }
    }

    async loadChapter(chapterIndex, append = false) {
        if (chapterIndex < 1 || chapterIndex > this.totalChapters) {
            this.showError('章节不存在');
            return;
        }

        if (this.isLoading) return;

        try {
            this.isLoading = true;
            this.showLoading(true);

            if (!this.chaptersData[chapterIndex]) {
                const chapterData = await this.loadChapterContent(chapterIndex);
                if (chapterData) {
                    this.chaptersData[chapterIndex] = chapterData;
                }
            }

            const chapterData = this.chaptersData[chapterIndex];
            
            if (append) {
                const contentDiv = document.createElement('div');
                contentDiv.className = 'chapter';
                contentDiv.dataset.chapterNum = chapterIndex;
                contentDiv.innerHTML = `
                    <div class="chapter-separator">
                        <h2 class="chapter-title">${chapterData.title}</h2>
                    </div>
                    ${chapterData.content}
                `;
                
                document.querySelector('.chapter-content').appendChild(contentDiv);
                this.loadedChapters.add(chapterIndex);
            } else {
                document.querySelector('.chapter-title').textContent = chapterData.title;
                const contentDiv = document.querySelector('.chapter-content');
                contentDiv.innerHTML = `
                    <div class="chapter" data-chapter-num="${chapterIndex}">
                        ${chapterData.content}
                    </div>
                `;
                this.loadedChapters = new Set([chapterIndex]);
            }

            this.currentChapter = chapterIndex;
            this.lastLoadedChapter = chapterIndex;
            this.saveProgress();
            this.updateActiveChapter();
            this.updateNavButtons();

            if (!append) {
                window.scrollTo(0, 0);
            }

        } catch (error) {
            console.error('加载章节失败:', error);
            this.showError('加载失败，请重试');
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
                    const chapterData = await this.loadChapterContent(nextChapter);
                    if (chapterData) {
                        this.chaptersData[nextChapter] = chapterData;
                        console.log(`预加载第${nextChapter}章完成`);
                    }
                } catch (error) {
                    console.error('预加载失败:', error);
                }
            }
        };

        // 添加滚动位置监听，用于更新当前阅读章节
        const updateCurrentReadingChapter = () => {
            if (this.isLoading) return;

            // 获取所有已加载的章节元素
            const chapters = document.querySelectorAll('.chapter');
            const viewportHeight = window.innerHeight;
            const viewportMiddle = window.scrollY + (viewportHeight / 2);

            // 找到当前在视口中间的章节
            let currentReadingChapter = null;
            chapters.forEach(chapter => {
                const chapterRect = chapter.getBoundingClientRect();
                const chapterTop = chapterRect.top + window.scrollY;
                const chapterBottom = chapterTop + chapterRect.height;

                if (viewportMiddle >= chapterTop && viewportMiddle <= chapterBottom) {
                    currentReadingChapter = parseInt(chapter.dataset.chapterNum);
                }
            });

            // 如果找到当前阅读的章节，更新进度
            if (currentReadingChapter && currentReadingChapter !== this.currentChapter) {
                console.log(`正在阅读第 ${currentReadingChapter} 章`);
                this.currentChapter = currentReadingChapter;
                this.saveProgress();
                this.updateActiveChapter();
            }
        };

        // 使用节流函数来限制更新频率
        let updateTimeout;
        const throttledUpdate = () => {
            if (!updateTimeout) {
                updateTimeout = setTimeout(() => {
                    updateCurrentReadingChapter();
                    updateTimeout = null;
                }, 200);
            }
        };

        // 监听滚动事件
        window.addEventListener('scroll', throttledUpdate);

        // 保持原有的检查加载下一章的逻辑
        const checkShowNext = () => {
            if (this.isLoading) return;
            
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            const scrollTop = window.scrollY || document.documentElement.scrollTop;
            
            if ((scrollTop + windowHeight) / documentHeight > 0.5) {
                const nextChapter = this.lastLoadedChapter + 1;
                if (nextChapter <= this.totalChapters && !this.loadedChapters.has(nextChapter)) {
                    console.log(`触发加载第${nextChapter}章`);
                    this.loadChapter(nextChapter, true);
                }
            }
        };

        // 使用节流函数来限制检查频率
        let loadTimeout;
        const throttledCheck = () => {
            if (!loadTimeout) {
                loadTimeout = setTimeout(() => {
                    checkShowNext();
                    loadTimeout = null;
                }, 200);
            }
        };

        window.addEventListener('scroll', throttledCheck);
    }

    saveProgress() {
        localStorage.setItem('currentChapter', this.currentChapter.toString());
        console.log(`进度已保存：第 ${this.currentChapter} 章`);
    }

    loadProgress() {
        const saved = localStorage.getItem('currentChapter');
        if (saved) {
            const chapter = parseInt(saved);
            console.log(`加载已保存的进度：第 ${chapter} 章`);
            this.loadChapter(chapter);
        } else {
            this.loadChapter(1);
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
        
        // 清空现有内容
        toc.innerHTML = '';
        
        // 创建并注入章节链接
        this.chapters.forEach(chapter => {
            const chapterDiv = document.createElement('div');
            chapterDiv.className = 'chapter-link';
            chapterDiv.dataset.chapter = chapter.index;
            chapterDiv.textContent = chapter.title;
            
            // 为当前章节添加激活状态
            if (chapter.index === this.currentChapter) {
                chapterDiv.classList.add('active');
            }
            
            // 添加点击事件
            chapterDiv.addEventListener('click', () => {
                if (!this.isLoading) {
                    this.loadChapter(chapter.index);
                }
            });
            
            toc.appendChild(chapterDiv);
        });

        // 如果有当前章节，加载它
        if (this.currentChapter) {
            await this.loadChapter(this.currentChapter);
            
            // 滚动到当前章节
            const activeChapter = toc.querySelector(`.chapter-link[data-chapter="${this.currentChapter}"]`);
            if (activeChapter) {
                activeChapter.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }

    bindEvents() {
        document.getElementById('toc').addEventListener('click', (e) => {
            const item = e.target.closest('.chapter-link');
            if (item) {
                const chapter = parseInt(item.dataset.chapter);
                this.loadChapter(chapter);
            }
        });

        document.getElementById('prevChapter').addEventListener('click', () => {
            if (this.currentChapter > 1) {
                this.loadChapter(this.currentChapter - 1);
            }
        });

        document.getElementById('nextChapter').addEventListener('click', () => {
            if (this.currentChapter < this.totalChapters) {
                this.loadChapter(this.currentChapter + 1);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                if (this.currentChapter > 1) {
                    this.loadChapter(this.currentChapter - 1);
                }
            } else if (e.key === 'ArrowRight') {
                if (this.currentChapter < this.totalChapters) {
                    this.loadChapter(this.currentChapter + 1);
                }
            }
        });
    }

    updateNavButtons() {
        const prevBtn = document.getElementById('prevChapter');
        const nextBtn = document.getElementById('nextChapter');
        
        prevBtn.disabled = this.currentChapter <= 1;
        nextBtn.disabled = this.currentChapter >= this.totalChapters;
    }

    updateActiveChapter() {
        const allChapters = document.querySelectorAll('.chapter-link');
        allChapters.forEach(chapter => {
            chapter.classList.remove('active');
            if (parseInt(chapter.dataset.chapter) === this.currentChapter) {
                chapter.classList.add('active');
                chapter.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }

    showLoading(show) {
        // 只在控制台显示加载状态
        if (show) {
            console.log('正在加载...');
        }
        // 保留无限滚动的加载提示，但改为更细致的信息
        const infiniteScrollLoading = document.querySelector('.infinite-scroll-loading');
        if (infiniteScrollLoading) {
            if (show && this.lastLoadedChapter) {
                infiniteScrollLoading.textContent = `正在加载第 ${this.lastLoadedChapter + 1} 章...`;
                infiniteScrollLoading.classList.toggle('show', show);
            } else {
                infiniteScrollLoading.classList.remove('show');
            }
        }
    }

    showError(message) {
        // 错误信息改为控制台输出
        console.error('错误:', message);
    }

    showProgress() {
        // 进度信息改为控制台输出
        console.log('进度已保存:', this.currentChapter);
    }
}

// 初始化阅读器
const reader = new Reader();