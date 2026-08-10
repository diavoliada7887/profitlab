/* Profitlab v12 — Госплан после МЧС, отменённые цели не захламляют экран */
(function(){
  let busy=false;
  function tidyGosplan(){
    if(busy)return;busy=true;
    try{
      const card=document.querySelector('#goalsCard');
      const emergency=document.querySelector('#emergencySpent')?.closest('article');
      if(card&&emergency&&card.previousElementSibling!==emergency){
        emergency.insertAdjacentElement('afterend',card);
      }
      document.querySelectorAll('#goalList [data-goal-edit]').forEach(btn=>{
        const g=(state.goals||[]).find(x=>x.id===btn.dataset.goalEdit);
        const row=btn.closest('.goalItem');
        if(row)row.style.display=g?.status==='cancelled'?'none':'';
      });
      const list=document.querySelector('#goalList');
      if(list){
        const visible=[...list.querySelectorAll('.goalItem')].some(x=>x.style.display!=='none');
        const anyActive=(state.goals||[]).some(g=>g.status!=='cancelled');
        if(!visible&&!anyActive)list.innerHTML='<div class="empty">Пока Госплан никому ничего не обещал. Подозрительно.</div>';
      }
    }finally{busy=false}
  }
  const observer=new MutationObserver(()=>tidyGosplan());
  observer.observe(document.body,{childList:true,subtree:true});
  let tries=0;const timer=setInterval(()=>{tidyGosplan();if(++tries>100||document.querySelector('#goalsCard'))clearInterval(timer)},50);
  window.addEventListener('load',tidyGosplan);
})();