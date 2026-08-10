/* Profitlab v15 — ближайшие оплаты только на 7 дней вперёд */
(function(){
  function installWeeklyReminder(){
    if(!document.querySelector('#upcomingPayments')||typeof render!=='function')return false;

    const todayNoon=()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate(),12)};
    const parseDate=s=>s?new Date(s+'T12:00:00'):null;
    const daysBetween=(a,b)=>Math.round((b-a)/86400000);
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
    function dateText(d){
      const diff=daysBetween(todayNoon(),d);
      if(diff===0)return 'сегодня';
      if(diff===1)return 'завтра';
      return `через ${diff} дн.`;
    }
    function collectWeek(){
      const rows=[],v=activeView(),today=todayNoon();if(v.archived)return rows;
      const inWeek=due=>{const diff=due?daysBetween(today,due):-1;return diff>=0&&diff<=7};

      for(const[gk,g]of Object.entries(state.budgets.fixed))for(const item of g.items||[]){
        if(!item.active||!item.dueDay||fixedPayment(v,item.id))continue;
        const due=fixedDueDate(item,v.period);if(!inWeek(due))continue;
        rows.push({date:due,name:`${g.name} · ${item.name}`,amount:+item.amount||0});
      }
      for(const d of familyDebts(v)){
        if(!d.active)continue;
        const due=debtNextDue(d);if(!inWeek(due))continue;
        const amount=d.debtType==='installment'?Math.min(+d.installmentPayment||0,+d.principal||0):Math.max(0,debtInterestDue(v,d));
        rows.push({date:due,name:d.name,amount});
      }
      return rows.sort((a,b)=>a.date-b.date);
    }
    function renderWeek(){
      const card=$('#upcomingPayments'),box=$('#upcomingPaymentsList');if(!card||!box)return;
      const rows=collectWeek();card.hidden=!!viewArchiveId||rows.length===0;box.innerHTML='';if(card.hidden)return;
      const shown=rows.slice(0,4);
      for(const x of shown){
        const el=document.createElement('div');el.className='upcomingPay';
        el.innerHTML=`<time>${safe(dateText(x.date))}</time><span>${safe(x.name)}</span>${x.amount>0?`<b>${money(x.amount)}</b>`:''}`;
        box.appendChild(el);
      }
      if(rows.length>shown.length){
        const more=document.createElement('span');more.className='upcomingMore';more.textContent=`ещё ${rows.length-shown.length}`;box.appendChild(more);
      }
    }

    const baseRender=render;
    render=function(){baseRender();renderWeek()};
    renderWeek();
    return true;
  }

  if(installWeeklyReminder())return;
  let tries=0;
  const timer=setInterval(()=>{
    if(installWeeklyReminder()||++tries>=100)clearInterval(timer);
  },50);
})();