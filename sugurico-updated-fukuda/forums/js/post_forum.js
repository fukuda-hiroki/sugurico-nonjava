'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    // --- HTML要素の取得 ---
    const pageTitle = document.querySelector('.form-container h1');
    const postForm = document.getElementById('post-form');
    const titleInput = document.getElementById('titleInput');
    const textInput = document.getElementById('textInput');
    const expireSelect = document.getElementById('expireSelect');
    const premiumExpireArea = document.getElementById('premium-expire-input-area');
    const premiumExpireInput = document.getElementById('premiumExpireInput');
    const isPrivateCheckbox = document.getElementById('isPrivateCheckbox');
    const currentExpirationInfo = document.getElementById('current-expiration-info');
    const imageInputContainer = document.getElementById('image-input-container');
    const submitButton = document.getElementById('submitButton');
    // --- ページ全体で使う変数 ---
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit_id');
    const isEditMode = !!editId;

    let currentUser;
    let isPremiumUser = await isCurrentUserPremium(); // ★2. プレミアム状態を管理する変数を宣言
    console.log("isPremiumUser is " + isPremiumUser);

    /**
     * ページの初期化処理
     */
    async function initializePage() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
            alert('この操作にはログインが必要です。');
            window.location.href = '../../auth/html/login.html';
            return;
        }
        currentUser = user;



        if (isPremiumUser) {
            expireSelect.style.display = 'none';
            premiumExpireArea.style.display = 'block';
        }

        if (isEditMode) {
            const newTitle = '投稿を編集する | スグリコ'
            pageTitle.textContent = '投稿を編集する';
            document.title = newTitle;
            submitButton.textContent = '更新する';
            await loadPostForEditing();
        } else {
            const newTitle = '新しい記録を投稿 | スグリコ';
            pageTitle.textContent = '新しい記録を投稿';
            document.title = newTitle;
            submitButton.textContent = '投稿する';
            if (window.imageManager) window.imageManager.init(isPremiumUser, []);
            if (window.tagManager) window.tagManager.init([]);// 新規作成時は空のタグで初期化
        }

        setupEventListeners();
    }

    /**
     * 編集対象の投稿データを読み込み、フォームに設定する
     */
    async function loadPostForEditing() {
        try {
            const { data: post, error } = await supabaseClient
                .from('forums')
                .select('*, tag(tag_dic(tag_name)), forum_images(image_id, image_url)')
                .eq('forum_id', editId)
                .single();

            if (error || !post) throw new Error('投稿が見つからないか、読み込めませんでした');
            if (post.user_id_auth !== currentUser.id) {
                alert('他人の投稿は編集できません。');
                window.location.href = '../../pages/html/index.html';
                return;
            }

            // --- フォームに既存データを設定 ---
            titleInput.value = post.title;
            textInput.value = post.text;

            if (post.delete_date) {
                const expirationDate = new Date(post.delete_date);
                const now = new Date();
                if (expirationDate <= now) {
                    if (isPremiumUser) {
                        isPrivateCheckbox.checked = true;
                        if (premiumExpireInput) premiumExpireInput.disabled = true;
                    } else {
                        expireSelect.value = 'private';
                    }
                } else {
                    currentExpirationInfo.textContent = `現在の期限: ${expirationDate.toLocaleString('ja-JP')}`;
                    currentExpirationInfo.style.display = 'block';
                    if (isPremiumUser) {
                        const year = expirationDate.getFullYear();
                        const month = String(expirationDate.getMonth() + 1).padStart(2, '0');
                        const day = String(expirationDate.getDate()).padStart(2, '0');
                        const hours = String(expirationDate.getHours()).padStart(2, '0');
                        const minutes = String(expirationDate.getMinutes()).padStart(2, '0');
                        premiumExpireInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
                    }
                }
            } else {
                if (!isPremiumUser) {
                    expireSelect.value = 'permanent';
                }
            }

            if (window.tagManager) {
                const tagNames = post.tag ? post.tag.map(t => t.tag_dic.tag_name) : [];
                window.tagManager.init(tagNames);
            }

            if (window.imageManager) {
                const initialImages = post.forum_images ? post.forum_images.map(img => ({ id: img.image_id, url: img.image_url })) : [];
                window.imageManager.init(isPremiumUser, initialImages);
            }

        } catch (error) {
            console.error('編集データの読み込みエラー:', error);
            alert('データの読み込みに失敗しました。');
            window.location.href = '../../pages/html/index.html';
        }
    }

    function setupEventListeners() {
        postForm.addEventListener('submit', handleFormSubmit);
        if (isPremiumUser) {
            isPrivateCheckbox.addEventListener('change', () => {
                premiumExpireInput.disabled = isPrivateCheckbox.checked;
            });
        }
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        submitButton.disabled = true;

        try {
            if (isEditMode) {
                submitButton.textContent = '更新中...';
                await updatePost();
                alert('投稿を更新しました。');
                window.location.href = `../../forums/html/forum_detail.html?id=${editId}`;
            } else {
                submitButton.textContent = '投稿中...';
                await createPost();
                alert('投稿が完了しました。');
                window.location.href = '../../pages/html/index.html';
            }
        } catch (error) {
            console.error('投稿/更新エラー', error);
            alert(`処理に失敗しました: ${error.message}`);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = isEditMode ? '更新する' : '投稿する';
        }
    }


    // 2026年1月7日　非表示指定されたら紐づいたブックマークすべて削除せよ
    async function createPost() {
        const imageInputs = imageInputContainer.querySelectorAll('.image-input');
        const filesToUpload = Array.from(imageInputs).map(input => input.files[0]).filter(Boolean);
        const imageUrls = await uploadImages(filesToUpload);

        const { data: [savedForum], error: forumError } = await supabaseClient.from('forums').insert({
            user_id_auth: currentUser.id,
            title: titleInput.value,
            text: textInput.value,
            delete_date: calculateDeleteDate()
        }).select();
        if (forumError) throw forumError;

        const tagInputs = document.querySelectorAll('#tag-container .tag-input');
        const tags = [...new Set(Array.from(tagInputs).map(input => input.value.trim()).filter(Boolean))];
        if (tags.length > 0) await saveTags(savedForum.forum_id, tags);
        if (imageUrls.length > 0) await saveImageUrls(savedForum.forum_id, imageUrls);
    }

    async function updatePost() {
        const newDeleteDate = calculateDeleteDate();

        await supabaseClient.from('forums').update({
            title: titleInput.value,
            text: textInput.value,
            delete_date: calculateDeleteDate()
        }).eq('forum_id', editId);

        await supabaseClient.from('tag').delete().eq('forum_id', editId);
        const tagInputs = document.querySelectorAll('#tag-container .tag-input');
        const tags = [...new Set(Array.from(tagInputs).map(input => input.value.trim()).filter(Boolean))];
        if (tags.length > 0) await saveTags(editId, tags);

        const imagesToDeleteIds = window.imageManager ? window.imageManager.getImagesToDelete() : [];
        if (imagesToDeleteIds.length > 0) {
            const { data: imagesToDelete, error: fetchError } = await supabaseClient.from('forum_images').select('image_url').in('image_id', imagesToDeleteIds);
            if (fetchError) throw fetchError;

            if (imagesToDelete.length > 0) {
                const filesToRemove = imagesToDelete.map(img => img.image_url.split('/post-images/')[1]);
                if (filesToRemove.length > 0) await supabaseClient.storage.from('post-images').remove(filesToRemove);
            }
            await supabaseClient.from('forum_images').delete().in('image_id', imagesToDeleteIds);
        }

        const imageInputs = imageInputContainer.querySelectorAll('.image-input');
        const filesToUpload = Array.from(imageInputs).map(input => input.files[0]).filter(Boolean);
        if (filesToUpload.length > 0) {
            const imageUrls = await uploadImages(filesToUpload);
            await saveImageUrls(editId, imageUrls);
        }

        if (newDeleteDate && new Date(newDeleteDate) <= new Date()) {
            console.log("投稿が非公開に設定されたため、関連するブックマークを削除します。");

            const { error: deleteBookmarkError } = await supabaseClient
                .from('bookmark')
                .delete()
                .eq('post_id', editId);
            if (deleteBookmarkError) {
                console.error('ブックマークの削除に失敗しました:', deleteBookmarkError);
            }
        }
    }

    async function uploadImages(files) {
        const uploadedUrls = [];
        if (!files || files.length === 0) return uploadedUrls;

        const uploadPromises = Array.from(files).map(file => {
            const fileExt = file.name.split('.').pop();
            const randomName = crypto.randomUUID();
            const fileName = `${currentUser.id}/${randomName}.${fileExt}`;

            return supabaseClient.storage.from('post-images').upload(fileName, file);
        });

        const results = await Promise.all(uploadPromises);

        for (const result of results) {
            if (result.error) throw new Error('画像アップロードに失敗:' + result.error.message);
            const { data: { publicUrl } } = supabaseClient.storage.from('post-images').getPublicUrl(result.data.path);
            uploadedUrls.push(publicUrl);
        }
        return uploadedUrls;
    }

    async function saveTags(forumId, tagNames) {
        const { data: existingTags, error: selectError } = await supabaseClient.from('tag_dic').select('tag_id, tag_name').in('tag_name', tagNames);
        if (selectError) throw selectError;

        const existingTagsMap = new Map(existingTags.map(tag => [tag.tag_name, tag.tag_id]));
        const newTagNames = tagNames.filter(name => !existingTagsMap.has(name));

        if (newTagNames.length > 0) {
            const { data: insertedTags, error: insertError } = await supabaseClient.from('tag_dic').insert(newTagNames.map(name => ({ tag_name: name }))).select('tag_id, tag_name');
            if (insertError) throw insertError;
            insertedTags.forEach(tag => existingTagsMap.set(tag.tag_name, tag.tag_id));
        }

        const tagIdsToLink = tagNames.map(name => existingTagsMap.get(name));
        const linksToInsert = tagIdsToLink.map(tagId => ({ forum_id: forumId, tag_id: tagId }));
        const { error: linkError } = await supabaseClient.from('tag').insert(linksToInsert);
        if (linkError) throw linkError;
    }

    async function saveImageUrls(forumId, urls) {
        const imageData = urls.map((url, index) => ({ post_id: forumId, image_url: url, display_order: index + 1 }));
        const { error } = await supabaseClient.from('forum_images').insert(imageData);
        if (error) throw error;
    }

    function calculateDeleteDate() {
        if (isPremiumUser) {
            if (isPrivateCheckbox.checked) return new Date().toISOString();
            const dateValue = premiumExpireInput.value;
            if (dateValue) {
                const selectedDate = new Date(dateValue);
                if (selectedDate < new Date()) throw new Error('公開期限は現在より未来の日時を指定してください。');
                return selectedDate.toISOString();
            }
            return null;
        } else {
            const expiresOption = expireSelect.value;
            if (expiresOption === 'permanent') return null;
            const date = new Date();
            if (expiresOption === 'private') return date.toISOString();
            const days = parseInt(expiresOption.replace(/days?/, ''));
            date.setDate(date.getDate() + days);
            return date.toISOString();
        }
    }

    initializePage();
});