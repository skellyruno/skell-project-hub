/* SKELL Project Hub v1.4 — verified CI evidence + durable desktop saves. */
'use strict';
const STORAGE_KEY = 'skelly-project-control-v1';
const SNAPSHOT_KEY = 'skelly-project-control-recovery-v1';
const AUTOMATION_DEFAULTS = Object.freeze({enabled:true,scope:'priority',intervalMinutes:60,snapshotsEnabled:true,lastAttemptAt:null,lastCompletedAt:null,lastSummary:'Not checked yet',pauseUntil:null});
const AUTO_SCOPE = ['priority','all'];
const AUTO_INTERVALS = [30,60,120,240];
const automationRuntime={timer:null,busy:false,notice:'',lastAlerts:[],tabId:'tab-'+Math.random().toString(36).slice(2)};
function automationConfig(){
  if(!isRecord(data.settings.automation))data.settings.automation={...AUTOMATION_DEFAULTS};
  const a=data.settings.automation;
  a.enabled=typeof a.enabled==='boolean'?a.enabled:true;
  a.snapshotsEnabled=typeof a.snapshotsEnabled==='boolean'?a.snapshotsEnabled:true;
  a.scope=AUTO_SCOPE.includes(a.scope)?a.scope:'priority';
  a.intervalMinutes=AUTO_INTERVALS.includes(a.intervalMinutes)?a.intervalMinutes:60;
  if(a.scope==='all'&&a.intervalMinutes<60)a.intervalMinutes=60;
  return a;
}
function readSnapshots(){try{const a=JSON.parse(localStorage.getItem(SNAPSHOT_KEY)||'[]');return Array.isArray(a)?a.filter(x=>isRecord(x)&&typeof x.data==='string'&&typeof x.at==='string').slice(0,4):[]}catch{return []}}
function makeSnapshot(reason='Automatic recovery',force=false){
  try{
    const a=automationConfig();if(!force&&!a.snapshotsEnabled)return false;
    const stored=localStorage.getItem(STORAGE_KEY)||JSON.stringify(data);
    if(stored.length>600000)return false; // Browser storage should not be filled with large copies.
    const history=readSnapshots();
    if(!force&&history.length&&Date.now()-(Date.parse(history[0].at)||0)<30*60000)return false;
    if(history.length&&history[0].data===stored)return false;
    history.unshift({at:new Date().toISOString(),reason,data:stored});
    localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(history.slice(0,4)));
    window.skellDesktop?.saveSnapshots?.();
    return true;
  }catch(err){console.warn('Recovery snapshot unavailable:',err);return false}
}
function snapshotBeforeWrite(){
  // Snapshot the previously committed workspace every 30 minutes, not every keystroke.
  makeSnapshot('Automatic recovery',false);
}
function restoreSnapshot(index){
  const record=readSnapshots()[index];if(!record)return toast('Recovery snapshot unavailable');
  try{
    const restored=JSON.parse(record.data);if(!validData(restored))throw new Error('Invalid backup');
    if(!confirm(`Restore workspace from ${dateFmt(record.at)}? Your current workspace will also be backed up.`))return;
    makeSnapshot('Before recovery restore',true);
    const previous=data;data=restored;automationConfig();
    if(!persist()){data=previous;throw new Error('Browser storage was not writable')}
    state.view='settings';state.selected=null;automationRuntime.notice='';automationRuntime.lastAlerts=[];render(false);scheduleAutoSync();toast('Recovery snapshot restored');
  }catch(err){toast('Restore failed: '+err.message)}
}

const STAGES = ['Planning','In progress','Needs audit','Blocked','On hold','Release candidate','Released'];
const PRIORITIES = ['Low','Normal','High','Critical'];
const VALIDATION_STATES = ['untested','in-progress','passed','failed'];
const CI_STATES = ['passed','failed','stale','unknown'];
const state = {view:'overview', selected:null, search:'', filter:'all', sort:'priority', workProject:'all', compareProject:'all', logProject:'all', workExpanded:[]};
let data = loadData();
let toastTimer;
function isRecord(v){return v!==null && typeof v==='object' && !Array.isArray(v)}
function validData(obj){
  if(!isRecord(obj)||obj.schema!==1||!Array.isArray(obj.projects)||!Array.isArray(obj.comparisons)||!Array.isArray(obj.changes)||obj.projects.length>500||obj.comparisons.length>2000||obj.changes.length>2500||!isRecord(obj.settings))return false;
  const ids=new Set();
  for(const p of obj.projects){
    if(!isRecord(p)||typeof p.id!=='string'||!p.id||p.id.length>150||ids.has(p.id)||typeof p.title!=='string'||!isRecord(p.ci)||!isRecord(p.validation)||!isRecord(p.checklists))return false;
    ids.add(p.id);
    for(const c of CATEGORIES){const tasks=p.checklists[c];if(!Array.isArray(tasks)||tasks.length>150||tasks.some(t=>!isRecord(t)||typeof t.id!=='string'||typeof t.label!=='string'||typeof t.done!=='boolean'))return false}
    if(p.buildHistory!==undefined&&(!Array.isArray(p.buildHistory)||p.buildHistory.length>100||p.buildHistory.some(h=>!isRecord(h))))return false;
  }
  return obj.comparisons.every(c=>isRecord(c)&&typeof c.id==='string')&&obj.changes.every(c=>isRecord(c)&&typeof c.id==='string');
}
function loadData(){try{const raw=localStorage.getItem(STORAGE_KEY);if(raw){const obj=JSON.parse(raw);if(validData(obj))return obj;}}catch(err){console.warn('Unable to read saved workspace:',err)}return initialData();}
function persist(){try{snapshotBeforeWrite();data.settings.lastLocalEdit=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(data));document.getElementById('saveIndicator').textContent='● Saved locally';window.skellDesktop?.saveWorkspace?.();return true;}catch(err){document.getElementById('saveIndicator').textContent='⚠ Save failed';toast('Browser storage failed. Export a backup immediately.');console.error(err);return false}}
function logChange(projectId,kind,message,evidence=''){data.changes.unshift({id:uid(),projectId,kind,message,evidence,at:new Date().toISOString(),system:false});if(data.changes.length>2000)data.changes.length=2000;}
function saveAndRender(keepScroll=true){persist();render(keepScroll)}
function uid(){return 'item-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}
function e(input){return String(input??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function safeUrl(s){try{const u=new URL(String(s||''));return /^(https?:)$/.test(u.protocol)?u.href:'';}catch{return '';}}
function repoParts(url){const u=safeUrl(url);if(!u)return null;try{const x=new URL(u);if(x.hostname!=='github.com')return null;const p=x.pathname.split('/').filter(Boolean);if(p.length<2||!/^[-.\w]+$/.test(p[0])||!/^[-.\w]+$/.test(p[1]))return null;return {owner:p[0],repo:p[1]};}catch{return null}}
function pById(id){return data.projects.find(p=>p.id===id)}
function pName(id){return pById(id)?.title||'Workspace'}
function dateFmt(s){if(!s)return 'Not recorded';const d=new Date(s);return Number.isNaN(d.getTime())?'Not recorded':new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(d)}
function workflowDuration(start,end){const a=Date.parse(start),b=Date.parse(end);if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return '';const sec=Math.round((b-a)/1000);return sec>=3600?`${Math.floor(sec/3600)}h ${Math.round(sec%3600/60)}m`:sec>=60?`${Math.floor(sec/60)}m ${sec%60}s`:`${sec}s`}
function shortDate(s){if(!s)return 'No verified update';const d=new Date(s);return Number.isNaN(d.getTime())?'Unknown':new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(d)}
function logo(p){return e(p.title.split(/\s+|\//).filter(Boolean).map(s=>s[0]).slice(0,2).join('').toUpperCase())}
function statusClass(status){return CI_STATES.includes(status)?'status-'+status:'status-unknown'}
function ciPill(p){const c=p.ci||{};let labels=c.source==='manual'?{passed:'Manual pass',failed:'Manual fail',stale:'Manual stale',unknown:'Unverified'}:{passed:'CI passed',failed:'CI failed',stale:'Stale CI',unknown:'Unverified'};return `<span title="${e(c.label||'No evidence')}" class="status-pill ${statusClass(c.status)}">${labels[c.status]||'Unverified'}</span>`}
function testPill(p){const st=p.validation?.status||'untested';return `<span class="small-tag ${st==='passed'?'ok':st==='failed'?'bad':'warn'}">Host test: ${e(st)}</span>`}
function progress(p){const a=Object.values(p.checklists||{}).flat().filter(x=>x&&typeof x.done==='boolean');return {done:a.filter(x=>x.done).length,total:a.length,percent:a.length?Math.round(100*a.filter(x=>x.done).length/a.length):0};}
function releaseReady(p){const pr=progress(p);const c=p.ci||{};return pr.total>0 && pr.done===pr.total && c.status==='passed' && c.source==='github' && !!c.checkedAt && !!c.runSha && !!p.lastCommit && c.runSha===p.lastCommit && p.validation?.status==='passed';}
function link(url, label, cls='link-tag'){const u=safeUrl(url);return u?`<a class="${cls}" href="${e(u)}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>`:''}
function toast(msg){let t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3300);}
function setView(view,selected=null){state.view=view;state.selected=selected;document.getElementById('commandPalette')?.close();window.scrollTo(0,0);render(false);if(view==='world')refreshWorld();window.skellDevCenter?.onView(view);}
function sectionHeading(t,desc='',action=''){return `<div class="section-heading"><div><h2>${e(t)}</h2>${desc?`<p>${e(desc)}</p>`:''}</div>${action}</div>`}
function pageHeader(eyebrow,title,desc,actions=''){return `<div class="page-header"><div><div class="eyebrow">${e(eyebrow)}</div><h1>${e(title)}</h1><p>${e(desc)}</p></div><div class="page-header-actions">${actions}</div></div>`}
function projectRow(p){return `<div class="project-row" data-project="${e(p.id)}" role="button" tabindex="0" aria-label="Open ${e(p.title)} project"><div class="project-logo">${logo(p)}</div><div><strong>${e(p.title)}</strong><small>${e(p.kind)} · ${e(p.stage)}</small></div><span class="task-snippet">${e(p.task)}</span>${ciPill(p)}</div>`}
function stat(label,count,foot,mark,cls=''){return `<div class="panel stat"><div class="stat-label">${e(label)}<span class="stat-mark">${e(mark)}</span></div><div class="stat-number ${cls}">${count}</div><div class="stat-foot">${e(foot)}</div></div>`}
function renderOverview(){
  const total=data.projects.length,passed=data.projects.filter(p=>p.ci?.status==='passed'&&p.ci?.source!=='manual').length;
  const attention=data.projects.filter(p=>['failed','stale'].includes(p.ci?.status)).length;
  const notTested=data.projects.filter(p=>p.validation?.status!=='passed').length;
  const checked=data.projects.reduce((s,p)=>s+progress(p).done,0),all=data.projects.reduce((s,p)=>s+progress(p).total,0);
  const spotlight=['motion','tune','deesser','flp','checkmate','fan'].map(pById).filter(Boolean);
  const risks=data.projects.filter(p=>['failed','stale'].includes(p.ci?.status));
  const queue=data.projects.filter(p=>p.priority==='Critical'||p.priority==='High').sort(prioritySort).slice(0,6);
  return `${pageHeader('Mission control / 01','Overview','One command center for every plugin, app and workflow. Verified builds stay separate from in-host testing and release readiness.',`<button class="btn btn-quiet" data-action="refresh-focus">↻ Refresh priority projects</button><span class="source-pill">● GitHub snapshot: ${SEED_VERSION}</span>`)}
  <section class="hero"><div><div class="eyebrow">THE SKELLY ECOSYSTEM / SYSTEM ONLINE</div><h2>One ecosystem.<br><em>Full visibility.</em></h2><p>Track what changed, what actually passed, and what still needs proof. All manual QA starts unchecked — no made-up green checkmarks.</p><div class="hero-actions"><button class="btn btn-primary" data-nav="projects">Explore projects →</button><button class="btn btn-quiet" data-nav="workboard">Open workboard</button></div></div><div class="hero-right"><div class="hero-meter"><strong>${checked}<span style="font-size:23px;color:#738f75"> / ${all}</span></strong></div><div class="meter-bar"><span style="width:${all?Math.round(100*checked/all):0}%"></span></div><div class="hero-note">Manually verified checklist items across ${total} projects. No automation or CI success silently checks off real-world QA.</div></div></section>
  <section class="automation-strip"><span class="signal-dot"></span><div><strong>Automation watch</strong><small>${e(automationLabel())} · ${e(automationConfig().lastSummary||'No checks yet')}${automationRuntime.notice?' · '+e(automationRuntime.notice):''}</small></div><button class="btn btn-sm btn-quiet" data-nav="settings">Configure →</button></section>
  <div class="stats-grid">${stat('Tracked projects',total,'Across plugins, apps and tools','▦')}${stat('Current CI passes',passed,'Observed matching head commit','✓','tone-green')}${stat('Build attention',attention,'Failed or stale build evidence','!','tone-orange')}${stat('Host QA not passed',notTested,'Explicit real-world signoff missing','◇','tone-cyan')}</div>
  <div class="cols-main"><section class="panel panel-pad">${sectionHeading('Projects in focus','Selected active workstreams',`<button class="btn-link" data-nav="projects">View all projects ↗</button>`)}<div class="project-list">${spotlight.map(projectRow).join('')}</div></section>
  <div class="stack"><section class="panel panel-pad">${sectionHeading('Priority milestones','What to validate next')}<div>${queue.map((p,i)=>`<div class="mini-item"><span class="mini-num">${String(i+1).padStart(2,'0')}</span><div><strong>${e(p.title)}</strong><p>${e(p.milestone)}</p></div></div>`).join('')}</div></section><section class="panel panel-pad">${sectionHeading('Build watch','Evidence needing attention')}${risks.length?risks.map(p=>`<div class="mini-item"><div><strong>${e(p.title)}</strong><p>${e(p.ci.label)}</p>${link(p.ci.runUrl,'View workflow','text-button')}</div>${ciPill(p)}</div>`).join(''):`<div class="micro">No CI failures or stale results currently tracked.</div>`}</section></div></div>`;
}
function prioritySort(a,b){const rank={Critical:0,High:1,Normal:2,Low:3};return (rank[a.priority]??4)-(rank[b.priority]??4)||a.title.localeCompare(b.title)}
function sortProjects(a,b){if(state.sort==='name')return a.title.localeCompare(b.title);if(state.sort==='updated')return (Date.parse(b.updatedAt)||0)-(Date.parse(a.updatedAt)||0)||a.title.localeCompare(b.title);if(state.sort==='qa')return progress(a).percent-progress(b).percent||prioritySort(a,b);return prioritySort(a,b)}
function renderProjects(){
  const list=data.projects.filter(p=>{const q=state.search.toLowerCase();const search=!q||[p.title,p.kind,p.task,p.milestone,p.risks].some(v=>String(v||'').toLowerCase().includes(q));const f=state.filter==='all'||(state.filter==='needs-attention'?['failed','stale'].includes(p.ci?.status):state.filter==='untested'?p.validation?.status!=='passed':state.filter==='unknown'?p.ci?.status==='unknown':p.kind===state.filter);return search&&f;}).sort(sortProjects);
  return `${pageHeader('Portfolio / 02','All projects','Search the ecosystem and open any project to update tasks, risks, evidence, release links, and checklists.',`<button class="btn btn-primary" data-action="new-project">+ Add a project</button>`)}
  <div class="toolbar"><div class="search-wrap"><input id="projectSearch" placeholder="Search projects, risks, tasks…" autocomplete="off" value="${e(state.search)}" aria-label="Search projects" /></div><select id="projectFilter" aria-label="Filter projects"><option value="all">All projects</option><option value="needs-attention" ${state.filter==='needs-attention'?'selected':''}>CI needs attention</option><option value="untested" ${state.filter==='untested'?'selected':''}>Host test not passed</option><option value="unknown" ${state.filter==='unknown'?'selected':''}>Unknown CI</option>${[...new Set(data.projects.map(p=>p.kind))].map(k=>`<option ${state.filter===k?'selected':''} value="${e(k)}">${e(k)}</option>`).join('')}</select><select id="projectSort" aria-label="Sort projects"><option value="priority" ${state.sort==='priority'?'selected':''}>Priority first</option><option value="name" ${state.sort==='name'?'selected':''}>Name A–Z</option><option value="updated" ${state.sort==='updated'?'selected':''}>Recently updated</option><option value="qa" ${state.sort==='qa'?'selected':''}>QA most remaining</option></select><span class="count-note">${list.length} / ${data.projects.length} projects</span></div>
  ${list.length?`<div class="project-grid">${list.map(p=>{const pr=progress(p);return `<article class="panel project-card" data-project="${e(p.id)}" role="button" tabindex="0" aria-label="Open ${e(p.title)}"><div class="card-top"><div class="project-logo">${logo(p)}</div>${ciPill(p)}</div><div><h2 class="card-title">${e(p.title)}</h2><div class="card-type">${e(p.kind)} · ${e(p.stage)}</div></div><p class="card-task">${e(p.task)}</p><div><div class="card-foot"><span class="progress-txt">${pr.done}/${pr.total} QA checks</span><span class="progress-txt">${pr.percent}%</span></div><div class="progress-track"><span style="width:${pr.percent}%"></span></div></div><div class="card-foot"><span class="micro">${shortDate(p.updatedAt)}</span><span class="tone-green" style="font-size:11px;font-weight:750">Open project →</span></div></article>`}).join('')}</div>`:`<div class="empty"><strong>No projects found</strong><p>Try a different search or filter.</p><button class="btn" data-action="clear-filters">Clear filters</button></div>`}`;
}
function infoSlot(name,value,full=false){return `<div class="info-slot ${full?'field-full':''}"><div class="label">${e(name)}</div><div class="field-value">${e(value||'Not recorded')}</div></div>`}
function renderChecklist(p,cat){const arr=p.checklists?.[cat]||[];const done=arr.filter(x=>x.done).length;return `<div class="panel check-panel"><div class="check-head"><strong>${e(cat)}</strong><span>${done} / ${arr.length} verified</span></div><div class="progress-track" style="margin-bottom:6px"><span style="width:${arr.length?Math.round(done/arr.length*100):0}%"></span></div>${arr.map(t=>`<div class="check-line ${t.done?'is-done':''}"><input id="task-${e(t.id)}" type="checkbox" data-check="${e(t.id)}" data-pid="${e(p.id)}" ${t.done?'checked':''} aria-label="Verify ${e(t.label)}"/><label for="task-${e(t.id)}" data-check-label="${e(t.id)}">${e(t.label)}${t.evidence?`<small style="display:block;color:#7d9880;margin-top:3px;text-decoration:none">Evidence: ${e(t.evidence)}</small>`:''}</label><button class="check-edit" data-action="edit-task" data-pid="${e(p.id)}" data-cat="${e(cat)}" data-task="${e(t.id)}" aria-label="Edit checklist item" title="Edit item and evidence">✎</button></div>`).join('')}<button class="check-add" data-action="add-task" data-pid="${e(p.id)}" data-cat="${e(cat)}">+ Add checklist item</button></div>`}
function renderDetail(){const p=pById(state.selected);if(!p)return renderProjects();const pr=progress(p);const related=data.changes.filter(x=>x.projectId===p.id).sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,4);
  return `<div class="detail-head"><div class="detail-intro"><div class="project-logo">${logo(p)}</div><div><div class="eyebrow">PROJECT WORKSPACE / <button class="btn-link" data-nav="projects">ALL PROJECTS</button></div><h1>${e(p.title)}</h1><p>${e(p.kind)} · ${e(p.stage)} · ${e(p.priority)} priority</p></div></div><div class="detail-actions"><button class="btn btn-quiet" data-nav="projects">← All projects</button><button class="btn" data-action="refresh-github" data-pid="${e(p.id)}" ${!repoParts(p.repoUrl)?'disabled':''}>↻ Refresh GitHub</button><button class="btn btn-primary" data-action="edit-project" data-pid="${e(p.id)}">✎ Edit details</button></div></div>
    <div class="detail-grid"><div class="stack"><section class="panel panel-pad">${sectionHeading('Current project snapshot',`Task source: ${p.taskSource||'Not recorded'}`)}<div class="overview-fields">${infoSlot('Latest task',p.task,true)}${infoSlot('Next milestone',p.milestone,true)}${infoSlot('Known risks',p.risks,true)}${infoSlot('Most recent code update',p.updatedAt?dateFmt(p.updatedAt):'Unknown')}${infoSlot('Latest inspected commit',p.lastCommit||'Unknown')}</div></section>
    <section>${sectionHeading('Editable release checklist','Each check is manual: mark complete only after collecting evidence.')}<div class="checklist-grid">${CATEGORIES.map(cat=>renderChecklist(p,cat)).join('')}</div></section>
    </div><div class="stack"><section class="panel panel-pad">${sectionHeading('Build & validation', 'Evidence is tracked separately')}<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 14px"><div><div class="label">Build / GitHub Actions</div>${ciPill(p)}</div>${p.ci?.runUrl?link(p.ci.runUrl,'Workflow ↗','btn btn-sm'):''}</div><p class="note-box">${e(p.ci?.label||'No CI result recorded')}<br>Run: ${dateFmt(p.ci?.checkedAt)}<br>Run SHA: ${e(p.ci?.runSha||'Unknown')}<br>Source: ${e(p.ci?.source==='manual'?'Manual report':'GitHub snapshot / public API')}</p><div class="divider"></div><div class="label">Real-world host / device test</div>${testPill(p)}<p class="note-box" style="margin-top:14px">${e(p.validation?.details||'Not verified')}</p><div class="inline-actions"><button class="btn btn-sm" data-action="validation" data-pid="${e(p.id)}">Record test result</button><button class="btn btn-sm btn-quiet" data-action="record-build" data-pid="${e(p.id)}">Record build</button></div><div class="divider"></div><div class="label">Release gate</div><strong class="${releaseReady(p)?'tone-green':'tone-orange'}" style="font-size:15px">${releaseReady(p)?'Ready by recorded criteria':'Not signed off'}</strong><p class="micro">${pr.done}/${pr.total} checks · CI ${e(p.ci?.status||'unknown')}${p.ci?.source==='manual'?' (manual only)':''} · host ${e(p.validation?.status||'untested')}</p><div class="progress-track" style="margin-top:12px"><span style="width:${pr.percent}%"></span></div></section>
    <section class="panel panel-pad">${sectionHeading('Observed build history','Local observations and manually reported builds')}<div class="build-history">${(p.buildHistory||[]).length?(p.buildHistory||[]).slice(0,12).map(h=>`<div class="build-entry"><div class="inline-actions"><span class="status-pill ${statusClass(h.status)}">${e(h.source==='manual'?'Manual':'GitHub')} · ${e(h.status)}</span><strong>${e(h.sha||'Unknown SHA')}</strong></div><p>${e(h.label||'No details')}</p><small>${dateFmt(h.at)} ${h.duration?' · Workflow '+e(h.duration):''} ${link(h.url,'View evidence','text-button')}</small></div>`).join(''):'<p class="micro">No new build observations recorded yet. Refresh GitHub to begin tracking changes, or record a manual result.</p>'}</div></section>
    <section class="panel panel-pad">${sectionHeading('Source & downloads','Links require an actual repository or release')}<div class="link-row">${link(p.repoUrl,'GitHub repository')}${link(p.ci?.runUrl,'Latest inspected CI run')}${link(p.commitUrl,'Source commit')}${link(p.releaseUrl,'Published release / file')}${!(p.repoUrl||p.ci?.runUrl||p.releaseUrl)?'<span class="micro">No repository or release link recorded.</span>':''}</div>${!p.releaseUrl?'<p class="micro" style="margin-top:13px">No verified release file URL recorded. A successful workflow is not a release.</p>':''}</section><section class="panel panel-pad">${sectionHeading('Desktop & SkellWorld', 'Local folder and read-only world status')}<p class="micro">Local folder: ${e(p.localFolder||'Not linked')}</p><div class="inline-actions"><button class="btn btn-sm" data-action="choose-folder" data-pid="${e(p.id)}">Choose folder</button><button class="btn btn-sm btn-quiet" data-action="open-folder" data-pid="${e(p.id)}" ${p.localFolder?'':'disabled'}>Open folder</button><button class="btn btn-sm btn-quiet" data-nav="world">World status</button></div><p class="micro" style="margin-top:12px">${e(worldMatch(p).label)} · ${e(worldMatch(p).detail)}</p></section>
    <section class="panel panel-pad">${sectionHeading('Notes & references')}<p class="note-box">${e(p.notes||'No additional notes recorded.')}</p><div style="margin-top:16px"><button class="btn btn-sm" data-action="edit-project" data-pid="${e(p.id)}">Edit project notes</button></div></section>
    <section class="panel panel-pad">${sectionHeading('Recent change log','Project-local history')}<div class="compact-log">${related.length?related.map(x=>`<div class="log-entry"><span class="log-rail"></span><div class="log-body"><strong>${e(x.kind)}</strong><p>${e(x.message)}</p><div class="log-meta">${dateFmt(x.at)} ${x.evidence?link(x.evidence,'Evidence ↗','text-button'):''}</div></div></div>`).join(''):'<p class="micro">No log entries yet.</p>'}</div><button class="btn btn-sm" data-action="add-change" data-pid="${e(p.id)}">+ Add entry</button></section></div></div>`;
}
function renderWorkboard(){const p=data.projects.find(x=>x.id===state.workProject);const list=p?[p]:data.projects;const sections=CATEGORIES.map(cat=>{let tasks=[];for(const pr of list){for(const t of (pr.checklists?.[cat]||[]).filter(t=>!t.done))tasks.push({p:pr,t})}return `<section class="panel work-card"><div class="panel-header"><h3>${e(cat)}</h3><span class="small-tag">${tasks.length} open</span></div>${tasks.length?tasks.slice(0,state.workExpanded.includes(cat)?tasks.length:7).map(({p,t})=>`<div class="open-work-item"><input type="checkbox" data-check="${e(t.id)}" data-pid="${e(p.id)}" aria-label="Verify ${e(t.label)}"/><div><strong>${e(t.label)}</strong><p>${e(p.title)}</p><button class="text-button" data-project="${e(p.id)}">Open project →</button></div></div>`).join('')+(tasks.length>7?`<button type="button" class="btn btn-sm btn-quiet" data-action="expand-work" data-cat="${e(cat)}">${state.workExpanded.includes(cat)?'Show fewer':`Show all ${tasks.length} items`}</button>`:''):'<div class="micro">All tracked checks in this category are complete.</div>'}</section>`}).join('');return `${pageHeader('Execution / 03','Workboard','Reusable UI, engine, packaging, regression and release checklists for every project. Completing an item logs the change.',`<button class="btn btn-quiet" data-action="new-project">+ New project</button>`)}<div class="toolbar"><label class="micro" for="workFilter">PROJECT FILTER</label><select id="workFilter"><option value="all">All projects</option>${data.projects.map(x=>`<option value="${e(x.id)}" ${x.id===state.workProject?'selected':''}>${e(x.title)}</option>`).join('')}</select><span class="count-note">Manual checkmarks only · verification required</span></div><div class="work-columns">${sections}</div>`}
function renderCompare(){const list=data.comparisons.filter(c=>state.compareProject==='all'||c.projectId===state.compareProject);return `${pageHeader('Research / 04','Implementation comparisons','Track reference engines, competing approaches, uploaded reference file names, tradeoffs, and measured evidence without inventing results.',`<button class="btn btn-primary" data-action="add-comparison">+ Add comparison</button>`)}<div class="toolbar"><span class="micro">SHOW PROJECT</span><select id="compareFilter"><option value="all">All comparisons</option>${data.projects.map(x=>`<option value="${e(x.id)}" ${x.id===state.compareProject?'selected':''}>${e(x.title)}</option>`).join('')}</select><span class="count-note">${list.length} reference entries</span></div><div class="panel panel-pad"><div class="table-overflow"><table class="comparison-table"><thead><tr><th style="width:14%">Project</th><th style="width:20%">Implementation</th><th style="width:20%">Potential strengths</th><th style="width:19%">Unknowns / gaps</th><th style="width:19%">Evidence</th><th style="width:8%">Status</th></tr></thead><tbody>${list.map(c=>`<tr><td><strong>${e(pName(c.projectId))}</strong></td><td><strong>${e(c.candidate)}</strong><div class="micro">${e(c.source)}</div>${c.fileName?`<div class="small-tag" style="margin-top:7px">Reference: ${e(c.fileName)}</div>`:''}<div style="margin-top:9px"><button class="text-button" data-action="edit-comparison" data-id="${e(c.id)}">Edit / inspect →</button></div></td><td>${e(c.strengths||'Not recorded')}</td><td>${e(c.gaps||'Not recorded')}</td><td>${e(c.evidence||'No evidence attached')}</td><td><span class="small-tag ${c.result==='Passed'?'ok':c.result==='Failed'?'bad':'warn'}">${e(c.result)}</span></td></tr>`).join('')}</tbody></table></div>${!list.length?'<div class="empty"><strong>No comparisons yet</strong><p>Add an implementation or reference project to start a new evaluation.</p></div>':''}</div><div class="instruction" style="margin-top:18px"><strong>Reference upload handling:</strong> selecting a local ZIP or source file records only its name and size, not its contents. This site does not analyze ZIPs, upload them to a server, or retain their bytes. Record benchmarks and evidence manually, and keep the original files in your own source archive.</div>`}
function renderChangelog(){let list=data.changes.filter(c=>state.logProject==='all'||c.projectId===state.logProject).sort((a,b)=>String(b.at).localeCompare(String(a.at)));return `${pageHeader('History / 05','Change log','A single audit trail for GitHub snapshots, checklist changes, validation results, and manual notes.',`<button class="btn btn-primary" data-action="add-change">+ New log entry</button>`)}<div class="toolbar"><span class="micro">PROJECT FILTER</span><select id="logFilter"><option value="all">All projects</option>${data.projects.map(x=>`<option value="${e(x.id)}" ${x.id===state.logProject?'selected':''}>${e(x.title)}</option>`).join('')}</select><span class="count-note">${list.length} entries · newest first</span></div><div class="panel panel-pad"><div class="compact-log">${list.length?list.map(x=>`<div class="log-entry"><span class="log-rail"></span><div class="log-body"><div class="inline-actions"><strong>${e(x.kind)}</strong><span class="small-tag">${e(pName(x.projectId))}</span>${x.system?'<span class="small-tag">GitHub baseline</span>':''}</div><p>${e(x.message)}</p><div class="log-meta">${dateFmt(x.at)} ${x.evidence?link(x.evidence,'Open evidence ↗','text-button'):''}</div></div></div>`).join(''):'<div class="empty">No changes recorded yet.</div>'}</div></div>`}
function renderSettings(){let localBytes=0;try{localBytes=new Blob([JSON.stringify(data)]).size;}catch{}
const native=window.skellDesktop?.isDesktop?.();
const storageCard=native?`<section class="panel settings-card"><div class="eyebrow">NATIVE DATA / APPDATA</div><h3>Workspace save health</h3><p id="nativeSaveMessage">${e(window.skellDesktop.storageSummary())}</p><p class="micro">Changes are saved to AppData separately from the portable EXE. Failed writes retry automatically; keep an exported JSON backup as an additional safeguard.</p></section>`:'';
return `${pageHeader('Workspace / 06','Data & settings','Keep control of your project notes and evidence. There is no account, server, or hidden sync.',`<span class="source-pill">${native?'AppData + local browser':'Local browser storage'}</span>`)}<div class="settings-grid">${storageCard}<section class="panel settings-card automation-card"><div class="eyebrow">AUTOMATION CENTER / LIVE</div><h3>Automatic GitHub monitoring</h3><p>Automatically check commits and GitHub Actions while this dashboard is open. Changes appear in build history; host/DAW tests always require your approval.</p>
    <label class="automation-row"><span><strong>Enable automatic checks</strong><small>Starts when the dashboard is open and visible</small></span><input type="checkbox" data-auto-setting="enabled" ${automationConfig().enabled?'checked':''}></label>
    <label class="automation-row"><span><strong>Monitor</strong><small>Priority = up to 8 high-priority repos</small></span><select data-auto-setting="scope"><option value="priority" ${automationConfig().scope==='priority'?'selected':''}>High priority</option><option value="all" ${automationConfig().scope==='all'?'selected':''}>All linked repos</option></select></label>
    <label class="automation-row"><span><strong>Check interval</strong><small>Longer intervals avoid GitHub API limits</small></span><select data-auto-setting="intervalMinutes">${AUTO_INTERVALS.filter(n=>automationConfig().scope==='priority'||n>=60).map(n=>`<option value="${n}" ${automationConfig().intervalMinutes===n?'selected':''}>${n} minutes</option>`).join('')}</select></label>
    <div class="automation-summary"><span class="signal-dot"></span><span>${e(automationLabel())}<small>${e(automationConfig().lastSummary||'No results yet')}</small></span></div>
    <div class="inline-actions"><button class="btn btn-primary" data-action="refresh-auto-now">↻ Check now</button><button class="btn btn-quiet" data-nav="changelog">View change log</button></div>
    <p class="micro">No background service, authentication token, or unattended compiling. Automatic checks pause when the tab is closed or hidden.</p></section>
    <section class="panel settings-card automation-card"><div class="eyebrow">RECOVERY / SAFETY</div><h3>Automatic recovery snapshots</h3><p>Protect your locally saved workspace with up to four rotating snapshots taken before periodic changes, imports, and resets. Stored only in this browser.</p>
    <label class="automation-row"><span><strong>Automatic recovery</strong><small>Snapshot prior saved data at most every 30 minutes</small></span><input type="checkbox" data-auto-setting="snapshotsEnabled" ${automationConfig().snapshotsEnabled?'checked':''}></label>
    <button class="btn btn-quiet" data-action="snapshot-now">+ Create snapshot</button>
    <div class="recovery-list">${readSnapshots().length?readSnapshots().map((snap,i)=>`<div class="recovery-item"><span><strong>${e(snap.reason||'Recovery')}</strong><small>${dateFmt(snap.at)}</small></span><button class="btn btn-sm" data-action="restore-snapshot" data-index="${i}">Restore</button></div>`).join(''):'<span class="micro">No recovery snapshots yet. Create one to protect the current workspace.</span>'}</div>
    <p class="micro">Recovery copies are not an external backup. Export JSON regularly to protect against browser data loss.</p></section>
    <section class="panel settings-card"><div class="eyebrow">BACKUPS / PORTABILITY</div><h3>Export your whole workspace</h3><p>Download all projects, checklists, comparison records, validation notes, and change logs as a portable JSON file.</p><button class="btn btn-primary" data-action="export">↓ Export JSON backup</button><button class="btn btn-quiet" data-action="import">↑ Import JSON backup</button><div class="divider"></div><div class="micro">${data.projects.length} projects · ${data.changes.length} history entries · ${(localBytes/1024).toFixed(1)} KB data</div></section><section class="panel settings-card"><div class="eyebrow">DATA INTEGRITY</div><h3>Verified vs. unverified</h3><p>CI status is tied to the inspected GitHub workflow and matching current commit SHA. Local host/DAW test results are always manual. Release readiness requires all five checklist groups completed, passing current CI, and a passed real-world test.</p><div class="instruction">CI pass ≠ FL Studio test ≠ released artifact. A run on a different commit is marked stale.</div></section><section class="panel settings-card"><div class="eyebrow">GITHUB / SOURCE CONTROL</div><h3>Optional one-project refresh</h3><p>Open a project and use “Refresh GitHub” to fetch its public repository’s latest commit, last workflow run, and latest release. Private repositories and browser network restrictions may prevent refresh. No GitHub token is stored.</p><button class="btn" data-nav="projects">Browse repositories →</button></section><section class="panel settings-card"><div class="eyebrow">RESET / RECOVERY</div><h3>Restore initial snapshot</h3><p>Restore the verified starting data and remove your edits in this browser. Export first if you might need the current workspace.</p><button class="btn btn-danger" data-action="reset">Reset local workspace</button><div class="divider"></div><div class="micro">Last local edit: ${data.settings.lastLocalEdit?dateFmt(data.settings.lastLocalEdit):'None · initial snapshot'}</div></section></div><div class="instruction" style="margin-top:19px">To make this a shared team site, add a database, authentication and server-backed sync. This version is a complete local-first single-user site and can be hosted as static files on GitHub Pages or your own domain. Browser storage is device/browser-specific; use exports as backups.</div>`}
function render(keepScroll=false){let scrollY=keepScroll?window.scrollY:0;const main=document.getElementById('main');const views={overview:renderOverview,projects:renderProjects,world:()=>renderWorld(),developer:()=>window.skellDevCenter?.render()||'<p>Developer Center initializing…</p>',detail:renderDetail,workboard:renderWorkboard,compare:renderCompare,changelog:renderChangelog,settings:renderSettings};main.innerHTML=(views[state.view]||renderOverview)();document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('is-active',b.dataset.nav===state.view));document.getElementById('navProjectCount').textContent=data.projects.length;document.getElementById('breadcrumb').textContent='WORKSPACE / '+(state.view==='detail'?pName(state.selected):state.view.toUpperCase());if(keepScroll)window.scrollTo(0,scrollY);}
function field(label,name,value='',type='text',extra=''){return `<label class="form-field"><span>${e(label)}</span>${type==='textarea'?`<textarea name="${e(name)}" ${extra}>${e(value)}</textarea>`:`<input name="${e(name)}" type="${e(type)}" value="${e(value)}" ${extra}/>`}</label>`}
function selectField(label,name,value,opts){return `<label class="form-field"><span>${e(label)}</span><select name="${e(name)}">${opts.map(o=>`<option value="${e(o)}" ${o===value?'selected':''}>${e(o)}</option>`).join('')}</select></label>`}
function projectSelectField(value){return `<label class="form-field"><span>Project</span><select name="projectId">${data.projects.map(p=>`<option value="${e(p.id)}" ${p.id===value?'selected':''}>${e(p.title)}</option>`).join('')}</select></label>`}
function openModal(title,desc,body,formType,button='Save changes',attrs=''){const dlg=document.getElementById('modal');document.getElementById('modalContent').innerHTML=`<div class="modal-inside"><button class="modal-close" type="button" data-action="close-modal" aria-label="Close">×</button><div class="modal-title">${e(title)}</div><p class="modal-desc">${e(desc)}</p><form data-form="${e(formType)}" ${attrs}>${body}<div class="form-actions"><button type="button" class="btn btn-quiet" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">${e(button)}</button></div></form></div>`;dlg.showModal();}
function closeModal(){document.getElementById('modal').close()}
function editProject(p){openModal(`Edit ${p.title}`,'Update evidence and roadmap notes. Changes are automatically recorded in the change log.',
  `<div class="field-row">${field('Project name','title',p.title)}${selectField('Type','kind',p.kind,['VST3 plugin','Desktop app','Desktop tool','Python tool','Web app','Other'])}</div><div class="field-row">${selectField('Stage','stage',p.stage,STAGES)}${selectField('Priority','priority',p.priority,PRIORITIES)}</div>${field('Latest task','task',p.task,'textarea')}${field('Next milestone','milestone',p.milestone,'textarea')}${field('Known risks / blockers','risks',p.risks,'textarea')}${field('Repository URL','repoUrl',p.repoUrl)}${field('Local project folder (desktop only)','localFolder',p.localFolder||'')}${field('Release / download URL (only if verified)','releaseUrl',p.releaseUrl)}${field('Additional notes','notes',p.notes,'textarea')}${field('Latest task source','taskSource',p.taskSource)}<input type="hidden" name="pid" value="${e(p.id)}"/>`,'edit-project');}
function newProject(){openModal('Add a project','Start with no claimed CI builds, no release files, and all QA items unchecked.',`${field('Project name','title','','text','required maxlength="100"')}<div class="field-row">${selectField('Type','kind','VST3 plugin',['VST3 plugin','Desktop app','Desktop tool','Python tool','Web app','Other'])}${selectField('Stage','stage','Planning',STAGES)}</div>${field('Repository URL (optional)','repoUrl','')}${field('First milestone','milestone','Identify the current source baseline and verification plan','textarea')}`,'new-project','Create project')}
function validationForm(p){openModal(`Record ${p.title} host test`,'Only mark Passed after an actual installed app / host / device test. Explain the tested version, system, and evidence.',`${selectField('Real-world validation state','testStatus',p.validation?.status||'untested',VALIDATION_STATES)}${field('Test details / steps / environment / proof','details',p.validation?.details||'','textarea','required')}<input type="hidden" name="pid" value="${e(p.id)}"/>`,'validation','Record result')}
function recordBuildForm(p){openModal(`Record ${p.title} build`,'Manual builds are not GitHub-verified. Include a reproducible artifact, commit SHA, date and evidence URL.',`${selectField('Build result','status',p.ci?.status||'unknown',CI_STATES)}${field('Build description','label',p.ci?.label||'','textarea','required')}${field('Commit SHA or version','runSha',p.ci?.runSha||'')}${field('Workflow log / evidence URL','runUrl',p.ci?.runUrl||'')}<input type="hidden" name="pid" value="${e(p.id)}"/>`,'build','Record manual build');}
function comparisonForm(c=null){const item=c||{id:'',projectId:state.compareProject==='all'?(data.projects[0]?.id||''):state.compareProject,candidate:'',source:'',strengths:'',gaps:'',evidence:'',result:'Not tested',fileName:''};openModal(c?'Edit comparison':'Add implementation comparison','Upload reference file metadata or type a repository/source URL. The original file bytes are not retained.',`${projectSelectField(item.projectId)}${field('Implementation / candidate name','candidate',item.candidate,'text','required')}${field('Source URL, repo or description','source',item.source)}<div class="field-row">${field('Potential strengths','strengths',item.strengths,'textarea')}${field('Unknowns / gaps','gaps',item.gaps,'textarea')}</div>${field('Evidence / benchmark notes','evidence',item.evidence,'textarea')}${selectField('Result status','result',item.result,['Not tested','Reported only','Testing','Passed','Failed','Inconclusive'])}<label class="form-field"><span>Reference file (optional; metadata only)</span><input type="file" name="referenceFile" accept=".zip,.cpp,.h,.hpp,.py,.js,.ts,.json,.md,.txt,.wav,.flp,.vst3"/><small>Existing reference: ${e(item.fileName||'none')}. Files are not uploaded or saved.</small></label><input type="hidden" name="itemId" value="${e(item.id)}"/>${c?`<button type="button" class="btn btn-danger btn-sm" data-action="delete-comparison" data-id="${e(item.id)}">Delete comparison</button>`:''}`,'comparison',c?'Save comparison':'Add comparison');}
function changeForm(projectId=null){openModal('Add change log entry','Record a decision, tested result, bug, or milestone with a proof link when available.',`${projectSelectField(projectId||data.projects[0]?.id||'')}${selectField('Entry type','kind','Manual note',['Manual note','Bug found','Bug fixed','Test result','Decision','Milestone','Release','Research'])}${field('Description','message','','textarea','required')}${field('Evidence URL (optional)','evidence','')}`,'change','Add entry')}
function taskForm(p,cat,item=null){openModal(item?'Edit checklist item':'Add checklist item','For completed tasks, record the exact evidence or test environment in the notes.',`${field('Checklist task','label',item?.label||'','text','required')}${field('Evidence / validation notes','evidence',item?.evidence||'','textarea')}<input type="hidden" name="pid" value="${e(p.id)}"/><input type="hidden" name="category" value="${e(cat)}"/><input type="hidden" name="taskId" value="${e(item?.id||'')}"/>${item?`<button class="btn btn-danger btn-sm" type="button" data-action="delete-task" data-pid="${e(p.id)}" data-cat="${e(cat)}" data-task="${e(item.id)}">Delete this item</button>`:''}`,'task',item?'Save checklist item':'Add checklist item')}
function getFormData(form){return Object.fromEntries(new FormData(form).entries())}
function onFormSubmit(ev){const form=ev.target.closest('form[data-form]');if(!form)return;ev.preventDefault();const v=getFormData(form);const typ=form.dataset.form;
  if(typ==='new-project'){const p=project(uid(),String(v.title).trim(),v.kind,null,'Define initial verified task',v.milestone||'Document initial milestone','Not assessed',{}, {stage:v.stage,taskSource:'Manually entered'});p.repoUrl=safeUrl(v.repoUrl);data.projects.push(p);logChange(p.id,'Project created','New project added to workspace');closeModal();saveAndRender(false);setView('detail',p.id);toast('New project created');return;}
  if(typ==='edit-project'){const p=pById(v.pid);if(!p)return;const changes=[];for(const k of ['title','kind','stage','priority','task','milestone','risks','repoUrl','releaseUrl','notes','localFolder','taskSource']){let nv=String(v[k]??'').trim();if(['repoUrl','releaseUrl'].includes(k))nv=safeUrl(nv);if(p[k]!==nv){p[k]=nv;changes.push(k)}}if(changes.length)logChange(p.id,'Project edited','Updated: '+changes.join(', '));closeModal();saveAndRender();toast(changes.length?'Project details saved':'No changes to save');return;}
  if(typ==='validation'){const p=pById(v.pid);if(!p)return;p.validation={status:v.testStatus,details:String(v.details||'').trim()};logChange(p.id,'Test result',`Real-world validation recorded: ${v.testStatus}. ${p.validation.details}`);closeModal();saveAndRender();toast('Validation record updated');return;}
  if(typ==='build'){const p=pById(v.pid);if(!p)return;p.ci={status:v.status,label:`Manually reported: ${String(v.label||'').trim()}`,runUrl:safeUrl(v.runUrl),runSha:String(v.runSha||'').trim(),checkedAt:new Date().toISOString(),source:'manual'};appendBuildHistory(p,{status:p.ci.status,sha:p.ci.runSha,label:p.ci.label,url:p.ci.runUrl,at:p.ci.checkedAt,source:'manual'});logChange(p.id,'Build report',`Manually recorded build: ${v.status} — ${v.label}`,p.ci.runUrl);closeModal();saveAndRender();toast('Manual build report recorded, not GitHub-verified');return;}
  if(typ==='comparison'){let c=data.comparisons.find(x=>x.id===v.itemId);const oldName=c?.candidate;if(!c){c={id:uid()};data.comparisons.unshift(c)}for(const k of ['projectId','candidate','source','strengths','gaps','evidence','result'])c[k]=String(v[k]||'').trim();const file=form.elements.referenceFile?.files?.[0];if(file)c.fileName=`${file.name} (${(file.size/1024).toFixed(1)} KB)`;else if(!c.fileName)c.fileName='';logChange(c.projectId,'Research',`${oldName?'Updated':'Added'} comparison: ${c.candidate} (${c.result})`);closeModal();saveAndRender();toast('Comparison saved — file bytes not retained');return;}
  if(typ==='change'){logChange(v.projectId,v.kind,String(v.message||'').trim(),safeUrl(v.evidence));closeModal();saveAndRender();toast('Entry added to change log');return;}
  if(typ==='task'){const p=pById(v.pid);const cat=v.category;if(!p||!p.checklists?.[cat])return;let t=p.checklists[cat].find(x=>x.id===v.taskId);if(!t){t={id:uid(),done:false,label:'',evidence:''};p.checklists[cat].push(t)}t.label=String(v.label||'').trim();t.evidence=String(v.evidence||'').trim();logChange(p.id,'Checklist edited',`${cat}: ${t.label}`);closeModal();saveAndRender();toast('Checklist updated');return;}}
function appendBuildHistory(p,h){
  if(!Array.isArray(p.buildHistory))p.buildHistory=[];
  const key=[h.source,h.sha,h.status,h.url].join('|');
  if(p.buildHistory.some(x=>[x.source,x.sha,x.status,x.url].join('|')===key))return;
  p.buildHistory.unshift(h);if(p.buildHistory.length>24)p.buildHistory.length=24;
}
async function gitGet(root,path){
  const r=await fetch(root+path,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(14000)});
  if(!r.ok){const error=new Error(`GitHub HTTP ${r.status} — ${path}`);error.status=r.status;error.rateLimited=r.status===403||r.status===429;throw error}
  return r.json();
}
async function refreshGitHub(p,{silent=false,includeRelease=true}={}){
  const rp=repoParts(p.repoUrl);if(!rp){if(!silent)toast('Add a valid GitHub repository URL first');return {ok:false,reason:'No repository URL'}};
  const btn=document.querySelector(`[data-action="refresh-github"][data-pid="${CSS.escape(p.id)}"]`);
  if(btn){btn.disabled=true;btn.textContent='↻ Checking…'}
  const root=`https://api.github.com/repos/${rp.owner}/${rp.repo}`;
  try{
    // A missing release or disabled Actions must never discard a successful commit fetch.
    const results=await Promise.allSettled([gitGet(root,'/commits?per_page=1'),gitGet(root,'/actions/runs?per_page=12'),includeRelease?gitGet(root,'/releases?per_page=1').catch(error=>{if(error.status===404)return [];throw error}):Promise.resolve(null)]);
    const [commits,runs,releases]=results.map(x=>x.status==='fulfilled'?x.value:null);
    const errors=results.filter(x=>x.status==='rejected').map(x=>x.reason);
    if(!commits&&!runs&&!releases)throw errors[0]||new Error('No GitHub data returned');
    // An in-flight response must never mutate a project removed by import/reset.
    if(pById(p.id)!==p)return {ok:false,reason:'Project replaced during refresh',stale:true};
    const prior=JSON.stringify({sha:p.lastCommit,ci:p.ci?.status,run:p.ci?.runUrl,release:p.githubReleaseUrl});
    const priorStatus=p.ci?.status;
    const head=Array.isArray(commits)?commits[0]:null;
    if(head?.sha){
      p.updatedAt=head.commit?.committer?.date||p.updatedAt;
      p.lastCommit=head.sha.slice(0,10);p.commitUrl=safeUrl(head.html_url)||p.commitUrl;
      p.latestCommitMessage=String(head.commit?.message||'').split('\n')[0].slice(0,220);
      // Refresh source evidence without clobbering a manually authored project plan.
    }
    if(runs?.workflow_runs){
      const all=Array.isArray(runs.workflow_runs)?runs.workflow_runs:[];
      const matching=head?.sha?all.find(r=>r.head_sha===head.sha):null;
      const runRec=matching||all[0];
      if(runRec){
        const matches=Boolean(matching&&head?.sha);
        let status='unknown';
        if(!matches&&head?.sha)status='stale';
        else if(matches&&runRec.status==='completed'&&runRec.conclusion==='success')status='passed';
        else if(matches&&runRec.status==='completed'&&['failure','timed_out','startup_failure','action_required'].includes(runRec.conclusion))status='failed';
        const inspectedAt=new Date().toISOString();
        const evidence=matches?'Verified head commit':head?.sha?'Different commit':'Head commit unavailable';
        p.ci={status,label:`${evidence} · ${runRec.name||'Workflow'} · ${runRec.conclusion||runRec.status||'unknown'}`,runUrl:safeUrl(runRec.html_url),checkedAt:inspectedAt,runAt:runRec.created_at||'',runSha:String(runRec.head_sha||'').slice(0,10),duration:workflowDuration(runRec.run_started_at,runRec.updated_at),source:'github'};
        appendBuildHistory(p,{status,sha:p.ci.runSha,label:p.ci.label,url:p.ci.runUrl,at:runRec.created_at||inspectedAt,duration:p.ci.duration,source:'github'});
      }else p.ci={status:'unknown',label:'No workflow runs returned',runUrl:'',runSha:'',checkedAt:new Date().toISOString(),source:'github'};
    }else if(head){
      // Head changed but workflows were inaccessible: old pass can no longer be trusted.
      p.ci={status:'unknown',label:'Commit updated; workflow evidence unavailable',runUrl:'',runSha:'',checkedAt:new Date().toISOString(),source:'github'};
    }
    if(Array.isArray(releases)&&releases[0]?.html_url){
      // Never erase a manually entered release URL when GitHub has no published release.
      p.githubReleaseUrl=safeUrl(releases[0].html_url);
      if(!p.releaseUrl)p.releaseUrl=p.githubReleaseUrl;
    }
    const partial=errors.length?` (${errors.length} endpoint(s) unavailable)` : '';
    const changed=prior!==JSON.stringify({sha:p.lastCommit,ci:p.ci?.status,run:p.ci?.runUrl,release:p.githubReleaseUrl});
    if(changed)logChange(p.id,'GitHub evidence changed',`Public GitHub metadata updated${partial}; head ${p.lastCommit||'unknown'}, CI ${p.ci?.status||'unknown'}. Manual tasks and QA unchanged.`,p.ci?.runUrl||'');
    if(!silent){persist();render(true);toast(`GitHub refreshed${partial} — host QA unchanged`)}
    return {ok:true,changed,priorStatus,newStatus:p.ci?.status,partial:!!errors.length,rateLimited:errors.some(err=>err.rateLimited)};
  }catch(err){if(!silent)toast(`GitHub refresh failed: ${err.message}`);console.warn('GitHub refresh:',err);return {ok:false,reason:err.message,rateLimited:!!err.rateLimited}}
  finally{if(btn?.isConnected){btn.disabled=false;btn.textContent='↻ Refresh GitHub'}}
}
function automationDueAt(){
  const a=automationConfig();const last=Date.parse(a.lastAttemptAt)||0;
  const normal=last+a.intervalMinutes*60000;
  return Math.max(normal,Date.parse(a.pauseUntil)||0);
}
function automationLabel(){
  const a=automationConfig();
  if(automationRuntime.busy)return 'Checking GitHub repositories…';
  if(!a.enabled)return 'Automation off';
  if(a.pauseUntil&&Date.parse(a.pauseUntil)>Date.now())return 'Paused until '+dateFmt(a.pauseUntil);
  return a.lastCompletedAt?'Last check: '+dateFmt(a.lastCompletedAt):'Ready for first GitHub check';
}
function scheduleAutoSync(){
  if(automationRuntime.timer!==null)clearTimeout(automationRuntime.timer);
  automationRuntime.timer=null;
  const a=automationConfig();
  if(!a.enabled||document.hidden||syncBusy)return;
  const delay=Math.max(1000,automationDueAt()-Date.now());
  automationRuntime.timer=setTimeout(()=>{automationRuntime.timer=null;runRefresh({automatic:true})},Math.min(delay,2147483647));
}
function refreshScopeTargets(scope){
  const all=data.projects.filter(p=>repoParts(p.repoUrl)).sort(prioritySort);
  return scope==='all'?all.slice(0,30):all.filter(p=>['Critical','High'].includes(p.priority)).slice(0,8);
}
let syncBusy=false;
async function runRefresh({automatic=false,scope=null}={}){
  if(syncBusy){if(!automatic)toast('Refresh already running');return {ok:0,failed:0,skipped:true}}
  const a=automationConfig();
  if(automatic&&(!a.enabled||document.hidden))return {ok:0,failed:0,skipped:true};
  const actualScope=scope||a.scope;
  const targets=refreshScopeTargets(actualScope);
  if(!targets.length){if(!automatic)toast('No GitHub repositories to refresh');return {ok:0,failed:0,skipped:true}}
  syncBusy=true;automationRuntime.busy=true;a.lastAttemptAt=new Date().toISOString();
  const button=document.querySelector('[data-action="refresh-focus"]');if(button)button.disabled=true;
  const status=document.getElementById('syncStatus');let completed=0,ok=0,partial=0,failed=0,stop=false,changed=0;
  const alerts=[];
  try{
    let index=0;
    async function worker(){
      while(index<targets.length&&!stop){
        const p=targets[index++];if(status)status.textContent=`GitHub ${completed+1}/${targets.length}: ${p.title}`;
        // Automatic checks skip the releases endpoint to conserve the public API quota.
        const result=await refreshGitHub(p,{silent:true,includeRelease:!automatic});
        completed++;
        if(result.ok){ok++;if(result.partial)partial++;if(result.changed)changed++;
          if(['failed','stale'].includes(result.newStatus)&&result.priorStatus!==result.newStatus)alerts.push(`${p.title}: ${result.newStatus}`);
        }else failed++;
        if(result.rateLimited)stop=true;
      }
    }
    await Promise.all([worker(),worker()]);
    if(stop)a.pauseUntil=new Date(Date.now()+90*60000).toISOString();else a.pauseUntil=null;
    a.lastCompletedAt=new Date().toISOString();
    a.lastSummary=`${ok} checked · ${changed} changes · ${failed} failed${stop?' · GitHub rate-limited':''}`;
    automationRuntime.lastAlerts=alerts.slice(0,8);
    automationRuntime.notice=alerts.length?alerts.join(' · '):'';
    if(status)status.textContent=`${automatic?'Auto-sync':'Manual sync'}: ${a.lastSummary}`;
    persist();render(true);
    if(!automatic)toast(`GitHub: ${ok} checked, ${failed} failed${partial?`, ${partial} partial`:''}`);
    else if(alerts.length)toast(`${alerts.length} new build alert(s) — see Overview`);
    return {ok,failed,partial,changed,alerts,stopped:stop};
  }finally{syncBusy=false;automationRuntime.busy=false;if(button?.isConnected)button.disabled=false;scheduleAutoSync()}
}
function refreshFocus(){return runRefresh({scope:'priority'})}
function setAutomationOption(key,value){
  const a=automationConfig();
  if(key==='enabled'||key==='snapshotsEnabled')a[key]=Boolean(value);
  else if(key==='scope'&&AUTO_SCOPE.includes(value))a.scope=value;
  else if(key==='intervalMinutes'&&AUTO_INTERVALS.includes(Number(value)))a.intervalMinutes=Number(value);
  if(a.scope==='all'&&a.intervalMinutes<60)a.intervalMinutes=60;
  a.lastAttemptAt=null; // New settings take effect immediately, not one stale interval later.
  persist();scheduleAutoSync();render(true);toast('Automation preferences saved');
}
function paletteCandidates(query){
  const q=String(query||'').toLowerCase().trim();
  return data.projects.filter(p=>!q||[p.title,p.kind,p.task,p.milestone,p.repoUrl].some(x=>String(x||'').toLowerCase().includes(q))).sort(prioritySort).slice(0,12);
}
function updatePalette(){
  const q=document.getElementById('paletteSearch')?.value||'';
  const results=document.getElementById('paletteResults');if(!results)return;
  const matches=paletteCandidates(q);
  results.innerHTML=matches.length?matches.map((p,i)=>`<button type="button" data-palette-project="${e(p.id)}" class="palette-result ${i===0?'is-highlighted':''}"><span class="project-logo">${logo(p)}</span><span><strong>${e(p.title)}</strong><small>${e(p.kind)} · ${e(p.stage)}</small></span><span class="palette-enter">↵</span></button>`).join(''):'<p class="micro">No matching projects.</p>';
}
function openPalette(){const dlg=document.getElementById('commandPalette');if(dlg.open)return;dlg.showModal();document.getElementById('paletteSearch').value='';updatePalette();document.getElementById('paletteSearch').focus()}
function openPaletteSelection(){const selected=document.querySelector('.palette-result.is-highlighted')||document.querySelector('.palette-result');if(selected)setView('detail',selected.dataset.paletteProject)}
function exportData(){const backup=JSON.stringify(data,null,2);const blob=new Blob([backup],{type:'application/json'});const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download=`skelly-project-control-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);toast('Workspace backup exported');}
async function importData(file){if(!file)return;if(file.size>5*1024*1024){toast('Backup too large (5 MB max)');return}try{const incoming=JSON.parse(await file.text());if(!validData(incoming))throw new Error('Invalid schema or missing records');if(!confirm(`Replace the current workspace with ${incoming.projects.length} projects from this backup? The current data will be snapshotted first.`))return;makeSnapshot('Before import',true);const old=data;data=incoming;automationConfig();if(!persist()){data=old;throw new Error('Browser storage is full or blocked; original workspace was kept')}state.view='overview';state.selected=null;automationRuntime.notice='';automationRuntime.lastAlerts=[];render(false);scheduleAutoSync();toast('Workspace restored from JSON backup');}catch(err){toast('Import failed: '+err.message)}}
function changeCheck(el){const p=pById(el.dataset.pid);if(!p)return;let item;let category;for(const [cat,arr] of Object.entries(p.checklists||{})){const t=arr.find(x=>x.id===el.dataset.check);if(t){item=t;category=cat;break}}if(!item)return;item.done=el.checked;logChange(p.id,item.done?'Checklist verified':'Checklist reopened',`${category}: ${item.label}${item.evidence?' — Evidence: '+item.evidence:''}`);saveAndRender(true);toast(item.done?'Checklist marked verified (manual)':'Checklist reopened');}
function handleAction(el){const a=el.dataset.action;if(a==='world-refresh'){refreshWorld();return}if(a==='world-share-toggle'){toggleWorldSummary();return}if(a==='choose-folder'){desktopChooseFolder(el.dataset.pid);return}if(a==='open-folder'){desktopOpenFolder(el.dataset.pid);return}if(a==='close-modal'){closeModal();return}if(a==='new-project'){newProject();return}if(a==='edit-project'){const p=pById(el.dataset.pid);if(p)editProject(p);return}if(a==='validation'){const p=pById(el.dataset.pid);if(p)validationForm(p);return}if(a==='record-build'){const p=pById(el.dataset.pid);if(p)recordBuildForm(p);return}if(a==='add-comparison'){comparisonForm();return}if(a==='edit-comparison'){const c=data.comparisons.find(x=>x.id===el.dataset.id);if(c)comparisonForm(c);return}if(a==='add-change'){changeForm(el.dataset.pid||null);return}if(a==='delete-comparison'){const idx=data.comparisons.findIndex(c=>c.id===el.dataset.id);if(idx>=0&&confirm('Delete this comparison?')){const c=data.comparisons[idx];data.comparisons.splice(idx,1);logChange(c.projectId,'Research',`Removed comparison: ${c.candidate}`);closeModal();saveAndRender();toast('Comparison removed')}return}if(a==='edit-task'||a==='add-task'){const p=pById(el.dataset.pid);if(p){const cat=el.dataset.cat;taskForm(p,cat,a==='edit-task'?p.checklists[cat]?.find(x=>x.id===el.dataset.task):null);}return}if(a==='delete-task'){const p=pById(el.dataset.pid);if(!p)return;if(confirm('Delete this checklist item?')){const arr=p.checklists[el.dataset.cat];const i=arr.findIndex(x=>x.id===el.dataset.task);if(i>=0){logChange(p.id,'Checklist deleted',`${el.dataset.cat}: ${arr[i].label}`);arr.splice(i,1);closeModal();saveAndRender();toast('Checklist item deleted')}}return}if(a==='refresh-github'){const p=pById(el.dataset.pid);if(p)refreshGitHub(p);return}if(a==='export'){exportData();return}if(a==='import'){document.getElementById('importFile').click();return}if(a==='reset'){if(confirm('Reset all projects, tasks, comparisons and log entries to the initial snapshot?')){makeSnapshot('Before reset',true);data=initialData();persist();state.view='overview';automationRuntime.notice='';automationRuntime.lastAlerts=[];render(false);scheduleAutoSync();toast('Initial snapshot restored; recovery snapshot retained')}return}if(a==='clear-filters'){state.search='';state.filter='all';render();return}if(a==='expand-work'){const c=el.dataset.cat;state.workExpanded=state.workExpanded.includes(c)?state.workExpanded.filter(x=>x!==c):[...state.workExpanded,c];render(true);return}if(a==='refresh-focus'){refreshFocus();return}if(a==='refresh-auto-now'){runRefresh({scope:automationConfig().scope});return}if(a==='snapshot-now'){const created=makeSnapshot('Manual snapshot',true);render(true);toast(created?'Recovery snapshot saved':'Snapshot already up to date or storage unavailable');return}if(a==='restore-snapshot'){restoreSnapshot(Number(el.dataset.index));return}if(a==='command-palette'){openPalette();return}}
// Keep keyboard-focused navigation visible in the horizontally scrollable compact rail.
document.addEventListener('focusin', ev => {
  const navButton = ev.target.closest?.('.navigation [data-nav]');
  if (navButton) navButton.scrollIntoView({block:'nearest', inline:'nearest'});
});
document.addEventListener('click',ev=>{const a=ev.target.closest('a');if(a)return;const action=ev.target.closest('[data-action]');if(action){handleAction(action);return}const nav=ev.target.closest('[data-nav]');if(nav){setView(nav.dataset.nav);return}const row=ev.target.closest('[data-project]');if(row){setView('detail',row.dataset.project)}});
document.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){const el=ev.target.closest('[data-project][role="button"]');if(el){ev.preventDefault();setView('detail',el.dataset.project)}}});
document.addEventListener('change',ev=>{const el=ev.target;if(el.matches('[data-auto-setting]')){setAutomationOption(el.dataset.autoSetting,el.type==='checkbox'?el.checked:el.value);return}if(el.matches('[data-check]'))changeCheck(el);if(el.id==='projectFilter'){state.filter=el.value;render(true)}if(el.id==='projectSort'){state.sort=el.value;render(true)}if(el.id==='workFilter'){state.workProject=el.value;render(true)}if(el.id==='compareFilter'){state.compareProject=el.value;render(true)}if(el.id==='logFilter'){state.logProject=el.value;render(true)}});
let searchTimeout=null;document.addEventListener('input',ev=>{if(ev.target.id==='projectSearch'){const input=ev.target;const pos=input.selectionStart;state.search=input.value;clearTimeout(searchTimeout);searchTimeout=setTimeout(()=>{render(true);const next=document.getElementById('projectSearch');if(next){next.focus();next.setSelectionRange(pos,pos)}},180)}});
document.addEventListener('submit',onFormSubmit);
document.getElementById('paletteSearch').addEventListener('input',updatePalette);
document.getElementById('paletteResults').addEventListener('click',ev=>{const b=ev.target.closest('[data-palette-project]');if(b)setView('detail',b.dataset.paletteProject)});
document.getElementById('paletteSearch').addEventListener('keydown',ev=>{
 if(ev.key==='Enter'){ev.preventDefault();openPaletteSelection()}
 if(['ArrowDown','ArrowUp'].includes(ev.key)){ev.preventDefault();const arr=[...document.querySelectorAll('.palette-result')];if(!arr.length)return;const n=arr.findIndex(x=>x.classList.contains('is-highlighted'));arr.forEach(x=>x.classList.remove('is-highlighted'));arr[(n+(ev.key==='ArrowDown'?1:-1)+arr.length)%arr.length].classList.add('is-highlighted')}
});
document.addEventListener('keydown',ev=>{if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='k'){ev.preventDefault();document.getElementById('commandPalette').open?document.getElementById('commandPalette').close():openPalette()}});
document.getElementById('exportTop').addEventListener('click',exportData);
document.getElementById('newProject').addEventListener('click',newProject);
document.getElementById('importFile').addEventListener('change',ev=>{importData(ev.target.files[0]);ev.target.value=''});
automationConfig();
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(automationRuntime.timer!==null)clearTimeout(automationRuntime.timer);automationRuntime.timer=null}else scheduleAutoSync()});
window.addEventListener('online',scheduleAutoSync);
render();
scheduleAutoSync();
