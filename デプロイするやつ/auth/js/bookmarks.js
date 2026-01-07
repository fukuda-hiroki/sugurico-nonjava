'use strict';

document.addEventListener('DOMContentLoaded', async () => {

    const postsListContainer = document.getElementById('bookmarks-list');
    const paginationContainer = document.getElementById('pagination-container');

    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        window.location.href = 'login.html';
        return;
    }

    const currentUser = session.user;

    const isPremium = await isCurrentUserPremium();

    if (!isPremium) {
        document.querySelector('main').innerHTML = '<h1>アクセス権がありません</h1><p>この機能はプレミアム会員限定です。</p>';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const currentPage = parseInt(urlParams.get('page')) || 1;
    const postsPerPage = 10;
    const offset = (currentPage - 1) * postsPerPage;

    try {
        postsListContainer.innerHTML = '<p>読み込み中...</p>';

        const { count: totalPosts, error: countError } = await supabaseClient
            .from('bookmark')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUser.id);

        if (countError) throw countError;

        if (totalPosts === 0) {
            postsListContainer.innerHTML = '<p>ブックマークされた投稿はまだありません。</p>';
            return;
        }

        const { data: posts, error: postsError } = await supabaseClient
            .from('bookmark')
            .select(`
                created_at,
                forums (
                    *,
                    users!forums_user_id_auth_fkey ( user_name,premium_flag ),
                    forum_images ( image_url )
                )
            `)
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .range(offset, offset + postsPerPage - 1);

        if (postsError) throw postsError;

        postsListContainer.innerHTML = posts.map(item => renderPostHTML(item.forums)).join('');

        renderPagination(totalPosts, currentPage, postsPerPage);

    } catch (error) {
        console.error('ブックマークの取得エラー:', error);
        postsListContainer.innerHTML = `<p>ブックマークの読み込み中にエラーが発生しました。</p>`;
    }

    // ==================================================
    //  ヘルパー関数
    // ==================================================

    function renderPostHTML(post) {
        let thumbnailHTML = '';
        if (post.forum_images && post.forum_images.length > 0) {
            thumbnailHTML = `<div class="post-item-thumbnail"><img src="${post.forum_images[0].image_url}" alt="サムネイル"></div>`;
        }
        const remainingTime = timeLeft(post.delete_date);
        const timeAgoString = timeAgo(post.created_at);

        const premiumIconHTML = post.users?.premium_flag === true ? '<img src="/common/circle-check-solid-full.svg" class="premium-badge">' : '';
        let authorName = escapeHTML(post.users?.user_name || '不明');
        let authorHTML = `${authorName} ${premiumIconHTML}`;
        let actionsHTML = '';
        if (currentUser.id === post.user_id_auth) {
            actionsHTML = `
                <div class="post-item-actions">
                    <a href="/forums/html/forum_input.html?edit_id=${post.forum_id}" class="action-button edit-button">編集</a>
                    <button type="button" class="action-button delete-button" data-post-id="${post.forum_id}">削除</button>
                </div>`;
        }

        return `
            <article class="post-item">
                <a href="/forums/html/forum_detail.html?id=${post.forum_id}" class="post-item-link">
                    <div class="post-item-main ${thumbnailHTML ? 'has-thumbnail' : ''}">
                        ${thumbnailHTML}
                        <div class="post-item-content">
                            <h3>${escapeHTML(post.title)} <small style="color:gray;">${timeAgoString}</small></h3>
                            <p>${nl2br(post.text.length > 50 ? post.text.slice(0, 50) + '...' : post.text)}</p>
                            <small>投稿者: ${authorHTML}</small>
                            <br>
                            <small style="color:gray;">${remainingTime}</small>
                        </div>
                    </div>
                </a>
                ${actionsHTML}
            </article>
        `;
    }

    function renderPagination(totalItems, currentPage, itemsPerPage) {
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
            return;
        }

        let paginationHTML = '';

        if (currentPage > 1) {
            paginationHTML += `<a href="?page=${currentPage - 1}">« 前へ</a>`;
        }

        for (let i = 1; i <= totalPages; i++) {
            if (i === currentPage) {
                paginationHTML += `<span class="current-page">${i}</span>`;
            } else {
                paginationHTML += `<a href="?page=${i}">${i}</a>`;
            }
        }

        if (currentPage < totalPages) {
            paginationHTML += `<a href="?page=${currentPage + 1}">次へ »</a>`;
        }

        paginationContainer.innerHTML = paginationHTML;
    }

    postsListContainer.addEventListener('click', async (event) => {
        if (event.target.classList.contains('delete-button')) {
            const postId = event.target.dataset.postId;
            if (confirm('この投稿を本当に削除しますか？')) {
                const { error } = await supabaseClient.rpc('delete_forum_with_related_data', { forum_id_param: postId });
                if (error) {
                    alert('削除に失敗しました。');
                } else {
                    alert('削除しました。');
                    location.reload();
                }
            }
        }
    });

});