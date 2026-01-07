
'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const pageTitle = document.getElementById('page-title');
    const postsListContainer = document.getElementById('posts-list-container');
    const paginationContainer = document.getElementById('pagination-container');

    const toggleSearchButton = document.getElementById('toggle-search-button');
    const advancedSearchForm = document.getElementById('advanced-search-form');
    const filterButton = document.getElementById('filter-button');
    const keywordInput = document.getElementById('search-keyword');
    const periodSelect = document.getElementById('period-select');
    const sortSelect = document.getElementById('sort-select');
    const tagSelect = document.getElementById('tag-select');

    const urlParams = new URLSearchParams(window.location.search);
    const targetUserId = urlParams.get('id');

    async function initializePage() {
        if (!targetUserId) {
            pageTitle.textContent = 'ユーザーが指定されていません。';
            return;
        }

        try {
            const { data: targetUser, error: userError } = await supabaseClient
                .from('users')
                .select('user_name, premium_flag')
                .eq('id', targetUserId)
                .single();
            if (userError || !targetUser) throw new Error('ユーザーが見つかりません。');
            const premiumIconHTML = targetUser.premium_flag === true ? '<img src="../../common/circle-check-solid-full.svg" style="width:30px;" >' : '';
            pageTitle.innerHTML = `${targetUser.user_name}さん ${premiumIconHTML}の投稿一覧`;
        } catch (e) {
            pageTitle.textContent = '';
            return;
        }


        await populateUserTags();
        await fetchAndDisplayUserPosts();
        setupEventListeners();
    }

    function setupEventListeners() {
        toggleSearchButton.addEventListener('click', () => {
            const isHidden = advancedSearchForm.style.display === 'none';
            advancedSearchForm.style.display = isHidden ? 'block' : 'none';
            toggleSearchButton.textContent = isHidden ? '詳細検索を閉じる' : '詳細検索';
        });

        filterButton.addEventListener('click', () => {
            fetchAndDisplayUserPosts(1);
        });
    }

    async function populateUserTags() {
        try {
            const { data: tags, error } = await supabaseClient
                .rpc('get_user_tags', {
                    user_id_param: targetUserId
                });
            if (error) throw error;

            tagSelect.innerHTML = '<option value="">すべてのタグ</option>';
            if (tags && tags.length > 0) {
                tags.forEach(tag => {
                    const option = document.createElement('option');
                    option.value = tag.tag_id;
                    option.textContent = tag.tag_name;
                    tagSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('ユーザーのタグリスト取得に失敗:', error);
        }
    }

    async function fetchAndDisplayUserPosts(page = 1) {
        postsListContainer.innerHTML = '読み込み中...';
        paginationContainer.innerHTML = '';
        try {
            const postsPerPage = 10;
            const { data, error, count } = await supabaseClient
                .rpc('filter_other_user_posts', {
                    user_id_param: targetUserId,
                    keyword_param: keywordInput.value.trim(),
                    period_param: periodSelect.value,
                    tag_id_param: tagSelect.value ? parseInt(tagSelect.value) : null,
                    sort_order_param: sortSelect.value,
                    page_param: page,
                    limit_param: postsPerPage
                }, { count: 'exact' });

            if (error) {
                throw error;
            }

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
            postsListContainer.innerHTML = `<p>投稿の取得中にエラーが発生しました。${error.message}</p>`;
        }
    }

    initializePage();

    function renderPostHTML(post) {
        let thumbnailHTML = '';
        if (post.first_image_url) {
            thumbnailHTML = `
                <div class="post-item-thumbnail">
                    <img src="${post.first_image_url}" alt="投稿画像">
                </div>
            `;
        }

        const remainingTime = typeof timeLeft === 'function' ? timeLeft(post.delete_date) : '';
        const timeAgoString = typeof timeAgo === 'function' ? timeAgo(post.created_at) : '';

        const premiumIconHTML = post.premium_flag === true ? '<img src="/common/circle-check-solid-full.svg" class="premium-badge">' : '';
        let authorName = escapeHTML(post.user_name || '不明');
        let authorHTML = `${authorName} ${premiumIconHTML}`;

        const shortText = post.text && post.text.length > 50
            ? escapeHTML(post.text.substring(0, 50)) + '...'
            : escapeHTML(post.text || '');

        return `<a href="/forums/html/forum_detail.html?id=${post.forum_id}">
                    <article class="post-item ${thumbnailHTML ? 'has-thumbnail' : ''}" role="link" tabindex="0">
                        <div class="post-item-main">
                            <h3>${escapeHTML(post.title)} <small>${timeAgoString}</small></h3>
                            <p>${shortText}</p>
                            <small style="color:gray;">投稿者: ${authorHTML}</small>
                            <small style="color:gray;">${remainingTime}</small>
                        </div>
                        ${thumbnailHTML}
                    </article>
                </a>
        `;
    }

    function renderPagination(totalItems, currentPage, itemsPerPage) {
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
            return;
        }
        let paginationHTML = '';
        const baseLink = `?id=${targetUserId}`;
        if (currentPage > 1) {
            paginationHTML += `<a href="${baseLink}&page=${currentPage - 1}">« 前へ</a>`;
        }
        for (let i = 1; i <= totalPages; i++) {
            if (i === currentPage) {
                paginationHTML += `<span class="current-page">${i}</span>`;
            } else {
                paginationHTML += `<a href="${baseLink}&page=${i}">${i}</a>`;
            }
        }
        if (currentPage < totalPages) {
            paginationHTML += `<a href="${baseLink}&page=${currentPage + 1}">次へ »</a>`;
        }
        paginationContainer.innerHTML = paginationHTML;
    }
});