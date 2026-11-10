from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'skelly_project_hub.html').read_text(encoding='utf-8')
INIT='''(()=>{
const values=new Map();window.__memoryStore=values;
Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(k){return values.has(k)?values.get(k):null},setItem(k,v){values.set(k,String(v))},removeItem(k){values.delete(k)},clear(){values.clear()}}});
window.confirm=()=>true;
window.__fetchCalls=[];
window.__mockStatus='success';
window.fetch=async function(url){
  const u=String(url);window.__fetchCalls.push(u);
  const sha='a'.repeat(40);
  if(u.includes('/commits?'))return {ok:true,json:async()=>[{sha,html_url:'https://github.com/skellyruno/test/commit/'+sha,commit:{message:'Fix test',committer:{date:'2026-11-09T14:34:00Z'}}}]};
  if(u.includes('/actions/runs?'))return {ok:true,json:async()=>({workflow_runs:[{head_sha:sha,status:'completed',conclusion:window.__mockStatus,name:'Windows VST3',html_url:'https://github.com/skellyruno/test/actions/runs/123',created_at:'2026-11-09T14:34:00Z'}]})};
  if(u.includes('/releases?'))return {ok:false,status:404,json:async()=>({})};
  throw Error('Unexpected URL: '+u);
};
})();'''
with sync_playwright() as pl:
    launch={'executable_path':'/usr/bin/chromium'} if Path('/usr/bin/chromium').is_file() else {}
    browser=pl.chromium.launch(headless=True,args=['--no-sandbox'],**launch)
    page=browser.new_page(viewport={'width':1440,'height':960},device_scale_factor=1)
    errors=[]
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.evaluate(INIT)
    page.set_content(HTML,wait_until='domcontentloaded')
    assert page.locator('h1').first.inner_text()=='Overview'
    assert page.locator('.automation-strip').count()==1
    page.locator('button[data-nav="settings"]').last.click()
    assert page.locator('h1').first.inner_text()=='Data & settings'
    assert page.locator('[data-auto-setting="enabled"]').is_checked()
    # disable auto during deterministic tests
    page.locator('[data-auto-setting="enabled"]').uncheck()
    assert page.evaluate('automationConfig().enabled') is False
    page.locator('[data-auto-setting="scope"]').select_option('all')
    assert page.locator('[data-auto-setting="intervalMinutes"]').input_value()=='60'
    page.locator('[data-auto-setting="scope"]').select_option('priority')
    page.locator('[data-auto-setting="intervalMinutes"]').select_option('30')
    assert page.evaluate('automationConfig().intervalMinutes')==30
    # manual snapshot
    page.locator('[data-action="snapshot-now"]').click()
    assert page.locator('.recovery-item').count()>=1
    # modify user's task; verify github update does not overwrite this
    page.evaluate('''() => {data.projects[0].task="CUSTOM MANUAL PLAN KEEP THIS"; persist()}''')
    result=page.evaluate('''async () => await runRefresh({scope:'priority'})''')
    print('Manual refresh:',result)
    assert result['ok']>0
    assert page.evaluate('data.projects[0].task')=='CUSTOM MANUAL PLAN KEEP THIS'
    assert page.evaluate('data.projects[0].ci.source')=='github'
    assert page.evaluate('data.projects[0].ci.status')=='passed'
    initial_history=page.evaluate('data.projects[0].buildHistory.length')
    result2=page.evaluate('''async () => await runRefresh({scope:'priority'})''')
    assert result2['changed']==0, result2
    assert page.evaluate('data.projects[0].buildHistory.length')==initial_history
    # confirm no release lookup in automatic mode
    page.evaluate('window.__fetchCalls.length=0')
    autoresult=page.evaluate('''async () => {automationConfig().enabled=true;return await runRefresh({automatic:true,scope:'priority'})}''')
    assert autoresult['ok']>0
    assert page.evaluate('window.__fetchCalls.every(url => !url.includes("/releases?"))')
    # transition failure, triggers alert
    page.evaluate('window.__mockStatus="failure"')
    failedresult=page.evaluate('''async () => await runRefresh({scope:'priority'})''')
    assert failedresult['alerts'],failedresult
    assert page.evaluate('data.projects[0].ci.status')=='failed'
    # manual saved notes survive reload (simulated same context)
    assert page.evaluate('JSON.parse(localStorage.getItem(STORAGE_KEY)).projects[0].task')=='CUSTOM MANUAL PLAN KEEP THIS'
    # snapshot restoration from saved original state should recover initial plan
    page.locator('button[data-nav="settings"]').last.click()
    page.locator('[data-action="restore-snapshot"]').first.click()
    assert page.evaluate('data.projects[0].task')!='CUSTOM MANUAL PLAN KEEP THIS'
    # mobile layout
    page.set_viewport_size({'width':390,'height':844})
    page.locator('button[data-nav="overview"]').first.click()
    page.wait_for_timeout(150)
    geometry=page.evaluate('''() => ({scroll:document.documentElement.scrollWidth, viewport:window.innerWidth})''')
    print('Mobile geometry:',geometry)
    assert geometry['scroll']<=geometry['viewport']+2,geometry
    page.screenshot(path=str(ROOT/'screenshot_mobile.png'),full_page=True)
    page.set_viewport_size({'width':1440,'height':900})
    page.locator('button[data-nav="settings"]').last.click()
    page.screenshot(path=str(ROOT/'screenshot_automation.png'),full_page=True)
    print('Page errors:',errors)
    assert not errors,errors
    browser.close()
print('ALL BROWSER TESTS PASSED')
