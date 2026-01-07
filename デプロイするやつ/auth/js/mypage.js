'use strict';

document.addEventListener('DOMContentLoaded', async () => {

    const mypageTitle = document.getElementById('mypage-title');
    const postsListContainer = document.getElementById('my-posts-list');
    const paginationContainer = document.getElementById('pagination-container');
    const toggleSearchButton = document.getElementById('toggle-search-button');
    const advancedSearchForm = document.getElementById('advanced-search-form');
    const filterButton = document.getElementById('filter-button');
    const keywordInput = document.getElementById('search-keyword');
    const periodSelect = document.getElementById('period-select');
    const sortSelect = document.getElementById('sort-select');
    const tagSelect = document.getElementById('tag-select');
    const showedSelect = document.getElementById('showed-select');

    let currentUser;

    async function initializePage() {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            window.location.href = 'login.html';
            return;
        }
        currentUser = session.user;

        const userName = currentUser.user_metadata?.user_name || 'あなた';
        mypageTitle.textContent = `${userName}の投稿一覧`;

        await populateUserTags();

        const urlParams = new URLSearchParams(window.location.search);
        keywordInput.value = urlParams.get('keyword') || '';
        periodSelect.value = urlParams.get('period') || 'all';
        sortSelect.value = urlParams.get('sort') || 'desc';
        tagSelect.value = urlParams.get('tag') || '';
        showedSelect.value = urlParams.get('showed') || 'all';

        await fetchAndDisplayUserPosts(parseInt(urlParams.get('page')) || 1);

        setupEventListeners();

        const actionCards = document.querySelectorAll('.action-card');
        actionCards.forEach((card, index) => {
            setTimeout(() => {
                card.classList.add('is-visible');
            }, index * 100);
        });
        const bookmarkLink = document.getElementById("bookmark-link");
        if (!isPremium) {
            bookmarkLink.style.display = "none";
        }
    }

    function setupEventListeners() {
        toggleSearchButton.addEventListener('click', () => {
            const isHidden = advancedSearchForm.style.display === 'none';
            advancedSearchForm.style.display = isHidden ? 'block' : 'none';

            const btnIcon = toggleSearchButton.querySelector('.btn-icon');
            const btnText = toggleSearchButton.querySelector('.btn-text');
            if (isHidden) {
                if (btnIcon) btnIcon.textContent = '🔼';
                if (btnText) btnText.textContent = '閉じる';
            } else {
                if (btnIcon) btnIcon.textContent = '🔍';
                if (btnText) btnText.textContent = '詳細検索';
            }
        });

        filterButton.addEventListener('click', () => {
            updateURL();
            fetchAndDisplayUserPosts(1);
        });
        postsListContainer.addEventListener('click', (event) => {
            const actionButton = event.target.closest('.action-button');

            if (actionButton && actionButton.classList.contains('delete-button')) {
                const postId = actionButton.dataset.postId;
                handleDeletePost(postId);
                return;
            }
            if (actionButton && actionButton.classList.contains('edit-button')) {
                return;
            }
            const postItem = event.target.closest('.post-item');
            if (postItem && postItem.dataset.href) {
                window.location.href = postItem.dataset.href;
            }
        });

        postsListContainer.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                const postItem = event.target.closest('.post-item');
                if (postItem && postItem.dataset.href) {
                    window.location.href = postItem.dataset.href;
                }
            }
        });
    }

    async function populateUserTags() {
        try {
            const { data: tags, error } = await supabaseClient.rpc('get_user_tags', {
                user_id_param: currentUser.id
            });
            if (error) throw error;

            tagSelect.innerHTML = '<option value="">すべてのタグ</option>';
            if (tags) {
                tags.forEach(tag => {
                    const option = document.createElement('option');
                    option.value = tag.tag_id;
                    option.textContent = tag.tag_name;
                    tagSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('ユーザーのタグリスト取得に失敗:', error);
            tagSelect.innerHTML = '<option value="">すべてのタグ</option>';
        }
    }

    async function fetchAndDisplayUserPosts(page = 1) {
        postsListContainer.innerHTML = '<p class="loading-text">読み込み中...</p>';
        paginationContainer.innerHTML = '';

        try {
            const postsPerPage = 10;
            const { data, error, count } = await supabaseClient.rpc('filter_user_posts', {
                user_id_param: currentUser.id,
                keyword_param: keywordInput.value.trim(),
                period_param: periodSelect.value,
                tag_id_param: tagSelect.value ? parseInt(tagSelect.value) : null,
                sort_order_param: sortSelect.value,
                showed_param: showedSelect.value,
                page_param: page,
                limit_param: postsPerPage
            }, { count: 'exact' });

            if (error) throw error;
            const posts = data;
            const totalPosts = count ?? 0;

            if (posts && posts.length > 0) {
                postsListContainer.innerHTML = posts.map(post => renderPostHTML(post)).join('');
            } else {
                postsListContainer.innerHTML = '<p>該当する投稿はありません。</p>';
            }
            renderPagination(totalPosts, page, postsPerPage);
        } catch (error) {
            console.error('投稿の取得に失敗:', error);
            postsListContainer.innerHTML = `<p>投稿の取得中にエラーが発生しました。</p>`;
        }
    }

    function renderPostHTML(post) {

        let thumbnailHTML = '';
        if (post.first_image_url) {
            thumbnailHTML = `
                <div class="post-item-thumbnail" style="display:flex; justify-content:center; align-items:center;">
                    <img src="${post.first_image_url}" alt="投稿画像" class="my_forum-thumbnail">
                </div>
            `;
        }

        const remainingTime = typeof timeLeft === 'function' ? timeLeft(post.delete_date) : '';
        const timeAgoString = typeof timeAgo === 'function' ? timeAgo(post.created_at) : '';

        const shortText = post.text && post.text.length > 50
            ? escapeHTML(post.text.substring(0, 50)) + '...'
            : escapeHTML(post.text || '');

        return `
            <article class="post-item ${thumbnailHTML ? 'has-thumbnail' : ''}" 
                     data-href="/forums/html/forum_detail.html?id=${post.forum_id}"
                     role="link" 
                     tabindex="0">
                
                <div class="post-item-main">
                    <h3>${escapeHTML(post.title)} <small>${timeAgoString}</small></h3>
                    <p>${shortText}</p>
                    <div class="post-meta">
                        <small>投稿者: ${escapeHTML(post.user_name)}</small>
                        <small style="color:gray;">${remainingTime}</small>
                    </div>
                </div>
                ${thumbnailHTML}

                <div class="post-item-actions">
                    <a href="/forums/html/forum_input.html?edit_id=${post.forum_id}" class="action-button edit-button">編集</a>
                    <button type="button" class="action-button delete-button" data-post-id="${post.forum_id}">削除</button>
                </div>
            </article>
        `;
    }

    async function handleDeletePost(postIdToDelete) {
        if (!confirm('この投稿を本当に削除しますか？\nこの操作は元に戻せません。')) return;

        try {
            const { error } = await supabaseClient.rpc('delete_forum_with_related_data', {
                forum_id_param: parseInt(postIdToDelete)
            });

            if (error) throw error;

            alert('投稿を削除しました。');
            window.location.reload();

        } catch (error) {
            console.error('削除エラー:', error);
            alert(`投稿の削除に失敗しました: ${error.message}`);
        }
    }

    function renderPagination(totalItems, currentPage, itemsPerPage) {
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
        }

        let paginationHTML = '';

        const params = new URLSearchParams();
        if (keywordInput.value.trim() !== '') params.set('keyword', keywordInput.value.trim());
        if (periodSelect.value !== 'all') params.set('period', periodSelect.value);
        if (sortSelect.value !== 'newest') params.set('sort', sortSelect.value);
        if (tagSelect.value !== '') params.set('tag', tagSelect.value);
        if (showedSelect.value !== 'all') params.set('showed', showedSelect.value);

        if (currentPage > 1) {
            params.set('page', currentPage - 1);
            paginationHTML += `<a href="?${params.toString()}" class="pagination-button">前へ</a>`;
        }

        for (let i = 1; i <= totalPages; i++) {
            params.set('page', i);
            if (i === currentPage) {
                paginationHTML += `<span class="pagination-button current">${i}</span>`;
            } else {
                paginationHTML += `<a href="?${params.toString()}" class="pagination-button">${i}</a>`;
            }
        }

        if (currentPage < totalPages) {
            params.set('page', currentPage + 1);
            paginationHTML += `<a href="?${params.toString()}" class="pagination-button">次へ</a>`;
        }

        paginationContainer.innerHTML = paginationHTML;
    }

    function updateURL() {
        const urlParams = new URLSearchParams();
        if (keywordInput.value.trim()) urlParams.set('keyword', keywordInput.value.trim());
        if (periodSelect.value !== 'all') urlParams.set('period', periodSelect.value);
        if (sortSelect.value !== 'desc') urlParams.set('sort', sortSelect.value);
        if (tagSelect.value) urlParams.set('tag', tagSelect.value);
        history.replaceState(null, '', `?${urlParams.toString()}`);
    }

    initializePage();
});