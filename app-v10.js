/* Profitlab v10 — цена покупки отдельно от реальной суммы накопления */
(function(){
  function isInstallment(d){return d?.debtType==='installment'}
  function isSavingsInstallment(d){return d?.scope==='family'&&isInstallment(d)&&d.installmentTarget==='savings'}
  function paidAllForDebt(debtId){return sum(allPeriods().flatMap(v=>v.period.debtPayments.filter(p=>p.debtId===debtId).map(p=>p.amount)))}
  function purchasePrice(d){return Math.max(0,+d.installmentPurchasePrice||(+d.principal||0)+paidAllForDebt(d.id))}
  function savingsValue(d){const p=purchasePrice(d);return Math.max(0,d.installmentSavingsValue==null?p:+d.installmentSavingsValue||0)}
  function savingsRatio(d){const p=purchasePrice(d);return p>0?savingsValue(d)/p:0}
  function savingsCreditForAmount(d,amount){return Math.max(0,+amount||0)*savingsRatio(d)}
  function manualSavings(v){return sum(v.period.savings.map(x=>x.amount))}
  function rawInstallmentActual(v,target){let n=0;for(const p of v.period.debtPayments){const d=debtById(v,p.debtId);if(d?.scope==='family'&&isInstallment(d)&&d.installmentTarget===target)n+=+p.amount||0}return n}
  function creditedSavingsActual(v){let n=0;for(const p of v.period.debtPayments){const d=debtById(v,p.debtId);if(isSavingsInstallment(d))n+=savingsCreditForAmount(d,p.amount)}return n}
  function installmentDueInPeriod(v,d){
    if(!isInstallment(d)||!d.active)return 0;const pay=Math.max(0,+d.installmentPayment||0),step=Math.max(1,+d.installmentEveryDays||14);if(!pay||!d.installmentNextDate)return 0;
    const start=new Date(v.period.start+'T12:00:00'),end=new Date(v.period.end+'T12:00:00'),first=new Date(d.installmentNextDate+'T12:00:00');if(Number.isNaN(first.getTime()))return 0;
    let cur=new Date(first),count=0,guard=0;while(cur<start&&guard++<1000)cur.setDate(cur.getDate()+step);while(cur<=end&&guard++<1100){count++;cur.setDate(cur.getDate()+step)}
    return Math.min(Math.max(0,debtOpening(v,d)),count*pay);
  }
  function rawInstallmentProjected(v,target){return sum(familyDebts(v).filter(d=>isInstallment(d)&&d.installmentTarget===target).map(d=>Math.max(installmentDueInPeriod(v,d),debtPaid(v,d.id))))}
  function creditedSavingsProjected(v){return sum(familyDebts(v).filter(isSavingsInstallment).map(d=>Math.max(installmentDueInPeriod(v,d),debtPaid(v,d.id))*savingsRatio(d)))}
  function nonCategorizedDebtPaid(v){return sum(v.period.debtPayments.filter(p=>{if(p.source==='business')return false;const d=debtById(v,p.debtId);if(!d)return true;if(d.scope==='family'&&isInstallment(d)&&(d.installmentTarget==='savings'||d.installmentTarget==='social'))return false;return true}).map(x=>x.amount))}

  let migrated=false;
  for(const d of state.debts||[]){if(isSavingsInstallment(d)){if(d.installmentPurchasePrice==null){d.installmentPurchasePrice=(+d.principal||0)+paidAllForDebt(d.id);migrated=true}if(d.installmentSavingsValue==null){d.installmentSavingsValue=d.installmentPurchasePrice;migrated=true}}}
  for(const a of state.archives||[])for(const d of a.debts||[]){if(isSavingsInstallment(d)){if(d.installmentPurchasePrice==null){d.installmentPurchasePrice=+d.principal||0;migrated=true}if(d.installmentSavingsValue==null){d.installmentSavingsValue=d.installmentPurchasePrice;migrated=true}}}
  if(migrated)localStorage.setItem(KEY,JSON.stringify(state));

  const targetWrap=$('#installmentTargetWrap');
  if(targetWrap&&!$('#installmentSavingsValueWrap')){
    const wrap=document.createElement('div');wrap.id='installmentSavingsValueWrap';wrap.hidden=true;wrap.innerHTML='<label>Зачесть в накопления</label><input id="installmentSavingsValueInput" type="number" min="0" step="1" placeholder="ликвидная стоимость сегодня"><div class="sub">Не цена покупки, а сумма, которую актив реально стоит для накоплений сейчас.</div><div class="note" id="installmentSavingsValuePreview"></div>';
    targetWrap.insertAdjacentElement('afterend',wrap);
  }
  function refreshSavingsField(){
    if(!$('#installmentSavingsValueWrap'))return;const on=$('#debtTypeInput')?.value==='installment'&&$('#debtScopeInput')?.value==='family'&&$('#installmentTargetInput')?.value==='savings';$('#installmentSavingsValueWrap').hidden=!on;if(!on)return;
    const price=Math.max(0,+$('#debtPrincipalInput').value||0),value=Math.max(0,+$('#installmentSavingsValueInput').value||0),diff=Math.max(0,price-value);
    $('#installmentSavingsValuePreview').textContent=value?`Покупка ${money(price)} → в накопления ${money(value)}${diff?` · разница ${money(diff)} считается ценой входа`:''}.`:'Укажи ликвидную стоимость, которую реально считаем накоплением.';
  }
  ['debtTypeInput','debtScopeInput','installmentTargetInput','debtPrincipalInput','installmentSavingsValueInput'].forEach(i=>$('#'+i)?.addEventListener('input',refreshSavingsField));
  $('#debtTypeInput')?.addEventListener('change',refreshSavingsField);$('#debtScopeInput')?.addEventListener('change',refreshSavingsField);$('#installmentTargetInput')?.addEventListener('change',refreshSavingsField);

  const baseOpenDebt=openDebt;
  openDebt=function(debtId=null,forcedScope=null){
    baseOpenDebt(debtId,forcedScope);const d=debtId?state.debts.find(x=>x.id===debtId):null;$('#installmentSavingsValueInput').value=isSavingsInstallment(d)?savingsValue(d):'';refreshSavingsField();
  };
  const baseSaveDebt=saveDebt;
  saveDebt=function(){
    const wantsSavings=$('#debtTypeInput')?.value==='installment'&&$('#debtScopeInput')?.value==='family'&&$('#installmentTargetInput')?.value==='savings';const liquid=+$('#installmentSavingsValueInput')?.value;
    if(wantsSavings&&!(liquid>=0)){toast('Укажи, сколько реально идёт в накопления');return}if(wantsSavings&&$('#installmentSavingsValueInput').value===''){toast('Укажи ликвидную стоимость накопления');return}
    const existingId=debtRef,before=new Set((state.debts||[]).map(x=>x.id)),priceBefore=existingId?purchasePrice(state.debts.find(x=>x.id===existingId)):Math.max(0,+$('#debtPrincipalInput').value||0);
    baseSaveDebt();
    const d=existingId?state.debts.find(x=>x.id===existingId):state.debts.find(x=>!before.has(x.id));if(!d)return;
    if(isSavingsInstallment(d)){d.installmentPurchasePrice=priceBefore||(+d.principal||0);d.installmentSavingsValue=Math.max(0,liquid||0)}
    save();render();
  };

  savingsFact=function(v){return manualSavings(v)+creditedSavingsActual(v)};
  projectedResult=function(v){
    const rawScheduled=rawInstallmentProjected(v,'savings'),creditedScheduled=creditedSavingsProjected(v),manual=manualSavings(v),extraToPlan=Math.max(0,savingsPlan(v)-manual-creditedScheduled),cashForSavings=manual+rawScheduled+extraToPlan;
    return incomeTotal(v)-cashForSavings-projectedVariableCost(v)-fixedPlan(v)-emergencySpent(v)-debtPlannedCost(v)+businessReturnsPeriod(v);
  };
  actualCashDelta=function(v){return incomeTotal(v)-manualSavings(v)-rawInstallmentActual(v,'savings')-foodSpent(v)-socialSpentAll(v)-fixedPaid(v)-emergencySpent(v)-nonCategorizedDebtPaid(v)+businessReturnsPeriod(v)};

  const baseRenderDebtList=renderDebtList;
  renderDebtList=function(v,scope,boxSelector,totalSelector){
    baseRenderDebtList(v,scope,boxSelector,totalSelector);const box=$(boxSelector),debts=(v.debts||[]).filter(d=>(d.scope||'family')===scope),cards=[...box.querySelectorAll('.debt')];
    debts.forEach((d,i)=>{if(!isSavingsInstallment(d)||!cards[i])return;const price=purchasePrice(d),value=savingsValue(d),paid=debtPaid(v,d.id),credited=Math.min(value,savingsCreditForAmount(d,paid)),premium=Math.max(0,price-value);const note=document.createElement('div');note.className='note';note.innerHTML=`Цена покупки <b>${money(price)}</b> · в накопления считаем <b>${money(value)}</b>${premium?` · цена входа <b>${money(premium)}</b>`:''}<br>Из уже уплаченного ${money(paid)} накоплением считается ${money(credited)}.`;cards[i].appendChild(note)});
  };
  renderDebts=function(v){renderDebtList(v,'family','#debtList','#debtTotal')};

  const oldRender=render;
  render=function(){oldRender();const v=activeView();renderDebts(v);renderDebtList(v,'business','#businessDebtList','#businessDebtTotal');const credited=creditedSavingsActual(v),raw=rawInstallmentActual(v,'savings');if($('#installmentSavingsFact'))$('#installmentSavingsFact').textContent=raw?`Через рассрочки уплачено ${money(raw)}, в накопления по ликвидной стоимости зачтено ${money(credited)}.`:'';refreshSavingsField()};
  render();
})();
