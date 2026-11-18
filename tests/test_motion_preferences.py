"""Browser regression for Project Hub's reduced-motion preference support."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def run():
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    with sync_playwright() as pl:
        opts = {"executable_path": "/usr/bin/chromium"} if Path("/usr/bin/chromium").exists() else {}
        browser = pl.chromium.launch(headless=True, args=["--no-sandbox"], **opts)
        page = browser.new_page()
        page.set_content(
            """<!doctype html>
            <html><head></head><body>
              <article class="project-card" id="card">Project card</article>
              <div id="toast" class="show" role="status">Saved</div>
            </body></html>"""
        )
        page.add_style_tag(content=css)

        page.emulate_media(reduced_motion="reduce")
        page.locator("#card").hover()
        reduced = page.evaluate("""() => ({
            preference: matchMedia("(prefers-reduced-motion: reduce)").matches,
            scroll: getComputedStyle(document.documentElement).scrollBehavior,
            cardTransition: getComputedStyle(document.querySelector("#card")).transitionDuration,
            cardTransform: getComputedStyle(document.querySelector("#card")).transform,
            toastTransition: getComputedStyle(document.querySelector("#toast")).transitionDuration
        })""")
        assert reduced["preference"] is True, reduced
        assert reduced["scroll"] == "auto", reduced
        assert reduced["cardTransition"] == "1e-05s", reduced
        assert reduced["toastTransition"] == "1e-05s", reduced
        assert reduced["cardTransform"] == "none", reduced

        # The normal Skelly hover treatment remains intact when motion is allowed.
        page.emulate_media(reduced_motion="no-preference")
        page.wait_for_timeout(250)
        normal = page.evaluate("""() => ({
            preference: matchMedia("(prefers-reduced-motion: reduce)").matches,
            scroll: getComputedStyle(document.documentElement).scrollBehavior,
            cardTransition: getComputedStyle(document.querySelector("#card")).transitionDuration,
            cardTransform: getComputedStyle(document.querySelector("#card")).transform
        })""")
        assert normal["preference"] is False, normal
        assert normal["scroll"] == "smooth", normal
        assert normal["cardTransition"] == "0.18s", normal
        assert normal["cardTransform"] != "none", normal
        browser.close()


if __name__ == "__main__":
    run()
    print("REDUCED-MOTION BROWSER TEST PASSED")
