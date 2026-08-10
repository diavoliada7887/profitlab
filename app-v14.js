/* Profitlab v14 — даты платежей и тихая лента ближайших оплат */
(function(){
  const todayNoon=()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate(),12)};
  const parseDate=s=>s?new Date(s+'T12:00:00'):null;
  const dateISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const daysBetween=(a,b)=>Math.round((b-a)/86400000);
  const monthName=d=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'}).format(d).replace('.','');
  const paymentCount=did=>sum(allPeriods().map(v=>v.period.debtPayments.filter(x=>x.debtId===did).length));

  function monthDate(y,mZero,day){
    const last=new Date(y,mZero+1,0).getDate();
    return new Date(y,mZero,Math.min(Math.max(1,+day||1),last),12);
  }
  function fixedDueDate(item,p=state.activePeriod){
    const day=+item.dueDay||0;if(!day)return null;
    const [y,m]=p.id.split('-').map(Number);
    return day>=9?monthDate(y,m-1,day):monthDate(y,m,day);
  }
  function addMonthsClamped(date,n){
    const d=new Date(date),day=d.getDate(),target=new Date(d.getFullYear(),d.getMonth()+n,1,12),last=new Date(target.getFullYear(),target.getMonth()+1,0).getDate();
    target.setDate(Math.min(day,last));return target;
  }
  function installmentNextDue(d){
    const anchor=parseDate(d.installmentNextDate);if(!anchor)return null;
    const base=Number.isFinite(+d.installmentAnchorPaidCount)?+d.installmentAnchorPaidCount:paymentCount(d.id);
    const steps=Math.max(0,paymentCount(d.id)-base),days=Math.max(1,+d.installmentEveryDays||14);
    const x=new Date(anchor);x.setDate(x.getDate()+steps*days);return x;
  }
  function creditNextDue(d){
    const anchor=parseDate(d.creditNextDate);if(!anchor)return null;
    const base=Number.isFinite(+d.creditAnchorPaidCount)?+d.creditAnchorPaidCount:paymentCount(d.id);
    return addMonthsClamped(anchor,Math.max(0,paymentCount(d.id)-base));
  }
  function debtNextDue(d){return d?.debtType==='installment'?installmentNextDue(d):creditNextDue(d)}

  /* Старые рассрочки: введённую раньше дату считаем ближайшей на момент миграции. */
  let migrated=false;
  for(const d of state.debts||[]){
    if(d.debtType==='installment'&&d.installmentAnchorPaidCount==null){d.installmentAnchorPaidCount=paymentCount(d.id);migrated=true}
  }
  if(migrated)localStorage.setItem(KEY,JSON.stringify(state));

  /* МВД: день ежемесячного платежа. */
  if($('#fixedAmountInput')&&!$('#fixedDueDayInput')){
    const wrap=document.createElement('div');wrap.id='fixedDueDayWrap';wrap.innerHTML='<label>День платежа</label><input id="fixedDueDayInput" type="number" min="1" max="31" step="1" placeholder="например: 15"><div class="sub">Необязательно. Для ежемесячных обязательств — число месяца.</div>';
    $('#fixedAmountInput').insertAdjacentElement('afterend',wrap);
  }
  const baseOpenFixed=openFixed;
  openFixed=function(groupKey,itemId=null){
    baseOpenFixed(groupKey,itemId);const item=itemId?state.budgets.fixed[groupKey]?.items?.find(x=>x.id===itemId):null;
    $('#fixedDueDayInput').value=item?.dueDay||'';
  };
  saveFixed=function(){
    const name=$('#fixedNameInput').value.trim(),amount=+$('#fixedAmountInput').value,dueDay=+$('#fixedDueDayInput').value||0;
    if(!name||amount<0||dueDay<0||dueDay>31)return;
    const g=state.budgets.fixed[fixedRef.groupKey];
    if(fixedRef.itemId){const item=g.items.find(x=>x.id===fixedRef.itemId);if(!item)return;item.name=name;item.amount=amount;item.dueDay=dueDay||null;item.business=$('#fixedBusinessInput').checked;item.active=$('#fixedActiveInput').checked}
    else g.items.push({id:id(),name,amount,dueDay:dueDay||null,business:$('#fixedBusinessInput').checked,active:$('#fixedActiveInput').checked});
    save();render();$('#fixedDialog').close();toast('Статья сохранена');
  };
  $('#fixedSave')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();saveFixed()},true);

  /* Кредитам добавляем дату ближайшего ежемесячного платежа. У рассрочек график уже есть. */
  if($('#debtRateUnitInput')&&!$('#creditNextDateWrap')){
    const wrap=document.createElement('div');wrap.id='creditNextDateWrap';wrap.innerHTML='<label>Ближайший платёж</label><input id="creditNextDateInput" type="date"><div class="sub">После записанного платежа следующая дата сдвинется на месяц.</div>';
    $('#debtRateUnitInput').insertAdjacentElement('afterend',wrap);
  }
  function refreshCreditDateField(){
    if(!$('#creditNextDateWrap'))return;
    $('#creditNextDateWrap').hidden=$('#debtTypeInput')?.value==='installment';
  }
  $('#debtTypeInput')?.addEventListener('change',refreshCreditDateField);
  const baseOpenDebtV14=openDebt;
  openDebt=function(debtId=null,forcedScope=null){
    baseOpenDebtV14(debtId,forcedScope);const d=debtId?state.debts.find(x=>x.id===debtId):null;
    $('#creditNextDateInput').value=d?.creditNextDate||'';refreshCreditDateField();
  };
  const baseSaveDebtV14=saveDebt;
  saveDebt=function(){
    const existingId=debtRef,old=existingId?state.debts.find(x=>x.id===existingId):null,oldCredit=old?.creditNextDate||'',oldInstallment=old?.installmentNextDate||'',before=new Set((state.debts||[]).map(x=>x.id)),creditDate=$('#creditNextDateInput')?.value||'',installmentDate=$('#installmentNextDateInput')?.value||'';
    baseSaveDebtV14();
    const d=existingId?state.debts.find(x=>x.id===existingId):state.debts.find(x=>!before.has(x.id));if(!d)return;
    if(d.debtType==='installment'){
      if(d.installmentAnchorPaidCount==null||oldInstallment!==installmentDate)d.installmentAnchorPaidCount=paymentCount(d.id);
      delete d.creditNextDate;delete d.creditAnchorPaidCount;
    }else{
      if(!existingId||oldCredit!==creditDate||d.creditAnchorPaidCount==null)d.creditAnchorPaidCount=paymentCount(d.id);
      d.creditNextDate=creditDate;delete d.installmentAnchorPaidCount;
    }
    save();render();
  };

  /* Дата прямо внутри МВД. */
  renderFixed=function(v){
    const box=$('#fixedGroups');box.innerHTML='';
    for(const[gk,g]of Object.entries(v.budgets.fixed)){
      const active=(g.items||[]).filter(x=>x.active),plan=sum(active.map(x=>x.amount)),paid=sum(active.map(x=>fixedPayment(v,x.id)?.amount||0)),el=document.createElement('div');el.className='fixedGroup';
      el.innerHTML=`<div class="fixedHead"><div><div class="fixedTitle">${safe(g.name)}</div><div class="fixedTotals">План <b>${money(plan)}</b> · оплачено <b>${money(paid)}</b> · осталось <b>${money(Math.max(0,plan-paid))}</b></div></div><button class="btn tiny secondary" data-add-fixed="${gk}" ${v.archived?'disabled':''}>+ статья</button></div><div class="fixedItems"></div>`;
      const items=el.querySelector('.fixedItems');if(!(g.items||[]).length)items.innerHTML='<div class="empty">Пока пусто.</div>';
      for(const item of g.items||[]){
        const pay=fixedPayment(v,item.id),due=!v.archived&&item.dueDay?fixedDueDate(item,v.period):null,row=document.createElement('div');row.className='fixedItem'+(item.active?'':' inactive');
        row.innerHTML=`<input type="checkbox" ${pay?'checked':''} data-toggle-paid="${gk}" data-id="${item.id}" ${v.archived||!item.active?'disabled':''} aria-label="Оплачено"><div><div class="fiName">${safe(item.name)}${item.business?'<span class="businessBadge">БИЗНЕС</span>':''}</div><div class="fiMeta">${money(item.amount)}${due?` · платёж ${monthName(due)}`:''} · ${item.active?'действует':'на паузе'} · ${pay?'оплачено':'не оплачено'}</div></div><div class="fiActions"><button class="btn tiny ghost" data-toggle-active="${gk}" data-id="${item.id}" ${v.archived?'disabled':''}>${item.active?'пауза':'включить'}</button><button class="btn tiny ghost" data-edit-fixed="${gk}" data-id="${item.id}" ${v.archived?'disabled':''}>изменить</button><button class="btn tiny danger" data-delete-fixed="${gk}" data-id="${item.id}" ${v.archived?'disabled':''}>×</button></div>`;
        items.appendChild(row);
      }
      box.appendChild(el);
    }
  };

  /* Дата в карточках долгов, не вмешиваясь в расчёты v9/v10. */
  const baseRenderDebtListV14=renderDebtList;
  renderDebtList=function(v,scope,boxSelector,totalSelector){
    baseRenderDebtListV14(v,scope,boxSelector,totalSelector);
    if(v.archived)return;
    const debts=(v.debts||[]).filter(d=>(d.scope||'family')===scope),cards=[...$(boxSelector).querySelectorAll('.debt')];
    debts.forEach((d,i)=>{
      const due=debtNextDue(d),sub=cards[i]?.querySelector('.debtTop .sub');if(!due||!sub)return;
      if(d.debtType==='installment')sub.textContent=sub.textContent.replace(/ · ближайший .*$/,'')+` · ближайший ${monthName(due)}`;
      else sub.textContent+=` · ближайший ${monthName(due)}`;
    });
  };
  renderDebts=function(v){renderDebtList(v,'family','#debtList','#debtTotal')};

  /* Небольшая, нейтральная лента под героем. */
  if(!$('#upcomingPayments')){
    const hero=$('#familyView .hero'),strip=document.createElement('section');strip.id='upcomingPayments';strip.className='upcomingPayments';strip.innerHTML='<div class="upcomingLabel">Ближайшие оплаты</div><div class="upcomingList" id="upcomingPaymentsList"></div>';
    hero?.insertAdjacentElement('afterend',strip);
    const css=document.createElement('style');css.id='profitlabV14Style';css.textContent=`
      .upcomingPayments{display:flex;gap:12px;align-items:center;margin:-2px 2px 12px;padding:9px 12px;border:1px solid var(--line);border-radius:14px;background:rgba(255,253,247,.72);box-shadow:0 3px 10px rgba(37,48,47,.03)}
      .upcomingLabel{font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);white-space:nowrap}
      .upcomingList{display:flex;gap:7px;flex-wrap:wrap;min-width:0}.upcomingPay{display:flex;gap:6px;align-items:baseline;padding:4px 8px;border-radius:9px;background:#faf7ef;border:1px solid rgba(217,210,194,.72);font-size:12px;white-space:nowrap}.upcomingPay time{font-weight:750;color:var(--ink)}.upcomingPay span{color:var(--muted)}.upcomingPay b{font-size:12px;color:var(--ink)}.upcomingMore{font-size:11px;color:var(--muted);align-self:center}.upcomingEmpty{font-size:12px;color:var(--muted)}
      @media(max-width:760px){.upcomingPayments{align-items:flex-start;flex-direction:column;gap:6px}.upcomingList{display:grid;width:100%}.upcomingPay{white-space:normal;justify-content:space-between;gap:8px}}
    `;document.head.appendChild(css);
  }
  function upcomingDateText(d){
    const diff=daysBetween(todayNoon(),d);if(diff===0)return 'сегодня';if(diff===1)return 'завтра';if(diff>1&&diff<=7)return `через ${diff} дн.`;if(diff<0)return monthName(d);return monthName(d);
  }
  function collectUpcoming(){
    const rows=[],v=activeView();if(v.archived)return rows;
    for(const[gk,g]of Object.entries(state.budgets.fixed))for(const item of g.items||[]){
      if(!item.active||!item.dueDay||fixedPayment(v,item.id))continue;const due=fixedDueDate(item,v.period);if(due)rows.push({date:due,name:`${g.name} · ${item.name}`,amount:+item.amount||0,kind:'fixed'});
    }
    for(const d of familyDebts(v)){
      if(!d.active)continue;const due=debtNextDue(d);if(!due)continue;
      const amount=d.debtType==='installment'?Math.min(+d.installmentPayment||0,+d.principal||0):Math.max(0,debtInterestDue(v,d));
      rows.push({date:due,name:d.name,amount,kind:'debt'});
    }
    return rows.sort((a,b)=>a.date-b.date);
  }
  function renderUpcoming(){
    const box=$('#upcomingPaymentsList'),card=$('#upcomingPayments');if(!box||!card)return;card.hidden=!!viewArchiveId;box.innerHTML='';if(viewArchiveId)return;
    const rows=collectUpcoming(),shown=rows.slice(0,4);
    if(!shown.length){box.innerHTML='<span class="upcomingEmpty">Даты пока не заданы — добавь их в МВД или долгах.</span>';return}
    for(const x of shown){const el=document.createElement('div');el.className='upcomingPay';el.innerHTML=`<time>${safe(upcomingDateText(x.date))}</time><span>${safe(x.name)}</span>${x.amount>0?`<b>${money(x.amount)}</b>`:''}`;box.appendChild(el)}
    if(rows.length>shown.length){const more=document.createElement('span');more.className='upcomingMore';more.textContent=`ещё ${rows.length-shown.length}`;box.appendChild(more)}
  }

  const baseRenderV14=render;
  render=function(){baseRenderV14();renderUpcoming()};
  render();refreshCreditDateField();
})();