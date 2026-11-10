/* Optional native integration. Browser-only Project Hub remains independent. */
'use strict';
const skellDesktop = {
  ready: false,
  loading: false,
  pendingWorkspace: null,
  pendingSnapshots: null,
  workspaceWriter: null,
  snapshotWriter: null,
  isDesktop(){return this.ready && !!window.pywebview?.api;},
  saveWorkspace(){
    if(!this.isDesktop())return;
    this.pendingWorkspace=localStorage.getItem(STORAGE_KEY)||JSON.stringify(data);
    if(!this.workspaceWriter)this.workspaceWriter=this.flushWorkspace();
  },
  async flushWorkspace(){
    try{
      while(this.pendingWorkspace!==null){
        const raw=this.pendingWorkspace;this.pendingWorkspace=null;
        const result=await window.pywebview.api.save_workspace(raw);
        if(!result?.ok){
          document.getElementById('saveIndicator').textContent='⚠ Native save failed';
          console.error('Native save failed',result?.error);
          toast('Native disk save failed. Export a JSON backup.');
        }
      }
    }catch(err){
      console.error('Native save error',err);
      document.getElementById('saveIndicator').textContent='⚠ Native save failed';
      toast('Native save unavailable. Export a JSON backup.');
    }finally{
      this.workspaceWriter=null;
      if(this.pendingWorkspace!==null)this.saveWorkspace();
    }
  },
  saveSnapshots(){
    if(!this.isDesktop())return;
    this.pendingSnapshots=localStorage.getItem(SNAPSHOT_KEY)||'[]';
    if(!this.snapshotWriter)this.snapshotWriter=this.flushSnapshots();
  },
  async flushSnapshots(){
    try{
      while(this.pendingSnapshots!==null){
        const raw=this.pendingSnapshots;this.pendingSnapshots=null;
        const result=await window.pywebview.api.save_snapshots(raw);
        if(!result?.ok)console.warn('Recovery snapshots could not be saved:',result?.error);
      }
    }catch(err){console.warn('Recovery snapshots unavailable',err)}
    finally{this.snapshotWriter=null;if(this.pendingSnapshots!==null)this.saveSnapshots()}
  },
  async hydrate(){
    if(this.loading || !window.pywebview?.api)return;
    this.loading=true;
    try{
      const restored=await window.pywebview.api.load_workspace();
      const old=localStorage.getItem(STORAGE_KEY);
      let local=null;
      try{const obj=JSON.parse(old);if(validData(obj))local=obj}catch{}
      let disk=null;
      try{const obj=JSON.parse(restored.workspace);if(validData(obj))disk=obj}catch{}
      // Preserve the newer valid edit in a persistent WebView2 profile after a crash.
      const localTime=Date.parse(local?.settings?.lastLocalEdit)||0;
      const diskTime=Date.parse(disk?.settings?.lastLocalEdit)||0;
      data=local && (!disk || localTime>diskTime) ? local : (disk||local||data);
      if(restored.snapshots){
        try{const parsed=JSON.parse(restored.snapshots);if(Array.isArray(parsed)&&parsed.length<=4)localStorage.setItem(SNAPSHOT_KEY,restored.snapshots)}catch{}
      }
      localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
      this.ready=true;
      automationConfig();render(false);scheduleAutoSync();
      if(!disk || (local && localTime>diskTime))this.saveWorkspace();
      if(restored.recovered)toast('Workspace recovered from the previous valid disk copy');
      refreshWorld();
    }catch(err){
      console.error('Desktop workspace initialization error',err);
      this.ready=true;
      toast('Native workspace unavailable; export a JSON backup');
    }finally{this.loading=false}
  }
};

window.skellDesktop=skellDesktop;

const worldInfo={online:false,loading:false,peer_count:0,peers:[],catalog:[],warning:'Not checked yet',checkedAt:null};
function worldMatch(p){
  if(!worldInfo.online)return {label:'Not detected',tone:'warn',detail:'Start SkellWorld to inspect presence'};
  const repo=repoParts(p.repoUrl);
  const name=repo?`${repo.owner}/${repo.repo}`.toLowerCase():'';
  const entry=worldInfo.catalog.find(x=>String(x.repository||'').toLowerCase()===name);
  if(!entry)return {label:'Not catalogued',tone:'warn',detail:'No SkellWorld catalog entry'};
  const count=worldInfo.peers.filter(x=>entry.product_id&&x.product_id===entry.product_id).length;
  if(count)return {label:`${count} active instance${count===1?'':'s'}`,tone:'ok',detail:'Unverified informational SW1 presence'};
  return {label:entry.integration==='planned'?'Planned integration':e(entry.integration||'Unverified'),tone:'warn',detail:'Catalog entry does not establish live connectivity'};
}
function renderWorld(){
  const status=worldInfo.online?`SkellWorld console reachable · ${worldInfo.peer_count} opted-in plugin instances`:'SkellWorld console offline or unavailable';
  const rows=data.projects.map(p=>{
    const s=worldMatch(p);
    return `<div class="world-project"><div><strong>${e(p.title)}</strong><small>${e(s.detail)}</small></div><span class="small-tag ${s.tone}">${e(s.label)}</span></div>`;
  }).join('');
  return `${pageHeader('Ecosystem / Developer Mode','SkellWorld connection',
   'Read-only plugin presence and catalog discovery. Project Hub works independently even if SkellWorld is closed.',
   '<button class="btn btn-primary" data-action="world-refresh">↻ Check SkellWorld</button>')}
   <div class="world-hero panel panel-pad"><div><div class="eyebrow">SKELLWORLD / LOCAL STATUS</div>
     <h2>${e(worldInfo.loading?'Checking SkellWorld…':status)}</h2><p class="micro">${e(worldInfo.warning)}<br>Checked: ${e(worldInfo.checkedAt?dateFmt(worldInfo.checkedAt):'Not yet checked')}</p></div>
     <div class="world-count">${worldInfo.online?worldInfo.peer_count:'—'}<span>LIVE INSTANCES</span></div></div>
   <div class="panel panel-pad">${sectionHeading('Developer ecosystem', 'Per-project status from the actual SkellWorld catalog; no fabricated plugin connectivity')}
   <div class="world-list">${rows}</div></div>
   <p class="micro" style="margin-top:14px">SkellWorld SW1 is unauthenticated and informational only. Project Hub neither sends SW1 commands nor performs remote GitHub or file actions through it. The desktop integration reads only http://127.0.0.1:48674/api/status and /api/catalog. The web-only dashboard cannot access the native connection.</p>`;
}
async function refreshWorld(){
  if(worldInfo.loading)return;
  if(!skellDesktop.isDesktop()){
    worldInfo.warning='Native integration requires the Windows desktop app';
    if(state.view==='world')render(true);
    return;
  }
  worldInfo.loading=true;if(state.view==='world')render(true);
  try{
    const result=await window.pywebview.api.world_status();
    Object.assign(worldInfo,{online:!!result.online,peer_count:Math.max(0,Number(result.peer_count)||0),
      peers:Array.isArray(result.peers)?result.peers:[],catalog:Array.isArray(result.catalog)?result.catalog:[],
      warning:String(result.warning||''),checkedAt:new Date().toISOString()});
  }catch(err){Object.assign(worldInfo,{online:false,peer_count:0,peers:[],catalog:[],warning:String(err),checkedAt:new Date().toISOString()})}
  finally{worldInfo.loading=false;if(state.view==='world'||state.view==='detail')render(true)}
}
async function desktopChooseFolder(pid){
  if(!skellDesktop.isDesktop())return toast('Folder chooser requires the Windows app');
  const p=pById(pid);if(!p)return;
  try{
    const folder=await window.pywebview.api.choose_project_folder();
    if(folder){p.localFolder=folder;logChange(p.id,'Local folder linked','Linked a local project folder');saveAndRender();toast('Local folder linked')}
  }catch(err){toast('Folder chooser failed: '+err.message)}
}
async function desktopOpenFolder(pid){
  if(!skellDesktop.isDesktop())return toast('Open folder requires the Windows app');
  const p=pById(pid);if(!p?.localFolder)return toast('Choose a folder first');
  try{const r=await window.pywebview.api.open_project_folder(p.localFolder);if(!r.ok)toast(r.error||'Folder unavailable')}
  catch(err){toast('Cannot open folder: '+err.message)}
}
// Imported by the editable site and embedded in the single-file HTML version.
window.addEventListener('pywebviewready',()=>skellDesktop.hydrate());
if(window.pywebview?.api)skellDesktop.hydrate();
