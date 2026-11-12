/* Optional native integration. Browser-only Project Hub remains independent. */
'use strict';
const skellDesktop = {
  ready: false,
  loading: false,
  pendingWorkspace: null,
  pendingSnapshots: null,
  workspaceWriter: null,
  snapshotWriter: null,
  retryTimer: null,
  retryDelayMs: 3000,
  diskStatus: 'loading',
  lastSuccessfulAt: null,
  lastDiskError: '',
  warnedSaveError: false,
  isDesktop(){return this.ready && !!window.pywebview?.api;},
  storageSummary(){
    if(this.diskStatus==='saved')return 'Saved to your AppData workspace' + (this.lastSuccessfulAt?' · '+new Date(this.lastSuccessfulAt).toLocaleTimeString():'');
    if(this.diskStatus==='retry')return 'Disk save pending retry — browser copy preserved. '+this.lastDiskError;
    if(this.diskStatus==='pending')return 'Saving the latest workspace to AppData…';
    return 'Checking your AppData workspace…';
  },
  showStorageState(){
    const caption=this.storageSummary();
    const indicator=document.getElementById('saveIndicator');
    if(indicator)indicator.textContent=(this.diskStatus==='retry'?'⚠ ':this.diskStatus==='saved'?'● ':'◌ ')+caption;
    const detail=document.getElementById('nativeSaveMessage');
    if(detail)detail.textContent=caption;
  },
  saveWorkspace(){
    if(!this.isDesktop())return;
    this.pendingWorkspace=localStorage.getItem(STORAGE_KEY)||JSON.stringify(data);
    // A new user edit supersedes the older payload, including one pending retry.
    if(this.retryTimer!==null){clearTimeout(this.retryTimer);this.retryTimer=null;}
    this.diskStatus='pending';this.showStorageState();
    if(!this.workspaceWriter)this.workspaceWriter=this.flushWorkspace();
  },
  async flushWorkspace(){
    try{
      while(this.pendingWorkspace!==null){
        const raw=this.pendingWorkspace;
        this.pendingWorkspace=null;
        let result;
        try{result=await window.pywebview.api.save_workspace(raw)}
        catch(err){result={ok:false,error:String(err)}}
        if(!result?.ok){
          // Preserve a newer queued revision if another edit arrived in flight.
          if(this.pendingWorkspace===null)this.pendingWorkspace=raw;
          this.diskStatus='retry';
          this.lastDiskError=String(result?.error||'Unknown native write error').slice(0,180);
          this.showStorageState();
          if(!this.warnedSaveError)toast('AppData save failed. Will retry; export JSON for an external backup.');
          this.warnedSaveError=true;
          break;
        }
        this.lastSuccessfulAt=new Date().toISOString();
        this.lastDiskError='';this.warnedSaveError=false;
        this.retryDelayMs=3000;
        this.diskStatus=this.pendingWorkspace===null?'saved':'pending';
        this.showStorageState();
      }
    }finally{
      this.workspaceWriter=null;
      if(this.pendingWorkspace!==null){
        if(this.diskStatus==='retry'){
          this.retryTimer=setTimeout(()=>{this.retryTimer=null;if(!this.workspaceWriter)this.workspaceWriter=this.flushWorkspace()},this.retryDelayMs);
          this.retryDelayMs=Math.min(60000,this.retryDelayMs*2);
        }else this.workspaceWriter=this.flushWorkspace();
      }
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
      this.diskStatus='saved';
      automationConfig();render(false);scheduleAutoSync();
      // Repair a corrupt primary disk file after recovery from its valid backup.
      if(restored.recovered || !disk || (local && localTime>diskTime))this.saveWorkspace();
      else this.showStorageState();
      if(restored.recovered)toast('Workspace recovered from the previous valid disk copy');
      refreshWorld();
    }catch(err){
      console.error('Desktop workspace initialization error',err);
      this.ready=true;
      this.diskStatus='retry';this.lastDiskError='Could not load native workspace';
      this.showStorageState();
      toast('Native workspace unavailable; export a JSON backup');
    }finally{this.loading=false}
  }
};

window.skellDesktop=skellDesktop;

const worldInfo={online:false,loading:false,peer_count:0,peers:[],catalog:[],warning:'Not checked yet',checkedAt:null,summary_sharing:{enabled:false,published:false}};
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
   <div class="panel panel-pad">
     ${sectionHeading('World status sharing', 'Only aggregate project and CI counts are shared. No names, notes, folders or GitHub credentials.')}
     <div class="world-share-row">
       <strong>${worldInfo.summary_sharing?.enabled ? (worldInfo.summary_sharing?.published ? 'Sharing aggregate summary' : 'Enabled · awaiting workspace save') : 'Summary sharing is OFF'}</strong>
       <button class="btn btn-primary" data-action="world-share-toggle">${worldInfo.summary_sharing?.enabled?'Stop sharing':'Share counts with SkellWorld'}</button>
     </div>
     <p class="micro">Optional, local and revocable. Project Hub writes a small summary only when you enable it, and updates it when you save your workspace. SkellWorld never gains write access.</p>
   </div>
   <div class="panel panel-pad">${sectionHeading('Developer ecosystem', 'Per-project status from the actual SkellWorld catalog; no fabricated plugin connectivity')}
   <div class="world-list">${rows}</div></div>
   <p class="micro" style="margin-top:14px">SkellWorld SW1 is unauthenticated and informational only. Project Hub neither sends SW1 commands nor performs remote GitHub or file actions through it. The desktop integration reads only http://127.0.0.1:48674/api/status and /api/catalog. The web-only dashboard cannot access the native connection.</p>`;
}
async function toggleWorldSummary() {
  if(!skellDesktop.isDesktop())return toast('World sharing requires the Windows desktop app');
  const enable=!worldInfo.summary_sharing?.enabled;
  if(enable && !window.confirm('Share only aggregate project and CI counts with the local SkellWorld dashboard? No project names, paths, notes or credentials will be shared.'))return;
  try {
    const result=await window.pywebview.api.set_world_summary_sharing(enable);
    if(!result?.ok)return toast('World summary change failed: '+String(result?.error||'unknown'));
    worldInfo.summary_sharing={enabled:!!result.enabled,published:!!result.published};
    toast(enable?'SkellWorld summary sharing enabled':'SkellWorld summary sharing disabled');
    if(state.view==='world')render(true);
  } catch(err){toast('World sharing update failed: '+String(err))}
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
      warning:String(result.warning||''),checkedAt:new Date().toISOString(),
      summary_sharing:result.summary_sharing||{enabled:false,published:false}});
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
