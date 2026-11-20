from playwright.sync_api import sync_playwright

BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"

MAX_TABS = 8
MAX_EXPANDS = 12
SCROLL_STEPS = 18

EXPAND_SELECTORS = [
    'button[apptranslate="readMore"]',
    'button:has-text("Read More")',
    'button:has-text("Show More")',
    'button:has-text("View More")',
    'a:has-text("Read More")',
    'span:has-text("Read More")',
]


def settle(page) -> None:
    try:
        page.wait_for_load_state("networkidle", timeout=6000)
    except Exception:
        pass


def collect(page, seen: set, parts: list) -> None:
    html = page.content()
    if html not in seen:
        seen.add(html)
        parts.append(html)


def expand_all(page, done: set) -> None:
    for selector in EXPAND_SELECTORS:
        try:
            controls = page.query_selector_all(selector)
        except Exception:
            continue
        for control in controls:
            if len(done) >= MAX_EXPANDS:
                return
            try:
                box = control.bounding_box()
                if box is None:
                    continue
                key = (selector, round(box["x"]), round(box["y"]))
                if key in done:
                    continue
                label = (control.inner_text() or "").strip().lower()
                if "less" in label:
                    continue
                control.scroll_into_view_if_needed(timeout=1500)
                control.click(timeout=1500)
                done.add(key)
                page.wait_for_timeout(300)
            except Exception:
                continue


def scroll_through(page, seen: set, parts: list, done: set) -> None:
    try:
        page.mouse.move(700, 500)
    except Exception:
        pass
    for _ in range(SCROLL_STEPS):
        try:
            page.mouse.wheel(0, 900)
            page.evaluate("window.scrollBy(0, 900)")
        except Exception:
            break
        page.wait_for_timeout(450)
        expand_all(page, done)
        collect(page, seen, parts)


def click_tabs(page, seen: set, parts: list, done: set) -> None:
    clicked = 0
    for handle in page.query_selector_all('[role="tab"]'):
        if clicked >= MAX_TABS:
            return
        try:
            handle.click(timeout=3000)
            settle(page)
            expand_all(page, done)
            collect(page, seen, parts)
            clicked += 1
        except Exception:
            continue


def render_pages(url: str, timeout_ms: int = 30000) -> list[str]:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            context = browser.new_context(
                user_agent=BROWSER_UA,
                viewport={"width": 1400, "height": 900},
            )
            page = context.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            settle(page)

            seen = set()
            parts = []
            done = set()
            expand_all(page, done)
            collect(page, seen, parts)
            scroll_through(page, seen, parts, done)
            click_tabs(page, seen, parts, done)
            return parts
        finally:
            browser.close()