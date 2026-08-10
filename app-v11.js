/* Profitlab v11 — Госплан: будущие целевые расходы и резервы */
(function(){
  if(!Array.isArray(state.goals))state.goals=[];
  if(!Array.isArray(state.goalMoves))state.goalMoves=[];
  let goalEditId=null,goalMoveMode=null,goalMoveId=null;

  const baseProjectedResult=projectedResult,baseClosingResult=closingResult,baseActualCashDelta=actualCashDelta;
  const currentPid=()=>state.activePeriod.id;
  const goalMoves=g=>state.goalMoves.filter(x=>x.goalId===g.id);
  const goalMovesBy=(g,type)=>goalMoves(g).filter(x=>x.type===type);
  const goalReserve=g=>Math.max(0,sum(goalMovesBy(g,'reserve').map(x=>x.amount))-sum(goalMovesBy(g,'release').map(x=>x.amount))-sum(goalMovesBy(g,'spend').map(x=>x.reserveUsed||0)));
  const goalSpent=g=>sum(goalMovesBy(g,'spend').map(x=>x.amount));
  const goalRemaining=g=>Math.max(0,(+g.target||0)-goalSpent(g)-goalReserve(g));
  const goalReserveCurrent=g=>sum(goalMovesBy(g,'reserve').filter(x=>x.periodId===currentPid()).map(x=>x.amount));
  const goalReleaseCurrent=g=>sum(goalMovesBy(g,'release').filter(x=>x.periodId===currentPid()).map(x=>x.amount));
  const goalSpendCurrent=g=>sum(goalMovesBy(g,'spend').filter(x=>x.periodId===currentPid()).map(x=>x.amount));
  const goalUnfundedSpendCurrent=g=>sum(goalMovesBy(g,'spend').filter(x=>x.periodId===currentPid()).map(x=>Math.max(0,(+x.amount||0)-(+x.reserveUsed||0))));

  function monthIndex(pid){const[y,m]=pid.split('-').map(Number);return y*12+(m-1)}
  function periodsToDue(g){
    if(!g.dueDate)return 1;
    const duePid=periodIdFromDate(new Date(g.dueDate+'T12:00:00'));
    return Math.max(1,monthIndex(duePid)-monthIndex(currentPid())+1);
  }
  function goalRecommended(g){
    if(!g.active||g.priority!=='required')return 0;
    return goalRemaining(g)/periodsToDue(g);
  }
  function goalProjectedPlan(){
    let n=0;
    for(const g of state.goals){
      const actual=goalReserveCurrent(g);
      n+=g.active&&g.priority==='required'?Math.max(actual,goalRecommended(g)):actual;
    }
    return n;
  }
  function currentGoalReleases(){return sum(state.goals.map(goalReleaseCurrent))}
  function currentGoalReserves(){return sum(state.goals.map(goalReserveCurrent))}
  function currentGoalUnfundedSpend(){return sum(state.goals.map(goalUnfundedSpendCurrent))}
  function currentGoalCashSpend(){return sum(state.goals.map(goalSpendCurrent))}
  function isCurrentView(v){return !v.archived&&v.period.id===state.activePeriod.id}

  projectedResult=function(v){
    const base=baseProjectedResult(v);if(!isCurrentView(v))return base;
    return base-goalProjectedPlan()+currentGoalReleases()-currentGoalUnfundedSpend();
  };
  closingResult=function(v){
    const base=baseClosingResult(v);if(!isCurrentView(v))return base;
    return base-currentGoalReserves()+currentGoalReleases()-currentGoalUnfundedSpend();
  };
  actualCashDelta=function(v){
    const base=baseActualCashDelta(v);if(!isCurrentView(v))return base;
    return base-currentGoalCashSpend();
  };

  const familyMetrics=document.querySelector('#familyView .metrics.two');
  if(familyMetrics&&!$('#goalsCard')){
    const card=document.createElement('section');card.className='card wide goalsCard';card.id='goalsCard';card.innerHTML=`
      <div class="head"><div><div class="title">Госплан · будущие расходы</div><div class="sub">Деньги остаются на руках, но перестают считаться свободными. Обязательные цели входят в план периода.</div></div><div class="icon">📌</div></div>
      <div class="goalSummary"><div><span>Зарезервировано</span><b id="goalReservedTotal">0 ₽</b></div><div><span>Нужно зарезервировать в этом периоде</span><b id="goalPlanCurrent">0 ₽</b></div><button class="btn tiny" id="goalAddBtn">+ цель</button></div>
      <div class="goalList" id="goalList"></div>`;
    familyMetrics.insertAdjacentElement('afterend',card);
  }

  if(!$('#goalDialog'))document.body.insertAdjacentHTML('beforeend',`
    <dialog id="goalDialog"><div class="modal"><h3 id="goalDialogTitle">Новая цель</h3><p>Одноразовый будущий расход. Резерв не уменьшает «денег сейчас», но уменьшает свободный профицит.</p>
      <label>Название</label><input id="goalNameInput" type="text" placeholder="например: Автошкола">
      <div class="formGrid"><div><label>Нужно всего</label><input id="goalTargetInput" type="number" min="0" step="1"></div><div><label>К какой дате</label><input id="goalDueInput" type="date"></div></div>
      <label>Тип цели</label><select id="goalPriorityInput"><option value="required">Обязательная — включать в план</option><option value="wish">Желательная — только если сама резервирую</option></select>
      <label>Комментарий</label><input id="goalNoteInput" type="text" placeholder="необязательно">
      <div class="note" id="goalPreview"></div>
      <div class="modalActions"><button class="btn secondary" id="goalCancelBtn">Отмена</button><button class="btn" id="goalSaveBtn">Сохранить</button></div>
    </div></dialog>
    <dialog id="goalMoveDialog"><div class="modal"><h3 id="goalMoveTitle">Движение по цели</h3><p id="goalMoveHint"></p>
      <label>Сумма</label><input id="goalMoveAmount" type="number" min="0" step="1">
      <label>Комментарий</label><input id="goalMoveNote" type="text" placeholder="необязательно">
      <div class="modalActions"><button class="btn secondary" id="goalMoveCancel">Отмена</button><button class="btn" id="goalMoveSave">Сохранить</button></div>
    </div></dialog>`);

  const css=document.createElement('style');css.textContent=`
    .goalsCard{margin:0 0 12px}.goalSummary{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;margin-bottom:10px}.goalSummary>div{border:1px solid var(--line);border-radius:13px;padding:9px 11px;background:#faf7ef}.goalSummary span{display:block;color:var(--muted);font-size:11px}.goalSummary b{font-size:20px}.goalList{display:grid;gap:9px}.goalItem{border:1px solid var(--line);border-radius:15px;padding:12px;background:#faf7ef}.goalTop{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.goalName{font-weight:740;font-size:16px}.goalBadges{display:flex;gap:5px;flex-wrap:wrap;margin-top:4px}.goalNumbers{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0}.goalNum{border:1px solid var(--line);background:#fffdf8;border-radius:10px;padding:7px;font-size:10px;color:var(--muted)}.goalNum b{display:block;color:var(--ink);font-size:13px;margin-top:2px}.goalActions{display:flex;gap:5px;flex-wrap:wrap}.goalMoves{margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);font-size:11px;color:var(--muted);display:flex;justify-content:space-between;gap:8px;align-items:center}.goalItem.inactive{opacity:.68}@media(max-width:760px){.goalSummary{grid-template-columns:1fr}.goalNumbers{grid-template-columns:1fr 1fr}}`;
  document.head.appendChild(css);

  function fmtDate(s){return s?new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(s+'T12:00:00')):'—'}
  function goalStatus(g){if(g.status==='done')return 'закрыта';if(g.status==='cancelled')return 'отменена';return g.active?'действует':'пауза'}
  function updateGoalPreview(){
    const target=+$('#goalTargetInput').value||0,due=$('#goalDueInput').value,priority=$('#goalPriorityInput').value;
    if(!target||!due){$('#goalPreview').textContent='Укажи сумму и дату — посчитаю темп резерва.';return}
    const temp={target,dueDate:due,priority,active:true,id:'preview'},periods=periodsToDue(temp),per=target/periods;
    $('#goalPreview').textContent=priority==='required'?`До срока ${periods} финансовых период${periods===1?'':'а/ов'}. Сейчас темп примерно ${money(per)} за период.`:'Желательная цель не уменьшает план сама по себе — только когда ты реально кладёшь в неё резерв.';
  }
  ['goalTargetInput','goalDueInput','goalPriorityInput'].forEach(x=>$('#'+x)?.addEventListener('input',updateGoalPreview));

  function openGoal(gid=null){
    if(viewArchiveId)return;goalEditId=gid;const g=gid?state.goals.find(x=>x.id===gid):null;
    $('#goalDialogTitle').textContent=g?'Изменить цель':'Новая цель';$('#goalNameInput').value=g?.name||'';$('#goalTargetInput').value=g?.target??'';$('#goalDueInput').value=g?.dueDate||'';$('#goalPriorityInput').value=g?.priority||'required';$('#goalNoteInput').value=g?.note||'';updateGoalPreview();$('#goalDialog').showModal();setTimeout(()=>$('#goalNameInput').focus(),30);
  }
  function saveGoal(){
    const name=$('#goalNameInput').value.trim(),target=+$('#goalTargetInput').value,dueDate=$('#goalDueInput').value,priority=$('#goalPriorityInput').value,note=$('#goalNoteInput').value.trim();if(!name||!(target>0)||!dueDate){toast('Нужны название, сумма и дата');return}
    if(goalEditId){const g=state.goals.find(x=>x.id===goalEditId);if(!g)return;const spent=goalSpent(g);if(target<spent&&!confirm(`Уже потрачено по цели ${money(spent)}, а новая сумма меньше. Сохранить?`))return;g.name=name;g.target=target;g.dueDate=dueDate;g.priority=priority;g.note=note}
    else state.goals.push({id:id(),name,target,dueDate,priority,note,active:true,status:'active',createdAt:Date.now()});
    save();render();$('#goalDialog').close();toast('Госплан обновлён');
  }
  function openGoalMove(gid,mode){
    const g=state.goals.find(x=>x.id===gid);if(!g)return;goalMoveId=gid;goalMoveMode=mode;const reserve=goalReserve(g),remain=Math.max(0,(+g.target||0)-goalSpent(g));
    if(mode==='reserve'){$('#goalMoveTitle').textContent='Зарезервировать · '+g.name;$('#goalMoveHint').textContent=`Сейчас в резерве ${money(reserve)}. Эти деньги останутся в «ДЕНЕГ СЕЙЧАС», но перестанут быть свободными.`;$('#goalMoveAmount').value=Math.round(goalRecommended(g))||''}
    else{$('#goalMoveTitle').textContent='Оплатить · '+g.name;$('#goalMoveHint').textContent=`В резерве ${money(reserve)}. Фактический платёж уменьшит деньги на руках. Зарезервированная часть второй раз из профицита не вычитается.`;$('#goalMoveAmount').value=Math.min(reserve||remain,remain)||''}
    $('#goalMoveNote').value='';$('#goalMoveDialog').showModal();setTimeout(()=>$('#goalMoveAmount').focus(),30);
  }
  function saveGoalMove(){
    const g=state.goals.find(x=>x.id===goalMoveId),amount=+$('#goalMoveAmount').value,note=$('#goalMoveNote').value.trim();if(!g||!(amount>0))return;
    if(goalMoveMode==='reserve')state.goalMoves.push({id:id(),goalId:g.id,type:'reserve',amount,periodId:currentPid(),ts:Date.now(),note});
    else{
      const reserve=goalReserve(g),reserveUsed=Math.min(reserve,amount);if(amount>reserve&&!confirm(`${money(amount-reserve)} из этого платежа не зарезервировано заранее и уменьшит свободный результат периода. Продолжить?`))return;
      state.goalMoves.push({id:id(),goalId:g.id,type:'spend',amount,reserveUsed,periodId:currentPid(),ts:Date.now(),note});if(goalSpent(g)>=+g.target){g.active=false;g.status='done'}
    }
    save();render();$('#goalMoveDialog').close();toast(goalMoveMode==='reserve'?'Убрали в резерв':'Расход записан');
  }
  function cancelGoal(gid){
    const g=state.goals.find(x=>x.id===gid);if(!g||!g.active)return;const reserve=goalReserve(g);if(!confirm(reserve?`Отменить цель «${g.name}»? ${money(reserve)} резерва снова станут свободными.`:`Отменить цель «${g.name}»?`))return;
    if(reserve>0)state.goalMoves.push({id:id(),goalId:g.id,type:'release',amount:reserve,periodId:currentPid(),ts:Date.now(),note:'Отмена цели'});g.active=false;g.status='cancelled';save();render();toast('Цель отменена');
  }
  function undoGoalLast(gid){
    const moves=state.goalMoves.filter(x=>x.goalId===gid).sort((a,b)=>(b.ts||0)-(a.ts||0));if(!moves.length)return;const last=moves[0],g=state.goals.find(x=>x.id===gid);if(!confirm('Отменить последнее движение по этой цели?'))return;state.goalMoves=state.goalMoves.filter(x=>x.id!==last.id);
    if(g&&last.type==='release'&&g.status==='cancelled'){g.active=true;g.status='active'}
    if(g&&last.type==='spend'&&g.status==='done'&&goalSpent(g)<+g.target){g.active=true;g.status='active'}
    save();render();toast('Последнее движение отменено');
  }

  function renderGoals(){
    if(!$('#goalList'))return;const box=$('#goalList');box.innerHTML='';const goals=[...state.goals].sort((a,b)=>(b.active-a.active)||String(a.dueDate).localeCompare(String(b.dueDate)));
    const reserved=sum(goals.map(goalReserve)),plan=goalProjectedPlan();$('#goalReservedTotal').textContent=money(reserved);$('#goalPlanCurrent').textContent=money(plan);
    $('#goalsCard').style.display=viewArchiveId?'none':'';
    if(!goals.length){box.innerHTML='<div class="empty">Пока Госплан никому ничего не обещал. Подозрительно.</div>';return}
    for(const g of goals){const reserve=goalReserve(g),spent=goalSpent(g),remain=goalRemaining(g),rec=goalRecommended(g),covered=Math.min(+g.target||0,reserve+spent),pct=g.target?Math.min(100,covered/g.target*100):0,moves=goalMoves(g).sort((a,b)=>(b.ts||0)-(a.ts||0)),last=moves[0],el=document.createElement('div');el.className='goalItem'+(g.active?'':' inactive');
      const mandatory=g.priority==='required'?'<span class="businessBadge">ОБЯЗАТЕЛЬНАЯ</span>':'<span class="tag">ЖЕЛАТЕЛЬНАЯ</span>',overdue=g.active&&g.dueDate&&g.dueDate<iso(new Date())?'<span class="businessBadge">СРОК ПРОШЁЛ</span>':'';
      el.innerHTML=`<div class="goalTop"><div><div class="goalName">${safe(g.name)}</div><div class="goalBadges">${mandatory}${overdue}<span class="tag">${goalStatus(g)}</span></div><div class="sub">к ${fmtDate(g.dueDate)}${g.note?' · '+safe(g.note):''}</div></div><div class="amount">${money(g.target)}</div></div><div class="progress gold"><i style="width:${pct}%"></i></div><div class="goalNumbers"><div class="goalNum">В резерве<b>${money(reserve)}</b></div><div class="goalNum">Уже оплачено<b>${money(spent)}</b></div><div class="goalNum">Осталось обеспечить<b>${money(remain)}</b></div><div class="goalNum">Темп этого периода<b>${g.active&&g.priority==='required'?money(rec):'—'}</b></div></div><div class="goalActions"><button class="btn tiny" data-goal-reserve="${g.id}" ${!g.active?'disabled':''}>+ в резерв</button><button class="btn tiny secondary" data-goal-spend="${g.id}" ${!g.active?'disabled':''}>− оплатить</button><button class="btn tiny ghost" data-goal-edit="${g.id}">изменить</button><button class="btn tiny danger" data-goal-cancel="${g.id}" ${!g.active?'disabled':''}>отменить цель</button></div>${last?`<div class="goalMoves"><span>Последнее: ${last.type==='reserve'?'в резерв':last.type==='spend'?'оплачено':'резерв освобождён'} ${money(last.amount)}${last.note?' · '+safe(last.note):''}</span><button class="btn tiny ghost" data-goal-undo="${g.id}">↶ отменить последнее</button></div>`:''}`;box.appendChild(el)}
  }

  $('#goalAddBtn')?.addEventListener('click',()=>openGoal());$('#goalCancelBtn')?.addEventListener('click',()=>$('#goalDialog').close());$('#goalSaveBtn')?.addEventListener('click',saveGoal);$('#goalMoveCancel')?.addEventListener('click',()=>$('#goalMoveDialog').close());$('#goalMoveSave')?.addEventListener('click',saveGoalMove);
  document.addEventListener('click',e=>{const r=e.target.closest('[data-goal-reserve]');if(r)openGoalMove(r.dataset.goalReserve,'reserve');const s=e.target.closest('[data-goal-spend]');if(s)openGoalMove(s.dataset.goalSpend,'spend');const ed=e.target.closest('[data-goal-edit]');if(ed)openGoal(ed.dataset.goalEdit);const c=e.target.closest('[data-goal-cancel]');if(c)cancelGoal(c.dataset.goalCancel);const u=e.target.closest('[data-goal-undo]');if(u)undoGoalLast(u.dataset.goalUndo)});

  const oldRender=render;
  render=function(){oldRender();renderGoals()};
  render();
})();