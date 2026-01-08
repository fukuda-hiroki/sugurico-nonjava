'use strict';

document.addEventListener('DOMContentLoaded', async () => {

    // --- HTML要素の取得 ---
    const postsListContainer = document.getElementById('bookmarks-list');
    const paginationContainer = document.getElementById('pagination-container');

    // --- 1. ログイン状態をチェック ---
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        // ログインしていなければ、ログインページにリダイレクト
        window.location.href = 'login.html';
        return;
    }

    const currentUser = session.user;

    // ★ 共通関数を呼び出すように変更
    const isPremium = await isCurrentUserPremium();

    if (!isPremium) {
        document.querySelector('main').innerHTML = '<h1>アクセス権がありません</h1><p>この機能はプレミアム会員限定です。</p>';
        return;
    }

    // --- 2. ページネーションの準備 ---
    const urlParams = new URLSearchParams(window.location.search);
    const currentPage = parseInt(urlParams.get('page')) || 1;
    const postsPerPage = 10;

    // --- 3. ブックマークした投稿を取得して表示 ---
    try {
        postsListContainer.innerHTML = '<p>読み込み中...</p>';

        // ▼▼▼ このtryブロックの中身をすべて置き換える ▼▼▼

        // 1. ページネーションなしで、ブックマークした投稿IDと投稿データをすべて取得
        const { data: bookmarkedItems, error: postsError } = await supabaseClient
            .from('bookmark')
            .select(`
                forums (
                    forum_id,
                    title,
                    text,
                    delete_date,
                    created_at,
                    user_id_auth,
                    users!forums_user_id_auth_fkey ( user_name, premium_flag ),
                    forum_images ( image_url )
                )
            `)
            .eq('user_id', currentUser.id)
            .order('created_at', { asending: false });// ブックマークした日時でソート

        if (postsError) throw postsError;

        if (!bookmarkedItems || bookmarkedItems.length === 0) {
            postsListContainer.innerHTML = '<p>ブックマークされた投稿はまだありません。</p>';
            return;
        }
        // 2. 期限切れの投稿IDを収集し、有効な投稿だけをフィルタリング
        const expiredPostIds = [];
        const validPosts = bookmarkedItems
            .map(item => item.forums)// forumsオブジェクトだけを取り出す
            .filter(post => {
                if (post && (post.delete_date === null || new Date(post.delete_date) > new Date())) {
                    return true;// 有効な投稿
                } else {
                    if (post) expiredPostIds.push(post.forum_id); // 期限切れのIDを収集
                    return false;// 無効な投稿 (期限切れ or 削除済み)
                }
            });

        // 3. (バックグラウンドで) 期限切れのブックマークをDBから削除

        if (expiredPostIds.length > 0) {
            alert("期限切れの投稿がありましたので自動的に削除されました。");
            console.log('期限切れのブックマークを削除します:', expiredPostIds);
            // awaitを付けずに実行 (Fire and Forget)
            supabaseClient.from('bookmark')
                .delete()
                .eq('user_id', currentUser.id)
                .in('post_id', expiredPostIds)
                .then();

        }

        // 4. 有効な投稿でページネーションと表示を行う
        const totalPosts = validPosts.length;
        if (totalPosts === 0) {
            postsListContainer.innerHTML = '<p>ブックマークされた投稿はまだありません。</p>';
            return;
        }
        // 手動でページネーション処理
        const offset = (currentPage - 1) * postsPerPage;
        const postToShow = validPosts.slice(offset, offset + postsPerPage);

        postsListContainer.innerHTML = postToShow.map(post => renderPostHTML(post)).join('');
        renderPagination(totalPosts, currentPage, postsPerPage);
        // ▲▲▲ 置き換えここまで ▲▲▲

    } catch (error) {
        console.error('ブックマークの取得エラー:', error);
        postsListContainer.innerHTML = `<p>ブックマークの読み込み中にエラーが発生しました。</p>`;
    }

    // ==================================================
    //  ヘルパー関数
    // ==================================================

    function renderPostHTML(post) {
        // search.jsやmypage.jsと同じHTML生成ロジックを再利用
        let thumbnailHTML = '';
        if (post.forum_images && post.forum_images.length > 0) {
            thumbnailHTML = `<div class="post-item-thumbnail"><img src="${post.forum_images[0].image_url}" alt="サムネイル"></div>`;
        }
        const remainingTime = timeLeft(post.delete_date);
        const timeAgoString = timeAgo(post.created_at);

        const premiumIconHTML = post.users?.premium_flag === true ? '<img src="../../common/circle-check-solid-full.svg" class="premium-badge">' : '';
        let authorName = escapeHTML(post.users?.user_name || '不明');
        let authorHTML = `${authorName} ${premiumIconHTML}`;

        // 自分投稿かどうかで編集・削除ボタンの表示を切り替え
        let actionsHTML = '';
        if (currentUser.id === post.user_id_auth) {
            actionsHTML = `
                <div class="post-item-actions">
                    <a href="../../forums/html/forum_input.html?edit_id=${post.forum_id}" class="action-button edit-button">編集</a>
                    <button type="button" class="action-button delete-button" data-post-id="${post.forum_id}">削除</button>
                </div>`;
        }

        return `
            <article class="post-item">
                <a href="../../forums/html/forum_detail.html?id=${post.forum_id}" class="post-item-link">
                    <div class="post-item-main ${thumbnailHTML ? 'has-thumbnail' : ''}">
                        
                        <div class="post-item-content">
                            <h3>${escapeHTML(post.title)} <small style="color:gray;">${timeAgoString}</small></h3>
                            <p>${nl2br(post.text.length > 50 ? post.text.slice(0, 50) + '...' : post.text)}</p>
                            <small>投稿者: ${authorHTML}</small>
                            <br>
                            <small style="color:gray;">${remainingTime}</small>
                        </div>
                    </div>
                </a>
                ${thumbnailHTML}
                ${actionsHTML}
            </article>
        `;
    }

    function renderPagination(totalItems, currentPage, itemsPerPage) {
        // ★ 変数名を totalPages に修正
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
            return;
        }

        let paginationHTML = '';

        // 前のページリンク
        if (currentPage > 1) {
            paginationHTML += `<a href="?page=${currentPage - 1}">« 前へ</a>`;
        }

        // ページ番号リンク
        for (let i = 1; i <= totalPages; i++) {
            if (i === currentPage) {
                paginationHTML += `<span class="current-page">${i}</span>`;
            } else {
                paginationHTML += `<a href="?page=${i}">${i}</a>`;
            }
        }

        // 次のページリンク
        if (currentPage < totalPages) {
            paginationHTML += `<a href="?page=${currentPage + 1}">次へ »</a>`;
        }

        paginationContainer.innerHTML = paginationHTML;
    }

    // 削除ボタン用のイベントリスナーを設定
    postsListContainer.addEventListener('click', async (event) => {
        if (event.target.classList.contains('delete-button')) {
            const postId = event.target.dataset.postId;
            if (confirm('この投稿を本当に削除しますか？')) {
                const { error } = await supabaseClient.rpc('delete_forum_with_related_data', { forum_id_param: postId });
                if (error) {
                    alert('削除に失敗しました。');
                } else {
                    alert('削除しました。');
                    location.reload(); // 簡単にするためリロード
                }
            }
        }
    });

});