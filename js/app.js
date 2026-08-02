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
    [{label:'CM1 · Flashcards',color:'#3D6FD1',modId:'CM1',type:'flashcards'},{label:'CS1 · Flashcards',color:'#2E9C8E',modId:'CS1',type:'flashcards'}],
    [{label:'CS1 · Flashcards',color:'#2E9C8E',modId:'CS1',type:'flashcards'}],
    [{label:'CM1 · Flashcards',color:'#3D6FD1',modId:'CM1',type:'flashcards'}],
    [{label:'CM1 · Flashcards',color:'#3D6FD1',modId:'CM1',type:'flashcards'},{label:'CB1 · Flashcards',color:'#6B5DD3',modId:'CB1',type:'flashcards'}],
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
  module:'ALL',
  fcIndex:0, fcFlipped:false, fcDeck:[], fcPool:[], fcWeakQueue:[], fcReviewRound:false, fcTotalReviewed:0, fcSessionSize:null, fcUndo:null,
  planEdit:false, planData:null, examDate:'2026-09-22', dailyGoal:45,
  addingTo:null, addMod:'CM1', addType:'Flashcards', chipDone:{},
  expandedTopics:{},
  expandedCourses:{CM1:true, CS1:true, CB1:true},
  planWeekOffset:0,
  drillSub: null,
  theme:'auto',
};

// ---- Theme / dark mode (client-side only) ----
function loadTheme(){try{return localStorage.getItem('tabula_theme_v1')||'auto';}catch(e){return 'auto';}}
function themeIsDark(t){return t==='dark'||(t==='auto'&&window.matchMedia&&matchMedia('(prefers-color-scheme:dark)').matches);}
function applyTheme(t){
  const root=document.documentElement;
  if(t==='auto')root.removeAttribute('data-theme'); else root.setAttribute('data-theme',t);
  const meta=document.querySelector('meta[name=theme-color]');
  if(meta)meta.setAttribute('content',themeIsDark(t)?'#12161C':'#3D6FD1');
}
window.cycleTheme=function(){
  const order=['auto','light','dark'];
  state.theme=order[(order.indexOf(state.theme)+1)%3];
  try{localStorage.setItem('tabula_theme_v1',state.theme);}catch(e){}
  applyTheme(state.theme);
  render();
  showToast('Theme: '+state.theme);
};
function themeIcon(t){return t==='dark'?'🌙':t==='light'?'☀️':'🌗';}

// Pool (checked subtopic ids)
function loadPool(){
  try{
    const s=localStorage.getItem('tabula_pool_v1');
    if(s)return JSON.parse(s);
  }catch(e){}
  // Default: nothing checked — a fresh user ticks the sections they've covered
  return {};
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
  recordDailySnapshot();
  checkMilestones();
}

// Study statistics (streak, daily card count, written questions answered)
function loadStudyStats(){
  try{const s=localStorage.getItem('tabula_stats_v1');if(s){const d=JSON.parse(s);if(!d.weekCards)d.weekCards=[0,0,0,0,0,0,0];if(!d.weekStart)d.weekStart='';if(!d.goalToastDate)d.goalToastDate='';return d;}}catch(e){}
  return {streak:0,lastStudyDate:'',todayCards:0,todayDate:'',writtenAnswered:0,weekCards:[0,0,0,0,0,0,0],weekStart:'',goalToastDate:''};
}
function saveStudyStats(){localStorage.setItem('tabula_stats_v1',JSON.stringify(studyStats));}
let studyStats=loadStudyStats();

// ============================================================
// ENHANCEMENTS (all client-side — no backend, single device)
// ============================================================

// --- Long-term trend history: one snapshot per calendar day ---
function loadHistory(){try{const s=localStorage.getItem('tabula_history_v1');if(s)return JSON.parse(s);}catch(e){}return [];}
let studyHistory=loadHistory();
function saveHistory(){try{localStorage.setItem('tabula_history_v1',JSON.stringify(studyHistory.slice(-180)));}catch(e){}}
function recordDailySnapshot(){
  const today=new Date().toISOString().slice(0,10);
  const snap={date:today,mastery:computeOverallMastery(),reviewed:totalCardsSeen(),cards:studyStats.todayCards||0,readiness:examReadiness()};
  const last=studyHistory[studyHistory.length-1];
  if(last&&last.date===today)studyHistory[studyHistory.length-1]=snap;
  else studyHistory.push(snap);
  saveHistory();
}

// --- Milestones / badges ---
const MILESTONES=[
  {id:'first-card',name:'First card',icon:'🎯',test:()=>totalCardsSeen()>=1},
  {id:'cards-50',name:'50 cards',icon:'🃏',test:()=>totalCardsSeen()>=50},
  {id:'cards-250',name:'250 cards',icon:'📚',test:()=>totalCardsSeen()>=250},
  {id:'cards-1000',name:'1,000 cards',icon:'🏆',test:()=>totalCardsSeen()>=1000},
  {id:'streak-3',name:'3-day streak',icon:'🔥',test:()=>studyStats.streak>=3},
  {id:'streak-7',name:'7-day streak',icon:'⚡',test:()=>studyStats.streak>=7},
  {id:'streak-30',name:'30-day streak',icon:'🌟',test:()=>studyStats.streak>=30},
  {id:'cards-500',name:'500 cards',icon:'📖',test:()=>totalCardsSeen()>=500},
  {id:'goal-hit',name:'Daily goal',icon:'✅',test:()=>state.dailyGoal>0&&(studyStats.todayCards||0)>=state.dailyGoal},
  {id:'mastery-50',name:'Halfway there',icon:'📈',test:()=>computeOverallMastery()>=50},
  {id:'mastery-80',name:'Exam ready',icon:'🎓',test:()=>computeOverallMastery()>=80},
  {id:'module-80',name:'Module master',icon:'💎',test:()=>MODULES.some(m=>moduleCardMastery(m.id)>=80)},
];
function loadBadges(){try{const s=localStorage.getItem('tabula_badges_v1');if(s)return JSON.parse(s);}catch(e){}return {};}
let badges=loadBadges();
function saveBadges(){try{localStorage.setItem('tabula_badges_v1',JSON.stringify(badges));}catch(e){}}
function checkMilestones(){
  MILESTONES.forEach(ms=>{
    if(!badges[ms.id]&&ms.test()){badges[ms.id]=new Date().toISOString();saveBadges();showToast(ms.icon+' '+ms.name+' unlocked!');}
  });
}

// --- Exam readiness & pacing ---
function poolCoveragePct(){
  const pooled=CARDS.filter(c=>pool[c.sub]);
  if(!pooled.length)return 0;
  const seen=pooled.filter(c=>{const m=mastery[c.sub];return m&&m.seen>0;}).length;
  return Math.round(seen/pooled.length*100);
}
function examReadiness(){
  const cov=poolCoveragePct();
  const mast=computeOverallMastery();
  return Math.max(0,Math.min(100,Math.round(cov*0.4+mast*0.6)));
}
function cardsPerDayNeeded(){
  const unseen=CARDS.filter(c=>pool[c.sub]).filter(c=>{const m=mastery[c.sub];return !m||m.seen<1;}).length;
  return Math.ceil(unseen/Math.max(1,daysToExam()));
}
function daysSinceStudy(){
  if(!studyStats.lastStudyDate)return 999;
  const last=new Date(studyStats.lastStudyDate);const now=new Date();now.setHours(0,0,0,0);last.setHours(0,0,0,0);
  return Math.round((now-last)/86400000);
}

// --- Data durability: backup age + persistent storage ---
function loadLastBackup(){try{return +localStorage.getItem('tabula_lastbackup_v1')||0;}catch(e){return 0;}}
function markBackup(){try{localStorage.setItem('tabula_lastbackup_v1',String(Date.now()));}catch(e){}}
function daysSinceBackup(){const t=loadLastBackup();return t?Math.floor((Date.now()-t)/86400000):999;}

// --- Calendar reminders (.ics) — the reliable no-backend way to get an
//     iPhone notification: the OS Calendar/Reminders app does the alerting ---
function icsEsc(s){return String(s).replace(/([\\,;])/g,'\\$1').replace(/\n/g,'\\n');}
window.addStudyReminder=function(){
  const pad=n=>String(n).padStart(2,'0');
  const now=new Date();
  const dtstamp=now.getUTCFullYear()+pad(now.getUTCMonth()+1)+pad(now.getUTCDate())+'T'+pad(now.getUTCHours())+pad(now.getUTCMinutes())+pad(now.getUTCSeconds())+'Z';
  const start=now.getFullYear()+pad(now.getMonth()+1)+pad(now.getDate());
  let ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Tabula//Study//EN\r\nCALSCALE:GREGORIAN\r\n';
  ics+='BEGIN:VEVENT\r\nUID:tabula-daily-'+start+'@tabula\r\nDTSTAMP:'+dtstamp+'\r\nDTSTART:'+start+'T180000\r\nDURATION:PT30M\r\nRRULE:FREQ=DAILY\r\nSUMMARY:'+icsEsc('📚 Tabula study session')+'\r\nDESCRIPTION:'+icsEsc('Daily actuarial revision — flashcards')+'\r\nBEGIN:VALARM\r\nTRIGGER:PT0S\r\nACTION:DISPLAY\r\nDESCRIPTION:'+icsEsc('Time to study')+'\r\nEND:VALARM\r\nEND:VEVENT\r\n';
  if(state.examDate){
    const ex=state.examDate.replace(/-/g,'');
    ics+='BEGIN:VEVENT\r\nUID:tabula-exam@tabula\r\nDTSTAMP:'+dtstamp+'\r\nDTSTART;VALUE=DATE:'+ex+'\r\nSUMMARY:'+icsEsc('🎓 IFoA exam day')+'\r\nBEGIN:VALARM\r\nTRIGGER:-P7D\r\nACTION:DISPLAY\r\nDESCRIPTION:'+icsEsc('Exam in one week')+'\r\nEND:VALARM\r\nEND:VEVENT\r\n';
  }
  ics+='END:VCALENDAR\r\n';
  const blob=new Blob([ics],{type:'text/calendar'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='tabula-study-reminders.ics';document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  showToast('Reminder downloaded — open it to add to your calendar');
};

function showToast(msg){
  const t=document.createElement('div');
  t.textContent=msg;
  t.style.cssText='position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:#1B2330;color:#fff;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.25);opacity:1;transition:opacity .4s';
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),400);},2500);
}


// Compute overall mastery across all subtopics (unseen subtopics count as 0%)
function computeOverallMastery(){
  const allSubs=[];
  SYLLABUS.forEach(c=>c.topics.forEach(t=>t.subs.forEach(s=>allSubs.push(s.id))));
  if(!allSubs.length) return 0;
  return Math.round(allSubs.reduce((a,id)=>a+subMastery(id),0)/allSubs.length);
}

// True once the student has actually studied something. Gates the "overdue"
// and "weak area" panels so a brand-new user isn't told they're already behind
// on day one — progress is still tracked from the very first card/question.
function totalCardsSeen(){return Object.values(mastery).reduce((a,m)=>a+(m.seen||0),0);}
function hasStudied(){return totalCardsSeen()>0 || (studyStats.writtenAnswered||0)>0;}

// Compute mastery for a module from card rating history (unseen subtopics count as 0%)
function moduleCardMastery(modId){
  const subs=[...new Set(CARDS.filter(c=>examOf(c.module)===modId).map(c=>c.sub))];
  if(!subs.length) return 0;
  return Math.round(subs.reduce((a,id)=>a+subMastery(id),0)/subs.length);
}

// Count cards available for a module (in pool)
function moduleCardsDue(modId){
  return CARDS.filter(c=>examOf(c.module)===modId&&pool[c.sub]).length;
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
  return {examDate:'2026-09-22',dailyGoal:45,sessionSize:null};
}
function saveExamDate(){localStorage.setItem('tabula_examdate_v1',JSON.stringify({examDate:state.examDate,dailyGoal:state.dailyGoal,sessionSize:state.fcSessionSize}));}

// Init
(function init(){
  const ed=loadExamDate();
  state.examDate=ed.examDate;
  state.dailyGoal=ed.dailyGoal;
  state.fcSessionSize=(typeof ed.sessionSize==='number'&&ed.sessionSize>0)?ed.sessionSize:null;
  state.theme=loadTheme();applyTheme(state.theme);
  if(window.matchMedia)matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>{if(state.theme==='auto'){applyTheme('auto');render();}});
  // Ask the browser to keep our localStorage from being evicted (no prompt on
  // most mobile browsers) — the closest thing to durability without a server.
  try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist();}catch(e){}
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

// How many cards to review before the weak-card review round. Defaults to the
// daily goal ("same number as the daily target") but can be set independently
// on the flashcards screen.
function fcSessionCap(){
  const n=(typeof state.fcSessionSize==='number'&&state.fcSessionSize>0)?state.fcSessionSize:state.dailyGoal;
  return Math.max(1,n||20);
}

function cardIsDue(c){
  const m=mastery[c.sub];
  if(!m||!m.nextReview)return true;
  const t=new Date();t.setHours(0,0,0,0);
  return new Date(m.nextReview)<=t;
}

function buildDecks(){
  let cards=CARDS;
  if(state.drillSub){cards=cards.filter(c=>c.sub===state.drillSub);state.drillSub=null;}
  else if(state.module!=='ALL') cards=cards.filter(c=>examOf(c.module)===state.module);
  cards=cards.filter(c=>pool[c.sub]);
  cards=shuffle(cards);
  // SM-2 ordering: cards due today (nextReview ≤ today) come first, sorted most-overdue first;
  // cards not yet due follow, sorted by soonest upcoming review date.
  const todaySM=new Date();todaySM.setHours(0,0,0,0);
  cards.sort((a,b)=>{
    const am=mastery[a.sub];const bm=mastery[b.sub];
    const aNxt=am?.nextReview?new Date(am.nextReview):new Date(0);
    const bNxt=bm?.nextReview?new Date(bm.nextReview):new Date(0);
    const aDue=!am?.nextReview||aNxt<=todaySM;
    const bDue=!bm?.nextReview||bNxt<=todaySM;
    if(aDue&&!bDue)return -1;
    if(!aDue&&bDue)return 1;
    if(aDue&&bDue){
      // Adaptive: among due cards, lead with your weakest (lowest mastery) topics
      const dm=subMastery(a.sub)-subMastery(b.sub);
      if(dm!==0)return dm;
    }
    return aNxt-bNxt; // most overdue first when both due; soonest next when neither due
  });
  // Keep the full eligible list for the pool counters, then cap the active deck
  // to the session size so the user only reviews as many as they chose before
  // the review round kicks in.
  state.fcPool=cards;
  state.fcDeck=cards.slice(0,fcSessionCap());
}

function filteredCards(){
  if(!state.fcDeck||state.fcDeck.length===0) buildDecks();
  return state.fcDeck;
}


// ========================
// RENDER
// ========================
// render() rebuilds app.innerHTML, so the .main scroll container is recreated and
// scroll jumps to the top. For in-place edits (ticking a subtopic, expanding a
// row) capture the scroll offset and restore it after the rebuild.
function renderKeepScroll(){
  const y=document.querySelector('.main')?.scrollTop||0;
  render();
  const nm=document.querySelector('.main');
  if(nm)nm.scrollTop=y;
}
function render(){
  const app=document.getElementById('app');
  if(!app)return;
  try{
    app.innerHTML=`
    ${renderSidebar()}
    <div class="main">
      ${renderTopbar()}
      <main class="page-content" id="main-content" role="main" tabindex="-1">
        ${renderView()}
      </main>
    </div>
    ${renderMobileNav()}
    ${state.addingTo!==null?renderAddModal():''}
  `;
  }catch(err){
    // Never white-screen: show a recoverable fallback instead of a blank app
    console.error('Render failed:',err);
    app.innerHTML=`<div style="max-width:420px;margin:60px auto;padding:24px;text-align:center;font-family:'Lexend',sans-serif">
      <div style="font-size:34px;margin-bottom:12px">😵‍💫</div>
      <div style="font-size:17px;font-weight:700;margin-bottom:8px">Something went wrong on this screen</div>
      <div style="font-size:14px;color:var(--t2);line-height:1.6;margin-bottom:20px">Your progress is saved. Try going back to the dashboard or reloading.</div>
      <button class="btn btn-primary" onclick="try{state.view='home';render()}catch(e){location.reload()}">Back to dashboard</button>
    </div>`;
    return;
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


const NAV_VIEWS=[
  {id:'home',label:'Dashboard',icon:`<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="6" height="6" rx="1.6" fill="currentColor"/><rect x="11" y="3" width="6" height="6" rx="1.6" fill="currentColor" opacity=".4"/><rect x="3" y="11" width="6" height="6" rx="1.6" fill="currentColor" opacity=".4"/><rect x="11" y="11" width="6" height="6" rx="1.6" fill="currentColor"/></svg>`},
  {id:'planner',label:'Planner',icon:`<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="3" y="4.5" width="14" height="12.5" rx="2.4" stroke="currentColor" stroke-width="1.7"/><path d="M3 8h14M7 3v3M13 3v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`},
  {id:'flashcards',label:'Flashcards',icon:`<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="5" y="5.5" width="12" height="9" rx="2.2" stroke="currentColor" stroke-width="1.7"/><path d="M3.4 8v6a2 2 0 0 0 2 2h7.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".45"/></svg>`},
  {id:'progress',label:'Progress',icon:`<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M4 16V9M10 16V4M16 16v-4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`},
];

function renderMobileNav(){
  const now=new Date();now.setHours(0,0,0,0);
  const badge=CARDS.filter(c=>pool[c.sub]).filter(c=>{const m=mastery[c.sub];return !m?.nextReview||new Date(m.nextReview)<=now;}).length;
  return `<nav class="mobile-nav" aria-label="Main navigation">
    ${NAV_VIEWS.map(v=>{const lbl=v.id==='home'?'Home':v.id==='flashcards'?'Cards':v.label;return `<div class="mobile-nav-item${state.view===v.id?' active':''}" role="button" tabindex="0" aria-label="${lbl}${v.id==='flashcards'&&badge>0?', '+badge+' due':''}"${state.view===v.id?' aria-current="page"':''} onclick="go('${v.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();go('${v.id}')}">
      <div style="position:relative;display:flex;align-items:center;justify-content:center">
        ${v.icon}
        ${v.id==='flashcards'&&badge>0?`<span class="mobile-nav-badge" aria-hidden="true">${badge}</span>`:''}
      </div>
      <span>${lbl}</span>
    </div>`;}).join('')}
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
        <div class="exam-card-days">${d} <span style="font-size:14px;font-weight:500;color:var(--t2)">days</span></div>
        <div class="exam-card-sub">${formatExamDate(state.examDate)}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="exportData()" style="flex:1;padding:7px 6px;border-radius:8px;border:1px solid var(--border);background:var(--s1);font-size:11.5px;font-weight:600;color:var(--t2);cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;transition:all .15s" onmouseover="this.style.background='var(--s2)';this.style.color='var(--t1)'" onmouseout="this.style.background='var(--s1)';this.style.color='var(--t2)'" title="Download a backup of all your progress">⬇ Backup</button>
        <button onclick="triggerImport()" style="flex:1;padding:7px 6px;border-radius:8px;border:1px solid var(--border);background:var(--s1);font-size:11.5px;font-weight:600;color:var(--t2);cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;transition:all .15s" onmouseover="this.style.background='var(--s2)';this.style.color='var(--t1)'" onmouseout="this.style.background='var(--s1)';this.style.color='var(--t2)'" title="Restore progress from a backup file">⬆ Restore</button>
      </div>
      <button onclick="addStudyReminder()" style="width:100%;margin-top:6px;padding:7px 6px;border-radius:8px;border:1px solid var(--border);background:var(--s1);font-size:11.5px;font-weight:600;color:var(--t2);cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px" title="Download a calendar file with a daily study reminder + your exam date">🔔 Add study reminder</button>
    </div>
  </div>`;
}

function formatExamDate(d){
  if(!d)return '';
  const dt=new Date(d);
  return dt.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
}

function renderTopbar(){
  const titles={home:'Dashboard',planner:'Weekly Planner',flashcards:'Flashcards',progress:'Progress'};
  const subs={home:'Good luck today — keep going!',planner:'Plan your study week',flashcards:'Spaced repetition review',progress:'Track notes coverage · controls your study pool'};
  return `<div class="topbar">
    <div>
      <div class="topbar-title">${titles[state.view]||''}</div>
      <div class="topbar-sub">${subs[state.view]||''}</div>
    </div>
    <div class="topbar-right" style="gap:12px">
      <button class="btn btn-sm btn-ghost" onclick="cycleTheme()" title="Theme: ${state.theme} (tap to change)" aria-label="Change theme, currently ${state.theme}">${themeIcon(state.theme)}</button>
      ${state.view==='flashcards'?renderModulePills():''}
    </div>
  </div>`;
}

function renderModulePills(){
  const pills=['ALL',...MODULES.map(m=>m.id)];
  return `<div style="display:flex;gap:6px;flex-wrap:wrap">
    ${pills.map(p=>{
      const mod=MODULES.find(m=>m.id===p);
      const color=mod?mod.color:'#616B7A';
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
    case 'progress': return renderProgress();
    default: return renderHome();
  }
}

// ========================
// HOME
// ========================
// First-run getting-started panel. Shown until the student logs their first
// activity, then it's replaced by the real progress/overdue widgets.
function renderWelcome(){
  return `
  <div class="card mb-16" style="border:1px solid var(--border);background:var(--tint-blue)">
    <div style="font-size:18px;font-weight:700;margin-bottom:4px">👋 Welcome to Tabula</div>
    <div style="font-size:13.5px;color:var(--t2);line-height:1.6;margin-bottom:16px">
      Your actuarial study companion. Nothing's overdue and nothing's weak yet — this
      is a clean slate. Start a session and your streak, mastery and weak areas will
      build automatically from here.
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      <button class="btn btn-primary" onclick="go('flashcards')">Start flashcards</button>
      <button class="btn btn-ghost" onclick="go('progress')">Choose your topics</button>
    </div>
    <div style="font-size:12px;color:var(--t3);margin-top:14px">${CARDS.length} flashcards ready · ${daysToExam()} days to your exam</div>
  </div>`;
}

// Exam-readiness card: blends coverage + mastery, and tells you the cards/day
// pace needed to see every topic before the exam.
function renderReadiness(){
  const r=examReadiness();
  const cov=poolCoveragePct();
  const mast=computeOverallMastery();
  const need=cardsPerDayNeeded();
  const goal=state.dailyGoal||0;
  const col=r>=70?'#2E9C8E':r>=40?'#C97B30':'#C94040';
  const circ=163.4;const fill=Math.round(r/100*circ*10)/10;
  return `
  <div class="card mb-16">
    <div class="flex items-center justify-between mb-12">
      <div style="font-size:14px;font-weight:600">Exam readiness</div>
      <div class="text-xs text-secondary">${daysToExam()} days left</div>
    </div>
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <svg width="76" height="76" viewBox="0 0 60 60" style="flex-shrink:0">
        <circle cx="30" cy="30" r="26" fill="none" style="stroke:var(--s2)" stroke-width="6"/>
        <circle cx="30" cy="30" r="26" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${fill} ${circ-fill}" transform="rotate(-90 30 30)"/>
        <text x="30" y="34" text-anchor="middle" font-size="14" font-weight="700" style="fill:var(--t1)">${r}%</text>
      </svg>
      <div style="flex:1;min-width:180px">
        <div style="display:flex;gap:18px;margin-bottom:8px">
          <div><div class="text-xs text-secondary">Coverage</div><div style="font-size:15px;font-weight:700">${cov}%</div></div>
          <div><div class="text-xs text-secondary">Mastery</div><div style="font-size:15px;font-weight:700">${mast}%</div></div>
        </div>
        <div style="font-size:12.5px;color:var(--t2)">
          ${need>0?`~<strong style="color:var(--t1)">${need}</strong> new cards/day to see every topic before your exam.`:`You've seen every topic in your pool 🎉`}
        </div>
        ${need>goal&&need>0?`<button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="adjustGoalTo(${need})">Set daily goal to ${need}</button>`:need>0?`<div style="font-size:11.5px;color:#2E9C8E;font-weight:600;margin-top:6px">✓ Goal of ${goal}/day keeps you on pace</div>`:''}
      </div>
    </div>
    <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
      <button class="btn btn-ghost btn-sm" onclick="addStudyReminder()" title="Downloads a calendar file with a daily study reminder + your exam date">🔔 Add daily reminder to calendar</button>
    </div>
  </div>`;
}

// Gentle nudges: come-back-after-a-break, and back-up-your-data.
function renderNudges(){
  let out='';
  const dsince=daysSinceStudy();
  if(dsince>=2&&dsince<999){
    out+=`<div class="card mb-16" style="border:1px solid var(--border);background:var(--tint-amber);display:flex;align-items:center;gap:12px">
      <span style="font-size:22px">👋</span>
      <div style="flex:1"><div style="font-size:13.5px;font-weight:600">Welcome back — it's been ${dsince} days</div><div style="font-size:12px;color:var(--t2)">A quick session keeps your memory and your streak alive.</div></div>
      <button class="btn btn-primary btn-sm" onclick="go('flashcards')">Study now</button>
    </div>`;
  }
  if(daysSinceBackup()>=14){
    out+=`<div class="card mb-16" style="display:flex;align-items:center;gap:12px">
      <span style="font-size:20px">💾</span>
      <div style="flex:1"><div style="font-size:13.5px;font-weight:600">Back up your progress</div><div style="font-size:12px;color:var(--t2)">Your data lives only on this device — save a backup so a cleared cache can't wipe it.</div></div>
      <button class="btn btn-ghost btn-sm" onclick="exportData()">Backup now</button>
    </div>`;
  }
  return out;
}

// Mastery/readiness trend from the daily snapshots.
function renderTrends(){
  const h=studyHistory.slice(-30);
  if(h.length<2)return `<div class="card mb-16"><div style="font-size:14px;font-weight:600;margin-bottom:6px">Progress over time</div><div class="text-sm text-secondary">Study on more than one day and your mastery trend will chart here.</div></div>`;
  const W=560,H=120,pad=8;
  const xs=i=>pad+i*((W-2*pad)/(h.length-1));
  const ys=v=>H-pad-(v/100)*(H-2*pad);
  const line=key=>h.map((s,i)=>`${i?'L':'M'}${xs(i).toFixed(1)},${ys(s[key]||0).toFixed(1)}`).join(' ');
  const delta=(h[h.length-1].mastery||0)-(h[0].mastery||0);
  return `
  <div class="card mb-16">
    <div class="flex items-center justify-between mb-12">
      <div style="font-size:14px;font-weight:600">Progress over time</div>
      <div class="text-xs" style="color:${delta>=0?'#2E9C8E':'#C94040'};font-weight:600">${delta>=0?'▲':'▼'} ${Math.abs(delta)}% mastery · ${h.length} days</div>
    </div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none" style="display:block;height:120px">
      <path d="${line('readiness')}" fill="none" style="stroke:#C97B30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>
      <path d="${line('mastery')}" fill="none" style="stroke:#3D6FD1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <div style="display:flex;gap:16px;margin-top:8px;font-size:11.5px;color:var(--t2)">
      <span><span style="display:inline-block;width:12px;height:3px;background:#3D6FD1;vertical-align:middle;border-radius:2px"></span> Mastery</span>
      <span><span style="display:inline-block;width:12px;height:3px;background:#C97B30;vertical-align:middle;border-radius:2px"></span> Readiness</span>
    </div>
  </div>`;
}

// Local achievements — motivation without any social layer.
function renderMilestones(){
  const earned=MILESTONES.filter(m=>badges[m.id]).length;
  return `
  <div class="card mb-16">
    <div class="flex items-center justify-between mb-12">
      <div style="font-size:14px;font-weight:600">Milestones</div>
      <div class="text-xs text-secondary">${earned} / ${MILESTONES.length} unlocked</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px">
      ${MILESTONES.map(m=>{const got=!!badges[m.id];return `
        <div style="text-align:center;padding:10px 6px;border:1px solid var(--border);border-radius:10px;opacity:${got?1:0.45};background:${got?'var(--tint-teal)':'transparent'}">
          <div style="font-size:22px;filter:${got?'none':'grayscale(1)'}">${m.icon}</div>
          <div style="font-size:11px;font-weight:600;margin-top:3px;color:var(--t1)">${m.name}</div>
        </div>`;}).join('')}
    </div>
  </div>`;
}

function renderHome(){
  const firstRun=!hasStudied();
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
  ${firstRun ? renderWelcome() : renderNudges()+renderOverdueAlerts()}
  <div class="grid-4 mb-16">
    ${statCard(dueCount,'Cards in pool','Across all modules')}
    ${statCard(overallMastPct+'%','Overall mastery','Based on card ratings')}
    ${statCard(studyStats.streak,'Day streak','Keep it up!')}
    ${statCard(daysToExam()+'d','To exam',formatExamDate(state.examDate))}
  </div>
  <div class="kb-hint" style="text-align:right;margin-top:-8px;margin-bottom:12px"><span class="kb-key">S</span> Start studying</div>
  ${firstRun ? '' : renderReadiness()}
  ${firstRun ? '' : renderDangerZone()}

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
        const nameColor=due>0?'#1B2330':'#616B7A';
        return `<div class="flex items-center gap-8 mb-12" style="cursor:pointer" onclick="go('progress')">
          <svg width="32" height="32" viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="26" class="ring-bg"/>
            <circle cx="30" cy="30" r="26" class="ring-fill progress-ring" stroke="${ringColor}" stroke-dasharray="${fill} ${circ-fill}"/>
          </svg>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:${nameColor}">${m.name}</div>
            <div style="font-size:11.5px;color:var(--t2)">${due>0?mast+'% mastery · '+due+' in pool':'not in pool'}</div>
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
        <input type="date" value="${state.examDate}" onchange="setExamDate(this.value)" style="font-family:inherit;font-size:13px;border:1px solid var(--border);border-radius:8px;padding:6px 10px;color:var(--t1);background:var(--s1);outline:none">
      </div>
      <div>
        <label class="form-label">Daily goal (cards)</label>
        <div class="flex items-center gap-8">
          <button class="btn btn-ghost btn-sm" onclick="adjustGoal(-5)" aria-label="Decrease daily goal by 5">−</button>
          <span style="font-size:14px;font-weight:600;min-width:36px;text-align:center" aria-live="polite">${state.dailyGoal}</span>
          <button class="btn btn-ghost btn-sm" onclick="adjustGoal(5)" aria-label="Increase daily goal by 5">+</button>
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
    <button class="week-nav-btn" onclick="shiftWeek(-1)" title="Previous week" aria-label="Previous week">←</button>
    <div style="text-align:center">
      <div style="font-size:14px;font-weight:700">${weekLabel}</div>
      ${!isCurrentWeek?`<button class="btn btn-ghost btn-sm" style="margin-top:4px;font-size:11.5px" onclick="shiftWeek(${-offset})">↩ Back to this week</button>`:`<div class="text-xs text-secondary" style="margin-top:2px">Current week</div>`}
    </div>
    <button class="week-nav-btn" onclick="shiftWeek(1)" title="Next week" aria-label="Next week">→</button>
  </div>

  <div class="planner-grid">
    ${plan.map((day,di)=>`
      <div class="plan-day${(di===todayIdx&&isCurrentWeek)?' today':''}">
        <div>
          <div class="plan-day-head">${day.day}</div>
          <div class="plan-day-date">${day.date}</div>
          ${day.monthYear?`<div style="font-size:10px;color:#6B7280">${day.monthYear}</div>`:''}
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
  // Counters. "Left" is driven off session position so it ticks down on every
  // single card; "due today"/"upcoming" are computed live from the whole pool
  // (nextReview is per-subtopic, so these move in steps as subtopics schedule).
  const pool=(state.fcPool&&state.fcPool.length)?state.fcPool:cards;
  const _fcDueToday=pool.filter(cardIsDue).length;
  const _fcUpcoming=pool.length-_fcDueToday;
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
  const _fcLeft=Math.max(0,cards.length-idx); // remaining in this session — ticks every card

  return `
  ${state.fcReviewRound?`<div style="background:var(--tint-amber);border:1px solid #F0C080;border-radius:10px;padding:10px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
    <span style="font-size:16px">🔁</span>
    <div>
      <div style="font-size:13px;font-weight:600;color:#C97B30">Review round — cards you found difficult</div>
      <div style="font-size:12px;color:var(--t2)">${cards.length} card${cards.length!==1?'s':''} to retry</div>
    </div>
  </div>`:`<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;padding:8px 14px;background:var(--s2);border-radius:8px;margin-bottom:14px;font-size:12.5px;color:var(--t2)">
    <span><strong style="color:#3D6FD1">${_fcLeft}</strong> left</span>
    <span style="color:#D0D5DE">·</span>
    <span><strong style="color:var(--t1)">${_fcDueToday}</strong> due today</span>
    <span style="color:#D0D5DE">·</span>
    <span><strong style="color:var(--t1)">${_fcUpcoming}</strong> upcoming</span>
    ${state.module!=='ALL'?`<span style="color:#D0D5DE">·</span><span style="font-size:11px;opacity:.8">${state.module} only</span>`:''}
    <span style="margin-left:auto;display:flex;align-items:center;gap:6px" title="Cards per session before the review round — changing restarts this session">
      <span style="font-size:11px;opacity:.85">Session</span>
      <button class="btn btn-ghost btn-sm" style="padding:2px 8px" onclick="adjustSessionSize(-5)" aria-label="Fewer cards per session">−</button>
      <strong style="min-width:22px;text-align:center;color:var(--t1)" aria-live="polite">${fcSessionCap()}</strong>
      <button class="btn btn-ghost btn-sm" style="padding:2px 8px" onclick="adjustSessionSize(5)" aria-label="More cards per session">+</button>
    </span>
  </div>`}
  <div class="flex items-center justify-between mb-20">
    <div class="text-sm text-secondary">${idx+1} of ${cards.length} cards</div>
    <div class="flex items-center gap-8">
      <svg width="32" height="32" viewBox="0 0 60 60" style="transform:rotate(-90deg)">
        <circle cx="30" cy="30" r="26" fill="none" stroke="#F0F2F6" stroke-width="4"/>
        <circle cx="30" cy="30" r="26" fill="none" stroke="${state.fcReviewRound?'#C97B30':'#3D6FD1'}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${prog} ${circ-prog}"/>
      </svg>
      ${state.fcUndo?`<button class="btn btn-ghost btn-sm" onclick="undoRating()" title="Undo your last rating">↩ Undo</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="resetFC()">Restart</button>
    </div>
  </div>

  <div class="fc-card mb-20" style="border-top:4px solid ${card.color}" role="button" tabindex="0" aria-label="Flashcard — activate to ${state.fcFlipped?'hide':'reveal'} answer" onclick="flipCard()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();flipCard()}">
    <div style="margin-bottom:12px">
      <span class="badge" style="background:${card.color}18;color:${card.color}">${card.topic}</span>
    </div>
    ${!state.fcFlipped
      ?`<div class="fc-q">${renderMd(card.q,!card.ai,'lines')}</div><div class="fc-flip-hint">Click to reveal answer</div>`
      :`<span style="font-size:13px;font-weight:600;color:var(--t2);display:block;margin-bottom:10px">Answer</span>
        <div class="fc-q mb-12" style="font-size:15px;color:var(--t2)">${renderMd(card.q,!card.ai,'lines')}</div>
        <div style="width:48px;height:3px;border-radius:2px;background:${card.color}55;margin:14px 0"></div>
        <div class="fc-a">${renderMd(card.a,!card.ai,'bullets')}</div>`
    }
  </div>

  ${state.fcFlipped?`
  <div class="rating-row">
    <button class="rating-btn rating-again" onclick="rateCard('again')">Again</button>
    <button class="rating-btn rating-hard" onclick="rateCard('hard')">Hard</button>
    <button class="rating-btn rating-good" onclick="rateCard('good')">Good</button>
    <button class="rating-btn rating-easy" onclick="rateCard('easy')">Easy</button>
  </div>
  <div class="kb-hint"><span class="kb-key">1</span> Again &nbsp; <span class="kb-key">2</span> Hard &nbsp; <span class="kb-key">3</span> Good &nbsp; <span class="kb-key">4</span> Easy</div>
  <div class="swipe-hint">Swipe card&nbsp; → <b>Good</b> &nbsp;·&nbsp; ← <b>Again</b></div>`:`
  <div style="text-align:center" class="text-sm text-secondary">Rate yourself after flipping</div>
  <div class="kb-hint"><span class="kb-key">Space</span> or <span class="kb-key">→</span> to flip</div>
  <div class="swipe-hint">Tap or swipe the card to flip</div>`}`;
}

function renderFCComplete(total){
  const dueLeft=(state.fcPool||[]).filter(cardIsDue).length;
  const cap=fcSessionCap();
  const nextBatch=Math.min(cap,dueLeft);
  return `<div class="card" style="text-align:center;padding:56px 40px;max-width:500px;margin:0 auto">
    <div style="font-size:40px;margin-bottom:16px">${dueLeft>0?'✅':'🎉'}</div>
    <div style="font-size:20px;font-weight:700;margin-bottom:8px">Session complete!</div>
    <div class="text-sm text-secondary mb-8">You reviewed ${state.fcTotalReviewed} card${state.fcTotalReviewed!==1?'s':''} this session. Great work!</div>
    <div class="text-sm mb-24" style="color:${dueLeft>0?'#C97B30':'#2E9C8E'};font-weight:600">
      ${dueLeft>0?`${dueLeft} card${dueLeft!==1?'s':''} still due in your pool`:`You're all caught up for today 🎯`}
    </div>
    <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:20px" title="Cards per session">
      <span style="font-size:12px;color:var(--t2)">Cards per session</span>
      <button class="btn btn-ghost btn-sm" style="padding:2px 8px" onclick="adjustSessionSize(-5)" aria-label="Fewer cards per session">−</button>
      <strong style="min-width:22px;text-align:center" aria-live="polite">${cap}</strong>
      <button class="btn btn-ghost btn-sm" style="padding:2px 8px" onclick="adjustSessionSize(5)" aria-label="More cards per session">+</button>
    </div>
    <div class="flex gap-12" style="justify-content:center;flex-wrap:wrap">
      ${dueLeft>0?`<button class="btn btn-primary" onclick="resetFC()">Continue — next ${nextBatch}</button>`:`<button class="btn btn-primary" onclick="go('home')">Back to dashboard</button>`}
      <button class="btn btn-ghost" onclick="go('progress')">Review topics</button>
    </div>
  </div>`;
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

// Fold the syllabus papers (CS1A, CS1B, …) into their whole exam (CS1) so the
// Progress page shows one card per exam. Each group keeps its constituent
// `papers` (for a paper sub-heading) plus a flattened `topics` list so the
// existing coverage/mastery helpers work unchanged.
function examGroups(){
  const order=[], byId={};
  SYLLABUS.forEach(course=>{
    const code=examOf(course.code);
    if(!byId[code]){
      const mod=MODULES.find(m=>m.id===code);
      byId[code]={code, name:(mod&&mod.name)||course.name, color:(mod&&mod.color)||course.color, papers:[], topics:[]};
      order.push(code);
    }
    byId[code].papers.push(course);
    byId[code].topics.push(...course.topics);
  });
  return order.map(code=>byId[code]);
}

function renderProgress(){
  const allSubs=[];
  SYLLABUS.forEach(c=>c.topics.forEach(t=>t.subs.forEach(s=>allSubs.push(s.id))));
  const checked=allSubs.filter(id=>pool[id]).length;

  return `
  <div class="flex items-center justify-between mb-20">
    <div class="text-sm text-secondary">${checked} / ${allSubs.length} subtopics covered in notes · Flashcards draw only from ticked sections</div>
    <div class="flex gap-8">
      <button class="btn btn-ghost btn-sm" onclick="poolAll(true)">Tick all</button>
      <button class="btn btn-ghost btn-sm" style="color:#C94040" onclick="poolAll(false)">Clear all</button>
    </div>
  </div>

  ${renderTrends()}
  ${renderMilestones()}

  ${examGroups().map(course=>{
    const open=state.expandedCourses[course.code]!==false;
    const subCount=course.topics.reduce((a,t)=>a+t.subs.length,0);
    return `
    <div class="card mb-16">
      <div class="flex items-center gap-12 mb-4" style="cursor:pointer;user-select:none" onclick="toggleCourse('${course.code}')">
        <div style="width:4px;height:36px;border-radius:2px;background:${course.color};flex-shrink:0"></div>
        <div style="flex:1">
          <div style="font-size:16px;font-weight:700">${course.code} — ${course.name}</div>
          <div class="text-sm text-secondary">${course.topics.length} topics · ${subCount} subtopics</div>
        </div>
        <div style="text-align:right;margin-right:8px">
          <div style="font-size:20px;font-weight:700;color:${course.color}">${coursePoolPct(course)}%</div>
          <div class="text-xs text-secondary">covered</div>
        </div>
        <span style="color:var(--t2);font-size:14px;transition:transform .2s;display:inline-block;transform:rotate(${open?90:0}deg)">▶</span>
      </div>

      ${open?`
      <div style="margin-top:12px">
        ${course.papers.map((paper,pi)=>`
        ${course.papers.length>1?`<div style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--t2);margin:${pi?18:2}px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--border)">${paper.code} · ${paper.name}</div>`:''}
        ${paper.topics.map(topic=>{
          const pct=topicPoolPct(topic);
          const pooled=topic.subs.filter(s=>pool[s.id]).length;
          return `
          <div>
            <div class="topic-row${state.expandedTopics[topic.id]?' expanded':''}" onclick="toggleTopic('${topic.id}')">
              <span class="expand-caret" style="color:var(--t2);font-size:12px">▶</span>
              <input type="checkbox" ${pct===100?'checked':pct>0?'indeterminate-js':''} onclick="event.stopPropagation();toggleTopic_pool('${topic.id}',this.checked)" style="flex-shrink:0;width:16px;height:16px;cursor:pointer" id="tc-${topic.id}">
              <div style="flex:1">
                <div style="font-size:13.5px;font-weight:600">${topic.name} <span style="color:var(--t2);font-weight:400">[${topic.w}%]</span></div>
                <div style="font-size:11.5px;color:var(--t2);margin-top:2px">${pooled}/${topic.subs.length} subtopics covered</div>
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
                  <div style="font-size:12px;color:var(--t2);font-weight:600;margin-bottom:1px">${sub.num}</div>
                  <div style="font-size:13px">${sub.name}</div>
                </div>
                <span style="font-size:11px;color:${covered?'#2E9C8E':'#6B7280'};flex-shrink:0;font-weight:600">${covered?'✓ covered':'not yet'}</span>
              </div>`;
            }).join(''):''}
          </div>`;
        }).join('')}`).join('')}
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
  render();
};

window.setModule=function(mod){
  state.module=mod;
  state.fcIndex=0;state.fcFlipped=false;state.fcWeakQueue=[];state.fcReviewRound=false;
  buildDecks();
  render();
};

// Announce dynamic changes to screen readers via the polite live region
function announce(msg){
  const el=document.getElementById('a11y-live');
  if(el){el.textContent='';setTimeout(()=>{el.textContent=msg;},30);}
}

window.flipCard=function(){
  if(state.fcIndex>=filteredCards().length)return;
  state.fcFlipped=!state.fcFlipped;
  render();
  announce(state.fcFlipped?'Answer revealed':'Question shown');
};

window.rateCard=function(rating){
  const cards=filteredCards();
  if(state.fcIndex>=cards.length)return;
  const card=cards[state.fcIndex];
  // Snapshot everything a rating touches so it can be undone (fat-finger fix).
  if(card){
    state.fcUndo={
      subId:card.sub,
      m:mastery[card.sub]?JSON.stringify(mastery[card.sub]):null,
      stats:JSON.stringify(studyStats),
      deck:state.fcDeck.slice(),weak:state.fcWeakQueue.slice(),pool:(state.fcPool||[]).slice(),
      index:state.fcIndex,review:state.fcReviewRound,total:state.fcTotalReviewed
    };
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
  const remaining=Math.max(0,(state.fcDeck?state.fcDeck.length:0)-state.fcIndex);
  announce(`Rated ${rating}. ${remaining} card${remaining===1?'':'s'} left.`);
};

window.resetFC=function(){
  state.fcIndex=0;state.fcFlipped=false;state.fcWeakQueue=[];state.fcReviewRound=false;state.fcTotalReviewed=0;state.fcUndo=null;buildDecks();
  render();
};

// Undo the most recent flashcard rating and put the card back in front of you.
window.undoRating=function(){
  const u=state.fcUndo;if(!u)return;
  if(u.m===null)delete mastery[u.subId];else mastery[u.subId]=JSON.parse(u.m);
  saveMastery();
  studyStats=JSON.parse(u.stats);saveStudyStats();
  state.fcDeck=u.deck;state.fcWeakQueue=u.weak;state.fcPool=u.pool;
  state.fcIndex=u.index;state.fcReviewRound=u.review;state.fcTotalReviewed=u.total;
  state.fcFlipped=true;state.fcUndo=null;
  render();showToast('Undid last rating');
};

window.toggleTopic=function(id){
  state.expandedTopics[id]=!state.expandedTopics[id];
  renderKeepScroll();
};

window.toggleCourse=function(code){
  state.expandedCourses[code]=state.expandedCourses[code]===false?true:false;
  render();
};

function invalidateDecks(){state.fcDeck=[];state.fcPool=[];}

window.toggleTopic_pool=function(topicId, val){
  const topic=SYLLABUS.flatMap(c=>c.topics).find(t=>t.id===topicId);
  if(!topic) return;
  topic.subs.forEach(s=>{ pool[s.id]=val; });
  savePool();
  invalidateDecks();
  renderKeepScroll();
};

window.togglePool=function(id,val){
  pool[id]=val;
  savePool();
  invalidateDecks();
  renderKeepScroll();
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
  const color=mod?mod.color:'#616B7A';
  const typeMap={'Flashcards':'flashcards','Review':null};
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

window.adjustGoalTo=function(n){
  state.dailyGoal=Math.max(5,Math.round(n));
  saveExamDate();
  render();
  showToast('Daily goal set to '+state.dailyGoal);
};

// Cards per flashcard session (before the weak-card review round). Defaults to
// the daily goal; once the user sets it, it sticks. Changing it restarts the
// current session so the new cap takes effect immediately.
window.adjustSessionSize=function(delta){
  state.fcSessionSize=Math.max(5,fcSessionCap()+delta);
  saveExamDate();
  // Restart only when actively mid-session so the new cap takes effect; on the
  // completion screen just re-render so "Continue — next N" reflects the change.
  const midSession=state.view==='flashcards'&&state.fcDeck&&state.fcIndex<state.fcDeck.length;
  if(midSession)resetFC();
  else render();
};

window.toggleChip=function(dayIndex,chipIndex,val){
  state.chipDone[dayIndex+'-'+chipIndex]=val;
  saveChipDone();
  render();
};

window.startFromChip=function(modId,type){
  state.module=examOf(modId)||'ALL';
  if(modId){
    state.fcIndex=0;state.fcFlipped=false;
    go('flashcards');
  }else{
    go('home');
  }
};

function escHtml(s){
  if(!s)return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Break inline "(1) … (2) …" and "(i) … (ii) …" enumerations onto separate lines.
// Runs on RAW text using sentinel chars (\x01 = line break, \x02…\x03 = marker span)
// so markers survive the math-segment split; sentinels become HTML after escaping.
// Only fires when the first two markers both appear after a sentence boundary, so
// notation like i^(p) and references like "shown in part (i)" are left alone.
function markEnums(text){
  const numSig=/(^|[.:;\]!?]\s+)\(1\)\s/.test(text)&&/[.:;\]!?]\s+\(2\)\s/.test(text);
  if(numSig){
    text=text.replace(/(^|[.:;\]!?]\s+)\((\d{1,2})\)\s+/g,(m,pre,n)=>
      pre.replace(/\s+$/,'')+(pre?' ':'')+(pre||n!=='1'?'\x01':'')+'\x02('+n+')\x03 ');
  }
  const romSig=/(^|[.:;\]!?]\s+)\(i\)\s/.test(text)&&/[.:;\]!?]\s+\(ii\)\s/.test(text);
  if(romSig){
    text=text.replace(/(^|[.:;\]!?]\s+)\(([ivx]{1,4})\)\s+/g,(m,pre,n)=>
      pre.replace(/\s+$/,'')+(pre?' ':'')+(pre||n!=='i'?'\x01':'')+'\x02('+n+')\x03 ');
  }
  return text;
}

// Break paragraphs into one sentence per chunk (\x04 = bullet item, \x01 = plain
// line break). Runs on RAW text after markEnums so enum items keep their own
// markers; abbreviations and decimals are protected; next sentence must start
// with a capital/digit/maths symbol so lowercase continuations stay joined.
function chunkSentences(text,mode){
  const mark=mode==='bullets'?'\x04':'\x01';
  return text.replace(/([.!?])(\s+)(?=[A-Z0-9£("Α-Ωα-ω₀-₉ₓⁿ¹²³∫Σ√])/g,(m,p,sp,off,str)=>{
    const before=str.slice(Math.max(0,off-7),off+1);
    if(/(e\.g\.|i\.e\.|etc\.|vs\.|cf\.|approx\.)$/i.test(before))return m;
    return p+' '+mark+' ';
  });
}

// ── Plain-text formula → LaTeX ──
// Static content writes maths as unicode text ("δ = ln(1 + i)", "A_x = Σ v^{k+1} k|qₓ").
// texifyMath detects maths-like token runs and converts them to \( … \) LaTeX for
// MathJax. Strict rules keep prose and R code untouched: a run must be made of
// maths tokens only (single letters, digits, operators, greek, known functions,
// 2-4 letter acronyms) AND contain a trigger (relational op, ^ _ ∫ √ Σ, or
// unicode sub/superscripts). "Duration of assets = duration of liabilities" and
// "lm(y ~ x1 * x2)" fail these tests and stay as text.
const TEX_FUNCS={ln:'\\ln',log:'\\log',exp:'\\exp',max:'\\max',min:'\\min',lim:'\\lim',Var:'\\operatorname{Var}',Cov:'\\operatorname{Cov}',Corr:'\\operatorname{Corr}',SD:'\\operatorname{SD}',MSE:'\\operatorname{MSE}',SE:'\\operatorname{SE}'};
const TEX_DIFFS=new Set(['dt','dx','ds','dv','dr','dn','du','di']);
const TEX_SUPS={'⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9','ⁿ':'n','⁺':'+','⁻':'-','ᵀ':'T','ᵏ':'k'};
const TEX_SUBS={'₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9','ₓ':'x','ₜ':'t','ₙ':'n','₊':'+','₋':'-'};
const TEX_GREEK={'α':'\\alpha ','β':'\\beta ','γ':'\\gamma ','δ':'\\delta ','ε':'\\varepsilon ','ζ':'\\zeta ','η':'\\eta ','θ':'\\theta ','κ':'\\kappa ','λ':'\\lambda ','μ':'\\mu ','ν':'\\nu ','ξ':'\\xi ','π':'\\pi ','ρ':'\\rho ','σ':'\\sigma ','τ':'\\tau ','υ':'\\upsilon ','φ':'\\phi ','χ':'\\chi ','ψ':'\\psi ','ω':'\\omega ','Γ':'\\Gamma ','Δ':'\\Delta ','Θ':'\\Theta ','Λ':'\\Lambda ','Φ':'\\Phi ','Ψ':'\\Psi ','Ω':'\\Omega ','Σ':'\\sum ','Π':'\\prod '};
const TEX_SYMS={'−':'-','–':'-','±':'\\pm ','·':'\\cdot ','×':'\\times ','≈':'\\approx ','≤':'\\le ','≥':'\\ge ','≠':'\\ne ','∝':'\\propto ','→':'\\to ','⇒':'\\Rightarrow ','∞':'\\infty ','∫':'\\int ','√':'\\surd ','∂':'\\partial ','∈':'\\in ','½':'\\tfrac{1}{2}','£':'\\pounds ','%':'\\%','&':'\\&','<':'\\lt ','>':'\\gt ','ä':'\\ddot{a}','′':"'"};
const TEX_CHAR_RE=/^[A-Za-z0-9̂̄̅αβγδεζηθκλμνξπρστυφχψωΓΔΘΛΦΨΩΣΠ₀-₉ₓₜₙ₊₋⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻ᵀᵏä=+\-*/^_(){}\[\]|.,:'′!<>≈≤≥≠∝→⇒∞∫√∂∈±½£%·×−–&]+$/;
const TEX_TRIG=/[=≈≤≥≠∝<>±→]|[\^_]|[∫√Σ]|[₀-₉ₓₜₙ₊₋]|[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻ᵀᵏ]|[̂̄̅]/;
function _texToken(tok){
  if(!TEX_CHAR_RE.test(tok))return false;
  if(/^[(\[]?(e\.g\.?|i\.e\.?|etc\.?|vs\.?|cf\.?)[,;:.)\]]*$/i.test(tok))return false;
  const runs=tok.match(/[A-Za-z]{2,}/g)||[];
  return runs.every(w=>TEX_FUNCS[w]!==undefined||TEX_DIFFS.has(w)||/^[A-Z]{2,4}$/.test(w));
}
function _texValid(s){
  if(s.replace(/[\s().,;:'!]/g,'').length<2)return false;
  if(!TEX_TRIG.test(s))return false;
  // unbalanced braces make fatal TeX (unlike parens, which render fine)
  if((s.match(/{/g)||[]).length!==(s.match(/}/g)||[]).length)return false;
  const rm=s.match(/[=≈≤≥≠∝<>]/);
  if(rm){
    const i=s.indexOf(rm[0]);
    const operand=/[A-Za-z0-9αβγδεζηθκλμνξπρστυφχψω]|[₀-₉ₓₜₙ]|[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ]/;
    if(!operand.test(s.slice(0,i))||!operand.test(s.slice(i+1)))return false;
  }else{
    if(!/[A-Za-zαβγδεζηθκλμνξπρστυφχψω]/.test(s))return false;
  }
  return true;
}
function _toTex(s){
  let t=s;
  // words first: functions, differentials, acronyms → \text{}; combining marks
  // before greek so \hat/\bar wrap the converted symbol
  t=t.replace(/[A-Za-z]{2,}/g,w=>TEX_FUNCS[w]||(TEX_DIFFS.has(w)?'\\,'+w:'\\text{'+w+'}'));
  // brace primed identifiers (q' → {q'}) so a following ^ isn't a double exponent
  t=t.replace(/([A-Za-z])[′']/g,"{$1'}");
  t=t.replace(/(.)̂/g,(m,c)=>'\\hat{'+(TEX_GREEK[c]?TEX_GREEK[c].trim():c)+'}');
  t=t.replace(/(.)[̄̅]/g,(m,c)=>'\\bar{'+(TEX_GREEK[c]?TEX_GREEK[c].trim():c)+'}');
  t=t.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻ᵀᵏ]+/g,(m,off)=>{
    const v=m.split('').map(c=>TEX_SUPS[c]).join('');
    const prev=off>0?t[off-1]:'';
    return ((!prev||/[\s(=+*/·×,−-]/.test(prev))?'{}':'')+'^{'+v+'}';
  });
  t=t.replace(/[₀-₉ₓₜₙ₊₋]+/g,(m,off)=>{
    const v=m.split('').map(c=>TEX_SUBS[c]).join('');
    const prev=off>0?t[off-1]:'';
    return ((!prev||/[\s(=+*/·×,−-]/.test(prev))?'{}':'')+'_{'+v+'}';
  });
  t=t.replace(/\^\(([^()]{1,10})\)/g,'^{($1)}');
  t=t.replace(/_\(([^()]{1,10})\)/g,'_{($1)}');
  t=t.replace(/[αβγδεζηθκλμνξπρστυφχψωΓΔΘΛΦΨΩΣΠ]/g,c=>TEX_GREEK[c]);
  t=t.replace(/[−–±·×≈≤≥≠∝→⇒∞∫√∂∈½£%&<>ä′]/g,c=>TEX_SYMS[c]);
  return t;
}
function texifyMath(text){
  try{
    const parts=text.split(/(\s+)/);
    let out='',run='';
    const flush=()=>{
      if(!run)return;
      const m=run.match(/^([\s\S]*?)([\s.,;:]*)$/);
      const core=m[1],tail=m[2];
      if(_texValid(core)) out+='\\('+_toTex(core)+'\\)'+tail;
      else out+=run;
      run='';
    };
    for(const p of parts){
      if(/^\s+$/.test(p)){ if(run)run+=p; else out+=p; continue; }
      if(p&&_texToken(p)){ run+=p; }
      else { flush(); out+=p; }
    }
    flush();
    return out;
  }catch(e){ return text; }
}

// plain=true: escape + enumeration/formula formatting only, no markdown emphasis.
// Static exam content uses bare * ^ _ as notation (e.g. "D* = D/(1+i)") which
// markdown rules would corrupt — only AI-generated content gets full markdown.
// chunk ('bullets'|'lines') breaks plain content into one sentence per line;
// AI content structures itself with markdown so chunk is ignored when !plain.
function renderMd(text,plain,chunk){
  if(!text)return '';
  // Shield escaped \$ (e.g. R list-access model$coef) so paired $ are never
  // mis-read as MathJax inline-math delimiters; restored to a literal $ at the end
  text=text.replace(/\\\$/g,'\x05');
  text=markEnums(text);
  if(plain){
    if(chunk)text=chunkSentences(text,chunk);
    text=texifyMath(text);
  }
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

  let html=segments.map(seg=>{
    if(seg.t==='math')return seg.v; // pass raw LaTeX to MathJax
    let h=escHtml(seg.v);
    if(!plain){
      h=h.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
      h=h.replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
      h=h.replace(/^###\s+(.+)$/gm,'<div style="font-weight:600;margin:10px 0 4px">$1</div>');
      h=h.replace(/^##\s+(.+)$/gm,'<div style="font-weight:700;margin:12px 0 4px">$1</div>');
    }
    h=h.replace(/^[-•]\s+(.+)$/gm,'<div style="display:flex;gap:6px;margin:3px 0"><span style="color:#3D6FD1;flex-shrink:0">•</span><span>$1</span></div>');
    h=h.replace(/^(\d+)\.\s+(.+)$/gm,'<div style="display:flex;gap:6px;margin:3px 0"><span style="color:#3D6FD1;font-weight:600;flex-shrink:0">$1.</span><span>$2</span></div>');
    h=h.replace(/\n\n+/g,'<br><br>');
    h=h.replace(/\n/g,'<br>');
    return h;
  }).join('');
  // Sentinels are resolved after joining so enum markers, line breaks and
  // bullet items can wrap around \( … \) math segments without fragmenting
  html=html.replace(/\x01/g,'<br>').replace(/\x02/g,'<span style="font-weight:600;color:#3D6FD1">').replace(/\x03/g,'</span>');
  if(html.includes('\x04')){
    html='<div class="rd-li">'+html.replace(/\x04/g,'</div><div class="rd-li">')+'</div>';
  }
  // emit \$ so MathJax's processEscapes renders a literal $ instead of a delimiter
  html=html.replace(/\x05/g,'\\$');
  return html;
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
    sessionSize: state.fcSessionSize,
    chipDone: state.chipDone,
    history: studyHistory,
    badges,
    exportedAt: new Date().toISOString(),
    version: 3,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tabula-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  markBackup();
  render();
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
        if (typeof data.sessionSize === 'number') { state.fcSessionSize = data.sessionSize; saveExamDate(); }
        if (data.chipDone) { state.chipDone = data.chipDone; saveChipDone(); }
        if (Array.isArray(data.history)) { studyHistory = data.history; saveHistory(); }
        if (data.badges) { badges = data.badges; saveBadges(); }
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
  // Weak areas are judged only from topics the student has actually attempted.
  // Unseen topics aren't "weak" — they're just not started yet — so they never
  // appear here. Only genuinely low-scoring studied topics get flagged, which
  // keeps day one clean while still surfacing real gaps as they build up.
  const WEAK_PCT = 60; // studied topics scoring below this are flagged
  const rows = [];
  SYLLABUS.forEach(course => {
    course.topics.forEach(topic => {
      topic.subs.forEach(sub => {
        if (!pool[sub.id]) return;
        const m = mastery[sub.id];
        if (!m || m.seen < 1) return;            // only judge what's been studied
        const pct = Math.round(m.good / m.seen * 100);
        if (pct >= WEAK_PCT) return;             // strong enough → not a weak area
        rows.push({id: sub.id, name: sub.name, num: sub.num, course: examOf(course.code), color: course.color, pct, seen: m.seen});
      });
    });
  });
  if (rows.length === 0) return '';
  rows.sort((a,b) => a.pct - b.pct);
  const weakest = rows.slice(0, 5);
  return `
  <div class="card mb-16">
    <div class="flex items-center justify-between mb-12">
      <div style="font-size:14px;font-weight:600;color:#C94040">⚠ Weak areas — focus here${weakest.length>1?' ('+weakest.length+')':''}</div>
      <button class="btn btn-ghost btn-sm" onclick="go('progress')">All progress →</button>
    </div>
    ${weakest.map(s => `
      <div class="danger-row" onclick="drillSubTopic('${s.id}')" style="cursor:pointer" title="Drill this topic">
        <span class="badge" style="background:${s.color}18;color:${s.color};font-size:10px;flex-shrink:0;white-space:nowrap">${s.course} ${s.num}</span>
        <div style="flex:1;font-size:12.5px;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escHtml(s.name)}</div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <span style="font-size:13px;font-weight:700;color:${s.pct < 40 ? '#C94040' : '#C97B30'}">${s.pct}%</span>
          <span style="font-size:11px;color:var(--t2)">▶</span>
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
        modId = examOf(course.code);
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
    modId: m.id, name: m.name, color: m.color,
    pct: moduleCardMastery(m.id)
  })).sort((a,b) => a.pct - b.pct);

  const plan = loadPlanForWeek(state.planWeekOffset || 0);
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  // Assign flashcard sessions: rotate through weakest 3 modules, skip Sunday
  const priorities = modMastery.slice(0, 3);
  let qi = 0;
  plan.forEach((day, i) => {
    if (i === 6) return; // leave Sunday free
    if (day.chips && day.chips.length > 0) return; // don't overwrite existing chips
    const mod = priorities[qi % priorities.length];
    qi++;
    day.chips = [{
      label: `${mod.modId} · Flashcards`,
      color: mod.color,
      modId: mod.modId,
      type: 'flashcards'
    }];
  });
  savePlanForWeek(plan, state.planWeekOffset || 0);
  state.planData = plan;
  showToast('Plan filled based on your weakest modules');
  render();
};

function renderOverdueAlerts() {
  // Only surface topics the student has actually studied and then let go stale.
  // Never-seen topics are NOT "overdue" — flagging the whole syllabus on day one
  // is what made the app feel like you were already behind. New material is
  // simply waiting in the normal flashcard queue instead.
  const now = Date.now();
  const overdue = [];
  SYLLABUS.forEach(course => {
    course.topics.forEach(topic => {
      topic.subs.forEach(sub => {
        if (!pool[sub.id]) return;
        const m = mastery[sub.id];
        if (!m || !m.lastSeen) return; // never studied → not overdue
        const days = Math.floor((now - new Date(m.lastSeen).getTime()) / 86400000);
        if (days >= 14) overdue.push({name: sub.name, course: examOf(course.code), color: course.color, days, id: sub.id});
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
        <span style="font-size:11.5px;color:#C94040;flex-shrink:0;font-weight:600">${t.days}d ago</span>
      </div>`).join('')}
    <button class="btn btn-sm" style="background:#FEE2DC;color:#C94040;border:none;margin-top:8px" onclick="go('flashcards')">Review now →</button>
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
    [{label:'CM1 · Flashcards',color:'#3D6FD1',modId:'CM1',type:'flashcards'},{label:'CS1 · Flashcards',color:'#2E9C8E',modId:'CS1',type:'flashcards'}],
    [{label:'CS1 · Flashcards',color:'#2E9C8E',modId:'CS1',type:'flashcards'}],
    [{label:'CM1 · Flashcards',color:'#3D6FD1',modId:'CM1',type:'flashcards'}],
    [{label:'CM1 · Flashcards',color:'#3D6FD1',modId:'CM1',type:'flashcards'},{label:'CB1 · Flashcards',color:'#6B5DD3',modId:'CB1',type:'flashcards'}],
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

// Touch swipe gestures on flashcards (event-delegated so they survive re-renders).
// The card follows the finger and, once flipped, tints green (Good) / red (Again)
// past the commit threshold. Unflipped → any swipe flips.
(function setupCardGestures(){
  const THRESH=55;
  let start=null, el=null, dragging=false;
  const reset=animate=>{
    if(el){
      if(animate)el.style.transition='transform .2s ease';
      el.style.transform='';
      const b=el.querySelector('.swipe-badge'); if(b)b.remove();
      const cur=el; setTimeout(()=>{if(cur)cur.style.transition='';},210);
    }
    start=null; el=null; dragging=false;
  };
  document.addEventListener('touchstart',e=>{
    const card=e.target.closest?e.target.closest('.fc-card'):null;
    if(!card){start=null;el=null;return;}
    const t=e.touches[0]; start={x:t.clientX,y:t.clientY}; el=card; dragging=false;
  },{passive:true});
  document.addEventListener('touchmove',e=>{
    if(!start||!el||state.view!=='flashcards')return;
    const t=e.touches[0], dx=t.clientX-start.x, dy=t.clientY-start.y;
    if(!dragging && (Math.abs(dx)<8 || Math.abs(dx)<Math.abs(dy)))return; // allow vertical scroll
    dragging=true;
    el.style.transition='';
    el.style.transform=`translateX(${dx}px) rotate(${dx*0.03}deg)`;
    if(state.fcFlipped){
      let badge=el.querySelector('.swipe-badge');
      if(Math.abs(dx)>THRESH){
        const good=dx>0;
        if(!badge){badge=document.createElement('div');badge.className='swipe-badge';el.appendChild(badge);}
        badge.textContent=good?'✓ GOOD':'↻ AGAIN';
        badge.style.cssText=`position:absolute;top:14px;${good?'right':'left'}:14px;background:${good?'#2E9C8E':'#C94040'};color:#fff;font-weight:700;font-size:13px;padding:5px 12px;border-radius:8px;font-family:'Lexend',sans-serif;letter-spacing:.03em`;
      }else if(badge){badge.remove();}
    }
  },{passive:true});
  document.addEventListener('touchend',e=>{
    if(!start){reset(false);return;}
    const t=e.changedTouches[0], dx=t.clientX-start.x, dy=t.clientY-start.y;
    const horizontal=Math.abs(dx)>=THRESH && Math.abs(dx)>=Math.abs(dy)*1.3;
    const wasFlipped=state.fcFlipped, view=state.view;
    reset(!horizontal); // snap back only when not committing
    if(!horizontal||view!=='flashcards')return;
    if(!wasFlipped) flipCard(); else rateCard(dx>0?'good':'again');
  },{passive:true});
})();

render();
