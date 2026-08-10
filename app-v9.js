/* Profitlab v9 — кредиты, рассрочки и бюджетный смысл долга */
(function(){
  const allDebtSets=[state.debts||[],...(state.archives||[]).map(a=>a.debts||[])];
  let migrated=false;
  for(const set of allDebtSets)for(const d of set){
    if(!d.debtType){d.debtType='credit';migrated=true}
    if(d.debtType==='installment'){
      if(!d.installmentTarget)d.installmentTarget='obligation';
      if(!d.installmentEveryDays)d.installmentEveryDays=14;
    }
  }
  if(migrated)localStorage.setItem(KEY,JSON.stringify(state));

  function isInstallment(d){return d?.debtType==='installment'}
  function targetLabel(d){
    if(!isInstallment(d))return 'КРЕДИТ';
    if(d.scope==='business')return 'РАССРОЧКА · БИЗНЕС';
    return 'РАССРОЧКА · '+({savings:'НАКОПЛЕНИЯ',social:'СОЦИАЛКА',obligation:'ОБЯЗАТЕЛЬСТВА'}[d.installmentTarget]||'ОБЯЗАТЕЛЬСТВА');
  }
  function baseSocialSpentAll(v){return sum(v.period.expenses.filter(x=>x.envelope==='social').map(x=>x.amount))}
  function baseSocialSpent(v,bucket){return sum(v.period.expenses.filter(x=>x.envelope==='social'&&x.bucket===bucket).map(x=>x.amount))}
  function manualSavings(v){return sum(v.period.savings.map(x=>x.amount))}
  function installmentActual(v,target,bucket=null){
    let n=0;
    for(const p of v.period.debtPayments){
      const d=debtById(v,p.debtId);
      if(!d||d.scope!=='family'||!isInstallment(d)||d.installmentTarget!==target)continue;
      if(bucket&&d.installmentSocialBucket!==bucket)continue;
      n+=+p.amount||0;
    }
    return n;
  }
  function installmentDueInPeriod(v,d){
    if(!isInstallment(d)||!d.active)return 0;
    const pay=Math.max(0,+d.installmentPayment||0),step=Math.max(1,+d.installmentEveryDays||14);
    if(!pay||!d.installmentNextDate)return 0;
    const start=new Date(v.period.start+'T12:00:00'),end=new Date(v.period.end+'T12:00:00'),first=new Date(d.installmentNextDate+'T12:00:00');
    if(Number.isNaN(first.getTime()))return 0;
    let cur=new Date(first),count=0,guard=0;
    while(cur<start&&guard++<1000)cur.setDate(cur.getDate()+step);
    while(cur<=end&&guard++<1100){count++;cur.setDate(cur.getDate()+step)}
    const opening=Math.max(0,debtOpening(v,d));
    return Math.min(opening,count*pay);
  }
  function installmentProjected(v,target,bucket=null){
    return sum(familyDebts(v).filter(d=>isInstallment(d)&&d.installmentTarget===target&&(!bucket||d.installmentSocialBucket===bucket)).map(d=>Math.max(installmentDueInPeriod(v,d),debtPaid(v,d.id))));
  }
  function nonCategorizedDebtPaid(v){
    return sum(v.period.debtPayments.filter(p=>{
      if(p.source==='business')return false;
      const d=debtById(v,p.debtId);
      if(!d)return true;
      if(d.scope==='family'&&isInstallment(d)&&(d.installmentTarget==='savings'||d.installmentTarget==='social'))return false;
      return true;
    }).map(x=>x.amount));
  }

  savingsFact=function(v){return manualSavings(v)+installmentActual(v,'savings')};
  socialSpentAll=function(v){return baseSocialSpentAll(v)+installmentActual(v,'social')};
  socialSpent=function(v,bucket){return baseSocialSpent(v,bucket)+installmentActual(v,'social',bucket)};
  variableSpent=function(v){return foodSpent(v)+socialSpentAll(v)};
  debtPlannedCost=function(v){
    return sum(familyDebts(v).filter(d=>d.active||debtPaid(v,d.id)>0).map(d=>{
      if(isInstallment(d)){
        if(d.installmentTarget==='savings'||d.installmentTarget==='social')return 0;
        return Math.max(d.active?installmentDueInPeriod(v,d):0,debtPaid(v,d.id));
      }
      return Math.max(d.active?debtInterestDue(v,d):0,debtPaid(v,d.id));
    }));
  };
  projectedVariableCost=function(v){
    const socialCommitted=baseSocialSpentAll(v)+installmentProjected(v,'social');
    return Math.max(foodPlan(v),foodSpent(v))+Math.max(socialPlan(v),socialCommitted);
  };
  projectedResult=function(v){
    const savingsCommitted=Math.max(savingsPlan(v),manualSavings(v)+installmentProjected(v,'savings'));
    return incomeTotal(v)-savingsCommitted-projectedVariableCost(v)-fixedPlan(v)-emergencySpent(v)-debtPlannedCost(v)+businessReturnsPeriod(v);
  };
  closingResult=function(v){
    const savingsCost=manualSavings(v)+Math.max(installmentActual(v,'savings'),installmentProjected(v,'savings'));
    const socialCost=baseSocialSpentAll(v)+Math.max(installmentActual(v,'social'),installmentProjected(v,'social'));
    return incomeTotal(v)-savingsCost-foodSpent(v)-socialCost-fixedPlan(v)-emergencySpent(v)-debtPlannedCost(v)+businessReturnsPeriod(v);
  };
  actualCashDelta=function(v){
    return incomeTotal(v)-savingsFact(v)-foodSpent(v)-socialSpentAll(v)-fixedPaid(v)-emergencySpent(v)-nonCategorizedDebtPaid(v)+businessReturnsPeriod(v);
  };

  const debtDialog=$('#debtDialog');
  if(debtDialog&&!$('#debtTypeInput')){
    const scope=$('#debtScopeInput');
    const typeLabel=document.createElement('label');typeLabel.textContent='Тип';typeLabel.id='debtTypeLabel';
    const type=document.createElement('select');type.id='debtTypeInput';type.innerHTML='<option value="credit">Кредит</option><option value="installment">Рассрочка</option>';
    scope.previousElementSibling.insertAdjacentElement('beforebegin',typeLabel);typeLabel.insertAdjacentElement('afterend',type);
    const rate=$('#debtRateInput'),rateUnit=$('#debtRateUnitInput');
    if(rate?.previousElementSibling)rate.previousElementSibling.id='debtRateLabel';
    if(rateUnit?.previousElementSibling)rateUnit.previousElementSibling.id='debtRateUnitLabel';
    const wrap=document.createElement('div');wrap.id='installmentFields';wrap.hidden=true;wrap.innerHTML=`
      <label>Платёж по графику</label><input id="installmentPaymentInput" type="number" min="0" step="1">
      <label>Платить каждые</label><select id="installmentEveryInput"><option value="7">1 неделю</option><option value="14" selected>2 недели</option><option value="28">4 недели</option></select>
      <label>Ближайший платёж</label><input id="installmentNextDateInput" type="date">
      <div id="installmentTargetWrap"><label>Что это для семейного бюджета</label><select id="installmentTargetInput"><option value="savings">Накопления</option><option value="social">Социалка</option><option value="obligation">Обязательство</option></select></div>
      <div id="installmentSocialWrap" hidden><label>Чья социалка</label><select id="installmentSocialBucketInput"><option value="oksana">Оксана</option><option value="tim">Тимоха</option><option value="mom">Мама</option></select></div>
      <div class="note" id="installmentPreview"></div>`;
    rateUnit.insertAdjacentElement('afterend',wrap);
  }

  function refreshDebtMode(){
    const installment=$('#debtTypeInput').value==='installment',business=$('#debtScopeInput').value==='business';
    $('#debtRateInput').hidden=installment;$('#debtRateUnitInput').hidden=installment;$('#debtRateLabel').hidden=installment;$('#debtRateUnitLabel').hidden=installment;
    $('#installmentFields').hidden=!installment;
    $('#installmentTargetWrap').hidden=!installment||business;
    const social=installment&&!business&&$('#installmentTargetInput').value==='social';$('#installmentSocialWrap').hidden=!social;
    const p=+$('#debtPrincipalInput').value||0,pay=+$('#installmentPaymentInput').value||0,days=+$('#installmentEveryInput').value||14;
    if(installment){const count=pay?Math.ceil(p/pay):0,weeks=count?Math.round((count-1)*days/7):0;$('#installmentPreview').textContent=count?`Осталось примерно ${count} платеж${count===1?'':'а/ей'}; последний примерно через ${weeks} нед.`:'Укажи остаток и платёж — покажу длину хвоста.'}
  }
  ['debtTypeInput','debtScopeInput','installmentTargetInput','debtPrincipalInput','installmentPaymentInput','installmentEveryInput'].forEach(i=>$('#'+i)?.addEventListener('input',refreshDebtMode));
  $('#debtScopeInput')?.addEventListener('change',refreshDebtMode);$('#debtTypeInput')?.addEventListener('change',refreshDebtMode);$('#installmentTargetInput')?.addEventListener('change',refreshDebtMode);

  openDebt=function(debtId=null,forcedScope=null){
    if(viewArchiveId)return;debtRef=debtId;const d=debtId?state.debts.find(x=>x.id===debtId):null,pays=debtId?state.activePeriod.debtPayments.filter(x=>x.debtId===debtId):[];
    $('#debtDialogTitle').textContent=d?'Изменить долг':forcedScope==='business'?'Добавить долг бизнеса':'Добавить долг';
    $('#debtNameInput').value=d?.name||'';$('#debtScopeInput').value=d?.scope||forcedScope||'family';$('#debtTypeInput').value=d?.debtType||'credit';
    $('#debtPrincipalInput').value=d?.principal??'';$('#debtRateInput').value=d?.rate??'';$('#debtRateUnitInput').value=d?.rateUnit||'month';
    $('#installmentPaymentInput').value=d?.installmentPayment??'';$('#installmentEveryInput').value=String(d?.installmentEveryDays||14);$('#installmentNextDateInput').value=d?.installmentNextDate||'';
    $('#installmentTargetInput').value=d?.installmentTarget||'obligation';$('#installmentSocialBucketInput').value=d?.installmentSocialBucket||'oksana';
    $('#debtActiveInput').checked=d?!!d.active:true;$('#debtPrincipalInput').disabled=!!(d&&pays.length);$('#debtScopeInput').disabled=!!(d&&pays.length);$('#debtTypeInput').disabled=!!(d&&pays.length);
    refreshDebtMode();$('#debtDialog').showModal();
  };
  saveDebt=function(){
    const name=$('#debtNameInput').value.trim(),principal=+$('#debtPrincipalInput').value,type=$('#debtTypeInput').value,scope=$('#debtScopeInput').value;if(!name||principal<0)return;
    const active=$('#debtActiveInput').checked;let data={name,principal,debtType:type,scope,active};
    if(type==='credit'){
      const rate=+$('#debtRateInput').value,rateUnit=$('#debtRateUnitInput').value;if(rate<0)return;data={...data,rate,rateUnit};
    }else{
      const installmentPayment=+$('#installmentPaymentInput').value,installmentEveryDays=+$('#installmentEveryInput').value,installmentNextDate=$('#installmentNextDateInput').value,installmentTarget=scope==='business'?'obligation':$('#installmentTargetInput').value,installmentSocialBucket=$('#installmentSocialBucketInput').value;
      if(!(installmentPayment>0)||!installmentNextDate){toast('Для рассрочки нужен платёж и дата');return}
      data={...data,rate:0,rateUnit:'month',installmentPayment,installmentEveryDays,installmentNextDate,installmentTarget,installmentSocialBucket};
    }
    if(debtRef){const d=state.debts.find(x=>x.id===debtRef),pays=state.activePeriod.debtPayments.filter(x=>x.debtId===debtRef);Object.assign(d,data);if(pays.length){d.principal=d.principal;d.scope=d.scope;d.debtType=d.debtType}else state.activePeriod.debtOpenings[d.id]=principal}
    else{const d={id:id(),...data};state.debts.push(d);state.activePeriod.debtOpenings[d.id]=principal}
    save();render();$('#debtDialog').close();toast(type==='installment'?'Рассрочка сохранена':'Кредит сохранён');
  };

  recalcDebt=function(debtId){
    const d=state.debts.find(x=>x.id===debtId);if(!d)return;const p=state.activePeriod,opening=Number(p.debtOpenings[debtId]??d.principal),payments=p.debtPayments.filter(x=>x.debtId===debtId).sort((a,b)=>a.ts-b.ts);let principal=opening;
    if(isInstallment(d)){
      for(const x of payments){x.interestPart=0;x.principalPart=Math.min(principal,+x.amount||0);principal=Math.max(0,principal-x.principalPart)}
    }else{
      let interestLeft=debtInterestDue(activeView(),{...d,principal:opening});for(const x of payments){x.interestPart=Math.min(+x.amount||0,interestLeft);interestLeft=Math.max(0,interestLeft-x.interestPart);x.principalPart=Math.min(principal,Math.max(0,(+x.amount||0)-x.interestPart));principal=Math.max(0,principal-x.principalPart)}
    }
    d.principal=principal;if(principal<=0)d.active=false;
  };
  openDebtPay=function(debtId,paymentId=null){
    if(viewArchiveId)return;debtPayRef={debtId,paymentId};const d=state.debts.find(x=>x.id===debtId),p=paymentId?state.activePeriod.debtPayments.find(x=>x.id===paymentId):null;
    $('#debtPayTitle').textContent=(isInstallment(d)?'Платёж по рассрочке · ':'Платёж · ')+d.name;
    if(isInstallment(d))$('#debtPayHint').textContent=`По графику ${money(d.installmentPayment)} каждые ${Math.round((+d.installmentEveryDays||14)/7)} нед. В этом финансовом периоде запланировано ${money(installmentDueInPeriod(activeView(),d))}, уже оплачено ${money(debtPaid(activeView(),debtId))}.`;
    else $('#debtPayHint').textContent=`Минимальный платёж по ставке ${rateLabel(d)}: ${money(debtInterestDue(activeView(),d))}. Уже фактически уплачено: ${money(debtPaid(activeView(),debtId))}.`;
    $('#debtPayAmount').value=p?.amount??(isInstallment(d)?Math.min(+d.installmentPayment||0,+d.principal||0):'');$('#debtPayNote').value=p?.note||'';const business=d.scope==='business';$('#debtPaySourceWrap').hidden=!business;$('#debtPaySource').value=p?.source||(business?'business':'family');$('#debtPayDialog').showModal();
  };
  saveDebtPay=function(){
    const amount=+$('#debtPayAmount').value,note=$('#debtPayNote').value.trim();if(!(amount>0))return;const p=state.activePeriod,d=state.debts.find(x=>x.id===debtPayRef.debtId),source=d?.scope==='business'?$('#debtPaySource').value:'family',business=!!(d?.scope==='business'&&source==='family');
    if(isInstallment(d)&&!debtPayRef.paymentId&&amount>d.principal&&!confirm('Платёж больше остатка рассрочки. Всё равно записать?'))return;
    if(debtPayRef.paymentId){const x=p.debtPayments.find(x=>x.id===debtPayRef.paymentId);x.amount=amount;x.note=note;x.source=source;x.business=business}else p.debtPayments.push({id:id(),debtId:debtPayRef.debtId,amount,note,source,business,interestPart:0,principalPart:0,ts:Date.now()});
    recalcDebt(debtPayRef.debtId);save();render();$('#debtPayDialog').close();toast('Платёж записан');
  };

  renderDebtList=function(v,scope,boxSelector,totalSelector){
    const debts=(v.debts||[]).filter(d=>(d.scope||'family')===scope);$(totalSelector).textContent=money(sum(debts.map(x=>x.principal)));const box=$(boxSelector);box.innerHTML='';if(!debts.length){box.innerHTML=`<div class="empty">${scope==='business'?'Займов бизнеса пока нет.':'Долгов нет. Какая подозрительная роскошь.'}</div>`;return}
    for(const d of debts){const paid=debtPaid(v,d.id),pp=debtPrincipalPaid(v,d.id),el=document.createElement('div');el.className='debt';
      if(isInstallment(d)){
        const due=installmentDueInPeriod(v,d),weeks=Math.round((+d.installmentEveryDays||14)/7),target=d.scope==='business'?'':` · ${({savings:'накопления',social:'социалка',obligation:'обязательства'}[d.installmentTarget]||'обязательства')}`;
        el.innerHTML=`<div class="debtTop"><div><div class="debtName">${safe(d.name)} <span class="businessBadge">${targetLabel(d)}</span></div><div class="sub">${d.active?'действует':'на паузе'} · ${money(d.installmentPayment)} каждые ${weeks} нед.${target} · ближайший ${d.installmentNextDate?shortDate(d.installmentNextDate):'—'}</div></div><div class="debtBody">${money(d.principal)}</div></div><div class="debtStats"><div class="debtStat">По графику в периоде<b>${money(due)}</b></div><div class="debtStat">Уплачено<b>${money(paid)}</b></div><div class="debtStat">В погашение<b>${money(pp)}</b></div></div><div class="debtActions"><button class="btn tiny" data-pay-debt="${d.id}" ${v.archived||!d.active?'disabled':''}>+ платёж</button><button class="btn tiny ghost" data-edit-debt="${d.id}" ${v.archived?'disabled':''}>изменить</button><button class="btn tiny danger" data-delete-debt="${d.id}" ${v.archived?'disabled':''}>удалить</button></div>`;
      }else{
        const ip=debtInterestPaid(v,d.id),min=debtInterestDue(v,d);el.innerHTML=`<div class="debtTop"><div><div class="debtName">${safe(d.name)} <span class="businessBadge">КРЕДИТ</span></div><div class="sub">${d.active?'действует':'на паузе'} · ${rateLabel(d)}</div></div><div class="debtBody">${money(d.principal)}</div></div><div class="debtStats"><div class="debtStat">Минимум<b>${money(min)}</b></div><div class="debtStat">Уплачено<b>${money(paid)}</b></div><div class="debtStat">В тело<b>${money(pp)}</b></div></div><div class="sub" style="margin:0 0 8px">Из уплаченного проценты: ${money(ip)}</div><div class="debtActions"><button class="btn tiny" data-pay-debt="${d.id}" ${v.archived||!d.active?'disabled':''}>+ платёж</button><button class="btn tiny ghost" data-edit-debt="${d.id}" ${v.archived?'disabled':''}>изменить</button><button class="btn tiny danger" data-delete-debt="${d.id}" ${v.archived?'disabled':''}>удалить</button></div>`;
      }
      box.appendChild(el);
    }
  };
  renderDebts=function(v){renderDebtList(v,'family','#debtList','#debtTotal')};

  const savingRemain=$('#savingRemain');if(savingRemain&&!$('#installmentSavingsFact'))savingRemain.insertAdjacentHTML('afterend','<div class="sub" id="installmentSavingsFact"></div>');
  const oldRender=render;
  render=function(){
    oldRender();
    const v=activeView();renderDebts(v);renderDebtList(v,'business','#businessDebtList','#businessDebtTotal');
    const extra=installmentActual(v,'savings');if($('#installmentSavingsFact'))$('#installmentSavingsFact').textContent=extra?`Из факта накоплений ${money(extra)} оплачено через рассрочки.`:'';
    refreshDebtMode();
  };

  $('#debtSave').addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();saveDebt()},true);
  $('#debtPaySave').addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();saveDebtPay()},true);
  render();
})();
