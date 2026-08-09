/* Profitlab v6 — debt rates, quieter food UI, business debt under profit */
(function(){
  function daysInPeriod(p){
    const a=new Date(p.start+'T12:00:00'), b=new Date(p.end+'T12:00:00');
    return Math.max(1,Math.round((b-a)/86400000)+1);
  }
  function debtOpening(v,d){return Number(v.period.debtOpenings?.[d.id] ?? d.principal ?? 0)}
  window.debtInterestDue=function(v,d){
    const body=debtOpening(v,d), rate=(+d.rate||0)/100, days=daysInPeriod(v.period);
    if(d.rateUnit==='day')return body*rate*days;
    if(d.rateUnit==='year')return body*rate*days/365;
    return body*rate;
  };
  function rateLabel(d){
    const unit=d.rateUnit==='day'?'в день':d.rateUnit==='year'?'в год':'в месяц';
    return `${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:4}).format(+d.rate||0)}% ${unit}`;
  }
  function weekRange(p,w){
    const start=new Date(p.start+'T12:00:00'); start.setDate(start.getDate()+(w-1)*7);
    const end=new Date(start); end.setDate(end.getDate()+6);
    const periodEnd=new Date(p.end+'T12:00:00'); if(end>periodEnd)end.setTime(periodEnd.getTime());
    const fmt=d=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'}).format(d).replace('.','');
    return `${fmt(start)} — ${fmt(end)}`;
  }

  // Upgrade debts created in v5: turn the old fixed interest amount into an equivalent monthly rate.
  for(const d of state.debts||[]){
    if(d.rate==null){
      const base=Math.max(0,+d.principal||0), old=Math.max(0,+d.interestPerPeriod||0);
      d.rate=base?old/base*100:0; d.rateUnit='month';
    }
    if(!d.rateUnit)d.rateUnit='month';
  }
  for(const a of state.archives||[]){for(const d of a.debts||[]){if(d.rate==null){const base=Math.max(0,+d.principal||0),old=Math.max(0,+d.interestPerPeriod||0);d.rate=base?old/base*100:0;d.rateUnit='month'}if(!d.rateUnit)d.rateUnit='month'}}
  localStorage.setItem('profit-land-v5',JSON.stringify(state));

  // Move "Бизнес должен" immediately under the main Profit block.
  const businessCard=document.querySelector('.businessCard'), hero=document.querySelector('.hero');
  if(businessCard&&hero){businessCard.classList.add('businessTop');hero.insertAdjacentElement('afterend',businessCard)}
  const foodTitle=document.querySelector('#foodBuckets')?.closest('.card')?.querySelector('.head .sub');
  if(foodTitle)foodTitle.textContent='Сайт сам понимает, какая бюджетная неделя сейчас. Показываем только её.';

  // Upgrade the debt editor from a fixed amount to rate + rate period.
  const debtDialog=document.querySelector('#debtDialog');
  if(debtDialog){
    const p=debtDialog.querySelector('p'); if(p)p.textContent='Вводишь тело и ставку. Сайт сам считает минимальный платёж — проценты за финансовый период. Всё сверх него идёт в тело.';
    const oldInput=document.querySelector('#debtInterestInput');
    if(oldInput){
      const label=oldInput.previousElementSibling; if(label)label.textContent='Процентная ставка';
      oldInput.id='debtRateInput'; oldInput.step='0.01';
      if(!document.querySelector('#debtRateUnitInput')){
        const rateLabelEl=document.createElement('label');rateLabelEl.textContent='Ставка указана';
        const sel=document.createElement('select');sel.id='debtRateUnitInput';
        sel.innerHTML='<option value="month">в месяц</option><option value="day">в день</option><option value="year">в год</option>';
        oldInput.insertAdjacentElement('afterend',sel);oldInput.insertAdjacentElement('afterend',rateLabelEl);
      }
    }
  }

  debtPlannedCost=function(v){return sum((v.debts||[]).filter(d=>d.active||debtPaid(v,d.id)>0).map(d=>Math.max(d.active?debtInterestDue(v,d):0,debtPaid(v,d.id))))};

  recalcDebt=function(debtId){
    const d=state.debts.find(x=>x.id===debtId);if(!d)return;
    const p=state.activePeriod,opening=Number(p.debtOpenings[debtId]??d.principal),payments=p.debtPayments.filter(x=>x.debtId===debtId).sort((a,b)=>a.ts-b.ts);
    const v=activeView();let interestLeft=debtInterestDue(v,{...d,principal:opening}),principal=opening;
    for(const x of payments){x.interestPart=Math.min(+x.amount||0,interestLeft);interestLeft=Math.max(0,interestLeft-x.interestPart);x.principalPart=Math.min(principal,Math.max(0,(+x.amount||0)-x.interestPart));principal=Math.max(0,principal-x.principalPart)}
    d.principal=principal;if(principal<=0)d.active=false;
  };

  openDebt=function(debtId=null){
    if(viewArchiveId)return;debtRef=debtId;
    const d=debtId?state.debts.find(x=>x.id===debtId):null,pays=debtId?state.activePeriod.debtPayments.filter(x=>x.debtId===debtId):[];
    $('#debtDialogTitle').textContent=d?'Изменить долг':'Добавить долг';
    $('#debtNameInput').value=d?.name||'';$('#debtPrincipalInput').value=d?.principal??'';$('#debtRateInput').value=d?.rate??'';$('#debtRateUnitInput').value=d?.rateUnit||'month';$('#debtActiveInput').checked=d?!!d.active:true;$('#debtPrincipalInput').disabled=!!(d&&pays.length);$('#debtDialog').showModal();
  };
  saveDebt=function(){
    const name=$('#debtNameInput').value.trim(),principal=+$('#debtPrincipalInput').value,rate=+$('#debtRateInput').value,rateUnit=$('#debtRateUnitInput').value;
    if(!name||principal<0||rate<0)return;
    if(debtRef){const d=state.debts.find(x=>x.id===debtRef),pays=state.activePeriod.debtPayments.filter(x=>x.debtId===debtRef);d.name=name;d.rate=rate;d.rateUnit=rateUnit;d.active=$('#debtActiveInput').checked;if(!pays.length){d.principal=principal;state.activePeriod.debtOpenings[d.id]=principal}}
    else{const d={id:id(),name,principal,rate,rateUnit,active:$('#debtActiveInput').checked};state.debts.push(d);state.activePeriod.debtOpenings[d.id]=principal}
    save();render();$('#debtDialog').close();toast('Долг сохранён');
  };
  openDebtPay=function(debtId,paymentId=null){
    if(viewArchiveId)return;debtPayRef={debtId,paymentId};const d=state.debts.find(x=>x.id===debtId),p=paymentId?state.activePeriod.debtPayments.find(x=>x.id===paymentId):null;const due=debtInterestDue(activeView(),d);
    $('#debtPayTitle').textContent='Платёж · '+d.name;$('#debtPayHint').textContent=`Минимальный платёж по ставке ${rateLabel(d)}: ${money(due)}. Уже фактически уплачено: ${money(debtPaid(activeView(),debtId))}.`;$('#debtPayAmount').value=p?.amount??'';$('#debtPayNote').value=p?.note||'';$('#debtPayBusiness').checked=!!p?.business;$('#debtPayDialog').showModal();
  };

  renderDebts=function(v){
    $('#debtTotal').textContent=money(sum((v.debts||[]).map(x=>x.principal)));const box=$('#debtList');box.innerHTML='';
    if(!(v.debts||[]).length){box.innerHTML='<div class="empty">Долгов нет. Какая подозрительная роскошь.</div>';return}
    for(const d of v.debts){const paid=debtPaid(v,d.id),ip=debtInterestPaid(v,d.id),pp=debtPrincipalPaid(v,d.id),min=debtInterestDue(v,d),el=document.createElement('div');el.className='debt';el.innerHTML=`<div class="debtTop"><div><div class="debtName">${safe(d.name)}</div><div class="sub">${d.active?'действует':'на паузе'} · ${rateLabel(d)}</div></div><div class="debtBody">${money(d.principal)}</div></div><div class="debtStats"><div class="debtStat">Минимум<b>${money(min)}</b></div><div class="debtStat">Фактически уплачено<b>${money(paid)}</b></div><div class="debtStat">В тело<b>${money(pp)}</b></div></div><div class="sub" style="margin:0 0 8px">Из уплаченного проценты: ${money(ip)}</div><div class="debtActions"><button class="btn tiny" data-pay-debt="${d.id}" ${v.archived||!d.active?'disabled':''}>+ платёж</button><button class="btn tiny ghost" data-edit-debt="${d.id}" ${v.archived?'disabled':''}>изменить</button><button class="btn tiny danger" data-delete-debt="${d.id}" ${v.archived?'disabled':''}>удалить</button></div>`;box.appendChild(el)}
  };

  renderBuckets=function(v,kind){
    const box=$(kind==='food'?'#foodBuckets':'#socialBuckets');box.innerHTML='';
    for(const [key,b] of Object.entries(v.budgets[kind])){const el=document.createElement('div');el.className='bucket';
      if(kind==='food'){
        if(v.archived){const total=foodSpentForBucket(v,key);el.innerHTML=`<div class="bucketTop"><div><div class="bucketName">${safe(b.name)}</div><div class="sub">Архив периода · ${money(b.limit)} в неделю</div></div><div class="bucketRemain">${money(total)} потрачено</div></div>`}
        else{const cw=currentBudgetWeek(v.period),spent=currentWeekSpent(v,key,cw),remain=Math.max(0,b.limit-spent);el.innerHTML=`<div class="bucketTop"><div><div class="bucketName">${safe(b.name)}</div><div class="sub">${weekRange(v.period,cw)} · лимит ${money(b.limit)}</div></div><div class="bucketRemain">${money(remain)}</div></div><div class="progress"><i style="width:${b.limit?Math.min(100,spent/b.limit*100):0}%"></i></div><div class="row"><div class="sub">Потрачено сейчас ${money(spent)}</div><button class="btn tiny" data-spend="food" data-bucket="${key}">− трата</button></div>`}
      }else{const spent=socialSpent(v,key),remain=Math.max(0,b.limit-spent);el.innerHTML=`<div class="bucketTop"><div><div class="bucketName">${safe(b.name)}</div><div class="sub">лимит периода ${money(b.limit)}</div></div><div class="bucketRemain">${money(remain)}</div></div><div class="progress blue"><i style="width:${b.limit?Math.min(100,spent/b.limit*100):0}%"></i></div><div class="row"><div class="sub">Потрачено ${money(spent)}</div><button class="btn tiny" data-spend="social" data-bucket="${key}" ${v.archived?'disabled':''}>− трата</button></div>`}
      box.appendChild(el)}
  };

  // Make the top business-debt strip visually read as part of the header.
  const css=document.createElement('style');css.textContent=`.businessTop{margin:-2px 0 12px;border:1px solid #d9cbe1;background:linear-gradient(90deg,rgba(247,241,250,.97),rgba(255,253,247,.97));display:grid;grid-template-columns:1fr auto auto;gap:14px;align-items:center}.businessTop .head{margin:0}.businessTop .amount{font-size:30px}.businessTop .businessStats{margin:0}.businessTop .btn{white-space:nowrap}@media(max-width:760px){.businessTop{grid-template-columns:1fr}.businessTop .amount{font-size:28px}.businessTop .businessStats{margin:0}}`;
  document.head.appendChild(css);

  render();
})();
