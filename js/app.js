// Tabula — Actuarial Study App
// Main application logic
function defaultPlan(){
  const now=new Date();
  const dow=now.getDay(); // 0=Sun
  const monday=new Date(now);
  monday.setDate(now.getDate()-((dow+6)%7));
  const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const defaultChips=[
    [{label:'CB1 · Flashcards',color:'#6B5DD3',modId:'CB1',type:'flashcards'}],
    [{label:'CM1A · Flashcards',color:'#3D6FD1',modId:'CM1A',type:'flashcards'},{label:'CS1A · Written',color:'#2E9C8E',modId:'CS1A',type:'practice'}],
    [{label:'CS1A · Written',color:'#2E9C8E',modId:'CS1A',type:'practice'}],
    [{label:'CM1B · Written',color:'#3D6FD1',modId:'CM1B',type:'practice'}],
    [{label:'CM1A · Flashcards',color:'#3D6FD1',modId:'CM1A',type:'flashcards'},{label:'CS1A · Written',color:'#2E9C8E',modId:'CS1A',type:'practice'},{label:'CB1 · Written',color:'#6B5DD3',modId:'CB1',type:'practice'}],
    [{label:'Review',color:'#7B8595',modId:null,type:null}],
    [],
  ];
  return days.map((day,i)=>{
    const d=new Date(monday);
    d.setDate(monday.getDate()+i);
    return {day,date:String(d.getDate()),chips:defaultChips[i]};
  });
}

function shuffle(arr){
  const a=arr.slice();
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

// State
let state = {
  view:'home',
  variant:1,
  module:'ALL',
  fcIndex:0, fcFlipped:false, fcDeck:[], fcWeakQueue:[], fcReviewRound:false, fcTotalReviewed:0,
  paIndex:0, paText:'', paStatus:'idle', paVerdict:null, paScore:0, paDeck:[], paWeakQueue:[], paReviewRound:false, paStartTime:null, aiMarking:false, paAIFeedback:'',
  taskDone:[true,false,false],
  rStatus:'idle', rIndex:0, rCode:null, rRan:false, rRunning:false, rOutput:[], rImages:[], rEnv:[], showHint:false, showModel:false,
  aiRQuestions:[], aiGenerating:false, aiGenError:'', showKeyModal:false,
  paQStartTime:null, paQDuration:0, paPreview:false,
  selected:null,
  planEdit:false, planData:null, examDate:'2026-09-22', dailyGoal:45,
  addingTo:null, addMod:'CM1A', addType:'Flashcards', chipDone:{},
  expandedTopics:{},
  expandedCourses:{CM1:true, CS1:true, CB1:true},
  planWeekOffset:0,
  drillSub: null,
  examMode:false, examModeEnd:null,
};

// Pool (checked subtopic ids)
function loadPool(){
  try{
    const s=localStorage.getItem('tabula_pool_v1');
    if(s)return JSON.parse(s);
  }catch(e){}
  // Default: all checked
  const p={};
  SYLLABUS.forEach(c=>c.topics.forEach(t=>t.subs.forEach(s=>{ p[s.id]=true; })));
  return p;
}
let pool=loadPool();
function savePool(){localStorage.setItem('tabula_pool_v1',JSON.stringify(pool));}

// Mastery: {subId: {seen:N, good:N}} — updated when flashcards are rated
function loadMastery(){
  try{const s=localStorage.getItem('tabula_mastery_v1');if(s)return JSON.parse(s);}catch(e){}
  return {};
}
let mastery=loadMastery();
function saveMastery(){localStorage.setItem('tabula_mastery_v1',JSON.stringify(mastery));}
function recordCardRating(subId, rating){
  if(!mastery[subId])mastery[subId]={seen:0,good:0,lastSeen:'',interval:1,easeFactor:2.5,nextReview:''};
  const m=mastery[subId];
  // Ensure SM-2 fields exist for records created before this update
  if(!m.interval)m.interval=1;
  if(!m.easeFactor)m.easeFactor=2.5;
  m.seen++;
  if(rating==='good'||rating==='easy'||rating==='Good'||rating==='Easy')m.good++;
  m.lastSeen=new Date().toDateString();
  // SM-2 interval update
  const r=rating.toLowerCase();
  if(r==='again'){
    m.interval=1;
    m.easeFactor=Math.max(1.3,m.easeFactor-0.2);
  }else if(r==='hard'){
    m.interval=Math.max(1,Math.round(m.interval*1.2));
    m.easeFactor=Math.max(1.3,m.easeFactor-0.15);
  }else if(r==='good'){
    m.interval=Math.round(m.interval*m.easeFactor);
  }else if(r==='easy'){
    m.interval=Math.round(m.interval*m.easeFactor*1.3);
    m.easeFactor=Math.min(2.5,m.easeFactor+0.1);
  }
  const nxt=new Date();nxt.setDate(nxt.getDate()+m.interval);
  m.nextReview=nxt.toDateString();
  saveMastery();
  // Track streak and today's card count
  const today=new Date().toDateString();
  if(studyStats.todayDate!==today){
    const yest=new Date();yest.setDate(yest.getDate()-1);
    if(studyStats.lastStudyDate===yest.toDateString()) studyStats.streak++;
    else if(studyStats.lastStudyDate!==today) studyStats.streak=1;
    studyStats.todayCards=0;
    studyStats.todayDate=today;
  }
  studyStats.todayCards++;
  studyStats.lastStudyDate=today;
  // QW-9: goal reached toast (once per day)
  if(studyStats.todayCards===state.dailyGoal&&studyStats.goalToastDate!==today){
    studyStats.goalToastDate=today;
    showToast('Goal reached! 🎉');
  }
  // Per-day weekly tracking for activity chart
  const mon=new Date();mon.setDate(mon.getDate()-((mon.getDay()+6)%7));mon.setHours(0,0,0,0);
  const wk=mon.toDateString();
  if(studyStats.weekStart!==wk){studyStats.weekStart=wk;studyStats.weekCards=[0,0,0,0,0,0,0];}
  const di=(new Date().getDay()+6)%7;
  studyStats.weekCards[di]=(studyStats.weekCards[di]||0)+1;
  saveStudyStats();
}

// Study statistics (streak, daily card count, written questions answered)
function loadStudyStats(){
  try{const s=localStorage.getItem('tabula_stats_v1');if(s){const d=JSON.parse(s);if(!d.weekCards)d.weekCards=[0,0,0,0,0,0,0];if(!d.weekStart)d.weekStart='';if(!d.goalToastDate)d.goalToastDate='';return d;}}catch(e){}
  return {streak:0,lastStudyDate:'',todayCards:0,todayDate:'',writtenAnswered:0,weekCards:[0,0,0,0,0,0,0],weekStart:'',goalToastDate:''};
}
function saveStudyStats(){localStorage.setItem('tabula_stats_v1',JSON.stringify(studyStats));}
let studyStats=loadStudyStats();

function showToast(msg){
  const t=document.createElement('div');
  t.textContent=msg;
  t.style.cssText='position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:#1B2330;color:#fff;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.25);opacity:1;transition:opacity .4s';
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),400);},2500);
}

// Written question history — keyed by a stable hash of the question stem
function _qHash(q){
  const s=(q.stem||q.prompt||'').slice(0,80)+(q.sub||'');
  let h=0;for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;}
  return (q.sub||'q')+'_'+Math.abs(h).toString(36);
}
function loadWrittenHistory(){
  try{const s=localStorage.getItem('tabula_written_v1');if(s)return JSON.parse(s);}catch(e){}
  return {};
}
function saveWrittenHistory(){localStorage.setItem('tabula_written_v1',JSON.stringify(writtenHistory));}
let writtenHistory=loadWrittenHistory();

// Compute overall mastery across all subtopics (unseen subtopics count as 0%)
function computeOverallMastery(){
  const allSubs=[];
  SYLLABUS.forEach(c=>c.topics.forEach(t=>t.subs.forEach(s=>allSubs.push(s.id))));
  if(!allSubs.length) return 0;
  return Math.round(allSubs.reduce((a,id)=>a+subMastery(id),0)/allSubs.length);
}

// Compute mastery for a module from card rating history (unseen subtopics count as 0%)
function moduleCardMastery(modId){
  const subs=[...new Set(CARDS.filter(c=>c.module===modId).map(c=>c.sub))];
  if(!subs.length) return 0;
  return Math.round(subs.reduce((a,id)=>a+subMastery(id),0)/subs.length);
}

// Count cards available for a module (in pool)
function moduleCardsDue(modId){
  return CARDS.filter(c=>c.module===modId&&pool[c.sub]).length;
}

function loadPlan(){
  try{
    const s=localStorage.getItem('tabula_plan_v1');
    if(s){
      const plan=JSON.parse(s);
      // Refresh date numbers to match the current week so saved plans don't show stale dates
      const now=new Date();
      const monday=new Date(now);
      monday.setDate(now.getDate()-((now.getDay()+6)%7));
      plan.forEach((day,i)=>{
        const d=new Date(monday);
        d.setDate(monday.getDate()+i);
        day.date=String(d.getDate());
      });
      return plan;
    }
  }catch(e){}
  return defaultPlan();
}
function savePlan(p){localStorage.setItem('tabula_plan_v1',JSON.stringify(p));}
function loadChipDone(){try{const s=localStorage.getItem('tabula_chipdone_v1');if(s)return JSON.parse(s);}catch(e){}return {};}
function saveChipDone(){localStorage.setItem('tabula_chipdone_v1',JSON.stringify(state.chipDone));}

function loadExamDate(){
  try{
    const s=localStorage.getItem('tabula_examdate_v1');
    if(s)return JSON.parse(s);
  }catch(e){}
  return {examDate:'2026-09-22',dailyGoal:45};
}
function saveExamDate(){localStorage.setItem('tabula_examdate_v1',JSON.stringify({examDate:state.examDate,dailyGoal:state.dailyGoal}));}

// Init
(function init(){
  const ed=loadExamDate();
  state.examDate=ed.examDate;
  state.dailyGoal=ed.dailyGoal;
  state.planData=loadPlan();
  state.chipDone=loadChipDone();
  // One-time migration: copy any CS1B mastery stored under old bare IDs to cs1b-* IDs
  const cs1bOldToNew={
    'data-aims':'cs1b-data-aims','data-explore':'cs1b-data-explore','data-corr':'cs1b-data-corr','data-pca':'cs1b-data-pca',
    'rv-dist':'cs1b-rv-dist','rv-joint':'cs1b-rv-joint','rv-condexp':'cs1b-rv-condexp','rv-gf':'cs1b-rv-gf','rv-clt':'cs1b-rv-clt','rv-sampling':'cs1b-rv-sampling',
    'inf-est':'cs1b-inf-est','inf-ci':'cs1b-inf-ci','inf-test':'cs1b-inf-test',
    'reg-lm':'cs1b-reg-lm','reg-diag':'cs1b-reg-diag','reg-glm':'cs1b-reg-glm','reg-glmfit':'cs1b-cs1b-reg-glmfit',
    'bayes-conj':'cs1b-bayes-conj','bayes-ci':'cs1b-bayes-ci','bayes-cred':'cs1b-bayes-cred',
  };
  let migrated=false;
  Object.entries(cs1bOldToNew).forEach(([oldId,newId])=>{
    if(mastery[oldId]&&!mastery[newId]){mastery[newId]={...mastery[oldId]};delete mastery[oldId];migrated=true;}
  });
  if(migrated)saveMastery();
})();

function daysToExam(){
  const today=new Date();
  const ex=new Date(state.examDate);
  const diff=Math.round((ex-today)/(1000*60*60*24));
  return Math.max(0,diff);
}

function buildDecks(){
  let cards=CARDS;
  if(state.drillSub){cards=cards.filter(c=>c.sub===state.drillSub);state.drillSub=null;}
  else if(state.module==='CS1B') cards=cards.filter(c=>c.module==='CS1A'||c.module==='CS1B');
  else if(state.module!=='ALL') cards=cards.filter(c=>c.module===state.module);
  cards=cards.filter(c=>pool[c.sub]);
  state.fcDeck=shuffle(cards);
  // SM-2 ordering: cards due today (nextReview ≤ today) come first, sorted most-overdue first;
  // cards not yet due follow, sorted by soonest upcoming review date.
  const todaySM=new Date();todaySM.setHours(0,0,0,0);
  state.fcDeck.sort((a,b)=>{
    const am=mastery[a.sub];const bm=mastery[b.sub];
    const aNxt=am?.nextReview?new Date(am.nextReview):new Date(0);
    const bNxt=bm?.nextReview?new Date(bm.nextReview):new Date(0);
    const aDue=!am?.nextReview||aNxt<=todaySM;
    const bDue=!bm?.nextReview||bNxt<=todaySM;
    if(aDue&&!bDue)return -1;
    if(!aDue&&bDue)return 1;
    return aNxt-bNxt; // most overdue first when both due; soonest next when neither due
  });

  let qs=QUESTIONS;
  if(state.module==='CS1B') qs=qs.filter(q=>q.module==='CS1A'||q.module==='CS1B');
  else if(state.module!=='ALL') qs=qs.filter(q=>q.module===state.module);
  qs=qs.filter(q=>pool[q.sub]);
  state.paDeck=shuffle(qs);
}

function filteredCards(){
  if(!state.fcDeck||state.fcDeck.length===0) buildDecks();
  return state.fcDeck;
}

function filteredQuestions(){
  if(!state.paDeck||state.paDeck.length===0) buildDecks();
  return state.paDeck;
}

function filteredRQ(){
  const cs1bInPool=SYLLABUS.some(c=>c.code==='CS1B'&&c.topics.some(t=>t.subs.some(s=>pool[s.id])));
  return [...state.aiRQuestions,...(cs1bInPool?R_QUESTIONS:[])];
}

// WebR
let webR=null;
let webRLoading=false;
let webRReady=false;
let webRShelter=null;

async function initWebR(){
  if(webRReady||webRLoading)return;
  webRLoading=true;
  state.rStatus='loading';
  render();
  try{
    const {WebR}=await import('https://webr.r-wasm.org/latest/webr.mjs');
    webR=new WebR();
    await webR.init();
    webRShelter=await new webR.Shelter();
    webRReady=true;
    state.rStatus='ready';
    // QW-6: pre-load MASS and survival silently
    try{await webR.evalR('suppressMessages(library(MASS))');}catch(e){console.log('MASS preload skipped:',e);}
    try{await webR.evalR('suppressMessages(library(survival))');}catch(e){console.log('survival preload skipped:',e);}
  }catch(e){
    state.rStatus='error';
    console.error('WebR failed',e);
  }
  webRLoading=false;
  render();
}

// Highlight R syntax
function highlightR(code){
  if(!code)return '';
  const keywords=['if','else','for','while','function','return','TRUE','FALSE','NULL','NA','Inf','NaN','in','repeat','break','next'];
  const fns=['c','sum','mean','sd','var','lm','glm','summary','coef','print','cat','paste','paste0','data.frame','factor','log','exp','sqrt','abs','round','length','nrow','ncol','head','tail','plot','hist','data','library','require','cbind','rbind','seq','rep','which','max','min','range','table','as.numeric','as.character','as.factor','rnorm','rpois','dnorm','pnorm','qnorm','dbinom','pbinom','t.test','cor','predict','residuals','fitted'];
  let h=code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // strings
  h=h.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g,m=>`<span style="color:#A6E3A1">${m}</span>`);
  // comments
  h=h.replace(/(#[^\n]*)/g,m=>`<span style="color:#6C7086">${m}</span>`);
  // numbers
  h=h.replace(/\b(\d+\.?\d*)\b/g,m=>`<span style="color:#FAB387">${m}</span>`);
  // keywords
  keywords.forEach(kw=>{
    h=h.replace(new RegExp(`\\b(${kw})\\b`,'g'),`<span style="color:#CBA6F7">$1</span>`);
  });
  // functions
  fns.forEach(fn=>{
    h=h.replace(new RegExp(`\\b(${fn})(?=\\s*\\()`,'g'),`<span style="color:#89DCEB">$1</span>`);
  });
  return h;
}

// ========================
// RENDER
// ========================
let paTimerInterval=null;
function startPATimer(){if(!state.paStartTime){state.paStartTime=Date.now();}if(!paTimerInterval){paTimerInterval=setInterval(()=>{if(state.view==='practice'&&state.paStatus==='idle'){if(state.module!=='CS1B')render();}else{clearInterval(paTimerInterval);paTimerInterval=null;}},1000);}}
function stopPATimer(){clearInterval(paTimerInterval);paTimerInterval=null;state.paStartTime=null;}
function fmtElapsed(ms){const s=Math.floor(ms/1000);const m=Math.floor(s/60);return m>0?`${m}m ${s%60}s`:`${s}s`;}
function render(){
  const app=document.getElementById('app');
  if(!app)return;
  app.innerHTML=`
    ${renderSidebar()}
    <div class="main">
      ${renderTopbar()}
      <div class="page-content">
        ${renderView()}
      </div>
    </div>
    ${renderMobileNav()}
    ${state.addingTo!==null?renderAddModal():''}
    ${state.showKeyModal?renderAIKeyModal():''}
  `;
  // Restore textarea values (practice)
  if(state.view==='practice'&&state.paStatus!=='complete'){
    const ta=document.getElementById('pa-answer');
    if(ta){
      ta.value=state.paText;
      ta.addEventListener('input',function(){state.paText=this.value;});
    }
  }
  // Restore R code editor
  if(state.view==='practice'&&state.module==='CS1B'){
    const rta=document.getElementById('r-code-ta');
    if(rta){
      const rq=filteredRQ();
      if(rq.length>0){
        const idx=Math.min(state.rIndex,rq.length-1);
        const rqItem=rq[idx];
        const defaultCode=(rqItem.setup?rqItem.setup+'\n':'')+rqItem.starter;
        rta.value=state.rCode!==null?state.rCode:defaultCode;
        function updateEditor(){
          const pre=document.getElementById('r-code-pre');
          if(pre)pre.innerHTML=highlightR(rta.value);
          updateLineNums(rta.value);
          syncScroll();
        }
        rta.addEventListener('input',function(){
          state.rCode=this.value;
          updateEditor();
        });
        rta.addEventListener('keydown',function(e){
          if(e.key==='Tab'){e.preventDefault();const s=this.selectionStart,en=this.selectionEnd;this.value=this.value.slice(0,s)+'  '+this.value.slice(en);this.selectionStart=this.selectionEnd=s+2;state.rCode=this.value;updateEditor();}
        });
        updateEditor();
      }
    }
  }
  // Typeset any LaTeX in newly rendered content
  if(window.MathJax&&MathJax.typesetPromise){
    MathJax.typesetPromise().catch(()=>{});
  }
  // Set indeterminate state on topic checkboxes (partial selection)
  if(state.view==='progress'){
    SYLLABUS.forEach(course=>course.topics.forEach(topic=>{
      const el=document.getElementById('tc-'+topic.id);
      if(el){
        const pooled=topic.subs.filter(s=>pool[s.id]).length;
        el.indeterminate=(pooled>0&&pooled<topic.subs.length);
      }
    }));
  }
}

function syncScroll(){
  const ta=document.getElementById('r-code-ta');
  const pre=document.getElementById('r-code-pre');
  if(ta&&pre){pre.scrollTop=ta.scrollTop;pre.scrollLeft=ta.scrollLeft;}
}
function updateLineNums(code){
  const gutter=document.getElementById('rs-gutter');
  if(!gutter)return;
  const lines=(code||'').split('\n').length;
  gutter.innerHTML=Array.from({length:lines},(_,i)=>`<span class="rs-gutter-num">${i+1}</span>`).join('');
}

const NAV_VIEWS=[
  {id:'home',label:'Dashboard',icon:`<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="6" height="6" rx="1.6" fill="currentColor"/><rect x="11" y="3" width="6" height="6" rx="1.6" fill="currentColor" opacity=".4"/><rect x="3" y="11" width="6" height="6" rx="1.6" fill="currentColor" opacity=".4"/><rect x="11" y="11" width="6" height="6" rx="1.6" fill="currentColor"/></svg>`},
  {id:'planner',label:'Planner',icon:`<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="3" y="4.5" width="14" height="12.5" rx="2.4" stroke="currentColor" stroke-width="1.7"/><path d="M3 8h14M7 3v3M13 3v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`},
  {id:'flashcards',label:'Flashcards',icon:`<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="5" y="5.5" width="12" height="9" rx="2.2" stroke="currentColor" stroke-width="1.7"/><path d="M3.4 8v6a2 2 0 0 0 2 2h7.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".45"/></svg>`},
  {id:'practice',label:'Practice',icon:`<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M5.5 3.5h9a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 15V5a1.5 1.5 0 0 1 1.5-1.5Z" stroke="currentColor" stroke-width="1.7"/><path d="M7 8h6M7 11h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`},
  {id:'progress',label:'Progress',icon:`<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M4 16V9M10 16V4M16 16v-4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`},
];

function renderMobileNav(){
  const now=new Date();now.setHours(0,0,0,0);
  const badge=CARDS.filter(c=>pool[c.sub]).filter(c=>{const m=mastery[c.sub];return !m?.nextReview||new Date(m.nextReview)<=now;}).length;
  return `<nav class="mobile-nav">
    ${NAV_VIEWS.map(v=>`<div class="mobile-nav-item${state.view===v.id?' active':''}" onclick="go('${v.id}')">
      <div style="position:relative;display:flex;align-items:center;justify-content:center">
        ${v.icon}
        ${v.id==='flashcards'&&badge>0?`<span class="mobile-nav-badge">${badge}</span>`:''}
      </div>
      <span>${v.id==='home'?'Home':v.id==='flashcards'?'Cards':v.label}</span>
    </div>`).join('')}
  </nav>`;
}

function renderSidebar(){
  const views=NAV_VIEWS;
  const d=daysToExam();
  // QW-3: count SM-2 due cards for badge
  const _sidebarNow=new Date();_sidebarNow.setHours(0,0,0,0);
  const _fcDueBadge=CARDS.filter(c=>pool[c.sub]).filter(c=>{const m=mastery[c.sub];return !m?.nextReview||new Date(m.nextReview)<=_sidebarNow;}).length;
  return `<div class="sidebar">
    <div class="sidebar-logo">
      <div class="logo-mark"><svg width="18" height="18" viewBox="0 0 20 20"><rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5" opacity=".6"/><rect x="3" y="11" width="6" height="6" rx="1.5" opacity=".6"/><rect x="11" y="11" width="6" height="6" rx="1.5" opacity=".3"/></svg></div>
      <div><div class="sidebar-logo-text">Tabula</div><div class="sidebar-logo-sub">IFoA Study Companion</div></div>
    </div>
    <div class="sidebar-section">Study</div>
    ${views.map(v=>`<div class="nav-item${state.view===v.id?' active':''}" onclick="go('${v.id}')" style="display:flex;align-items:center">
      <span class="nav-icon">${v.icon}</span>${v.label}${v.id==='flashcards'&&_fcDueBadge>0?`<span style="margin-left:auto;background:#C94040;color:#fff;font-size:9.5px;font-weight:700;padding:1px 6px;border-radius:10px;min-width:18px;text-align:center;line-height:1.5">${_fcDueBadge}</span>`:''}
    </div>`).join('')}
    <div class="sidebar-bottom">
      <div class="exam-card mb-12">
        <div class="exam-card-label">Exam countdown</div>
        <div class="exam-card-days">${d} <span style="font-size:14px;font-weight:500;color:#8A93A2">days</span></div>
        <div class="exam-card-sub">${formatExamDate(state.examDate)}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="exportData()" style="flex:1;padding:7px 6px;border-radius:8px;border:1px solid #E8EBF0;background:#fff;font-size:11.5px;font-weight:600;color:#8A93A2;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;transition:all .15s" onmouseover="this.style.background='#F5F6F8';this.style.color='#1B2330'" onmouseout="this.style.background='#fff';this.style.color='#8A93A2'" title="Download a backup of all your progress">⬇ Backup</button>
        <button onclick="triggerImport()" style="flex:1;padding:7px 6px;border-radius:8px;border:1px solid #E8EBF0;background:#fff;font-size:11.5px;font-weight:600;color:#8A93A2;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;transition:all .15s" onmouseover="this.style.background='#F5F6F8';this.style.color='#1B2330'" onmouseout="this.style.background='#fff';this.style.color='#8A93A2'" title="Restore progress from a backup file">⬆ Restore</button>
      </div>
    </div>
  </div>`;
}

function formatExamDate(d){
  if(!d)return '';
  const dt=new Date(d);
  return dt.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
}

function renderTopbar(){
  const titles={home:'Dashboard',planner:'Weekly Planner',flashcards:'Flashcards',practice:'Practice',progress:'Progress'};
  const subs={home:'Good luck today — keep going!',planner:'Plan your study week',flashcards:'Spaced repetition review',practice:'Written & coding questions',progress:'Track notes coverage · controls your study pool'};
  return `<div class="topbar">
    <div>
      <div class="topbar-title">${titles[state.view]||''}</div>
      <div class="topbar-sub">${subs[state.view]||''}</div>
    </div>
    <div class="topbar-right" style="gap:12px">
      ${state.view==='practice'?`<button class="btn btn-sm ${state.examMode?'btn-primary':'btn-ghost'}" onclick="toggleExamMode()" title="Timed exam mode (IFoA time limits)">${state.examMode?'⏱ End exam':'⏱ Exam mode'}</button>`:''}
      ${state.view==='flashcards'||state.view==='practice'?renderModulePills():''}
    </div>
  </div>`;
}

function renderModulePills(){
  const pills=['ALL',...MODULES.map(m=>m.id)];
  return `<div style="display:flex;gap:6px;flex-wrap:wrap">
    ${pills.map(p=>{
      const mod=MODULES.find(m=>m.id===p);
      const color=mod?mod.color:'#8A93A2';
      const label=p==='ALL'?'All':p;
      const active=state.module===p;
      return `<div class="pill${active?' pill-active':''}" style="color:${color};background:${active?color+'18':'transparent'}" onclick="setModule('${p}')">${label}</div>`;
    }).join('')}
  </div>`;
}

function renderView(){
  switch(state.view){
    case 'home': return renderHome();
    case 'planner': return renderPlanner();
    case 'flashcards': return renderFlashcards();
    case 'practice': return renderPractice();
    case 'progress': return renderProgress();
    default: return renderHome();
  }
}

// ========================
// HOME
// ========================
function renderHome(){
  const todayDi=(new Date().getDay()+6)%7;
  const wc=studyStats.weekCards||[0,0,0,0,0,0,0];
  const maxCards=Math.max(...wc,1);
  const barData=[
    {d:'M',cards:wc[0],today:todayDi===0},{d:'T',cards:wc[1],today:todayDi===1},{d:'W',cards:wc[2],today:todayDi===2},
    {d:'T',cards:wc[3],today:todayDi===3},{d:'F',cards:wc[4],today:todayDi===4},{d:'S',cards:wc[5],today:todayDi===5},{d:'S',cards:wc[6],today:todayDi===6}
  ];
  const dueCount=CARDS.filter(c=>pool[c.sub]).length;
  const overallMastPct=computeOverallMastery();
  const totalReviewed=Object.values(mastery).reduce((a,v)=>a+v.seen,0);

  return `
  ${renderOverdueAlerts()}
  <div class="grid-4 mb-16" style="grid-template-columns:repeat(4,1fr)">
    ${statCard(dueCount,'Cards in pool','Across all modules')}
    ${statCard(overallMastPct+'%','Overall mastery','Based on card ratings')}
    ${statCard(studyStats.streak,'Day streak','Keep it up!')}
    ${statCard(daysToExam()+'d','To exam',formatExamDate(state.examDate))}
  </div>
  <div class="kb-hint" style="text-align:right;margin-top:-8px;margin-bottom:12px"><span class="kb-key">S</span> Start studying</div>
  ${renderDangerZone()}

  <div class="grid-2 mb-24">
    <div class="card">
      <div class="flex items-center justify-between mb-16">
        <div style="font-size:14px;font-weight:600">Study activity</div>
        <div class="text-sm text-secondary">This week</div>
      </div>
      <div class="bar-chart-wrap">
        ${barData.map(b=>{
          const h=b.cards?Math.max(4,Math.round((b.cards/maxCards)*130)):3;
          const cls=b.today?'bar-fill today-bar':(b.cards>0?'bar-fill':'bar-fill light-bar');
          return `<div class="bar-col">
            <div class="${cls}" style="height:${h}px;width:100%;opacity:${b.cards>0||b.today?1:0.25}"></div>
            <div class="bar-label">${b.d}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:12px">
        <div class="text-xs text-secondary">Daily goal:</div>
        <div style="flex:1;height:5px;background:#F0F2F6;border-radius:3px;overflow:hidden"><div style="height:100%;width:${state.dailyGoal>0?Math.min(100,Math.round(studyStats.todayCards/state.dailyGoal*100)):0}%;background:#3D6FD1;border-radius:3px"></div></div>
        <div class="text-xs text-secondary">${studyStats.todayCards} / ${state.dailyGoal} cards</div>
      </div>
    </div>

    <div class="card">
      <div class="flex items-center justify-between mb-16">
        <div style="font-size:14px;font-weight:600">Module mastery</div>
      </div>
      ${MODULES.map(m=>{
        const circ=163.4;
        const mast=moduleCardMastery(m.id);
        const due=moduleCardsDue(m.id);
        const fill=due>0?Math.round(mast/100*circ*10)/10:0;
        const ringColor=due>0?m.color:'#D0D5DE';
        const nameColor=due>0?'#1B2330':'#8A93A2';
        return `<div class="flex items-center gap-8 mb-12" style="cursor:pointer" onclick="go('progress')">
          <svg width="32" height="32" viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="26" class="ring-bg"/>
            <circle cx="30" cy="30" r="26" class="ring-fill progress-ring" stroke="${ringColor}" stroke-dasharray="${fill} ${circ-fill}"/>
          </svg>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:${nameColor}">${m.name}</div>
            <div style="font-size:11.5px;color:#8A93A2">${due>0?mast+'% mastery · '+due+' in pool':'not in pool'}</div>
          </div>
          ${due>0?`<span class="due-badge">${due}</span>`:''}
        </div>`;
      }).join('')}
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="flex items-center justify-between mb-16">
        <div style="font-size:14px;font-weight:600">Today's plan</div>
        <button class="btn btn-ghost btn-sm" onclick="go('planner')">View planner</button>
      </div>
      ${(()=>{const ti=(new Date().getDay()+6)%7;const todayChips=state.planData&&state.planData[ti]&&state.planData[ti].chips||[];return todayChips.map((chip,i)=>`
        <div class="flex items-center gap-10 mb-8">
          <input type="checkbox" ${state.chipDone[ti+'-'+i]?'checked':''} onchange="toggleChip(${ti},${i},this.checked)">
          <div class="plan-chip" style="background:${chip.color};flex:1">
            <span class="plan-chip-label">${chip.label}</span>
          </div>
          ${chip.modId?`<button class="btn btn-primary btn-sm" onclick="startFromChip('${chip.modId}','${chip.type||''}')">Start</button>`:''}
        </div>
      `).join('')+(todayChips.length===0?'<div class="text-sm text-secondary">No tasks for today.</div>':'');})()}
    </div>

    <div class="card">
      <div class="flex items-center justify-between mb-16">
        <div style="font-size:14px;font-weight:600">Study streak</div>
        <div style="font-size:20px;font-weight:700;color:#E2922E">🔥 ${studyStats.streak}</div>
      </div>
      <div class="streak-dots mb-12">
        ${Array.from({length:Math.max(studyStats.streak,7)},(_,i)=>`<div class="streak-dot" style="background:${i<studyStats.streak?'#E2922E':'#E8EBF0'}"></div>`).join('')}
      </div>
      <div class="text-xs text-secondary">${studyStats.streak} day${studyStats.streak!==1?'s':''} in a row</div>
      <div style="margin-top:20px">
        <div class="flex items-center justify-between mb-8">
          <div style="font-size:13px;font-weight:600">Total cards reviewed</div>
          <div style="font-size:13px;font-weight:700">${totalReviewed}</div>
        </div>
        <div class="flex items-center justify-between mb-8">
          <div style="font-size:13px;font-weight:600">Written Qs answered</div>
          <div style="font-size:13px;font-weight:700">${studyStats.writtenAnswered||0}</div>
        </div>
        <div class="flex items-center justify-between">
          <div style="font-size:13px;font-weight:600">Cards today</div>
          <div style="font-size:13px;font-weight:700">${studyStats.todayCards}</div>
        </div>
      </div>
    </div>
  </div>`;
}

function statCard(value,label,sub){
  return `<div class="stat-card">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
    <div class="stat-sub">${sub}</div>
  </div>`;
}

// ========================
// PLANNER
// ========================
function renderPlanner(){
  const offset = state.planWeekOffset || 0;
  const plan = loadPlanForWeek(offset);
  state.planData = plan;
  const todayIdx = (new Date().getDay()+6)%7;
  const isCurrentWeek = offset === 0;

  // Week label
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay()+6)%7) + offset*7);
  const sunday = new Date(monday); sunday.setDate(monday.getDate()+6);
  const weekLabel = monday.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) + ' – ' + sunday.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});

  return `
  <div class="flex items-center justify-between mb-16">
    <div class="flex items-center gap-12">
      <div>
        <label class="form-label">Exam date</label>
        <input type="date" value="${state.examDate}" onchange="setExamDate(this.value)" style="font-family:inherit;font-size:13px;border:1px solid #E8EBF0;border-radius:8px;padding:6px 10px;color:#1B2330;background:#fff;outline:none">
      </div>
      <div>
        <label class="form-label">Daily goal (cards)</label>
        <div class="flex items-center gap-8">
          <button class="btn btn-ghost btn-sm" onclick="adjustGoal(-5)">−</button>
          <span style="font-size:14px;font-weight:600;min-width:36px;text-align:center">${state.dailyGoal}</span>
          <button class="btn btn-ghost btn-sm" onclick="adjustGoal(5)">+</button>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost btn-sm" onclick="autoSuggestPlan()" title="Fill empty days with sessions based on your weakest modules">✨ Suggest</button>
      <button class="btn ${state.planEdit?'btn-primary':'btn-ghost'}" onclick="togglePlanEdit()">
        ${state.planEdit?'Done editing':'Edit plan'}
      </button>
    </div>
  </div>

  <div class="flex items-center justify-between mb-16">
    <button class="week-nav-btn" onclick="shiftWeek(-1)" title="Previous week">←</button>
    <div style="text-align:center">
      <div style="font-size:14px;font-weight:700">${weekLabel}</div>
      ${!isCurrentWeek?`<button class="btn btn-ghost btn-sm" style="margin-top:4px;font-size:11.5px" onclick="shiftWeek(${-offset})">↩ Back to this week</button>`:`<div class="text-xs text-secondary" style="margin-top:2px">Current week</div>`}
    </div>
    <button class="week-nav-btn" onclick="shiftWeek(1)" title="Next week">→</button>
  </div>

  <div class="planner-grid">
    ${plan.map((day,di)=>`
      <div class="plan-day${(di===todayIdx&&isCurrentWeek)?' today':''}">
        <div>
          <div class="plan-day-head">${day.day}</div>
          <div class="plan-day-date">${day.date}</div>
          ${day.monthYear?`<div style="font-size:10px;color:#B0B7C3">${day.monthYear}</div>`:''}
        </div>
        ${day.chips.map((chip,ci)=>`
          <div class="plan-chip" style="background:${chip.color}">
            <span class="plan-chip-label">${chip.label}</span>
            ${state.planEdit?`<span onclick="removeChip(${di},${ci})" style="cursor:pointer;opacity:.8;font-size:14px;flex-shrink:0">×</span>`:''}
          </div>
        `).join('')}
        ${isCurrentWeek&&!state.planEdit&&di===todayIdx?`
          <div style="margin-top:4px;font-size:11px;color:#2E9C8E;font-weight:600">← today</div>
        `:''}
        ${state.planEdit?`<button class="plan-add-btn" onclick="openAddModal(${di})">+ Add</button>`:''}
      </div>
    `).join('')}
  </div>`;
}

window.shiftWeek = function(delta) {
  state.planWeekOffset = (state.planWeekOffset || 0) + delta;
  render();
};

function renderAddModal(){
  const di=state.addingTo;
  return `<div class="modal-overlay" onclick="closeAddModal()">
    <div class="modal-box" onclick="event.stopPropagation()">
      <div class="modal-title">Add study task</div>
      <div class="mb-12">
        <label class="form-label">Module</label>
        <select onchange="state.addMod=this.value">
          ${MODULES.map(m=>`<option value="${m.id}"${state.addMod===m.id?' selected':''}>${m.name}</option>`).join('')}
        </select>
      </div>
      <div class="mb-20">
        <label class="form-label">Type</label>
        <select onchange="state.addType=this.value">
          <option${state.addType==='Flashcards'?' selected':''}>Flashcards</option>
          <option${state.addType==='Written'?' selected':''}>Written</option>
          <option${state.addType==='Review'?' selected':''}>Review</option>
        </select>
      </div>
      <div class="flex gap-8">
        <button class="btn btn-ghost" style="flex:1" onclick="closeAddModal()">Cancel</button>
        <button class="btn btn-primary" style="flex:1" onclick="confirmAdd(${di})">Add</button>
      </div>
    </div>
  </div>`;
}

// ========================
// FLASHCARDS
// ========================
function renderFlashcards(){
  const cards=filteredCards();
  // QW-2: count due today vs upcoming
  const _fcNow=new Date();_fcNow.setHours(0,0,0,0);
  const _fcDueToday=cards.filter(c=>{const m=mastery[c.sub];return !m?.nextReview||new Date(m.nextReview)<=_fcNow;}).length;
  const _fcUpcoming=cards.length-_fcDueToday;
  if(cards.length===0){
    return `<div class="card" style="text-align:center;padding:60px 40px">
      <div style="font-size:32px;margin-bottom:12px">🃏</div>
      <div style="font-size:16px;font-weight:600;margin-bottom:8px">No cards available</div>
      <div class="text-sm text-secondary mb-16">Check your study pool in Progress, or select a different module.</div>
      <button class="btn btn-primary" onclick="go('progress')">Manage study pool</button>
    </div>`;
  }
  const idx=Math.min(state.fcIndex,cards.length-1);

  if(state.fcIndex>=cards.length){
    return renderFCComplete(cards.length);
  }

  const card=cards[idx];
  const circ=163.4;
  const prog=Math.round((idx/cards.length)*circ*10)/10;

  return `
  ${state.fcReviewRound?`<div style="background:#FDF7F0;border:1px solid #F0C080;border-radius:10px;padding:10px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
    <span style="font-size:16px">🔁</span>
    <div>
      <div style="font-size:13px;font-weight:600;color:#C97B30">Review round — cards you found difficult</div>
      <div style="font-size:12px;color:#8A93A2">${cards.length} card${cards.length!==1?'s':''} to retry</div>
    </div>
  </div>`:`<div style="display:flex;align-items:center;gap:10px;padding:7px 14px;background:#F5F6F8;border-radius:8px;margin-bottom:14px;font-size:12.5px;color:#8A93A2">
    <span><strong style="color:#3D6FD1">${_fcDueToday}</strong> due today</span>
    <span style="color:#D0D5DE">·</span>
    <span><strong style="color:#1B2330">${_fcUpcoming}</strong> upcoming</span>
    ${state.module!=='ALL'?`<span style="color:#D0D5DE">·</span><span style="font-size:11px;opacity:.8">${state.module} only</span>`:''}
  </div>`}
  <div class="flex items-center justify-between mb-20">
    <div class="text-sm text-secondary">${idx+1} of ${cards.length} cards</div>
    <div class="flex items-center gap-8">
      <svg width="32" height="32" viewBox="0 0 60 60" style="transform:rotate(-90deg)">
        <circle cx="30" cy="30" r="26" fill="none" stroke="#F0F2F6" stroke-width="4"/>
        <circle cx="30" cy="30" r="26" fill="none" stroke="${state.fcReviewRound?'#C97B30':'#3D6FD1'}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${prog} ${circ-prog}"/>
      </svg>
      <button class="btn btn-ghost btn-sm" onclick="resetFC()">Restart</button>
    </div>
  </div>

  <div class="fc-card mb-20" onclick="flipCard()">
    <div style="margin-bottom:12px">
      <span class="badge" style="background:${card.color}18;color:${card.color}">${card.topic}</span>
    </div>
    ${!state.fcFlipped
      ?`<div class="fc-q">${card.q}</div><div class="fc-flip-hint">Click to reveal answer</div>`
      :`<span style="font-size:13px;font-weight:600;color:#8A93A2;display:block;margin-bottom:10px">Answer</span>
        <div class="fc-q mb-12" style="font-size:15px;color:#8A93A2">${card.q}</div>
        <div style="width:48px;height:2px;background:#E8EBF0;margin:12px auto"></div>
        <div class="fc-a">${card.a}</div>`
    }
  </div>

  ${state.fcFlipped?`
  <div class="rating-row">
    <button class="rating-btn rating-again" onclick="rateCard('again')">Again</button>
    <button class="rating-btn rating-hard" onclick="rateCard('hard')">Hard</button>
    <button class="rating-btn rating-good" onclick="rateCard('good')">Good</button>
    <button class="rating-btn rating-easy" onclick="rateCard('easy')">Easy</button>
  </div>
  <div class="kb-hint"><span class="kb-key">1</span> Again &nbsp; <span class="kb-key">2</span> Hard &nbsp; <span class="kb-key">3</span> Good &nbsp; <span class="kb-key">4</span> Easy</div>`:`
  <div style="text-align:center" class="text-sm text-secondary">Rate yourself after flipping</div>
  <div class="kb-hint"><span class="kb-key">Space</span> or <span class="kb-key">→</span> to flip</div>`}`;
}

function renderFCComplete(total){
  return `<div class="card" style="text-align:center;padding:60px 40px;max-width:500px;margin:0 auto">
    <div style="font-size:40px;margin-bottom:16px">🎉</div>
    <div style="font-size:20px;font-weight:700;margin-bottom:8px">Deck complete!</div>
    <div class="text-sm text-secondary mb-24">You reviewed all ${state.fcTotalReviewed} cards. Great work!</div>
    <div class="flex gap-12" style="justify-content:center">
      <button class="btn btn-ghost" onclick="resetFC()">Review again</button>
      <button class="btn btn-primary" onclick="go('practice')">Try practice Qs</button>
    </div>
  </div>`;
}

// ========================
// PRACTICE
// ========================
function renderPractice(){
  if(state.module==='CS1B'){
    return renderRPractice();
  }
  return renderWrittenPractice();
}

function renderWrittenPractice(){
  const qs=filteredQuestions();
  if(qs.length===0){
    return `<div class="card" style="text-align:center;padding:60px 40px">
      <div style="font-size:16px;font-weight:600;margin-bottom:8px">No questions available</div>
      <div class="text-sm text-secondary mb-16">Check your study pool or select a different module.</div>
      <button class="btn btn-primary" onclick="go('progress')">Manage study pool</button>
    </div>`;
  }

  if(state.paStatus==='complete'){
    return renderPAComplete(qs.length);
  }

  const idx=Math.min(state.paIndex,qs.length-1);
  const q=qs[idx];

  // QW-7: per-question countdown timer (hidden when exam mode active — exam timer takes over)
  const _qRem=!state.examMode&&(state.paStatus==='idle'||state.paStatus==='answering')&&state.paQStartTime&&state.paQDuration
    ?Math.max(0,state.paQDuration-Math.floor((Date.now()-state.paQStartTime)/1000))
    :null;
  const _qPct=state.paQDuration>0&&_qRem!==null?(state.paQDuration-_qRem)/state.paQDuration:0;
  const _qColor=_qPct>=0.8?'#C94040':_qPct>=0.5?'#C97B30':'#2E9C8E';
  const _qFmt=_qRem!==null?`${Math.floor(_qRem/60)}:${String(_qRem%60).padStart(2,'0')}`:'';

  return `
  ${renderExamTimer()}
  <div class="flex items-center justify-between mb-16">
    <div class="flex items-center gap-8">
      ${state.aiGenerating
        ?`<span class="badge" style="background:#ECF1FB;color:#3D6FD1">✨ Generating question…</span>`
        :`<button class="btn btn-ghost btn-sm" onclick="generateWrittenQ()" style="gap:5px">✨ Generate AI question</button>`}
      ${state.aiGenError?`<span style="font-size:12px;color:#C94040">${escHtml(state.aiGenError)}</span>`:''}
    </div>
    <span style="font-size:12px;color:${loadAIKey()?'#2E9C8E':'#3D6FD1'};cursor:pointer;font-weight:500" onclick="openKeyModal()">${loadAIKey()?'⚙ API key saved':'⚙ Add API key'}</span>
  </div>
  ${state.paReviewRound?`<div style="background:#FDF7F0;border:1px solid #F0C080;border-radius:10px;padding:10px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
    <span style="font-size:16px">🔁</span>
    <div>
      <div style="font-size:13px;font-weight:600;color:#C97B30">Review round — questions you found difficult</div>
      <div style="font-size:12px;color:#8A93A2">${qs.length} question${qs.length!==1?'s':''} to retry</div>
    </div>
  </div>`:''}
  <div class="flex items-center justify-between mb-20">
    <div class="flex items-center gap-12">
      <div class="text-sm text-secondary">Question ${idx+1} of ${qs.length}</div>
      ${state.paStartTime?`<div class="text-sm text-secondary" style="font-variant-numeric:tabular-nums">⏱ ${fmtElapsed(Date.now()-state.paStartTime)}</div>`:''}
      ${_qRem!==null?`<span style="font-size:12px;font-weight:600;color:${_qColor};font-variant-numeric:tabular-nums">${_qFmt} left</span>`:''}
    </div>
    <div class="flex items-center gap-8">
      ${q.ai?`<span class="badge" style="background:#ECF1FB;color:#3D6FD1">✨ AI</span>`:''}
      <span class="badge" style="background:${q.chip}18;color:${q.chip}">${q.code}</span>
      <span class="badge" style="background:#F5F6F8;color:#8A93A2">${q.marks} marks</span>
      <span class="badge" style="background:#F5F6F8;color:#8A93A2" title="Suggested time at ~1.8 min/mark">${Math.round(q.marks*1.8)} min</span>
      <button class="btn btn-ghost btn-sm" onclick="resetPA()">Restart</button>
    </div>
  </div>

  <div class="card mb-16">
    <div class="text-xs text-secondary mb-8" style="font-weight:600;text-transform:uppercase;letter-spacing:.06em">${q.topic}</div>
    <div class="pa-stem">${q.ai?renderMd(q.stem):q.stem}</div>
  </div>

  ${state.paStatus==='idle'||state.paStatus==='answering'?`
  <div class="card mb-16">
    <div class="flex items-center justify-between mb-10">
      <div style="font-size:13px;font-weight:600">Your answer</div>
      <button class="btn btn-ghost btn-sm" onclick="togglePAPreview()">${state.paPreview?'✏ Edit':'👁 Preview'}</button>
    </div>
    ${state.paPreview
      ?`<div id="pa-preview" style="font-size:14px;line-height:1.7;padding:12px;background:#F8F9FB;border-radius:8px;min-height:120px">${state.paText?renderMd(state.paText):'<span style="color:#8A93A2">Nothing to preview yet</span>'}</div>`
      :`<textarea id="pa-answer" rows="7" placeholder="Write your answer here… (use $…$ for inline LaTeX)" oninput="state.paText=this.value">${escHtml(state.paText)}</textarea>`
    }
    <div class="flex items-center justify-between" style="margin-top:12px">
      <div class="text-xs text-secondary">Write a full exam-style answer</div>
      <button class="btn btn-primary" onclick="submitPA()">Submit</button>
    </div>
  </div>`:''}

  ${state.paStatus==='submitted'?`
  <div class="card mb-16" id="pa-result">
    <div style="font-size:13px;font-weight:600;margin-bottom:10px">Your answer</div>
    <div style="font-size:14px;line-height:1.7;color:#1B2330;padding:12px;background:#F8F9FB;border-radius:8px;white-space:pre-wrap">${escHtml(state.paText)||'<span style="color:#8A93A2">No answer written</span>'}</div>
  </div>

  <div class="card mb-16" style="border-left:3px solid #3D6FD1">
    <div style="font-size:13px;font-weight:600;color:#3D6FD1;margin-bottom:10px">Model answer</div>
    <div style="font-size:14px;line-height:1.7">${q.ai?renderMd(q.model):q.model}</div>
  </div>

  <div class="card">
    ${loadAIKey()?`
    <div style="font-size:13px;font-weight:600;margin-bottom:4px">AI marking</div>
    <div class="text-xs text-secondary mb-12">Gemini will read your answer and score it against the model</div>
    ${state.aiMarking?`
      <div style="display:flex;align-items:center;gap:10px;padding:14px;background:#F5F6F8;border-radius:8px">
        <div style="width:18px;height:18px;border:2.5px solid #3D6FD1;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0"></div>
        <span style="font-size:13px;color:#8A93A2">Marking your answer…</span>
      </div>`:`
      <button class="btn btn-primary" onclick="aiMarkAnswer()">✨ Mark my answer</button>
      <div class="verdict-row" style="margin-top:12px">
        <button class="verdict-btn v-incorrect" onclick="gradePA('incorrect')" style="font-size:12px;padding:6px 14px">Skip — Incorrect</button>
        <button class="verdict-btn v-partial" onclick="gradePA('partial')" style="font-size:12px;padding:6px 14px">Skip — Partial</button>
        <button class="verdict-btn v-correct" onclick="gradePA('correct')" style="font-size:12px;padding:6px 14px">Skip — Correct</button>
      </div>`}`:`
    <div style="font-size:13px;font-weight:600;margin-bottom:12px">How did you do?</div>
    <div class="text-xs text-secondary mb-12">Add a Gemini API key to get AI marking instead</div>
    <div class="verdict-row">
      <button class="verdict-btn v-incorrect" onclick="gradePA('incorrect')">Incorrect</button>
      <button class="verdict-btn v-partial" onclick="gradePA('partial')">Partial</button>
      <button class="verdict-btn v-correct" onclick="gradePA('correct')">Correct</button>
    </div>`}
  </div>`:''}

  ${state.paStatus==='graded'?`
  <div class="card mb-16">
    <div style="font-size:13px;font-weight:600;margin-bottom:10px">Your answer</div>
    <div style="font-size:14px;line-height:1.7;color:#1B2330;padding:12px;background:#F8F9FB;border-radius:8px;white-space:pre-wrap">${escHtml(state.paText)||'<span style="color:#8A93A2">No answer written</span>'}</div>
  </div>
  <div class="card mb-16" style="border-left:3px solid #3D6FD1">
    <div style="font-size:13px;font-weight:600;color:#3D6FD1;margin-bottom:10px">Model answer</div>
    <div style="font-size:14px;line-height:1.7">${q.ai?renderMd(q.model):q.model}</div>
  </div>
  ${state.paAIFeedback?`
  <div class="card mb-16" style="border-left:3px solid #6B5DD3">
    <div style="font-size:13px;font-weight:600;color:#6B5DD3;margin-bottom:8px">✨ AI feedback</div>
    <div style="font-size:14px;line-height:1.7">${escHtml(state.paAIFeedback)}</div>
  </div>`:''}
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-8">
      ${verdictBadge(state.paVerdict)}
      <span class="text-sm text-secondary">Score: ${state.paScore} / ${qs.reduce((a,q)=>a+q.marks,0)}</span>
    </div>
    <button class="btn btn-primary" onclick="nextPA()">Next question →</button>
  </div>`:''}`;
}

function verdictBadge(v){
  if(!v)return '';
  const map={incorrect:['#FDF2F2','#C94040','Incorrect'],partial:['#FDF7F0','#C97B30','Partial'],correct:['#F0FAF8','#2E9C8E','Correct']};
  const [bg,color,label]=map[v]||['#F5F6F8','#8A93A2',v];
  return `<span class="badge" style="background:${bg};color:${color}">${label}</span>`;
}

function renderPAComplete(total){
  const totalMarks=filteredQuestions().reduce((a,q)=>a+q.marks,0);
  const pct=totalMarks>0?Math.round(state.paScore/totalMarks*100):0;
  return `<div class="card" style="text-align:center;padding:60px 40px;max-width:500px;margin:0 auto">
    <div style="font-size:40px;margin-bottom:16px">${pct>=70?'🌟':pct>=50?'👍':'📚'}</div>
    <div style="font-size:20px;font-weight:700;margin-bottom:8px">Session complete!</div>
    <div style="font-size:32px;font-weight:700;color:#3D6FD1;margin:16px 0">${state.paScore} / ${totalMarks}</div>
    <div class="text-sm text-secondary mb-24">${pct}% — ${pct>=70?'Excellent work!':pct>=50?'Good effort — keep reviewing!':'Keep practising — you\'ll get there!'}</div>
    <div class="flex gap-12" style="justify-content:center">
      <button class="btn btn-ghost" onclick="resetPA()">Try again</button>
      <button class="btn btn-primary" onclick="go('flashcards')">Review flashcards</button>
    </div>
  </div>`;
}

// ========================
// R PRACTICE
// ========================
function renderRPractice(){
  const rqs=filteredRQ();
  if(rqs.length===0){
    return `
    <div class="flex items-center justify-between mb-20">
      <div class="flex items-center gap-8">
        ${state.aiGenerating
          ?`<span class="badge" style="background:#ECF1FB;color:#3D6FD1">✨ Generating…</span>`
          :`<button class="btn btn-primary" onclick="generateRQ()">✨ Generate AI question</button>`}
        ${state.aiGenError?`<span style="font-size:12px;color:#C94040">${escHtml(state.aiGenError)}</span>`:''}
      </div>
      <span style="font-size:12px;color:${loadAIKey()?'#2E9C8E':'#3D6FD1'};cursor:pointer;font-weight:500" onclick="openKeyModal()">${loadAIKey()?'⚙ API key saved':'⚙ Add API key'}</span>
    </div>
    <div class="card" style="text-align:center;padding:40px">
      <div style="font-size:16px;font-weight:600;margin-bottom:8px">No R questions in pool</div>
      <div class="text-sm text-secondary mb-16">Generate one with AI above, or enable CS1B subtopics in your study pool.</div>
      <button class="btn btn-ghost btn-sm" onclick="go('progress')">Manage study pool</button>
    </div>`;
  }
  const idx=Math.min(state.rIndex,rqs.length-1);
  const rq=rqs[idx];
  const defaultCode=(rq.setup?rq.setup+'\n':'')+rq.starter;
  const code=state.rCode!==null?state.rCode:defaultCode;

  let statusBadge='';
  if(state.rStatus==='loading') statusBadge=`<span class="badge" style="background:#FDF7F0;color:#C97B30"><span style="display:inline-block;width:10px;height:10px;border:2px solid #C97B30;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:4px"></span>R initialising…</span>`;
  else if(state.rStatus==='ready') statusBadge=`<span class="badge" style="background:#F0FAF8;color:#2E9C8E">R ready</span>`;
  else if(state.rStatus==='error') statusBadge=`<span class="badge" style="background:#FDF2F2;color:#C94040">R unavailable</span>`;

  const isAI = !!rq.ai;

  return `
  <div class="flex items-center justify-between mb-16">
    <div class="flex items-center gap-8">
      ${state.aiGenerating
        ?`<span class="badge" style="background:#ECF1FB;color:#3D6FD1">✨ Generating…</span>`
        :`<button class="btn btn-ghost btn-sm" onclick="generateRQ()">✨ Generate AI question</button>`}
      ${state.aiGenError?`<span style="font-size:12px;color:#C94040">${escHtml(state.aiGenError)}</span>`:''}
    </div>
    <span style="font-size:12px;color:${loadAIKey()?'#2E9C8E':'#3D6FD1'};cursor:pointer;font-weight:500" onclick="openKeyModal()">${loadAIKey()?'⚙ API key saved':'⚙ Add API key'}</span>
  </div>

  <div class="flex items-center justify-between mb-16">
    <div class="text-sm text-secondary">R Question ${idx+1} of ${rqs.length}</div>
    <div class="flex items-center gap-8">
      ${isAI?`<span class="badge" style="background:#ECF1FB;color:#3D6FD1">✨ AI</span>`:''}
      <span class="badge" style="background:#2E9C8E18;color:#2E9C8E">CS1B</span>
      <span class="badge" style="background:#F5F6F8;color:#8A93A2">${rq.marks} marks</span>
      ${statusBadge}
    </div>
  </div>

  <div class="card mb-16">
    <div class="flex items-center justify-between mb-8">
      <div class="text-xs text-secondary" style="font-weight:600;text-transform:uppercase;letter-spacing:.06em">${rq.topic}</div>
    </div>
    <div class="pa-stem">${rq.ai?renderMd(rq.prompt):rq.prompt}</div>
    ${isAI?`
    <div style="margin-top:14px;padding:10px 14px;background:#1E1E2E;border-radius:8px">
      <div class="text-xs" style="color:#6C7086;font-weight:600;margin-bottom:6px;font-family:'JetBrains Mono',monospace">SETUP CODE (auto-runs before your code)</div>
      <pre style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#A6E3A1;white-space:pre-wrap;margin:0">${escHtml(rq.setup)}</pre>
    </div>`:`
    <div style="margin-top:14px">
      <div class="text-xs text-secondary mb-6" style="font-weight:600">Data preview</div>
      <div style="overflow-x:auto">
        <table style="font-family:'JetBrains Mono',monospace;font-size:12px;border-collapse:collapse">
          <tr>${rq.preview.cols.map(c=>`<th style="padding:4px 10px;text-align:left;color:#8A93A2;font-weight:600;border-bottom:1px solid #E8EBF0">${escHtml(String(c))}</th>`).join('')}</tr>
          ${rq.preview.rows.map(r=>`<tr>${r.map(v=>`<td style="padding:4px 10px;border-bottom:1px solid #F5F6F8">${escHtml(String(v))}</td>`).join('')}</tr>`).join('')}
          <tr><td colspan="${rq.preview.cols.length}" style="padding:4px 10px;color:#8A93A2;font-size:11px">…</td></tr>
        </table>
      </div>
    </div>`}
  </div>

  <div class="rs-ide" style="height:560px">
    <!-- Global toolbar -->
    <div class="rs-toolbar">
      <div class="rs-toolbar-left">
        <div class="rs-toolbar-dot" style="background:#FF5F57"></div>
        <div class="rs-toolbar-dot" style="background:#FEBC2E"></div>
        <div class="rs-toolbar-dot" style="background:#28C840"></div>
        <span style="color:#585B70;font-size:11.5px;margin-left:6px">script.R</span>
        <span style="color:#45475A;font-size:10.5px">— Q${idx+1} of ${rqs.length}</span>
      </div>
      <div class="flex items-center gap-8">
        ${state.rStatus==='idle'?`<button class="rs-btn rs-btn-run" onclick="loadWebR()">⚡ Start R</button>`:''}
        ${state.rStatus==='loading'?`<span class="rs-status rs-status-loading">● R initialising…</span>`:''}
        ${state.rStatus==='ready'?`
          <button class="rs-btn rs-btn-ghost" onclick="resetRCode()">↺ Reset</button>
          <button class="rs-btn rs-btn-run" onclick="runRCode()" ${state.rRunning?'disabled':''}>
            ${state.rRunning?'<span style="opacity:.7">⏳</span> Running…':'▶ Run'}
          </button>
          <span class="rs-status rs-status-ready">● R ${state.rRunning?'running':'ready'}</span>`:''}
        ${state.rStatus==='error'?`<span class="rs-status rs-status-error">● R error</span>`:''}
      </div>
    </div>
    <!-- 4-panel body -->
    <div class="rs-body" style="flex:1;min-height:0">
      <!-- LEFT: Editor + Console -->
      <div class="rs-left">
        <!-- Editor panel (top-left) -->
        <div class="rs-panel-bar" style="flex-shrink:0">
          <span class="rs-panel-tab rs-panel-tab-blue">Script</span>
          <span style="color:#45475A;font-size:10px">${rq.topic}</span>
        </div>
        <div class="rs-editor-body" style="flex:3;min-height:0">
          <div class="rs-gutter" id="rs-gutter"></div>
          <div class="rs-code-wrap">
            <pre id="r-code-pre" aria-hidden="true"></pre>
            <textarea id="r-code-ta" spellcheck="false" onscroll="syncScrollTA()" placeholder="# Write your R code here…"></textarea>
          </div>
        </div>
        <!-- Console panel (bottom-left) -->
        <div style="flex:2;display:flex;flex-direction:column;border-top:1px solid #313244;min-height:0">
          <div class="rs-panel-bar" style="flex-shrink:0">
            <span class="rs-panel-tab rs-panel-tab-orange">Console</span>
            ${state.rOutput.length>0?`<button class="rs-panel-action" onclick="state.rOutput=[];state.rEnv=[];render()">✕ clear</button>`:''}
          </div>
          <div class="rs-console-body" id="r-console">
            ${state.rOutput.length===0
              ?`<span class="rs-empty-msg">${state.rStatus==='idle'?'Click ⚡ Start R to initialise the engine, then ▶ Run to execute your code.':'Ready — press ▶ Run to execute.'}</span>`
              :state.rOutput.map(l=>`<div class="${l.type==='error'?'r-err-line':'r-out-line'}"><span class="rs-prompt">&gt;</span> ${escHtml(l.text)}</div>`).join('')}
          </div>
        </div>
      </div>
      <!-- RIGHT: Environment + Plots -->
      <div class="rs-right">
        <!-- Environment panel (top-right) -->
        <div style="flex:1;display:flex;flex-direction:column;border-bottom:1px solid #313244;min-height:0">
          <div class="rs-panel-bar" style="flex-shrink:0">
            <span class="rs-panel-tab rs-panel-tab-purple">Environment</span>
            ${state.rEnv.length>0?`<span style="color:#45475A;font-size:10px">${state.rEnv.length} object${state.rEnv.length!==1?'s':''}</span>`:''}
          </div>
          <div class="rs-env-body">
            ${state.rEnv.length===0
              ?`<div class="rs-env-empty">No variables yet — run your code to populate the environment.</div>`
              :state.rEnv.map(v=>`
                <div class="rs-env-row">
                  <span class="rs-env-name">${escHtml(v.name)}</span>
                  <span class="rs-env-type">${escHtml(v.type)}</span>
                  <span class="rs-env-val">${escHtml(v.val)}</span>
                </div>`).join('')}
          </div>
        </div>
        <!-- Plots panel (bottom-right) -->
        <div style="flex:1;display:flex;flex-direction:column;min-height:0">
          <div class="rs-panel-bar" style="flex-shrink:0">
            <span class="rs-panel-tab rs-panel-tab-green">Plots</span>
            ${state.rImages.length>0?`<span style="color:#45475A;font-size:10px">${state.rImages.length} plot${state.rImages.length!==1?'s':''}</span>`:''}
          </div>
          <div class="rs-plots-body">
            ${state.rImages.length===0
              ?`<span class="rs-plots-empty">Plots will appear here when your code calls plot(), hist(), etc.</span>`
              :state.rImages.map(src=>`<img src="${src}" alt="R plot" style="max-width:100%">`).join('')}
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="flex gap-10 mb-16">
    <button class="btn btn-ghost btn-sm" onclick="toggleHint()">${state.showHint?'Hide hint':'Show hint'}</button>
    <button class="btn btn-ghost btn-sm" onclick="toggleModelR()">${state.showModel?'Hide model answer':'Show model answer'}</button>
    ${idx<rqs.length-1?`<button class="btn btn-ghost btn-sm" onclick="nextRQ()">Next question →</button>`:''}
  </div>

  ${state.showHint?`
  <div class="card mb-12" style="border-left:3px solid #C97B30">
    <div style="font-size:13px;font-weight:600;color:#C97B30;margin-bottom:8px">Hint</div>
    <div style="font-size:13.5px;line-height:1.7">${escHtml(rq.hint)}</div>
  </div>`:''}

  ${state.showModel?`
  <div class="card" style="border-left:3px solid #3D6FD1">
    <div style="font-size:13px;font-weight:600;color:#3D6FD1;margin-bottom:8px">Model answer</div>
    <pre style="font-family:'JetBrains Mono',monospace;font-size:12.5px;line-height:1.6;white-space:pre-wrap;color:#1B2330">${escHtml(rq.model)}</pre>
  </div>`:''}`;
}

// ========================
// PROGRESS
// ========================
function topicPoolPct(topic){
  if(!topic.subs.length) return 0;
  return Math.round(topic.subs.filter(s=>pool[s.id]).length/topic.subs.length*100);
}
function coursePoolPct(course){
  const allSubs=course.topics.flatMap(t=>t.subs);
  if(!allSubs.length) return 0;
  return Math.round(allSubs.filter(s=>pool[s.id]).length/allSubs.length*100);
}

function renderProgress(){
  const allSubs=[];
  SYLLABUS.forEach(c=>c.topics.forEach(t=>t.subs.forEach(s=>allSubs.push(s.id))));
  const checked=allSubs.filter(id=>pool[id]).length;

  // Render recent written question history
  const whEntries=Object.values(writtenHistory).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).slice(0,8);
  const whHtml=whEntries.length===0?'':`
  <div class="card mb-16">
    <div class="flex items-center justify-between mb-12">
      <div style="font-size:14px;font-weight:600">Recent written questions</div>
      <div class="text-xs text-secondary">${whEntries.length} shown</div>
    </div>
    ${whEntries.map(e=>{
      const vmap={correct:['#F0FAF8','#2E9C8E','Correct'],partial:['#FDF7F0','#C97B30','Partial'],incorrect:['#FDF2F2','#C94040','Incorrect']};
      const [bg,col,lbl]=vmap[e.verdict]||['#F5F6F8','#8A93A2',e.verdict];
      const dt=new Date(e.timestamp).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
      return `<div class="danger-row" style="gap:8px">
        <span class="badge" style="background:${bg};color:${col};flex-shrink:0">${lbl}</span>
        <div style="flex:1;font-size:12.5px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical">${escHtml(e.stem||e.topic)}</div>
        <span class="text-xs text-secondary" style="flex-shrink:0">${e.score}/${e.maxMarks} · ${dt}</span>
      </div>`;
    }).join('')}
  </div>`;

  return `
  <div class="flex items-center justify-between mb-20">
    <div class="text-sm text-secondary">${checked} / ${allSubs.length} subtopics covered in notes · Flashcards &amp; practice draw only from ticked sections</div>
    <div class="flex gap-8">
      <button class="btn btn-ghost btn-sm" onclick="poolAll(true)">Tick all</button>
      <button class="btn btn-ghost btn-sm" style="color:#C94040" onclick="poolAll(false)">Clear all</button>
    </div>
  </div>

  ${whHtml}

  ${SYLLABUS.map(course=>{
    const coursePct=avgMastery(course);
    const open=state.expandedCourses[course.code]!==false;
    return `
    <div class="card mb-16">
      <div class="flex items-center gap-12 mb-4" style="cursor:pointer;user-select:none" onclick="toggleCourse('${course.code}')">
        <div style="width:4px;height:36px;border-radius:2px;background:${course.color};flex-shrink:0"></div>
        <div style="flex:1">
          <div style="font-size:16px;font-weight:700">${course.code} — ${course.name}</div>
          <div class="text-sm text-secondary">${course.topics.length} topics · ${course.topics.reduce((a,t)=>a+t.subs.length,0)} subtopics</div>
        </div>
        <div style="text-align:right;margin-right:8px">
          <div style="font-size:20px;font-weight:700;color:${course.color}">${coursePoolPct(course)}%</div>
          <div class="text-xs text-secondary">covered</div>
        </div>
        <span style="color:#8A93A2;font-size:14px;transition:transform .2s;display:inline-block;transform:rotate(${open?90:0}deg)">▶</span>
      </div>

      ${open?`
      <div style="margin-top:12px">
        ${course.topics.map(topic=>{
          const pct=topicPoolPct(topic);
          const pooled=topic.subs.filter(s=>pool[s.id]).length;
          return `
          <div>
            <div class="topic-row${state.expandedTopics[topic.id]?' expanded':''}" onclick="toggleTopic('${topic.id}')">
              <span class="expand-caret" style="color:#8A93A2;font-size:12px">▶</span>
              <input type="checkbox" ${pct===100?'checked':pct>0?'indeterminate-js':''} onclick="event.stopPropagation();toggleTopic_pool('${topic.id}',this.checked)" style="flex-shrink:0;width:16px;height:16px;cursor:pointer" id="tc-${topic.id}">
              <div style="flex:1">
                <div style="font-size:13.5px;font-weight:600">${topic.name} <span style="color:#8A93A2;font-weight:400">[${topic.w}%]</span></div>
                <div style="font-size:11.5px;color:#8A93A2;margin-top:2px">${pooled}/${topic.subs.length} subtopics covered</div>
              </div>
              <div class="mastery-bar" style="max-width:100px">
                <div class="mastery-fill" style="width:${pct}%;background:${course.color}"></div>
              </div>
              <div style="font-size:13px;font-weight:600;color:${course.color};min-width:36px;text-align:right">${pct}%</div>
            </div>
            ${state.expandedTopics[topic.id]?topic.subs.map(sub=>{
              const covered=!!pool[sub.id];
              return `
              <div class="sub-row">
                <input type="checkbox" ${covered?'checked':''} onchange="togglePool('${sub.id}',this.checked)">
                <div style="flex:1">
                  <div style="font-size:12px;color:#8A93A2;font-weight:600;margin-bottom:1px">${sub.num}</div>
                  <div style="font-size:13px">${sub.name}</div>
                </div>
                <span style="font-size:11px;color:${covered?'#2E9C8E':'#B0B7C3'};flex-shrink:0;font-weight:600">${covered?'✓ covered':'not yet'}</span>
              </div>`;
            }).join(''):''}
          </div>`;
        }).join('')}
      </div>`:''}
    </div>`;
  }).join('')}`;
}

function subMastery(id){
  const m=mastery[id];
  if(!m||m.seen<1) return 0;
  return Math.round(m.good/m.seen*100);
}

// Coverage = % of sub-topics in a topic that have been studied at least once
function subCoverage(id){
  const m=mastery[id];
  return (m&&m.seen>0)?100:0;
}

function topicCoverage(topic){
  if(!topic.subs.length) return 0;
  return Math.round(topic.subs.reduce((a,s)=>a+subCoverage(s.id),0)/topic.subs.length);
}

function topicMastery(topic){
  if(!topic.subs.length) return 0;
  return Math.round(topic.subs.reduce((a,s)=>a+subMastery(s.id),0)/topic.subs.length);
}

function avgMastery(course){
  const totalW=course.topics.reduce((a,t)=>a+t.w,0);
  if(!totalW) return 0;
  return Math.round(course.topics.reduce((a,t)=>a+topicMastery(t)*t.w,0)/totalW);
}

// ========================
// ACTIONS
// ========================
window.go=function(view){
  state.view=view;
  if(view==='flashcards'){state.fcIndex=0;state.fcFlipped=false;state.fcWeakQueue=[];state.fcReviewRound=false;state.fcTotalReviewed=0;buildDecks();}
  if(view==='practice'){
    state.paIndex=0;state.paText='';state.paStatus='idle';state.paVerdict=null;state.paScore=0;state.paWeakQueue=[];state.paReviewRound=false;state.paPreview=false;
    stopPATimer();buildDecks();startPATimer();
    if(state.module==='CS1B') initWebR(); // QW-5: auto-init R
    // QW-7: start countdown for first question
    if(state.module!=='CS1B'&&state.paDeck.length>0){state.paQStartTime=Date.now();state.paQDuration=Math.round(state.paDeck[0].marks*1.8)*60;}
  }
  if(view!=='practice'){stopPATimer();state.paQStartTime=null;state.paQDuration=0;} // QW-7: clear countdown
  render();
};

window.setModule=function(mod){
  state.module=mod;
  state.fcIndex=0;state.fcFlipped=false;state.fcWeakQueue=[];state.fcReviewRound=false;
  state.paIndex=0;state.paText='';state.paStatus='idle';state.paVerdict=null;state.paScore=0;state.paWeakQueue=[];state.paReviewRound=false;state.paPreview=false;stopPATimer();
  state.rIndex=0;state.rCode=null;state.rOutput=[];state.rImages=[];state.rRan=false;state.showHint=false;state.showModel=false;
  state.paQStartTime=null;state.paQDuration=0; // QW-7: reset countdown
  buildDecks();
  if(mod==='CS1B'&&state.view==='practice') initWebR(); // QW-5: auto-init R
  // QW-7: start countdown for first written question
  if(mod!=='CS1B'&&state.view==='practice'&&state.paDeck.length>0){state.paQStartTime=Date.now();state.paQDuration=Math.round(state.paDeck[0].marks*1.8)*60;}
  render();
};

window.flipCard=function(){
  if(state.fcIndex>=filteredCards().length)return;
  state.fcFlipped=!state.fcFlipped;
  render();
};

window.rateCard=function(rating){
  const cards=filteredCards();
  if(state.fcIndex>=cards.length)return;
  const card=cards[state.fcIndex];
  if(card){
    recordCardRating(card.sub, rating);
    if(rating==='again'||rating==='hard') state.fcWeakQueue.push(card);
    state.fcTotalReviewed++;
  }
  state.fcIndex++;
  state.fcFlipped=false;
  if(state.fcIndex>=state.fcDeck.length && state.fcWeakQueue.length>0){
    state.fcReviewRound=true;
    state.fcDeck=[...state.fcWeakQueue];
    state.fcWeakQueue=[];
    state.fcIndex=0;
  }
  render();
};

window.resetFC=function(){
  state.fcIndex=0;state.fcFlipped=false;state.fcWeakQueue=[];state.fcReviewRound=false;state.fcTotalReviewed=0;buildDecks();
  render();
};

window.submitPA=function(){
  if(!state.paText.trim()){
    const ta=document.getElementById('pa-answer');
    if(ta){ta.style.borderColor='#C94040';ta.focus();setTimeout(()=>{ta.style.borderColor='';},1200);}
    return;
  }
  state.paStatus='submitted';
  state.paQStartTime=null; // QW-7: pause countdown on submit
  render();
  requestAnimationFrame(()=>{
    const target=document.getElementById('pa-result');
    if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
  });
};

window.gradePA=function(verdict){
  state.paVerdict=verdict;
  const qs=filteredQuestions();
  const idx=Math.min(state.paIndex,qs.length-1);
  const q=qs[idx];
  const marks=q.marks;
  const add=verdict==='correct'?marks:verdict==='partial'?Math.round(marks/2):0;
  state.paScore+=add;
  if(verdict==='incorrect'||verdict==='partial') state.paWeakQueue.push(q);
  state.paStatus='graded';
  studyStats.writtenAnswered=(studyStats.writtenAnswered||0)+1;
  saveStudyStats();
  // Save to written history (Issue-04)
  const qid=_qHash(q);
  writtenHistory[qid]={timestamp:new Date().toISOString(),verdict,score:add,maxMarks:marks,topic:q.topic||'',stem:(q.stem||'').slice(0,120),answer:state.paText.slice(0,500)};
  saveWrittenHistory();
  // Update mastery via same SM-2 logic as flashcards (Issue-06)
  if(q.sub&&q.sub!=='ai') recordCardRating(q.sub, verdict==='correct'?'good':verdict==='partial'?'hard':'again');
  render();
};

window.nextPA=function(){
  const qs=filteredQuestions();
  state.paIndex++;
  state.paText='';
  state.paVerdict=null;
  state.paAIFeedback='';
  state.aiMarking=false;
  state.paPreview=false;
  if(state.paIndex>=qs.length){
    if(state.paWeakQueue.length>0){
      state.paReviewRound=true;
      state.paDeck=[...state.paWeakQueue];
      state.paWeakQueue=[];
      state.paIndex=0;
      state.paStatus='idle';
      const _nq=filteredQuestions()[0];if(_nq){state.paQStartTime=Date.now();state.paQDuration=Math.round(_nq.marks*1.8)*60;} // QW-7
    }else{
      state.paStatus='complete';
      state.paQStartTime=null;state.paQDuration=0; // QW-7
    }
  }else{
    state.paStatus='idle';
    const _nq2=filteredQuestions()[state.paIndex];if(_nq2){state.paQStartTime=Date.now();state.paQDuration=Math.round(_nq2.marks*1.8)*60;} // QW-7
  }
  render();
};

window.aiMarkAnswer=async function(){
  if(state.aiMarking) return;
  const qs=filteredQuestions();
  const q=qs[Math.min(state.paIndex,qs.length-1)];
  const studentAnswer=state.paText.trim();
  if(!studentAnswer){ alert('No answer to mark.'); return; }
  state.aiMarking=true; render();
  try {
    const prompt=`You are an IFoA examiner marking a student's written answer.

Question (${q.marks} marks): ${q.stem||q.prompt}

Model answer: ${q.model}

Student's answer: ${studentAnswer}

Mark this answer strictly but fairly as an IFoA examiner would.
Return ONLY a valid JSON object with no markdown:
{"grade":"Correct"|"Partial"|"Incorrect","marks_awarded":number,"feedback":"2-3 sentences: what the student got right, what key points were missing or wrong, and one specific thing to focus on next time"}`;
    const raw=await callGemini(prompt);
    let result;
    try { result=JSON.parse(raw.replace(/```json\n?|\n?```/g,'').trim()); }
    catch(e){ result={grade:'Partial',marks_awarded:Math.round(q.marks/2),feedback:raw.slice(0,300)}; }
    const grade=(result.grade||'').toLowerCase();
    const verdict=grade==='correct'?'correct':grade==='incorrect'?'incorrect':'partial';
    state.paAIFeedback=result.feedback||'';
    state.aiMarking=false;
    // apply grade
    const add=verdict==='correct'?q.marks:verdict==='partial'?Math.round(q.marks/2):0;
    state.paScore+=add;
    if(verdict==='incorrect'||verdict==='partial') state.paWeakQueue.push(q);
    state.paVerdict=verdict;
    state.paStatus='graded';
    studyStats.writtenAnswered=(studyStats.writtenAnswered||0)+1;
    saveStudyStats();
    // Save to written history and update mastery (Issues 04 + 06)
    const qid=_qHash(q);
    writtenHistory[qid]={timestamp:new Date().toISOString(),verdict,score:add,maxMarks:q.marks,topic:q.topic||'',stem:(q.stem||'').slice(0,120),answer:studentAnswer.slice(0,500)};
    saveWrittenHistory();
    if(q.sub&&q.sub!=='ai') recordCardRating(q.sub, verdict==='correct'?'good':verdict==='partial'?'hard':'again');
    render();
    requestAnimationFrame(()=>{
      const t=document.getElementById('pa-result');
      if(t) t.scrollIntoView({behavior:'smooth',block:'start'});
    });
  } catch(e) {
    state.aiMarking=false;
    state.paAIFeedback='';
    alert('AI marking failed: '+(e.message||'unknown error')+'. Use manual grading below.');
    render();
  }
};

window.resetPA=function(){stopPATimer();startPATimer();
  state.paIndex=0;state.paText='';state.paStatus='idle';state.paVerdict=null;state.paScore=0;state.paWeakQueue=[];state.paReviewRound=false;state.paPreview=false;buildDecks();
  // QW-7: restart countdown for first question
  if(state.paDeck.length>0){state.paQStartTime=Date.now();state.paQDuration=Math.round(state.paDeck[0].marks*1.8)*60;}
  render();
};

window.togglePAPreview=function(){
  state.paPreview=!state.paPreview;
  render();
  // QW-8: trigger MathJax on preview panel
  if(state.paPreview&&window.MathJax&&MathJax.typesetPromise){
    setTimeout(()=>MathJax.typesetPromise(['#pa-preview']).catch(()=>{}),50);
  }
};

window.loadWebR=function(){
  initWebR();
};

window.runRCode=async function(){
  if(!webRReady||state.rRunning)return;
  const ta=document.getElementById('r-code-ta');
  const code=ta?ta.value:(state.rCode||'');
  state.rRunning=true;state.rOutput=[];state.rImages=[];state.rEnv=[];state.rRan=true;
  render();
  try{
    await webR.evalR('webr::canvas(width=560,height=380)');
    const result=await webRShelter.captureR(code,{withAutoprint:true,captureStreams:true,captureConditions:true});
    const output=[];
    for(const ev of result.output){
      if(ev.type==='stdout'||ev.type==='message') output.push({type:'out',text:ev.data});
      if(ev.type==='stderr') output.push({type:'error',text:ev.data});
    }
    if(output.length===0) output.push({type:'out',text:'Code ran with no output.'});
    state.rOutput=output;
    // Flush device and capture plots
    try{
      await webR.evalR('try(grDevices::dev.off(),silent=TRUE)');
      const imgs=await webR.evalR('webr::canvas_capture()');
      const imgData=await imgs.toJs();
      if(imgData&&imgData.values&&imgData.values.length>0){
        state.rImages=imgData.values.filter(Boolean).map(v=>'data:image/png;base64,'+v);
      }
    }catch(e){
      state.rOutput.push({type:'error',text:'Plot capture error: '+String(e)});
    }
    // Capture environment
    try{
      const envR=await webR.evalR(`
        nms <- ls()
        nms <- nms[!startsWith(nms,'.')]
        if(length(nms)==0) character(0) else sapply(nms, function(nm){
          obj <- get(nm)
          tp <- class(obj)[1]
          vl <- tryCatch({
            if(is.data.frame(obj)) paste0(nrow(obj),' x ',ncol(obj),' [',paste(names(obj),collapse=', '),']')
            else if(is.numeric(obj)&&length(obj)<=8) paste(round(obj,3),collapse='  ')
            else if(is.numeric(obj)) paste0('num[',length(obj),'] ',paste(round(head(obj,4),3),collapse=' '),' ...')
            else if(is.character(obj)&&length(obj)<=4) paste('"',obj,'"',sep='',collapse=' ')
            else if(is.list(obj)) paste0('List of ',length(obj))
            else paste0('[',length(obj),']')
          }, error=function(e) '?')
          paste0(nm,'|||',tp,'|||',vl)
        })
      `);
      const rows=await envR.toJs();
      if(rows&&rows.values&&rows.values.length>0){
        state.rEnv=rows.values.filter(Boolean).map(s=>{
          const p=s.split('|||');
          return {name:p[0]||'',type:p[1]||'',val:p[2]||''};
        });
      }
    }catch(e){}
  }catch(e){
    state.rOutput=[{type:'error',text:String(e)}];
  }
  state.rRunning=false;
  render();
};

window.syncScrollTA=function(){
  const ta=document.getElementById('r-code-ta');
  const pre=document.getElementById('r-code-pre');
  if(ta&&pre){pre.scrollTop=ta.scrollTop;pre.scrollLeft=ta.scrollLeft;}
};

window.resetRCode=function(){state.rCode=null;state.rOutput=[];state.rImages=[];state.rEnv=[];state.rRan=false;render();};
window.toggleHint=function(){state.showHint=!state.showHint;render();};
window.toggleModelR=function(){state.showModel=!state.showModel;render();};
window.nextRQ=function(){
  const rqs=filteredRQ();
  state.rIndex=Math.min(state.rIndex+1,rqs.length-1);
  state.rCode=null;state.rOutput=[];state.rImages=[];state.rEnv=[];state.rRan=false;state.showHint=false;state.showModel=false;
  render();
};

window.toggleTopic=function(id){
  state.expandedTopics[id]=!state.expandedTopics[id];
  render();
};

window.toggleCourse=function(code){
  state.expandedCourses[code]=state.expandedCourses[code]===false?true:false;
  render();
};

function invalidateDecks(){state.fcDeck=[];state.paDeck=[];}

window.toggleTopic_pool=function(topicId, val){
  const topic=SYLLABUS.flatMap(c=>c.topics).find(t=>t.id===topicId);
  if(!topic) return;
  topic.subs.forEach(s=>{ pool[s.id]=val; });
  savePool();
  invalidateDecks();
  render();
};

window.togglePool=function(id,val){
  pool[id]=val;
  savePool();
  invalidateDecks();
  render();
};

window.poolAll=function(val){
  if(!val&&!confirm('Clear all subtopics from your study pool?')) return;
  // Prune stale keys not in current syllabus before writing
  const validIds=new Set();
  SYLLABUS.forEach(c=>c.topics.forEach(t=>t.subs.forEach(s=>validIds.add(s.id))));
  Object.keys(pool).forEach(k=>{if(!validIds.has(k)) delete pool[k];});
  validIds.forEach(id=>{pool[id]=val;});
  savePool();
  invalidateDecks();
  render();
};

window.togglePlanEdit=function(){
  state.planEdit=!state.planEdit;
  render();
};

window.openAddModal=function(dayIndex){
  state.addingTo=dayIndex;
  render();
};

window.closeAddModal=function(){
  state.addingTo=null;
  render();
};

window.confirmAdd=function(dayIndex){
  const plan=state.planData;
  if(!plan||dayIndex===null)return;
  const mod=MODULES.find(m=>m.id===state.addMod);
  const color=mod?mod.color:'#8A93A2';
  const typeMap={'Flashcards':'flashcards','Written':'practice','Review':null};
  plan[dayIndex].chips.push({
    label:`${state.addMod} · ${state.addType}`,
    color,
    modId:state.addMod,
    type:typeMap[state.addType]||null,
  });
  savePlanForWeek(plan, state.planWeekOffset||0);
  savePlan(plan);
  state.addingTo=null;
  render();
};

window.removeChip=function(dayIndex,chipIndex){
  const plan=state.planData;
  if(!plan)return;
  plan[dayIndex].chips.splice(chipIndex,1);
  savePlanForWeek(plan, state.planWeekOffset||0);
  savePlan(plan);
  render();
};

window.setExamDate=function(val){
  state.examDate=val;
  saveExamDate();
  render();
};

window.adjustGoal=function(delta){
  state.dailyGoal=Math.max(5,state.dailyGoal+delta);
  saveExamDate();
  render();
};

window.toggleChip=function(dayIndex,chipIndex,val){
  state.chipDone[dayIndex+'-'+chipIndex]=val;
  saveChipDone();
  render();
};

window.startFromChip=function(modId,type){
  state.module=modId;
  if(type==='flashcards'){
    state.fcIndex=0;state.fcFlipped=false;
    go('flashcards');
  }else if(type==='practice'){
    state.paIndex=0;state.paText='';state.paStatus='idle';state.paVerdict=null;state.paScore=0;
    go('practice');
  }else{
    go('home');
  }
};

function escHtml(s){
  if(!s)return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderMd(text){
  if(!text)return '';
  // Split into math and non-math segments so math is never HTML-escaped
  const mathRe=/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g;
  const segments=[];
  let last=0,m;
  while((m=mathRe.exec(text))!==null){
    if(m.index>last)segments.push({t:'text',v:text.slice(last,m.index)});
    segments.push({t:'math',v:m[0]});
    last=m.index+m[0].length;
  }
  if(last<text.length)segments.push({t:'text',v:text.slice(last)});

  return segments.map(seg=>{
    if(seg.t==='math')return seg.v; // pass raw LaTeX to MathJax
    let h=escHtml(seg.v);
    h=h.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
    h=h.replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
    h=h.replace(/^###\s+(.+)$/gm,'<div style="font-weight:600;margin:10px 0 4px">$1</div>');
    h=h.replace(/^##\s+(.+)$/gm,'<div style="font-weight:700;margin:12px 0 4px">$1</div>');
    h=h.replace(/^[-•]\s+(.+)$/gm,'<div style="display:flex;gap:6px;margin:3px 0"><span style="color:#3D6FD1;flex-shrink:0">•</span><span>$1</span></div>');
    h=h.replace(/^(\d+)\.\s+(.+)$/gm,'<div style="display:flex;gap:6px;margin:3px 0"><span style="color:#3D6FD1;font-weight:600;flex-shrink:0">$1.</span><span>$2</span></div>');
    h=h.replace(/\n\n+/g,'<br><br>');
    h=h.replace(/\n/g,'<br>');
    return h;
  }).join('');
}

// ========================
// AI QUESTION GENERATION
// ========================
function loadAIKey(){ try{return localStorage.getItem('tabula_ai_key')||'';}catch(e){return '';} }
function saveAIKey(k){ try{localStorage.setItem('tabula_ai_key',k);}catch(e){} }

const MODULE_CONTEXT = {
  'CM1A':'Theory of interest rates (force of interest, nominal/effective conversion, annuities, perpetuities, duration, immunisation, spot/forward rates) and equation of value (loans, bonds, shares, IRR/NPV)',
  'CM1B':'Decrement models, life tables, survival functions, force of mortality, multi-state Markov models, EPV of assurances and annuities, gross premiums, prospective/retrospective reserves, profit testing',
  'CS1A':'Data analysis (EDA, PCA, correlation), random variables and distributions (Normal, Poisson, lognormal, exponential, Pareto), statistical inference (MLE, confidence intervals, hypothesis tests, Cramér-Rao bound)',
  'CS1B':'Linear and multiple regression (OLS, diagnostics, model selection), GLMs (Poisson and gamma with log/reciprocal link), deviance, Bayesian inference with conjugate priors, credibility theory (Bühlmann)',
  'CB1':'Corporate governance (agency problem, audit), sources of finance (debt, equity, derivatives, tax shield), capital structure (MM, trade-off, pecking order), project appraisal (NPV, IRR, CAPM, WACC), financial accounting (income statement, balance sheet, ratios)',
};

const R_TOPICS = [
  'simple linear regression with model summary and diagnostics',
  'multiple linear regression with stepwise model selection',
  'Poisson GLM for insurance claim frequency with log-link and offset',
  'Gamma GLM for claim severity with reciprocal or log link',
  'nested GLM comparison using deviance and AIC',
  'bootstrapping a confidence interval for the mean',
  'Bayesian posterior calculation with conjugate prior (Poisson-Gamma)',
  'principal component analysis (PCA) with scree plot',
  'chi-squared goodness-of-fit test for a Poisson distribution',
  'maximum likelihood estimation using optim()',
  'correlation analysis: Pearson and Spearman on actuarial data',
  'one-sample and two-sample t-tests on insurance data',
];

async function callGemini(prompt){
  const key=loadAIKey();
  if(!key) throw new Error('NO_KEY');
  const resp=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      contents:[{parts:[{text:prompt}]}],
      generationConfig:{maxOutputTokens:1800,temperature:0.7}
    })
  });
  if(!resp.ok){
    const err=await resp.json().catch(()=>({}));
    throw new Error(err.error?.message||`API error ${resp.status}`);
  }
  const data=await resp.json();
  return data.candidates[0].content.parts[0].text;
}

function parseJSON(raw){
  let s=raw.replace(/```json\n?|\n?```|```/g,'').trim();
  // Extract just the JSON object
  const start=s.indexOf('{');
  const end=s.lastIndexOf('}');
  if(start!==-1&&end!==-1) s=s.slice(start,end+1);
  try{
    return JSON.parse(s);
  }catch(e){
    // Fix unescaped backslashes (LaTeX: \delta, \mu, \frac etc.)
    s=s.replace(/\\(?!["\\/bfnrtu0-9])/g,'\\\\');
    try{
      return JSON.parse(s);
    }catch(e2){
      // Fix literal newlines inside JSON string values
      s=s.replace(/("(?:[^"\\]|\\.)*")|(\n)/g,(m,str,nl)=>str?str:' ');
      return JSON.parse(s);
    }
  }
}

window.generateWrittenQ=async function(){
  if(state.aiGenerating)return;
  if(!loadAIKey()){state.showKeyModal=true;render();return;}
  const allMods=['CM1A','CM1B','CS1A','CS1B','CB1'];
  // Build list of modules that have at least one ticked subtopic
  const tickedMods=allMods.filter(m=>{
    const modCodes=m==='CS1B'?['CS1A','CS1B']:[m];
    return CARDS.some(c=>modCodes.includes(c.module)&&pool[c.sub]);
  });
  const candidateMods=tickedMods.length>0?tickedMods:allMods;
  const mod=(state.module==='ALL'||state.module==='CS1B')?candidateMods[Math.floor(Math.random()*candidateMods.length)]:state.module;
  const ctx=MODULE_CONTEXT[mod]||'Actuarial science';
  const modObj=MODULES.find(m=>m.id===mod);
  const color=modObj?modObj.color:'#3D6FD1';
  state.aiGenerating=true;state.aiGenError='';render();
  try{
    const raw=await callGemini(
      `You are an IFoA actuarial exam question writer for the ${mod} module.\n\nSyllabus content: ${ctx}\n\nGenerate one written practice question at IFoA past-paper standard. Requirements:\n- Structure the question with labelled parts: (i), (ii), (iii) etc., each with its own mark allocation in square brackets e.g. [2 marks]\n- Include a brief scenario/context at the top before the parts\n- Require written answers: definitions, derivations, explanations or short calculations\n- Use precise actuarial notation throughout\n- For ALL mathematical expressions use LaTeX with $ delimiters: inline math as $...$ and display equations as $$...$$\n- Examples: write $\\mu_i$ not mu_i, write $\\ln(\\mu_i) = \\beta_0 + \\beta_1 x_i$ not ln(mu), write $Y_i \\sim \\text{Poisson}(\\mu_i)$ not Y~Poisson\n\nReturn ONLY a valid JSON object (no markdown fences, no explanation outside the JSON):\n{"topic":"<short topic name>","marks":<total integer marks>,"stem":"<full past-paper style question with parts (i)(ii) etc and mark allocations>","model":"<model answer with clear part headings matching the question parts, full working, and LaTeX math using $ delimiters>"}`
    );
    const q=parseJSON(raw);
    const aiQ={module:mod,sub:'ai',chip:color,code:mod,topic:q.topic||'AI Generated',marks:q.marks||5,stem:q.stem,model:q.model,ai:true};
    if(!state.paDeck||state.paDeck.length===0) buildDecks();
    state.paDeck.unshift(aiQ);
    state.paIndex=0;state.paText='';state.paStatus='idle';state.paVerdict=null;state.paPreview=false;
    // QW-7: start countdown for new AI question
    state.paQStartTime=Date.now();state.paQDuration=Math.round(aiQ.marks*1.8)*60;
  }catch(e){
    if(e.message==='NO_KEY') state.showKeyModal=true;
    else state.aiGenError=e.message||'Generation failed';
  }
  state.aiGenerating=false;render();
};

window.generateRQ=async function(){
  if(state.aiGenerating)return;
  if(!loadAIKey()){state.showKeyModal=true;render();return;}
  const topic=R_TOPICS[Math.floor(Math.random()*R_TOPICS.length)];
  state.aiGenerating=true;state.aiGenError='';render();
  try{
    const raw=await callGemini(
      `You are an IFoA CS1 exam question writer.\n\nGenerate one R coding practice question on: "${topic}".\n\nRequirements:\n- Small realistic actuarial dataset (6-12 rows, 2-4 columns)\n- Solvable in R in 5-10 minutes\n- The setup R code must create all required variables\n- Starter code should have the structure with comments but leave key lines blank\n- Model answer should be complete, runnable R code\n\nReturn ONLY a valid JSON object (no markdown, no code fences, no explanation):\n{"topic":"<short topic>","marks":<4-6>,"prompt":"<clear question with any context>","setup":"<complete R code creating dataset variables>","starter":"<skeleton R code with comments showing structure>","hint":"<one concise hint>","model":"<complete working R solution>"}`
    );
    const q=parseJSON(raw);
    const preview=extractPreview(q.setup);
    state.aiRQuestions.unshift({sub:'ai',topic:q.topic||topic,marks:q.marks||5,prompt:q.prompt,setup:q.setup,starter:q.starter,hint:q.hint,model:q.model,preview,ai:true});
    state.rIndex=0;state.rCode=null;state.rOutput=[];state.rImages=[];state.rRan=false;state.showHint=false;state.showModel=false;
  }catch(e){
    if(e.message==='NO_KEY') state.showKeyModal=true;
    else state.aiGenError=e.message||'Generation failed';
  }
  state.aiGenerating=false;render();
};

function extractPreview(setup){
  if(!setup) return {cols:['data'],rows:[['(run setup to see)']]};
  // Try to extract variable names from assignment lines
  const vars=(setup.match(/^(\w+)\s*<-/gm)||[]).map(m=>m.replace(/\s*<-.*/,'')).filter(Boolean);
  if(!vars.length) return {cols:['setup'],rows:[['(run to see data)']]};
  return {cols:vars.slice(0,4),rows:[['R setup creates: '+vars.join(', ')]]};
}

window.openKeyModal=function(){state.showKeyModal=true;render();};
window.closeKeyModal=function(){state.showKeyModal=false;render();};
window.submitKeyModal=function(){
  const inp=document.getElementById('ai-key-input');
  if(inp&&inp.value.trim()) saveAIKey(inp.value.trim());
  state.showKeyModal=false;render();
};

function renderAIKeyModal(){
  const hasKey=!!loadAIKey();
  return `<div class="modal-overlay" onclick="closeKeyModal()">
    <div class="modal-box" onclick="event.stopPropagation()" style="width:420px">
      <div class="modal-title">Google Gemini API Key <span style="font-size:12px;font-weight:500;color:#2E9C8E;background:#F0FAF8;padding:2px 8px;border-radius:4px;margin-left:4px">Free</span></div>
      <div class="text-sm text-secondary mb-8">Get a free key at <strong>aistudio.google.com</strong> → "Get API key". No credit card required.</div>
      <div class="text-sm text-secondary mb-16">Your key is saved only in your browser's local storage.</div>
      <div class="mb-20">
        <label class="form-label">API Key ${hasKey?'<span style="color:#2E9C8E">(saved)</span>':''}</label>
        <input id="ai-key-input" type="password" value="${escHtml(loadAIKey())}" placeholder="AIzaSy…" style="font-family:'JetBrains Mono',monospace;font-size:12.5px;border:1px solid #E8EBF0;border-radius:8px;padding:9px 12px;width:100%;outline:none;color:#1B2330;background:#FAFBFC">
      </div>
      <div class="flex gap-8">
        <button class="btn btn-ghost" style="flex:1" onclick="closeKeyModal()">Cancel</button>
        <button class="btn btn-primary" style="flex:1" onclick="submitKeyModal()">Save &amp; close</button>
      </div>
    </div>
  </div>`;
}

// ========================
// EXPORT / IMPORT
// ========================
window.exportData = function() {
  const payload = {
    mastery, pool,
    planData: state.planData,
    studyStats,
    examDate: state.examDate,
    dailyGoal: state.dailyGoal,
    chipDone: state.chipDone,
    exportedAt: new Date().toISOString(),
    version: 2,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tabula-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

window.triggerImport = function() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json';
  inp.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.mastery) { mastery = data.mastery; saveMastery(); }
        if (data.pool) { pool = data.pool; savePool(); }
        if (data.planData) { state.planData = data.planData; savePlan(state.planData); }
        if (data.studyStats) { studyStats = data.studyStats; saveStudyStats(); }
        if (data.examDate) { state.examDate = data.examDate; saveExamDate(); }
        if (typeof data.dailyGoal === 'number') { state.dailyGoal = data.dailyGoal; saveExamDate(); }
        if (data.chipDone) { state.chipDone = data.chipDone; saveChipDone(); }
        alert('Backup restored successfully.');
        render();
      } catch(err) {
        alert('Import failed: invalid backup file.');
      }
    };
    reader.readAsText(file);
  };
  inp.click();
};

// ========================
// DANGER ZONE + OVERDUE ALERTS
// ========================
function renderDangerZone() {
  const rows = [];
  SYLLABUS.forEach(course => {
    course.topics.forEach(topic => {
      topic.subs.forEach(sub => {
        if (!pool[sub.id]) return;
        const m = mastery[sub.id];
        const pct = m && m.seen > 0 ? Math.round(m.good / m.seen * 100) : (m ? 0 : -1);
        rows.push({id: sub.id, name: sub.name, num: sub.num, course: course.code, color: course.color, pct, seen: m?.seen || 0});
      });
    });
  });
  rows.sort((a,b) => (a.pct === -1 ? -999 : a.pct) - (b.pct === -1 ? -999 : b.pct));
  const weakest = rows.slice(0, 5);
  if (weakest.length === 0) return '';
  return `
  <div class="card mb-16">
    <div class="flex items-center justify-between mb-12">
      <div style="font-size:14px;font-weight:600;color:#C94040">⚠ Danger Zone — 5 weakest sub-topics</div>
      <button class="btn btn-ghost btn-sm" onclick="go('progress')">All progress →</button>
    </div>
    ${weakest.map(s => `
      <div class="danger-row" onclick="drillSubTopic('${s.id}')" style="cursor:pointer" title="Drill this topic">
        <span class="badge" style="background:${s.color}18;color:${s.color};font-size:10px;flex-shrink:0;white-space:nowrap">${s.course} ${s.num}</span>
        <div style="flex:1;font-size:12.5px;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escHtml(s.name)}</div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <span style="font-size:13px;font-weight:700;color:${s.pct < 0 ? '#B0B7C3' : s.pct < 40 ? '#C94040' : '#C97B30'}">${s.pct < 0 ? 'Unseen' : s.pct + '%'}</span>
          <span style="font-size:11px;color:#8A93A2">▶</span>
        </div>
      </div>`).join('')}
  </div>`;
}

// Drill a single sub-topic: store target sub so buildDecks() can filter
window.drillSubTopic = function(subId) {
  let modId = 'ALL';
  for (const course of SYLLABUS) {
    for (const topic of course.topics) {
      if (topic.subs.some(s => s.id === subId)) {
        const cm1TopicIdx = course.code === 'CM1' ? course.topics.indexOf(topic) : -1;
        if (course.code === 'CM1') modId = cm1TopicIdx < 2 ? 'CM1A' : 'CM1B';
        else modId = course.code;
        break;
      }
    }
    if (modId !== 'ALL') break;
  }
  const matchingCards = CARDS.filter(c=>c.sub===subId&&pool[c.sub]);
  if(matchingCards.length===0){
    showToast(`No flashcards for this topic yet`);
    return;
  }
  state.module = modId;
  state.drillSub = subId; // buildDecks reads this to filter
  go('flashcards');        // calls buildDecks() → picks up drillSub
  showToast(`Drilling: ${subId.replace(/-/g,' ')} (${state.fcDeck.length} card${state.fcDeck.length!==1?'s':''})`);
};

// Auto-fill the current week's plan based on weakest modules
window.autoSuggestPlan = function() {
  // Rank modules by mastery (ascending — lowest first)
  const modMastery = MODULES.map(m => ({
    modId: m.id, label: m.label, color: m.color,
    pct: moduleCardMastery(m.id)
  })).sort((a,b) => a.pct - b.pct);

  const plan = loadPlanForWeek(state.planWeekOffset || 0);
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  // Assign sessions: rotate through weakest 3 modules, skip Sunday
  const priorities = modMastery.slice(0, 3);
  let qi = 0;
  plan.forEach((day, i) => {
    if (i === 6) return; // leave Sunday free
    if (day.chips && day.chips.length > 0) return; // don't overwrite existing chips
    const mod = priorities[qi % priorities.length];
    qi++;
    const type = (qi % 2 === 0) ? 'practice' : 'flashcards';
    day.chips = [{
      label: `${mod.label.split(' ')[0]} · ${type === 'flashcards' ? 'Flashcards' : 'Written'}`,
      color: mod.color,
      modId: mod.modId,
      type
    }];
  });
  savePlanForWeek(plan, state.planWeekOffset || 0);
  state.planData = plan;
  showToast('Plan filled based on your weakest modules');
  render();
};

function renderOverdueAlerts() {
  const now = Date.now();
  const overdue = [];
  SYLLABUS.forEach(course => {
    course.topics.forEach(topic => {
      topic.subs.forEach(sub => {
        if (!pool[sub.id]) return;
        const m = mastery[sub.id];
        const days = m?.lastSeen ? Math.floor((now - new Date(m.lastSeen).getTime()) / 86400000) : 999;
        if (days >= 14) overdue.push({name: sub.name, course: course.code, color: course.color, days, id: sub.id});
      });
    });
  });
  overdue.sort((a,b) => b.days - a.days);
  const top = overdue.slice(0, 3);
  if (top.length === 0) return '';
  return `
  <div class="overdue-alert mb-16">
    <div style="font-size:13px;font-weight:600;color:#C94040;margin-bottom:8px">📣 Topics overdue for review</div>
    ${top.map(t => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
        <span class="badge" style="background:${t.color}18;color:${t.color};font-size:10px;flex-shrink:0">${t.course}</span>
        <span style="font-size:12.5px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(t.name)}</span>
        <span style="font-size:11.5px;color:#C94040;flex-shrink:0;font-weight:600">${t.days >= 999 ? 'Never' : t.days + 'd ago'}</span>
      </div>`).join('')}
    <button class="btn btn-sm" style="background:#FEE2DC;color:#C94040;border:none;margin-top:8px" onclick="go('flashcards')">Review now →</button>
  </div>`;
}

// ========================
// EXAM TIMER MODE
// ========================
const EXAM_TOTAL_MINS = {CM1A:200,CM1B:200,CS1A:105,CS1B:105,CB1:180,ALL:600};
let examTimerInterval = null;

window.toggleExamMode = function() {
  state.examMode = !state.examMode;
  if (state.examMode) {
    const mins = EXAM_TOTAL_MINS[state.module] || 180;
    state.examModeEnd = Date.now() + mins * 60 * 1000;
    examTimerInterval = setInterval(() => {
      if (!state.examMode) { clearInterval(examTimerInterval); return; }
      const left = Math.max(0, Math.round((state.examModeEnd - Date.now()) / 1000));
      const el = document.getElementById('exam-timer-display');
      if (el) {
        el.textContent = fmtExamTime(left);
        el.className = 'exam-timer ' + (left < 300 ? 'danger' : left < 900 ? 'warn' : 'ok');
      }
      if (left === 0) { clearInterval(examTimerInterval); }
    }, 1000);
  } else {
    clearInterval(examTimerInterval);
    state.examModeEnd = null;
  }
  render();
};

function fmtExamTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function renderExamTimer() {
  if (!state.examMode || !state.examModeEnd) return '';
  const left = Math.max(0, Math.round((state.examModeEnd - Date.now()) / 1000));
  const cls = left < 300 ? 'danger' : left < 900 ? 'warn' : 'ok';
  return `<div style="display:flex;align-items:center;gap:10px;background:#1B2330;border-radius:10px;padding:10px 16px;margin-bottom:16px">
    <span style="font-size:13px;font-weight:600;color:#8A93A2">🕐 Exam mode</span>
    <span id="exam-timer-display" class="exam-timer ${cls}">${fmtExamTime(left)}</span>
    <span style="flex:1;font-size:12px;color:#585B70">remaining — ${EXAM_TOTAL_MINS[state.module]||180} min total</span>
    <button onclick="toggleExamMode()" style="font-size:12px;color:#8A93A2;background:transparent;border:1px solid #313244;border-radius:6px;padding:4px 10px;cursor:pointer;font-family:inherit">End</button>
  </div>`;
}

// ========================
// PLANNER WEEK NAVIGATION
// ========================
function weekKey(offset) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay()+6)%7) + offset*7);
  monday.setHours(0,0,0,0);
  return monday.toISOString().slice(0,10);
}

function loadPlanForWeek(offset) {
  const key = 'tabula_plan_v2_' + weekKey(offset);
  try {
    const s = localStorage.getItem(key);
    if (s) {
      const plan = JSON.parse(s);
      // Always refresh date numbers to match the actual week
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay()+6)%7) + offset*7);
      plan.forEach((day, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        day.date = String(d.getDate());
        day.monthYear = d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
      });
      return plan;
    }
  } catch(e) {}
  // Build default plan for this week
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay()+6)%7) + offset*7);
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const defaultChips = [
    [{label:'CB1 · Flashcards',color:'#6B5DD3',modId:'CB1',type:'flashcards'}],
    [{label:'CM1A · Flashcards',color:'#3D6FD1',modId:'CM1A',type:'flashcards'},{label:'CS1A · Written',color:'#2E9C8E',modId:'CS1A',type:'practice'}],
    [{label:'CS1A · Written',color:'#2E9C8E',modId:'CS1A',type:'practice'}],
    [{label:'CM1B · Written',color:'#3D6FD1',modId:'CM1B',type:'practice'}],
    [{label:'CM1A · Flashcards',color:'#3D6FD1',modId:'CM1A',type:'flashcards'},{label:'CS1A · Written',color:'#2E9C8E',modId:'CS1A',type:'practice'},{label:'CB1 · Written',color:'#6B5DD3',modId:'CB1',type:'practice'}],
    [{label:'Review',color:'#7B8595',modId:null,type:null}],
    [],
  ];
  return days.map((day, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {day, date: String(d.getDate()), monthYear: d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'}), chips: (offset === 0 ? defaultChips[i] : [])};
  });
}

function savePlanForWeek(plan, offset) {
  const key = 'tabula_plan_v2_' + weekKey(offset);
  localStorage.setItem(key, JSON.stringify(plan));
}

// ========================
// KEYBOARD SHORTCUTS
// ========================
document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // QW-4: S to start studying from Dashboard
  if (state.view === 'home' && (e.key === 's' || e.key === 'S')) {
    e.preventDefault(); go('flashcards'); return;
  }
  if (state.view === 'flashcards') {
    const cards = filteredCards();
    if (state.fcIndex >= cards.length) return;
    if ((e.key === ' ' || e.key === 'ArrowRight') && !state.fcFlipped) {
      e.preventDefault(); flipCard(); return;
    }
    if (state.fcFlipped) {
      if (e.key === '1') { e.preventDefault(); rateCard('again'); }
      if (e.key === '2') { e.preventDefault(); rateCard('hard'); }
      if (e.key === '3') { e.preventDefault(); rateCard('good'); }
      if (e.key === '4') { e.preventDefault(); rateCard('easy'); }
    }
  }
});

render();
