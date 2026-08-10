/* Profitlab v8 — сквозные обязательства бизнеса и источники возврата семье */
(function(){
  const b=state.business;
  let normalized=false;
  if(!Array.isArray(b.fixedAccruals)){b.fixedAccruals=[];normalized=true}
  for(const v of allPeriods())for(const r of v.period.businessReturns||[]){if(!r.source){r.source='operating';normalized=true}}
  function persistQuiet(){localStorage.setItem(KEY,JSON.stringify(state))}
  function ensureBusinessFixedAccruals(){
    const pid=state.activePeriod.id;let changed=false;
    for(const item of b.fixedItems||[]){
      if(!item.active)continue;
      if(!b.fixedAccruals.some(x=>x.itemId===item.id&&x.periodId===pid)){
        b.fixedAccruals.push({id:id(),itemId:item.id,periodId:pid,amount:+item.amount||0,ts:Date.now()});changed=true;
      }
    }
    if(changed)persistQuiet();
  }
  if(normalized)persistQuiet();
  ensureBusinessFixedAccruals();

  function fixedAccruedAll(){return sum((b.fixedAccruals||[]).map(x=>x.amount))}
  function fixedPaidAll(){return sum((b.fixedPayments||[]).map(x=>x.amount))}
  function fixedAccruedForItem(itemId){return sum((b.fixedAccruals||[]).filter(x=>x.itemId===itemId).map(x=>x.amount))}
  function fixedPaidForItem(itemId){return sum((b.fixedPayments||[]).filter(x=>x.itemId===itemId).map(x=>x.amount))}
  function fixedDueForItem(itemId){return Math.max(0,fixedAccruedForItem(itemId)-fixedPaidForItem(itemId))}
  function fixedDueAll(){const ids=new Set([...(b.fixedAccruals||[]).map(x=>x.itemId),...(b.fixedPayments||[]).map(x=>x.itemId)]);return sum([...ids].map(fixedDueForItem))}
  function fixedAccruedCurrent(){return sum((b.fixedAccruals||[]).filter(x=>x.periodId===state.activePeriod.id).map(x=>x.amount))}
  function familyBusinessChargesAll(){return sum(allPeriods().map(v=>businessChargesPeriod(v)))}
  function returnsFromFree(){return sum(allPeriods().flatMap(v=>(v.period.businessReturns||[]).filter(x=>x.source==='free').map(x=>x.amount)))}
  function familyChargesLeftInOperating(){const charges=familyBusinessChargesAll();return Math.max(0,charges-Math.min(charges,returnsFromFree()))}

  businessOperatingSpentOwn=function(){return sum(b.operatingExpenses.map(x=>x.amount))};
  businessOperatingSpentAll=function(){return businessOperatingSpentOwn()+fixedAccruedAll()+familyChargesLeftInOperating()};
  businessOperatingBalance=function(){return businessOperatingAllocated()-businessOperatingSpentAll()};
  businessFixedPlan=function(){return sum((b.fixedItems||[]).filter(x=>x.active).map(x=>x.amount))};
  businessFixedPaid=function(pid=state.activePeriod.id){return sum((b.fixedPayments||[]).filter(x=>x.periodId===pid).map(x=>x.amount))};
  businessCashNow=function(){
    const businessDebtCash=sum(allPeriods().flatMap(v=>v.period.debtPayments.filter(p=>debtById(v,p.debtId)?.scope==='business'&&p.source==='business').map(p=>p.amount)));
    return businessRevenueTotal()-sum(b.operatingExpenses.map(x=>x.amount))-fixedPaidAll()-sum(b.taxPayments.map(x=>x.amount))-sum(b.developmentExpenses.map(x=>x.amount))-businessDistributionsTotal()-businessReturnsAll()-businessDebtCash;
  };
  businessFreeNow=function(){
    return businessCashNow()-Math.max(0,businessOperatingBalance())-Math.max(0,businessTaxBalance())-Math.max(0,businessDevelopmentBalance())-Math.max(0,businessDueTotal())-fixedDueAll()-Math.max(0,businessDebtRemainingPlan(activeView()));
  };

  const recurringSummary=document.querySelector('.recurringSummary');
  if(recurringSummary){
    const planSub=$('#businessFixedPlan')?.parentElement?.querySelector('.sub');if(planSub)planSub.textContent='начислено в этом месяце';
    const paidSub=$('#businessFixedPaid')?.parentElement?.querySelector('.sub');if(paidSub)paidSub.textContent='оплачено всего';
    if(!$('#businessFixedAccrued')){
      const accrued=document.createElement('div');accrued.innerHTML='<b id="businessFixedAccrued">0 ₽</b><div class="sub">начислено всего</div>';
      recurringSummary.insertBefore(accrued,$('#businessFixedAddBtn'));
    }
    if(!$('#businessFixedDue')){
      const due=document.createElement('div');due.innerHTML='<b id="businessFixedDue">0 ₽</b><div class="sub">бизнес должен сам по себе</div>';
      recurringSummary.insertBefore(due,$('#businessFixedAddBtn'));
    }
  }
  const heroSide=$('#businessView .heroSide');
  if(heroSide&&!$('#businessFixedDueTop'))heroSide.insertAdjacentHTML('beforeend','<span>Сквозные обязательства бизнеса</span><b class="smallBig" id="businessFixedDueTop">0 ₽</b>');
  const businessEntryActions=$('#businessEntryDialog .modalActions');
  if(businessEntryActions&&!$('#businessReturnSourceWrap')){
    const wrap=document.createElement('div');wrap.id='businessReturnSourceWrap';wrap.hidden=true;wrap.innerHTML='<label>Из каких денег возвращаем семье</label><select id="businessReturnSource"><option value="operating">Операционный фонд — расход уже сидит в 30%</option><option value="free">Свободные средства — берём из заработка и сохраняем операционку</option></select>';
    businessEntryActions.insertAdjacentElement('beforebegin',wrap);
  }

  let businessFixedPayItemId=null;
  openBusinessEntry=function(mode,o={}){
    businessEntryMode=mode;businessEditRef=o.edit||null;businessFixedPayItemId=mode==='fixedPay'?o.itemId:null;
    const item=businessFixedPayItemId?b.fixedItems.find(x=>x.id===businessFixedPayItemId):null;
    const names={revenue:'Поступление бизнеса',op:'Расход контракта',tax:'Уплачен налог',dev:'Расход на развитие',return:'Вернуть долг семье',distribution:'Вывести доход семье',fixedPay:'Оплатить сквозной расход'};
    const hints={revenue:'Каждое поступление автоматически раскладывается по операционному, налоговому и фонду развития.',op:'Фактический расход с денег бизнеса. Он уменьшает операционный фонд.',tax:'Фактически уплаченный налог уменьшает налоговый резерв.',dev:'Покупка оборудования или другая трата из фонда развития.',return:'Долг семье можно закрывать из операционного фонда или сознательно брать часть из свободного заработка, чтобы сохранить операционку.',distribution:'Это настоящий заработок семьи. Он попадёт в семейный доход и увеличит план Казначейства на 10%.',fixedPay:item?`Начисленный сквозной долг по статье «${item.name}»: ${money(fixedDueForItem(item.id))}. Можно платить частями.`:'Сквозной расход.'};
    $('#businessEntryTitle').textContent=(businessEditRef?'Изменить · ':'')+names[mode];$('#businessEntryHint').textContent=hints[mode]||'';
    $('#businessEntryAmount').value=o.amount??(mode==='fixedPay'?fixedDueForItem(businessFixedPayItemId):'');$('#businessEntryNote').value=o.note??'';
    $('#businessOwnerWrap').hidden=mode!=='distribution';$('#businessEntryOwner').value=o.owner||'Совместный';
    $('#businessReturnSourceWrap').hidden=mode!=='return';if(mode==='return')$('#businessReturnSource').value=o.source||'operating';
    $('#businessEntryDialog').showModal();setTimeout(()=>$('#businessEntryAmount').focus(),30);
  };

  saveBusinessEntry=function(){
    const amount=+$('#businessEntryAmount').value,note=$('#businessEntryNote').value.trim();if(!(amount>0))return;const mode=businessEntryMode;
    if(mode==='return'){
      const source=$('#businessReturnSource').value||'operating';
      if(amount>businessDueTotal()&&!confirm('Бизнес по модели должен семье меньше этой суммы. Всё равно записать возврат?'))return;
      if(amount>businessCashNow()&&!confirm('Сумма больше фактических денег бизнеса. Всё равно записать?'))return;
      if(source==='free'&&amount>Math.max(0,businessFreeNow())&&!confirm('Возврат из свободных средств больше текущего свободного остатка. Всё равно записать?'))return;
      state.activePeriod.businessReturns.push({id:id(),amount,note,source,ts:Date.now()});
    }else if(mode==='fixedPay'){
      const item=b.fixedItems.find(x=>x.id===businessFixedPayItemId);if(!item)return;
      const due=fixedDueForItem(item.id);if(amount>due&&!confirm('Платёж больше накопленного долга по этой статье. Всё равно записать?'))return;
      if(amount>businessCashNow()&&!confirm('Сумма больше фактических денег бизнеса. Всё равно записать?'))return;
      b.fixedPayments.push({id:id(),itemId:item.id,periodId:state.activePeriod.id,amount,note:note||item.name,ts:Date.now()});
    }else if(mode==='distribution'){
      if(amount>businessFreeNow()&&!confirm('Сумма больше свободных денег бизнеса по текущей модели. Всё равно вывести?'))return;
      const owner=$('#businessEntryOwner').value;
      if(businessEditRef?.id){const x=b.distributions.find(y=>y.id===businessEditRef.id);if(!x)return;x.amount=amount;x.note=note;x.owner=owner;const p=findPeriodById(x.periodId),inc=p?.incomes.find(y=>y.id===x.familyIncomeId);if(inc){inc.amount=amount;inc.note=note;inc.owner=owner}}
      else{const bid=id(),fid=id(),ts=Date.now();b.distributions.push({id:bid,amount,note,owner,ts,periodId:state.activePeriod.id,familyIncomeId:fid});state.activePeriod.incomes.push({id:fid,amount,note:note||'Доход из бизнеса',owner,ts,linkedBusinessId:bid})}
    }else{
      const a=businessCollection(mode);if(businessEditRef?.id){const x=a.find(y=>y.id===businessEditRef.id);if(!x)return;x.amount=amount;x.note=note}else a.push({id:id(),amount,note,ts:Date.now()});
    }
    save();render();$('#businessEntryDialog').close();toast('Сохранено');
  };

  saveBusinessFixed=function(){
    const name=$('#businessFixedNameInput').value.trim(),amount=+$('#businessFixedAmountInput').value;if(!name||amount<0)return;
    if(businessFixedRef){
      const x=b.fixedItems.find(y=>y.id===businessFixedRef);if(!x)return;x.name=name;x.amount=amount;x.active=$('#businessFixedActiveInput').checked;
      const current=(b.fixedAccruals||[]).find(a=>a.itemId===x.id&&a.periodId===state.activePeriod.id);if(current)current.amount=amount;
    }else b.fixedItems.push({id:id(),name,amount,active:$('#businessFixedActiveInput').checked});
    ensureBusinessFixedAccruals();save();render();$('#businessFixedDialog').close();toast('Сквозной расход сохранён');
  };

  renderBusinessFixed=function(){
    ensureBusinessFixedAccruals();const box=$('#businessFixedList');box.innerHTML='';
    $('#businessFixedPlan').textContent=money(fixedAccruedCurrent());$('#businessFixedPaid').textContent=money(fixedPaidAll());$('#businessFixedAccrued').textContent=money(fixedAccruedAll());$('#businessFixedDue').textContent=money(fixedDueAll());
    if(!b.fixedItems.length){box.innerHTML='<div class="empty">Сквозных расходов пока нет.</div>';return}
    for(const item of b.fixedItems){const accrued=fixedAccruedForItem(item.id),paid=fixedPaidForItem(item.id),due=fixedDueForItem(item.id),row=document.createElement('div');row.className='businessFixedItem'+(item.active?'':' inactive');row.innerHTML=`<span class="tag">${item.active?'действует':'пауза'}</span><div><div class="fiName">${safe(item.name)}</div><div class="fiMeta">${money(item.amount)} / месяц · начислено ${money(accrued)} · оплачено ${money(paid)} · долг ${money(due)}</div></div><div class="fiActions"><button class="btn tiny" data-business-fixed-pay="${item.id}" ${due<=0?'disabled':''}>+ оплатить</button><button class="btn tiny ghost" data-business-fixed-toggle="${item.id}">${item.active?'пауза':'включить'}</button><button class="btn tiny ghost" data-business-fixed-edit="${item.id}">изменить</button><button class="btn tiny danger" data-business-fixed-delete="${item.id}">×</button></div>`;box.appendChild(row)}
  };

  renderBusinessHistory=function(){
    const box=$('#businessHistoryList');box.innerHTML='';const rows=[...b.revenues.map(x=>({...x,kind:'revenue'})),...b.operatingExpenses.map(x=>({...x,kind:'op'})),...b.taxPayments.map(x=>({...x,kind:'tax'})),...b.developmentExpenses.map(x=>({...x,kind:'dev'})),...b.distributions.map(x=>({...x,kind:'distribution'})),...b.fixedPayments.map(x=>({...x,kind:'fixed'})),...allBusinessReturnRows(),...allBusinessDebtPaymentRows()].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,120);
    if(!rows.length){box.innerHTML='<div class="empty">Пока ни одного движения бизнеса.</div>';return}
    for(const x of rows){let title='',sign='−',badge='',editable=false;
      if(x.kind==='revenue'){title='Поступление бизнеса';sign='+';editable=true}
      if(x.kind==='op'){title='Расход контракта';editable=true}
      if(x.kind==='tax'){title='Налог';editable=true}
      if(x.kind==='dev'){title='Развитие';editable=true}
      if(x.kind==='distribution'){title='Выведено семье · '+(x.owner||'Совместный');editable=x.periodId===state.activePeriod.id;badge='<span class="businessTxBadge">ДОХОД СЕМЬИ</span>'}
      if(x.kind==='fixed'){const it=b.fixedItems.find(i=>i.id===x.itemId);title='Оплата сквозного · '+(it?.name||x.note||'статья');badge='<span class="businessTxBadge">СКВОЗНОЙ</span>'}
      if(x.kind==='return'){title='Возврат долга семье';badge=x.source==='free'?'<span class="businessTxBadge">ИЗ СВОБОДНЫХ</span>':'<span class="businessTxBadge">ИЗ ОПЕРАЦИОННЫХ</span>'}
      if(x.kind==='businessDebt'){title='Платёж по долгу · '+safe(x.debtName);badge='<span class="businessTxBadge">ДОЛГ БИЗНЕСА</span>'}
      const el=document.createElement('div');el.className='tx';el.innerHTML=`<div><b>${title}</b>${badge}<small>${safe(x.note)||new Date(x.ts||Date.now()).toLocaleDateString('ru-RU')}</small></div><div class="txAmount">${sign}${money(x.amount)}</div><div class="txActions">${editable?`<button class="btn tiny ghost" data-edit-business="${x.kind}" data-id="${x.id}">изменить</button><button class="btn tiny danger" data-delete-business="${x.kind}" data-id="${x.id}">удалить</button>`:''}</div>`;box.appendChild(el)}
  };

  renderBusiness=function(){
    ensureBusinessFixedAccruals();const rev=businessRevenueTotal(),opAlloc=businessOperatingAllocated(),opSpent=businessOperatingSpentAll(),taxAlloc=businessTaxAllocated(),taxPaid=sum(b.taxPayments.map(x=>x.amount)),devAlloc=businessDevelopmentAllocated(),devSpent=sum(b.developmentExpenses.map(x=>x.amount)),familyAdvanced=familyBusinessChargesAll(),shiftedToFree=Math.min(familyAdvanced,returnsFromFree()),familyInOp=familyChargesLeftInOperating(),ownOp=sum(b.operatingExpenses.map(x=>x.amount)),fixedAccrued=fixedAccruedAll(),fixedPaid=fixedPaidAll(),fixedDue=fixedDueAll(),free=businessFreeNow();
    $('#businessCashNow').textContent=money(businessCashNow());$('#businessFreeNow').textContent=money(free);$('#businessDueTop').textContent=money(businessDueTotal());$('#businessFixedDueTop').textContent=money(fixedDue);
    const bd=businessDebts(activeView());$('#businessDebtBodyTop').textContent=money(sum(bd.map(x=>x.principal)));$('#businessRevenueTotal').textContent=money(rev);$('#businessOperatingBalance').textContent=money(opAlloc-opSpent);$('#businessTaxBalance').textContent=money(taxAlloc-taxPaid);$('#businessDevelopmentBalance').textContent=money(devAlloc-devSpent);$('#businessOpRateLabel').textContent=(+b.operatingRate||0)+'%';$('#businessTaxRateLabel').textContent=(+b.taxRate||0)+'%';$('#businessDevRateLabel').textContent=(+b.developmentRate||0)+'%';
    $('#businessOperatingMeta').textContent=`Выделено ${money(opAlloc)} · занято и израсходовано ${money(opSpent)}`;$('#businessTaxMeta').textContent=`Начислено ${money(taxAlloc)} · уплачено ${money(taxPaid)}`;$('#businessDevelopmentMeta').textContent=`Выделено ${money(devAlloc)} · потрачено ${money(devSpent)}`;
    renderBusinessFixed();renderDebtList(activeView(),'business','#businessDebtList','#businessDebtTotal');
    $('#businessOperatingBreakdown').innerHTML=`<div class="br"><span>Выделено из оборота</span><b>+ ${money(opAlloc)}</b></div><div class="br"><span>Расходы контрактов с бизнес-счёта</span><b>− ${money(ownOp)}</b></div><div class="br"><span>Сквозные расходы начислено</span><b>− ${money(fixedAccrued)}</b></div><div class="br dim"><span>По сквозным уже оплачено деньгами бизнеса</span><b>${money(fixedPaid)}</b></div><div class="br"><span>Сквозной долг бизнеса сейчас</span><b>${money(fixedDue)}</b></div><div class="br"><span>Семья оплатила за бизнес</span><b>− ${money(familyAdvanced)}</b></div><div class="br dim"><span>Из этого возвращено за счёт свободного заработка</span><b>+ ${money(shiftedToFree)}</b></div><div class="br"><span>Семейных авансов остаётся на операционном фонде</span><b>− ${money(familyInOp)}</b></div><div class="br"><span>Осталось в операционном фонде</span><b>${money(opAlloc-opSpent)}</b></div>`;
    const rates=(+b.operatingRate||0)+(+b.taxRate||0)+(+b.developmentRate||0),grossFree=Math.max(0,100-rates);
    $('#businessFlow').innerHTML=`<div class="flowBox"><small>Операционный фонд · ${b.operatingRate}%</small><b>${money(opAlloc-opSpent)}</b><div class="flowArrow">выделено ${money(opAlloc)} · остаток после обязательств</div></div><div class="flowBox"><small>Налоговый резерв · ${b.taxRate}%</small><b>${money(taxAlloc-taxPaid)}</b><div class="flowArrow">УСН от оборота</div></div><div class="flowBox"><small>Развитие · ${b.developmentRate}%</small><b>${money(devAlloc-devSpent)}</b><div class="flowArrow">оборудование и рост</div></div><div class="flowBox free"><small>Свободно сейчас</small><b>${money(free)}</b><div class="flowArrow">после фондов, долгов и накопленных обязательств</div></div>`;
    renderBusinessHistory();
  };

  document.addEventListener('click',e=>{
    const familyReturn=e.target.closest('#businessReturnBtn');
    if(familyReturn){e.preventDefault();e.stopImmediatePropagation();openBusinessEntry('return');return}
    const pay=e.target.closest('[data-business-fixed-pay]');
    if(pay){e.preventDefault();e.stopImmediatePropagation();openBusinessEntry('fixedPay',{itemId:pay.dataset.businessFixedPay});return}
    if(e.target.closest('#businessEntrySave')){e.preventDefault();e.stopImmediatePropagation();saveBusinessEntry();return}
    if(e.target.closest('#businessFixedSave')){e.preventDefault();e.stopImmediatePropagation();saveBusinessFixed();return}
  },true);

  render();
})();
