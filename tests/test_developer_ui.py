"""Browser-level Developer Center test; all native actions are stubbed, never executed."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]


def run():
    with sync_playwright() as pl:
        opts={'executable_path':'/usr/bin/chromium'} if Path('/usr/bin/chromium').exists() else {}
        browser=pl.chromium.launch(headless=True,args=['--no-sandbox'],**opts)
        page=browser.new_page(viewport={'width':1080,'height':800})
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        # Playwright's about:blank origin does not have stable localStorage.
        # Match WebView2's persistent profile with an in-memory, test-only store.
        page.evaluate("""() => {
            const cache = new Map();
            Object.defineProperty(window,'localStorage',{configurable:true,value:{
                getItem:k=>cache.has(k)?cache.get(k):null,
                setItem:(k,v)=>cache.set(k,String(v)),
                removeItem:k=>cache.delete(k)
            }});
        }""")
        page.set_content((ROOT/'skelly_project_hub.html').read_text(encoding='utf-8'),wait_until='domcontentloaded')
        page.evaluate('''() => {
          window.__calls=[];
          window.pywebview={api:{
            load_workspace:async()=>({workspace:null,snapshots:null,recovered:false}),
            save_workspace:async()=>({ok:true}),save_snapshots:async()=>({ok:true}),
            world_status:async()=>({online:false,peers:[],catalog:[]}),
            builder_status:async()=>({active:null,queue:[],folders:{[data.projects[0].id]:'/tmp/mock'},history:[],logs:[],schedule:{enabled:false,interval_minutes:120,project_id:data.projects[0].id,with_tests:true},available:true}),
            launcher_status:async()=>({supported:true,registered:false}),
            diagnostics_capture:async()=>({ok:true,cpu_percent_all_cores:0.7,end_working_set_mb:62,peak_working_set_mb:67,scope:'mock',warning:'approximate'}),
            builder_start:async(ids,tests)=>{window.__calls.push(['start',ids,tests]);return {ok:true}},
            builder_schedule:async(id,minutes,tests,enabled)=>{window.__calls.push(['schedule',id,minutes,tests,enabled]);return {ok:true}},
            launcher_manage:async(enabled)=>{window.__calls.push(['launcher',enabled]);return {ok:true}},
            builder_link_folder:async()=>({ok:false,error:'cancelled'}),
            builder_cancel:async()=>({ok:false,error:'idle'})
          }};
          window.dispatchEvent(new Event('pywebviewready'));
        }''')
        page.wait_for_function('window.skellDesktop.ready===true')
        # Fresh AppData state should persist normally, not claim a disk failure.
        page.wait_for_function('skellDesktop.diskStatus==="saved"')
        assert "pending retry" not in page.locator('#saveIndicator').inner_text().lower()
        assert page.locator('#nav button[data-nav="overview"][aria-current="page"]').count() == 1
        assert page.locator('#nav button[data-nav="developer"][aria-current="page"]').count() == 0

        # CI pass badges must use the green status treatment defined by styles.css.
        passed_badge = page.locator('.status-pill.status-passed').first
        assert passed_badge.count() > 0, 'Seeded overview has no passed CI badge'
        passed_colors = passed_badge.evaluate("""el => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--green)';
          document.body.appendChild(probe);
          const expected = getComputedStyle(probe).color;
          probe.remove();
          return {actual: getComputedStyle(el).color, expected};
        }""")
        assert passed_colors['actual'] == passed_colors['expected'], passed_colors
        captures = ROOT/'artifacts'/'ui'
        captures.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(captures/'projecthub-overview-desktop.png'), full_page=True)

        page.locator('button[data-nav="developer"]').click()
        page.get_by_role('heading',name='Developer Command Center').wait_for()
        assert page.locator('#nav button[data-nav="developer"][aria-current="page"]').count() == 1
        assert page.locator('#nav button[data-nav="overview"][aria-current="page"]').count() == 0
        # Only the primary navigation may announce the current page.
        # Content buttons that also navigate must not be mislabeled as the current page.
        page.evaluate("""() => {
            const probe=document.createElement('button');
            probe.id='external-nav-probe';
            probe.dataset.nav='developer';
            document.body.appendChild(probe);
            render();
        }""")
        assert page.locator('#external-nav-probe').get_attribute('aria-current') is None
        page.locator('#external-nav-probe').evaluate('(el) => el.remove()')
        page.get_by_role('heading',name='Windows Builder').wait_for()
        assert page.get_by_role('region', name='Local build projects').count()==1
        page.wait_for_function('skellDevCenter.ready===true')
        assert page.evaluate('skellDevCenter.pollDelayMs()') == 12000
        page.evaluate('skellDevCenter.model.active={project_id:"test",step:"compile"}')
        assert page.evaluate('skellDevCenter.pollDelayMs()') == 2500
        page.evaluate('skellDevCenter.model.active=null')
        page.on('dialog',lambda d:d.accept())
        page.locator('[data-action=dev-build]:not([disabled])').first.click(timeout=5000)
        page.wait_for_function('window.__calls.some(x=>x[0]==="start")')
        assert page.evaluate('window.__calls.find(x=>x[0]==="start")[1].length')==1
        page.locator('[data-action="dev-schedule-enable"]').click()
        page.wait_for_function('window.__calls.some(x=>x[0]==="schedule")')
        page.locator('[data-action="dev-measure"]').click()
        page.get_by_text('CPU / all cores',exact=True).wait_for()
        assert '62 MB' in page.locator('.dev-perf-stats').inner_text()
        page.locator('[data-action="dev-register"]').click()
        page.wait_for_function('window.__calls.some(x=>x[0]==="launcher")')
        assert not errors,errors
        page.set_viewport_size({'width':390,'height':780})
        page.wait_for_timeout(200)
        nav_box=page.locator('#nav').bounding_box()
        active_box=page.locator('button[data-nav="developer"]').bounding_box()
        assert nav_box is not None and active_box is not None, 'Compact navigation geometry unavailable'
        assert active_box['x'] >= nav_box['x']-1 and active_box['x']+active_box['width'] <= nav_box['x']+nav_box['width']+1, active_box
        captures=ROOT/'artifacts'/'ui'
        captures.mkdir(parents=True, exist_ok=True)
        # Hide only the test's transient operation toast for legible QA captures.
        page.evaluate("""() => {
            const toast=document.getElementById('toast');
            if(toast)toast.classList.remove('show');
        }""")
        page.wait_for_timeout(300)  # let toast opacity transition settle
        page.screenshot(path=str(captures/'projecthub-390px.png'),full_page=True)
        # Keyboard navigation must remain legible on compact layouts.
        page.locator('button[data-nav="developer"]').focus()
        page.keyboard.press('Tab')
        focused=page.evaluate("""() => ({
            nav: document.activeElement?.getAttribute('data-nav'),
            outline: getComputedStyle(document.activeElement).outlineStyle,
            width: getComputedStyle(document.activeElement).outlineWidth
        })""")
        assert focused['nav']=='world',focused
        assert focused['outline']=='solid' and focused['width']=='2px',focused
        # The forward-focused item must also be inside the viewport after rail scrolling.
        world_box=page.locator('button[data-nav="world"]').bounding_box()
        assert world_box is not None, 'Forward-focused navigation button is not rendered'
        assert world_box['x'] >= -1 and world_box['x'] + world_box['width'] <= 391, world_box
        # Reverse keyboard navigation should restore focus without losing the ring.
        page.keyboard.press('Shift+Tab')
        previous=page.evaluate("""() => ({
            nav: document.activeElement?.getAttribute('data-nav'),
            outline: getComputedStyle(document.activeElement).outlineStyle,
            width: getComputedStyle(document.activeElement).outlineWidth
        })""")
        assert previous['nav']=='developer',previous
        assert previous['outline']=='solid' and previous['width']=='2px',previous
        # Focus must be visible inside the compact viewport, not merely styled.
        focus_box=page.locator('button[data-nav="developer"]').bounding_box()
        assert focus_box is not None, 'Focused navigation button is not rendered'
        viewport=page.viewport_size
        assert focus_box['x'] >= 0 and focus_box['y'] >= 0, focus_box
        assert focus_box['x'] + focus_box['width'] <= viewport['width'] + 1, focus_box
        assert focus_box['y'] + focus_box['height'] <= viewport['height'] + 1, focus_box
        size=page.evaluate('({page:document.documentElement.scrollWidth,window:window.innerWidth})')
        assert size['page']<=size['window']+2,size
        # Exercise the supported minimum width as well as the 390px compact layout.
        page.set_viewport_size({'width':320,'height':640})
        page.wait_for_timeout(200)
        for nav_name in ('developer', 'world'):
            page.locator(f'button[data-nav="{nav_name}"]').focus()
            box=page.locator(f'button[data-nav="{nav_name}"]').bounding_box()
            assert box is not None, f'{nav_name} button missing at 320px'
            assert box['x'] >= -1 and box['x'] + box['width'] <= 321, (nav_name, box)
        narrow=page.evaluate('({page:document.documentElement.scrollWidth,window:window.innerWidth})')
        assert narrow['page'] <= narrow['window'] + 2, narrow
        assert not errors, errors
        page.screenshot(path=str(captures/'projecthub-320px.png'),full_page=True)
        page.set_viewport_size({'width':1060,'height':760})
        page.locator('button[data-nav="developer"]').click()
        page.wait_for_timeout(150)
        page.screenshot(path=str(captures/'projecthub-desktop.png'),full_page=True)
        browser.close()


if __name__=='__main__':
    run()
    print('DEVELOPER CENTER BROWSER TESTS PASSED')
