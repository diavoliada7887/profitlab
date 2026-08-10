/* Profitlab v12 — компактная служебная информация внизу семейного бюджета */
(function(){
  let busy=false;

  function tidyFamilyLayout(){
    if(busy)return;busy=true;
    try{
      const emergency=document.querySelector('#emergencySpent')?.closest('article');
      const business=document.querySelector('#businessDue')?.closest('article');
      const goals=document.querySelector('#goalsCard');

      /* МЧС и долг бизнеса семье — одна строка; Госплан идёт сразу следом. */
      if(emergency&&business){
        business.classList.remove('businessTop','wide');
        business.classList.add('businessCompact');
        if(emergency.nextElementSibling!==business)emergency.insertAdjacentElement('afterend',business);
      }
      if(goals){
        goals.classList.add('wide');
        const anchor=business&&business.parentElement===goals.parentElement?business:emergency;
        if(anchor&&anchor.nextElementSibling!==goals)anchor.insertAdjacentElement('afterend',goals);
      }

      /* Отменённые цели остаются в истории расчётов, но не на рабочем экране. */
      document.querySelectorAll('#goalList [data-goal-edit]').forEach(btn=>{
        const g=(state.goals||[]).find(x=>x.id===btn.dataset.goalEdit);
        const row=btn.closest('.goalItem');
        if(row)row.style.display=g?.status==='cancelled'?'none':'';
      });
      const list=document.querySelector('#goalList');
      if(list){
        const visible=[...list.querySelectorAll('.goalItem')].some(x=>x.style.display!=='none');
        const anyVisibleGoal=(state.goals||[]).some(g=>g.status!=='cancelled');
        if(!visible&&!anyVisibleGoal)list.innerHTML='<div class="empty">Пока Госплан никому ничего не обещал. Подозрительно.</div>';
      }
    }finally{busy=false}
  }

  if(!document.querySelector('#profitlabV12Style')){
    const style=document.createElement('style');style.id='profitlabV12Style';style.textContent=`
      .businessCompact{margin:0;display:block;padding:16px}
      .businessCompact .head{margin-bottom:7px}
      .businessCompact .head .sub{display:none}
      .businessCompact .title{font-size:18px}
      .businessCompact .amount{font-size:27px;margin:2px 0 5px}
      .businessCompact .businessStats{margin:0 0 9px;gap:10px;font-size:11px}
      .businessCompact .btn{white-space:normal}
      @media(max-width:760px){.businessCompact{margin:0}.businessCompact .amount{font-size:25px}}
    `;document.head.appendChild(style);
  }

  const observer=new MutationObserver(()=>tidyFamilyLayout());
  observer.observe(document.body,{childList:true,subtree:true});
  let tries=0;const timer=setInterval(()=>{tidyFamilyLayout();if(++tries>120||(document.querySelector('#goalsCard')&&document.querySelector('.businessCompact')))clearInterval(timer)},50);
  window.addEventListener('load',tidyFamilyLayout);
})();