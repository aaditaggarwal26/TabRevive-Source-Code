(function () {
    const root = document.documentElement;

    function applyTheme() {
        root.dataset.theme = localStorage.getItem('trTheme') || 'oled';

        const bg = localStorage.getItem('trBg');
        if (bg) {
            root.dataset.bg = '';
            root.style.setProperty('--bg-image', bg);
            root.style.setProperty('--dim', String(Number(localStorage.getItem('trDim') ?? 40) / 100));
        } else {
            delete root.dataset.bg;
            root.style.removeProperty('--bg-image');
            root.style.removeProperty('--dim');
        }
    }

    let toastTimer = null;
    function toast(message, type = 'success') {
        let el = document.getElementById('toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'toast';
            el.className = 'notification';
            el.setAttribute('role', 'status');
            document.body.appendChild(el);
        }
        el.textContent = message;
        el.dataset.type = type;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), type === 'success' ? 1600 : 3500);
    }

    applyTheme();
    window.addEventListener('storage', applyTheme);
    window.applyTheme = applyTheme;
    window.toast = toast;
})();
