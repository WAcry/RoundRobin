export type ThemeMode = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'roundrobin.theme.v1';

function safeGetItem(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeSetItem(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Ignore quota / unavailable storage errors.
    }
}

let activeMode: ThemeMode = 'system';
let systemMediaQuery: MediaQueryList | null = null;
let systemMediaListener: ((event: MediaQueryListEvent) => void) | null = null;

type LegacyMediaQueryList = MediaQueryList & {
    addListener: (listener: (event: MediaQueryListEvent) => void) => void;
    removeListener: (listener: (event: MediaQueryListEvent) => void) => void;
};

function isLegacyMediaQueryList(mq: MediaQueryList): mq is LegacyMediaQueryList {
    const candidate = mq as unknown as { addListener?: unknown; removeListener?: unknown };
    return typeof candidate.addListener === 'function' && typeof candidate.removeListener === 'function';
}

function setEffectiveTheme(isDark: boolean) {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
}

function detachSystemListener() {
    if (!systemMediaQuery || !systemMediaListener) return;
    const mq = systemMediaQuery;
    const listener = systemMediaListener;
    systemMediaQuery = null;
    systemMediaListener = null;

    try {
        mq.removeEventListener('change', listener);
    } catch {
        if (isLegacyMediaQueryList(mq)) mq.removeListener(listener);
    }
}

function attachSystemListener() {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    systemMediaQuery = mq;
    systemMediaListener = (event: MediaQueryListEvent) => {
        if (activeMode !== 'system') return;
        setEffectiveTheme(event.matches);
    };

    try {
        mq.addEventListener('change', systemMediaListener);
    } catch {
        if (isLegacyMediaQueryList(mq)) mq.addListener(systemMediaListener);
    }

    setEffectiveTheme(mq.matches);
}

export function getThemeMode(): ThemeMode {
    const raw = safeGetItem(THEME_STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
    return 'system';
}

export function applyThemeMode(mode: ThemeMode) {
    activeMode = mode;
    detachSystemListener();

    if (mode === 'system') {
        attachSystemListener();
        return;
    }

    setEffectiveTheme(mode === 'dark');
}

export function setThemeMode(mode: ThemeMode) {
    safeSetItem(THEME_STORAGE_KEY, mode);
    applyThemeMode(mode);
}

export function initTheme() {
    applyThemeMode(getThemeMode());
}
