"""Playwright UI integration tests for the desktop bridge without a Windows GUI."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def test_desktop_bridge():
    html=(ROOT / 'skelly_project_hub.html').read_text(encoding='utf-8')
    with sync_playwright() as pl:
        opts={'executable_path':'/usr/bin/chromium'} if Path('/usr/bin/chromium').is_file() else {}
        browser=pl.chromium.launch(headless=True, args=['--no-sandbox'], **opts)
        page=browser.new_page(viewport={'width':1100,'height':760})
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.accept())
        page.evaluate("""() => {const store=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}})}""")
        page.set_content(html, wait_until='domcontentloaded')
        restored=page.evaluate('''() => {let copy=JSON.parse(JSON.stringify(data));copy.projects[0].task='RESTORED NATIVE DATA';return JSON.stringify(copy)}''')
        bridge={'workspace':restored,'snapshots':'[]','recovered':False}
        status={'online':True,'peer_count':1,
            'peers':[{'product_id':'skellcore.quickstart','display_name':'Demo'}],
            'catalog':[{'repository':'skellyruno/skell-vst-template','product_id':'skellcore.quickstart','integration':'world-demo'}],
            'warning':'SW1 informational only'}
        page.evaluate('''(mock) => {
          window.__saveCalls=[];
          window.__worldShareCalls=[];
          window.__failNativeOnce=false;
          window.pywebview={api:{
            load_workspace:async()=>mock.bridge,
            save_workspace:async(v)=>{window.__saveCalls.push(v);if(window.__failNativeOnce){window.__failNativeOnce=false;return {ok:false,error:'Simulated disk full'}}return {ok:true}},
            save_snapshots:async()=>({ok:true}),
            world_status:async()=>mock.status,
            set_world_summary_sharing:async(enabled)=>{window.__worldShareCalls.push(enabled);return {ok:true,enabled,published:enabled}},
            choose_project_folder:async()=>'/tmp/test-folder',
            open_project_folder:async()=>({ok:true})
          }};
          window.dispatchEvent(new Event('pywebviewready'));
        }''',{'bridge':bridge,'status':status})
        page.wait_for_function('skellDesktop.ready===true')
        assert page.evaluate('data.projects[0].task')=='RESTORED NATIVE DATA'
        page.locator('button[data-nav="world"]').first.click()
        page.get_by_text('SkellWorld console reachable',exact=False).wait_for()
        assert '1' in page.locator('.world-count').inner_text()
        assert page.locator('.world-project').count()>=20
        page.get_by_text('Summary sharing is OFF').wait_for()
        page.locator('button[data-action="world-share-toggle"]').click()
        page.wait_for_function('window.__worldShareCalls.length===1')
        assert page.evaluate('window.__worldShareCalls[0]') is True
        page.get_by_text('Sharing aggregate summary', exact=False).wait_for()
        page.locator('button[data-action="world-share-toggle"]').click()
        page.wait_for_function('window.__worldShareCalls.length===2')
        assert page.evaluate('window.__worldShareCalls[1]') is False
        page.get_by_text('Summary sharing is OFF').wait_for()
        page.locator('button[data-nav="projects"]').first.click()
        page.locator('.project-card').first.click()
        # A transient disk failure retains the newest workspace for a later retry.
        page.evaluate('window.__failNativeOnce=true')
        page.locator('button[data-action="choose-folder"]').click()
        page.wait_for_function('skellDesktop.diskStatus==="retry"')
        assert page.evaluate('skellDesktop.pendingWorkspace!==null')
        assert page.evaluate('data.projects.some(p=>p.localFolder==="/tmp/test-folder")')
        page.evaluate("""async () => {
          clearTimeout(skellDesktop.retryTimer);skellDesktop.retryTimer=null;
          await skellDesktop.flushWorkspace();
        }""")
        page.wait_for_function('skellDesktop.diskStatus==="saved"')
        assert page.evaluate('skellDesktop.pendingWorkspace===null')
        assert page.evaluate('window.__saveCalls.length>=2')
        page.locator('button[data-nav="settings"]').last.click()
        assert 'AppData workspace' in page.locator('#nativeSaveMessage').inner_text()
        assert not errors,errors
        browser.close()


if __name__=='__main__':
    test_desktop_bridge()
    print('DESKTOP BRIDGE BROWSER TESTS PASSED')
