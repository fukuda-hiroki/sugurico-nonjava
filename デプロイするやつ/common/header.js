'use strict';

let isPremium;


/**
 * ページのヘッダー フッターを動的に生成・表示する関数
 */
async function setupHeaderAndFooter() {

    const notificationBar = document.createElement('div');
    notificationBar.id = 'premium-notification-bar';
    notificationBar.style.display = 'none';
    document.body.prepend(notificationBar);


    const headerContainer = document.getElementById('header-container');
    const footerContainer = document.getElementById('footer-container');

    if (!headerContainer || !footerContainer) {
        return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();

    let navHTML = '';

    if (session && session.user) {
        await checkAndShowPremiumNotification(session.user);
        const userName = session.user.user_metadata?.user_name || 'ゲスト';
        const premiumIconHTML = isPremium ? '<img src="../../common/circle-check-solid-full.svg" class="premium-badge">' : '';
        navHTML = `
            <div class="dropdown">
                <a href="#" class="dropdown-toggle">${escapeHTML(userName)}さん ${premiumIconHTML}▼</a>
                <div class="dropdown-menu">
                    <a href="/auth/html/mypage.html">マイページ</a>
                    <a href="/auth/html/update.html">登録情報を変更する</a>`;
        if (isPremium) navHTML += `<a href="/auth/html/bookmarks.html">ブックマーク一覧</a>`;
        navHTML += `<a href="/auth/html/block_list.html">ブロック中のユーザー管理</a>
                    <a href="/auth/html/premium_entry.html">プレミアム機能</a>
                    <hr>
                    <a href="#" id="logout-button">ログアウト</a>
                </div>
            </div>
        `;

    } else {
        navHTML = `
            <a href="/auth/html/login.html">ログイン</a>
            <a href="/auth/html/register.html">新規登録</a>
        `;
    }

    const headerHTML = `
        <div class="header-logo">
            <h1><a href="/index.html">スグリコ</a></h1>
        </div>
        <div class="header-right-group">
            <div class="search-form-container">
                <form action="/pages/html/search.html" method="get">
                    <input type="text" name="terms" placeholder="キーワード検索..." id="terms-box">
                    <select name="type" id="types-box">
                        <option value="keyword">キーワード</option>
                        <option value="tag">タグ</option>
                    </select>
                    <button type="submit">検索</button>
                </form>
            </div>

            <nav class="header-nav">
                ${navHTML}
            </nav>
        </div>
    `;

    headerContainer.innerHTML = headerHTML;

    footerContainer.innerHTML = `<p>&copy; 2025 スグリコ. All Rights Reserved.</p>`;

    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', async (event) => {
            event.preventDefault();
            const { error } = await supabaseClient.auth.signOut();
            if (error) {
                console.error('ログアウトエラー:', error.message);
                alert('ログアウトに失敗しました。');
            } else {
                window.location.href = '/index.html';
            }
        });
    }

    const dropdownToggle = document.querySelector('.dropdown-toggle');
    if (dropdownToggle) {
        const dropdownMenu = document.querySelector('.dropdown-menu');
        const dropdown = dropdownToggle.parentElement;

        dropdown.addEventListener('mouseenter', () => {
            dropdownMenu.style.display = 'block';
        });
        dropdown.addEventListener('mouseleave', () => {
            dropdownMenu.style.display = 'none';
        });


    }

    const event = new CustomEvent('header-loaded');
    document.dispatchEvent(event);

}

async function checkAndShowPremiumNotification(user) {
    try {
        const { data: premium, error } = await supabaseClient
            .from('premium')
            .select('status, limit_date')
            .eq('id', user.id)
            .maybeSingle();
        if (error || !premium || premium.status !== 'active') {
            return;
        }
        isPremium = true;
        const limitDate = new Date(premium.limit_date);
        const now = new Date();
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        if (limitDate > now && limitDate < sevenDaysFromNow) {
            const lastShownKey = `premium_notify_${user.id}`;
            const lastShownTimestamp = localStorage.getItem(lastShownKey);
            const today = new Date().toLocaleDateString();

            if (lastShownTimestamp === today) {
                return;
            }
            const notificationBar = document.getElementById('premium-notification-bar');
            const daysLeft = Math.ceil((limitDate - now) / (1000 * 60 * 60 * 24));

            notificationBar.innerHTML = `
            
                <p>プレミアム会員の有効期限が近づいています。あと${daysLeft}日で自動更新されます。
                   <a href="/auth/html/premium_edit.html">会員情報の確認・変更はこちら</a>
                </p>
                <button id="close-notification-button">&times;</button>
            `;
            notificationBar.style.display = 'flex';

            document.getElementById('close-notification-button').addEventListener('click', () => {
                notificationBar.style.display = 'none';
                localStorage.setItem(lastShownKey, today);
            });
        }

    } catch (error) {
        console.error('プレミアム通知のチェック中にエラー:', error);
    }
}


/**
 * ログイン中のユーザーが有効なプレミアム会員か判定する共通関数
 * @returns {Promise<boolean>} プレミアムならtrue, それ以外はfalse
 */
async function isCurrentUserPremium() {

    const { data: { user } } = await supabaseClient.auth.getUser();

    if (!user) {
        return false;
    }

    const { data: premium, error } = await supabaseClient
        .from('premium')
        .select('status, limit_date')
        .eq('id', user.id)
        .maybeSingle();

    if (error || !premium) {
        return false;
    }

    const isActive = premium.status === 'active';
    const isNotExpired = new Date(premium.limit_date) > new Date();
    return isActive || isNotExpired;

}

setupHeaderAndFooter();
