// main.js
'use strict';


document.addEventListener('DOMContentLoaded', async () => {
    
    const { data: { session } } = await supabaseClient.auth.getSession();

    let blockedUserIds = [];
    if (session) {
        const { data: blockedUsers, error } = await supabaseClient
            .from('blocks')
            .select('blocked_user_id')
            .eq('blocker_user_id', session.user.id);

        if (error) {
            console.error('ブロックリストの取得に失敗:', error);
        } else {
            blockedUserIds = blockedUsers.map(b => b.blocked_user_id);
        }
    }

    if (session) {
        document.getElementById('my-posts-section').style.display = 'block';
        document.getElementById('new-post-button').style.display = 'flex';
        fetchAndDisplayPosts('my-posts-list', session.user.id, null, []);
        fetchAndDisplayPosts('all-posts-list', null, session.user.id, blockedUserIds);

    } else {
        fetchAndDisplayPosts('all-posts-list', null, null, []);
    }
});


/**
 * Supabaseから投稿を取得し、指定された場所に表示する関数
 * @param {string} containerId - 投稿を表示するHTML要素のID
 * @param {string|null} userId - 特定のユーザーID（指定しない場合はnull）
 * @param {string|null} excludeUserId - 除外するユーザーID（指定しない場合はnull）
 * @param {string[]} blockedUserIds - ブロック対象のユーザーIDの配列
 */
// ▼▼▼ 引数に blockedUserIds を追加 ▼▼▼
async function fetchAndDisplayPosts(containerId, userId = null, excludeUserId = null, blockedUserIds = []) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    try {
        let query = supabaseClient
            .from('forums')
            .select(`
                forum_id,
                title,
                text,
                delete_date,
                created_at,
                users!user_id_auth(user_name,premium_flag),
                forum_images ( image_url ) 
            `)
            .or('delete_date.is.null,delete_date.gt.now()')
            .order('created_at', { ascending: false })
            .limit(3);

        if (userId) {
            query = query.eq('user_id_auth', userId);
        }
        if (excludeUserId) {
            query = query.not('user_id_auth', 'eq', excludeUserId);
        }

        if (blockedUserIds.length > 0) {
            query = query.not('user_id_auth', 'in', `(${blockedUserIds.join(',')})`);
        }

        const { data: posts, error } = await query;
        
        if (error) throw error;

        // --- HTMLの組み立て --- (ここから下は変更なし)
        if (posts.length > 0) {
            container.innerHTML = posts.map(post => {
                let thumbnailHTML = '';
                if (post.forum_images && post.forum_images.length > 0) {
                    thumbnailHTML = `<div class="post-item-thumbnail"><img src="${post.forum_images[0].image_url}" alt="投稿画像"></div>`;
                }
                const remainingTime = timeLeft(post.delete_date);
                const timeAgoString = timeAgo(post.created_at);
	
                const premiumIconHTML = post.users?.premium_flag === true ? '<img src="../../common/circle-check-solid-full.svg" class="premium-badge">' : '';	
                let authorName = escapeHTML(post.users?.user_name || '不明');	
                let authorHTML = `${authorName} ${premiumIconHTML}`;

                return `
                    <a href="/forums/html/forum_detail.html?id=${post.forum_id}" class="post-link">
                        <article class="post-item ${thumbnailHTML ? 'has-thumbnail' : ''}">
                            <div class="post-item-content">
                                <h3>${escapeHTML(post.title)} <small style="color:gray;">${timeAgoString}</small> </h3>
                                <p>${escapeHTML(post.text.length > 20 ? post.text.slice(0, 20) + '...' : post.text).replace(/\n/g, '<br>')}</p>
                                <small>投稿者: ${authorHTML}</small>
                                <br>
                                <small style="color:gray;">${remainingTime}</small>
                            </div>
                            ${thumbnailHTML}
                        </article>
                    </a>
                `;
            }).join('');
        } else {
            container.innerHTML = '<p>まだ投稿がありません。</p>';
        }

    } catch (error) {
        console.error('投稿の取得に失敗しました:', error);
        container.innerHTML = '<p>投稿の読み込み中にエラーが発生しました。</p>';
    }
}