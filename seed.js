/* Snapshot collected 2026-11-07 from the connected GitHub repository and Actions APIs.
   This is a starting point, not a live monitoring service. All manual QA checks start unchecked. */
const SEED_VERSION = '2026-11-07';
const CATEGORIES = ['UI', 'DSP / Engine', 'Packaging', 'Regression tests', 'Release readiness'];
const CHECKLIST_TEMPLATES = {
  'UI': ['Inspect default window size and layout', 'Test resizing, scaling and clipping', 'Test keyboard and mouse accessibility', 'Verify controls reflect saved state'],
  'DSP / Engine': ['Check core behavior against requirements', 'Measure CPU, memory and latency where relevant', 'Review edge cases and failure handling', 'Compare output against a reference or baseline'],
  'Packaging': ['Build cleanly from fresh checkout', 'Verify install or portable package structure', 'Check dependency and license notices', 'Smoke-test the distributed artifact'],
  'Regression tests': ['Run automated regression suite', 'Test primary workflow with real project files', 'Re-test previous crash or freeze reports', 'Record reproducible results and evidence'],
  'Release readiness': ['Confirm all release blockers are resolved', 'Verify documentation and version number', 'Test fresh install / rollback path', 'Publish signed-off release and assets']
};
const repo = slug => `https://github.com/skellyruno/${slug}`;
const run = (id, name) => `https://github.com/skellyruno/${name}/actions/runs/${id}`;
function project(id, title, kind, slug, task, milestone, risks, ci = {}, extra = {}) {
  return {
    id, title, kind, repoUrl: slug ? repo(slug) : '', releaseUrl: '',
    stage: extra.stage || 'In progress', priority: extra.priority || 'Normal',
    task, milestone, risks, taskSource: extra.taskSource || 'GitHub commit',
    updatedAt: extra.updatedAt || '', lastCommit: extra.lastCommit || '', commitUrl: extra.commitUrl || '',
    ci: {status:'unknown', label:'No current CI evidence', runUrl:'', checkedAt:'', runSha:'', ...ci},
    validation: {status:'untested', details:'Real-world installation, DAW/device use, and audio quality not verified in this tracker.'},
    checklists: Object.fromEntries(CATEGORIES.map(category => [category, CHECKLIST_TEMPLATES[category].map((label, i) => ({id:`${id}-${i}-${category.replace(/\W/g,'')}`, label, done:false, evidence:''}))])),
    notes: extra.notes || ''
  };
}
function initialData() {
  const projects = [
    project('motion','SkellyMotion','Desktop app','LYRICFORGE',
      'Fix Windows startup hang detection and Safe Mode recovery',
      'Confirm portable launch, FFmpeg packaging, export, and save/discard flows on a clean Windows machine',
      'Previously reported freezes and MP4 export failures; latest fix is not locally verified.',
      {status:'passed',label:'Windows CI build passed',runUrl:run('42359590805','LYRICFORGE'),checkedAt:'2026-11-07T09:24:15Z',runSha:'b7753792d8'},
      {priority:'High',updatedAt:'2026-11-07T09:24:12Z',lastCommit:'b7753792d8',commitUrl:repo('LYRICFORGE')+'/commit/b7753792d8fac1fce67c2eafaffc64f306d88bbe',notes:'Repository remains LYRICFORGE; app branding is SkellyMotion.'}),
    project('tune','SkellyTune mini','VST3 plugin','skelltune-mini',
      'Initial plugin source uploaded; follow-up tuning-engine merge remains unverified',
      'Integrate and benchmark candidate pitch trackers and phase-coherent reconstruction',
      'Low-register artifacts, original-pitch leakage, formant stability, and fixed latency are unresolved validation targets.',
      {status:'passed',label:'Windows VST3 CI build passed',runUrl:run('42290557727','skelltune-mini'),checkedAt:'2026-11-06T20:42:06Z',runSha:'d930617f4a'},
      {priority:'Critical',updatedAt:'2026-11-06T20:40:16Z',lastCommit:'d930617f4a',notes:'Existing skin/UI should be preserved during engine comparison.'}),
    project('deesser','Skelly DeEsser','VST3 plugin','skell-deesser-vst',
      'V8: phrase-aware sibilance detection and compact UI',
      'A/B phrase-aware mode on varied vocals; verify gain reduction, false triggers and DAW stability',
      'Phrase boundaries, transient sensitivity, UI scaling and host-close regressions require testing.',
      {status:'passed',label:'Skelly DeEsser CI build passed',runUrl:run('42292432726','skell-deesser-vst'),checkedAt:'2026-11-06T20:55:35Z',runSha:'14ca7d5ba2'},
      {priority:'High',updatedAt:'2026-11-06T20:55:32Z',lastCommit:'14ca7d5ba2'}),
    project('flp','FLP Modifier','Desktop tool',null,
      'Requested: direct FLP inspection and editing, staged purge queue, mixer view and AI prompt',
      'Connect the actual source repository, then reproduce drag/drop and performance issues',
      'Repository and build are not linked; FLP format compatibility and destructive edits need fixture tests.',
      {},{stage:'Needs audit',priority:'High',taskSource:'Project discussion (not repository-verified)'}),
    project('checkmate','Checkmate','VST3 plugin','skell-chess-vst',
      'Checkmate 2.0: Game Lab, custom samples, MIDI editor and UI',
      'Test PGN/game import, custom-piece audio and move-to-MIDI in host and standalone',
      'Import parsing, MIDI timing, plugin scan and real user project tests are unverified.',
      {status:'passed',label:'Windows VST3 + Standalone CI passed',runUrl:run('42294622641','skell-chess-vst'),checkedAt:'2026-11-06T21:11:13Z',runSha:'eed6f41704'},
      {priority:'High',updatedAt:'2026-11-06T21:11:09Z',lastCommit:'eed6f41704'}),
    project('eq','Skelly EQ','VST3 plugin','skell-eq-vst',
      'v2.2: compact interface polish and regression checks',
      'Validate UI at target dimensions, stability in FL Studio, and filter automation',
      'Past host open/close crash reports and display sizing issues need regression evidence.',
      {status:'passed',label:'Skelly EQ CI build passed',runUrl:run('42293823090','skell-eq-vst'),checkedAt:'2026-11-06T21:05:32Z',runSha:'222934275e'},
      {updatedAt:'2026-11-06T21:05:29Z',lastCommit:'222934275e'}),
    project('scratch','ScratchPad','VST3 plugin','skell-scratch-vst',
      'v1.9: DSP refinements, neon UI, presets and regression tests',
      'Measure freeze/reverse transitions and automatable stop across sample rates',
      'Rapid curve edits, DSP discontinuities, CPU spikes, and smaller UI need host testing.',
      {status:'passed',label:'Windows CI build passed',runUrl:run('42294007165','skell-scratch-vst'),checkedAt:'2026-11-06T21:06:51Z',runSha:'2067176acf'},
      {updatedAt:'2026-11-06T21:06:42Z',lastCommit:'2067176acf'}),
    project('stop','StopDial','VST3 plugin','skell-stop-vst',
      'Import StopDial v2.0 complete JUCE source (newer than latest observed CI run)',
      'Run CI on current commit and verify time-stop envelopes and automation in host',
      'Last passing workflow ran on another SHA; current HEAD build is not proven.',
      {status:'stale',label:'Older commit passed; latest commit untested by observed CI',runUrl:run('42293282021','skell-stop-vst'),checkedAt:'2026-11-06T21:01:45Z',runSha:'41e1bebab5'},
      {priority:'High',updatedAt:'2026-11-06T21:01:51Z',lastCommit:'53e1194b3a',commitUrl:repo('skell-stop-vst')+'/commit/53e1194b3a0bc55361f0afaac01bff324ede9df3'}),
    project('master','Skelly Master','VST3 plugin','skell-master-vst',
      'Enable Windows VST3 build and DSP tests on main',
      'Assess loudness, limiter behavior and sound quality on test masters',
      'Perceptual benchmarks, true peak, stability and real DAW use not yet documented.',
      {status:'passed',label:'Windows VST3 CI passed',runUrl:run('42291532484','skell-master-vst'),checkedAt:'2026-11-06T20:49:03Z',runSha:'ecd5e7777b'},
      {updatedAt:'2026-11-06T20:49:01Z',lastCommit:'ecd5e7777b'}),
    project('separator','Skell Separator','VST3 plugin','skell-separator-vst',
      'Source imported; no later recorded commit in inspected repository',
      'Choose licensed streaming model, set latency contract, benchmark real stems',
      'True neural separation accuracy, streaming inference latency, model licensing and CPU use remain unverified.',
      {status:'passed',label:'Older Windows VST3 CI build passed',runUrl:run('40485287873','skell-separator-vst'),checkedAt:'2026-10-27T10:01:42Z',runSha:'506ba2f2cb'},
      {priority:'High',updatedAt:'2026-10-27T10:00:56Z',lastCommit:'506ba2f2cb'}),
    project('spectre','SkellSpectre','VST3 plugin','skell-spectre-vst',
      'Source imported; CI build recorded',
      'Polish exciter control and characterize distortion / oversampling',
      'DSP quality, aliasing, gain staging and DAW session tests are not recorded.',
      {status:'passed',label:'Windows VST3 CI build passed',runUrl:run('40819888432','skell-spectre-vst'),checkedAt:'2026-10-29T04:49:27Z',runSha:'d355be9420'},
      {updatedAt:'2026-10-29T04:49:06Z',lastCommit:'d355be9420'}),
    project('fan','BreezeMod / Skell Fan','VST3 plugin','skell-fan-vst',
      'Source uploaded; most recently observed CI workflow failed',
      'Investigate failed Windows workflow before making additional DSP/UI claims',
      'Last observed CI run failed, and its run SHA does not match inspected latest main commit.',
      {status:'failed',label:'Latest observed Windows CI run failed (different ref)',runUrl:run('42292481977','skell-fan-vst'),checkedAt:'2026-11-06T20:55:58Z',runSha:'0949224eb9'},
      {stage:'Blocked',priority:'High',updatedAt:'2026-10-21T19:23:25Z',lastCommit:'d7241ea8c5'}),
    project('cleaner','FL Project Cleaner','Python tool','fl-studio-project-cleaner-',
      'No commits available in inspected repository',
      'Link or upload active cleaner code; test FLP asset lookup and move/copy rules',
      'Repository is empty; script state and regression test results are unknown.',
      {},{stage:'Needs audit',priority:'High',taskSource:'Repository inspection + project discussion',notes:'User workflow: Downloads and Downloads/beats may move; other external assets copy; protected libraries skipped.'}),
    project('adlib','Skell AdlibLab','VST3 plugin',null,
      'Project name and template selected; current source state unknown',
      'Connect repository and record initial successful build',
      'No confirmed repository, package or engine validation.',
      {},{stage:'Planning',taskSource:'Project discussion (not repository-verified)'}),
    project('choir','Skell Choir','VST3 plugin','skell-choir-vst','No current task verified','Inspect source and identify baseline features','Build, tests and current implementation not inspected.',{}, {stage:'Needs audit',taskSource:'Unknown'}),
    project('gate','Skell Gate','VST3 plugin','skell-gate-vst','No current task verified','Inspect source and baseline CI status','Build, tests and current implementation not inspected.',{}, {stage:'Needs audit',taskSource:'Unknown'}),
    project('delay','Skell Delay','VST3 plugin','skell-delay-vst','No current task verified','Inspect source and baseline CI status','Build, tests and current implementation not inspected.',{}, {stage:'Needs audit',taskSource:'Unknown'}),
    project('rack','Skell Rack','VST3 plugin','skell-rack-vst','No current task verified','Inspect source and baseline CI status','Build, tests and current implementation not inspected.',{}, {stage:'Needs audit',taskSource:'Unknown'}),
    project('key','Skell Key','VST3 plugin','skell-key-vst','No current task verified','Inspect source and baseline CI status','Build, tests and current implementation not inspected.',{}, {stage:'Needs audit',taskSource:'Unknown'}),
    project('maw','Skell Maw','VST3 plugin','skell-maw-vst','No current task verified','Inspect source and baseline CI status','Build, tests and current implementation not inspected.',{}, {stage:'Needs audit',taskSource:'Unknown'})
  ];
  const comparisons = [
    {id:'c-1',projectId:'tune',candidate:'MetaTune engine/reference',source:'Existing reference/repository discussion',strengths:'Proposed baseline for keeping the existing tuner UI',gaps:'Pitch tracking, synthesis and real-time behavior not measured here',evidence:'No reproducible benchmark attached',result:'Not tested',fileName:''},
    {id:'c-2',projectId:'tune',candidate:'NoteForge',source:'skellyruno/NoteForge',strengths:'Candidate engine for low-latency comparison',gaps:'Measured latency and reconstruction quality not validated in this tracker',evidence:'No controlled A/B attached',result:'Not tested',fileName:''},
    {id:'c-3',projectId:'separator',candidate:'Ultimate Vocal Remover reference',source:'Prior uploaded ZIP reference (not retained here)',strengths:'Reference implementation to investigate',gaps:'Streaming license compatibility, fixed latency and CPU cost unknown',evidence:'Source contents not inspected within this site',result:'Not tested',fileName:''},
    {id:'c-4',projectId:'cleaner',candidate:'Fast zipper vs cleaner',source:'Reported behavior in project discussion',strengths:'Zipper reportedly located more FLP audio references',gaps:'Parser parity and speed difference not benchmarked',evidence:'User-reported; no fixture results attached',result:'Reported only',fileName:''}
  ];
  const changes = projects.filter(p => p.lastCommit).map(p=>({
    id:'initial-'+p.id, projectId:p.id, at:p.updatedAt||'2026-11-07T00:00:00Z', kind:'GitHub snapshot',
    message:p.task, evidence:p.commitUrl||p.ci.runUrl||'', system:true
  }));
  return {schema:1, seedVersion:SEED_VERSION, projects, comparisons, changes,
    settings:{title:'SKELLY // CONTROL', owner:'Skelly', lastLocalEdit:null}};
}
