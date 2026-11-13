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
        page.set_content((ROOT/'skelly_project_hub.html').read_text(encoding='utf-8'),wait_until='domcontentloaded')
        page.evaluate('''() => {
          window.__calls=[];
          window.pywebview={api:{
            load_workspace:async()=>({workspace:null,snapshots:null,recovered:false}),
            save_workspace:async()=>({ok:true}),save_snapshots:async()=>({ok:true}),
            world_status:async()=>({online:false,peers:[],catalog:[]}),
            builder_status:async()=>({active:null,queue:[],folders:{[data.projects[0].id]:'/tmp/mock'},history:[],logs:[],schedule:{enabled:false,interval_minutes:120,project_id:data.projects[0].id,with_tests:true},available:true}),
            launcher_status:async()=>({supported:true,registered:false}),
            builder_start:async(ids,tests)=>{window.__calls.push(['start',ids,tests]);return {ok:true}},
            builder_schedule:async(id,minutes,tests,enabled)=>{window.__calls.push(['schedule',id,minutes,tests,enabled]);return {ok:true}},
            launcher_manage:async(enabled)=>{window.__calls.push(['launcher',enabled]);return {ok:true}},
            builder_link_folder:async()=>({ok:false,error:'cancelled'}),
            builder_cancel:async()=>({ok:false,error:'idle'})
          }};
          window.dispatchEvent(new Event('pywebviewready'));
        }''')
        page.wait_for_function('window.skellDesktop.ready===true')
        page.locator('button[data-nav="developer"]').click()
        page.get_by_role('heading',name='Developer Command Center').wait_for()
        page.get_by_role('heading',name='Windows Builder').wait_for()
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
        page.locator('[data-action="dev-register"]').click()
        page.wait_for_function('window.__calls.some(x=>x[0]==="launcher")')
        assert not errors,errors
        page.set_viewport_size({'width':390,'height':780})
        page.wait_for_timeout(200)
        size=page.evaluate('({page:document.documentElement.scrollWidth,window:window.innerWidth})')
        assert size['page']<=size['window']+2,size
        browser.close()


if __name__=='__main__':
    run()
    print('DEVELOPER CENTER BROWSER TESTS PASSED')
