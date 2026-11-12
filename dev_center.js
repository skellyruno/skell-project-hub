/* SKELL Developer Command Center. Native operations require explicit user actions. */
'use strict';
const skellDevCenter = {
  model: {active:null, queue:[], folders:{}, history:[], logs:[],
          schedule:{enabled:false,interval_minutes:120,project_id:'',with_tests:true},
          available:false},
  launcher: {supported:false,registered:false},
  timer: null,
  busy: false,
  ready: false,
  lastSignature: null,
  isNative(){return Boolean(window.skellDesktop?.isDesktop?.());},
  onView(view){
    if(this.timer!==null){clearInterval(this.timer);this.timer=null;}
    if(view==='developer'){
      this.refresh();
      if(this.isNative())this.timer=setInterval(()=>{if(!document.hidden)this.refresh()},2500);
    }
  },
  async refresh(){
    if(this.busy || !this.isNative())return;
    this.busy=true;
    try{
      const [build,launcher]=await Promise.all([
        window.pywebview.api.builder_status(),
        window.pywebview.api.launcher_status()]);
      const signature=JSON.stringify([build,launcher]);
      const changed=!this.ready||signature!==this.lastSignature;
      if(build&&typeof build==='object')this.model=build;
      if(launcher&&typeof launcher==='object')this.launcher=launcher;
      this.ready=true;this.lastSignature=signature;
      if(changed&&state.view==='developer' && !['SELECT','INPUT','TEXTAREA'].includes(document.activeElement?.tagName))render(true);
    }catch(error){console.warn('Builder status unavailable',error)}
    finally{this.busy=false;}
  },
  priorityBrief(){
    const focused=data.projects.filter(p=>p.stage!=='Released').sort(prioritySort);
    const failures=focused.filter(p=>p.ci?.status==='failed');
    const blocked=focused.filter(p=>p.stage==='Blocked');
    const picks=[...failures,...blocked,...focused].filter((p,i,all)=>all.findIndex(q=>q.id===p.id)===i).slice(0,5);
    return picks.map(p=>`<div class="dev-priority"><span class="dev-severity ${p.ci?.status==='failed'?'dev-failed':''}">${p.ci?.status==='failed'?'CI FAILURE':p.stage==='Blocked'?'BLOCKED':e(p.priority)}</span><button type="button" data-dev-project="${e(p.id)}">${e(p.title)}</button><small>${e(p.task||'No next task recorded')}</small></div>`).join('')||'<p class="micro">No outstanding tasks.</p>';
  },
  render(){
    const native=this.isNative(),m=this.model;
    const linked=data.projects.filter(p=>m.folders?.[p.id]);
    const schedule=m.schedule||{};
    const options=linked.map(p=>`<option value="${e(p.id)}" ${schedule.project_id===p.id?'selected':''}>${e(p.title)}</option>`).join('');
    const selected=linked.length?linked.find(p=>p.id===schedule.project_id)||linked[0]:null;
    const status=m.active?`Building ${e(pName(m.active.project_id))} · ${e(m.active.step)}`:m.queue?.length?'Starting queued builds':'Idle — no builds running';
    const buildRows=data.projects.slice().sort(prioritySort).map(p=>{
      const folder=m.folders?.[p.id];
      const history=m.history?.find(h=>h.project_id===p.id);
      const install=m.installs?.[p.id];
      return `<div class="dev-build-row"><span class="dev-project-letter">${logo(p)}</span><div class="dev-build-name"><strong>${e(p.title)}</strong><small>${folder?e(folder):'Choose a local CMake project folder to enable builds'}</small></div><div class="dev-build-state">${history?`<span class="small-tag ${history.status==='compiled'?'ok':history.status==='failed'?'bad':'warn'}">${e(history.status)}</span><small>${e(history.artifact_verified?'VST3 binary found':'VST3 unverified')}</small>`:'<span class="small-tag">Not built here</span>'}</div><div class="dev-buttons"><button class="btn btn-sm btn-quiet" data-action="dev-folder" data-pid="${e(p.id)}" ${!native?'disabled':''}>Folder</button><button class="btn btn-sm btn-primary" data-action="dev-build" data-pid="${e(p.id)}" ${!native||!folder||m.active||m.queue?.length?'disabled':''}>Build</button><button class="btn btn-sm btn-quiet" data-action="dev-install" data-pid="${e(p.id)}" ${!native||history?.status!=='compiled'||!history?.artifact_verified||m.active?'disabled':''}>Install</button>${install?.status==='installed'&&install.backup?`<button class="btn btn-sm btn-quiet" data-action="dev-rollback" data-pid="${e(p.id)}">Rollback</button>`:''}</div></div>`;
    }).join('');
    const history=(m.history||[]).slice(0,8).map(h=>`<div class="dev-history-row"><span class="small-tag ${h.status==='compiled'?'ok':h.status==='failed'?'bad':'warn'}">${e(h.status)}</span><strong>${e(pName(h.project_id))}</strong><span>${e(String(h.duration_seconds??'—'))}s</span><small>${e(h.artifact_verified?'Verified VST3 binary':'Binary unverified')} · ${e(h.ctest_exit===0?'CTest passed':h.ctest_exit===null?'CTest not run':'CTest failed')}</small></div>`).join('')||'<p class="micro">No local build results yet.</p>';
    return `${pageHeader('SKELL / DEVELOPER MODE','Developer Command Center',
      'Projects, trusted local builds, verifiable results, and opt-in automation. Your FL Studio QA stays separate.',
      `<button class="btn btn-quiet" data-action="dev-refresh">↻ Refresh status</button>`) }
      <div class="dev-summary">
        <div class="dev-summary-cell"><small>PROJECTS</small><strong>${data.projects.length}</strong><span>Development workspace</span></div>
        <div class="dev-summary-cell"><small>LOCAL BUILDS</small><strong>${m.history?.length||0}</strong><span>Recorded build attempts</span></div>
        <div class="dev-summary-cell"><small>BUILD QUEUE</small><strong>${(m.active?1:0)+(m.queue?.length||0)}</strong><span>${e(status)}</span></div>
        <div class="dev-summary-cell"><small>SKELLWORLD</small><strong>${this.launcher.registered?'LINKED':'LOCAL'}</strong><span>${this.launcher.registered?'Launch shortcut installed':'Independent desktop app'}</span></div>
      </div>
      <div class="dev-columns">
        <section class="panel panel-pad dev-builder-panel"><div class="dev-panel-head"><div><div class="eyebrow">BUILD SYSTEM / LOCAL ONLY</div><h2>Windows Builder</h2><p class="micro">CMake Release builds, 2 compile jobs, cancellable queue, CTest when configured.</p></div><span class="small-tag ${m.active?'warn':'ok'}">${e(status)}</span></div>
        ${native?`<div class="dev-actions"><button class="btn btn-primary" data-action="dev-build-all" ${!linked.length||m.active||m.queue?.length?'disabled':''}>Build all linked (${linked.length})</button><button class="btn btn-danger" data-action="dev-cancel" ${!m.active&&!m.queue?.length?'disabled':''}>Cancel queue</button></div>`:
          '<div class="instruction">Builder requires the Windows desktop application. Browser mode remains read-only.</div>'}
        <div class="dev-build-list">${buildRows}</div>
        <div class="dev-panel-head"><h3>Latest native build evidence</h3><span class="micro">Compile ≠ host validation</span></div>
        <div class="dev-history">${history}</div>
        <details class="dev-log"><summary>Live build output (${m.logs?.length||0} lines)</summary><pre id="devBuildLogs">${e((m.logs||[]).join('\n')||'No build output yet.')}</pre></details>
        </section>
        <div class="dev-side-stack">
          <section class="panel panel-pad"><div class="eyebrow">MISSION CONTROL</div><h2>Today's priorities</h2><p class="micro">Based on failed CI, blocked work, and priority. These are recommendations, not verified completions.</p><div class="dev-priorities">${this.priorityBrief()}</div><button class="btn btn-quiet" data-nav="workboard">Open workboard</button></section>
          <section class="panel panel-pad"><div class="eyebrow">OPT-IN / LOCAL BUILDS</div><h2>Build scheduling</h2><p class="micro">Runs only while Project Hub is open. Never auto-installs, publishes, or executes SW1 commands.</p>
            <label class="dev-label">Project<select id="devScheduleProject" ${!native?'disabled':''}>${options||'<option value="">Link a project folder first</option>'}</select></label>
            <label class="dev-label">Interval<select id="devScheduleInterval" ${!native?'disabled':''}>${[60,120,240].map(i=>`<option value="${i}" ${schedule.interval_minutes===i?'selected':''}>Every ${i} minutes</option>`).join('')}</select></label>
            <label class="dev-check"><input type="checkbox" id="devScheduleTests" ${schedule.with_tests?'checked':''}>Run CTest when configured</label>
            <div class="dev-actions"><button class="btn btn-primary" data-action="dev-schedule-enable" ${!native||!selected?'disabled':''}>${schedule.enabled?'Update schedule':'Enable schedule'}</button><button class="btn btn-quiet" data-action="dev-schedule-disable" ${!schedule.enabled?'disabled':''}>Disable</button></div>
            <p class="micro">${schedule.enabled?'Next build: '+e(new Date((schedule.next_due||0)*1000).toLocaleString()):'Scheduled compiling is off by default.'}</p>
          </section>
          <section class="panel panel-pad"><div class="eyebrow">SKELLWORLD / DEVELOPER MODE</div><h2>Launch integration</h2><p class="micro">Register a Windows per-user shortcut after confirming. SkellWorld opens this app via a normal operating-system URL prompt, not SW1.</p>
          <span class="small-tag ${this.launcher.registered?'ok':'warn'}">${this.launcher.registered?'Registered on this PC':'Not registered'}</span>
          <div class="dev-actions"><button class="btn btn-primary" data-action="dev-register" ${!native||!this.launcher.supported?'disabled':''}>Register launcher</button><button class="btn btn-quiet" data-action="dev-unregister" ${!this.launcher.registered?'disabled':''}>Unregister</button></div>
          <p class="micro">The app works on its own even when SkellWorld is offline. No other registry keys or application data are changed.</p></section>
        </div>
      </div>`;
  },
  async action(el){
    const act=el.dataset.action;
    if(act==='dev-refresh')return this.refresh();
    const api=window.pywebview?.api;
    if(!api||!this.isNative())return toast('Available in the Windows desktop application');
    try{
      let result;
      if(act==='dev-folder'){
        result=await api.builder_link_folder(el.dataset.pid);
        if(result?.ok){const p=pById(el.dataset.pid);if(p){p.localFolder=result.folder;logChange(p.id,'Builder folder selected','Native folder linked with explicit user approval');persist();}}
      }else if(act==='dev-build'||act==='dev-build-all'){
        const ids=act==='dev-build'?[el.dataset.pid]:data.projects.filter(p=>this.model.folders?.[p.id]).map(p=>p.id);
        if(!ids.length)return toast('Choose a local CMake folder first');
        if(!confirm(`Build ${ids.length} linked project(s) locally? CMake may execute build scripts in folders you selected. No install or release will run.`))return;
        result=await api.builder_start(ids,true);
      }else if(act==='dev-install'){
        if(!confirm(`Install the last verified VST3 bundle for ${pName(el.dataset.pid)} into a folder you select? Any existing bundle will be backed up for rollback.`))return;
        result=await api.builder_install(el.dataset.pid,true);
      }else if(act==='dev-rollback'){
        if(!confirm(`Restore the previous VST3 for ${pName(el.dataset.pid)}? The newer installed version will be retained as a backup.`))return;
        result=await api.builder_rollback(el.dataset.pid,true);
      }else if(act==='dev-cancel'){
        if(!confirm('Cancel the running build and clear the remaining queue?'))return;
        result=await api.builder_cancel();
      }else if(act==='dev-schedule-enable'){
        const id=document.getElementById('devScheduleProject')?.value;
        const minutes=Number(document.getElementById('devScheduleInterval')?.value);
        const tests=document.getElementById('devScheduleTests')?.checked;
        if(!confirm(`Allow Project Hub to compile ${pName(id)} every ${minutes} minutes WHILE OPEN? CMake build scripts run on your computer. No publishing or installation.`))return;
        result=await api.builder_schedule(id,minutes,Boolean(tests),true);
      }else if(act==='dev-schedule-disable')result=await api.builder_schedule('',120,true,false);
      else if(act==='dev-register'||act==='dev-unregister'){
        const enable=act==='dev-register';
        if(!confirm(enable?'Register this Project Hub executable as the SkellWorld Developer Mode launcher for your Windows user account?':'Remove this executable’s SkellWorld launcher registration?'))return;
        result=await api.launcher_manage(enable);
      }
      if(result)toast(result.ok?(result.warning||'Operation accepted'):(result.error||'Operation failed'));
      await this.refresh();
    }catch(error){toast('Native operation failed: '+error.message)}
  }
};
window.skellDevCenter=skellDevCenter;
document.addEventListener('click',event=>{
  const btn=event.target.closest('[data-action^="dev-"]');
  if(btn)skellDevCenter.action(btn);
  const project=event.target.closest('[data-dev-project]');
  if(project)setView('detail',project.dataset.devProject);
});
