/* Profitlab v16 — облачная память Supabase поверх локального кэша */
(function(){
  const SUPABASE_URL='https://sbpwuibsumbhmcerbwpj.supabase.co';
  const SUPABASE_KEY=atob('c2JfcHVibGlzaGFibGVfb0ZaU0NNcDBRZ3hydW82dDR6OUNnZ19NZFdrdkh6Tg==');
  const DIRTY='profitlab-cloud-dirty';
  const LAST_SYNC='profitlab-cloud-last-sync';
  const CLEAN_INIT='profitlab-cloud-clean-init';
  const EMAIL_HINT='profitlab-cloud-email';

  function ready(){
    return typeof window.supabase!=='undefined'&&typeof state!=='undefined'&&typeof render==='function'&&typeof save==='function'&&document.querySelector('.topActions')&&document.querySelector('#upcomingPayments')&&Array.isArray(state.goals)&&Array.isArray(state.business?.fixedAccruals);
  }

  function install(){
    if(window.__profitlabCloudInstalled)return;
    window.__profitlabCloudInstalled=true;
    const cloud=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    let session=null,user=null,applyingCloud=false,saveTimer=null,syncing=false,lastCloudUpdated=localStorage.getItem(LAST_SYNC)||'';

    injectUI();
    const baseSave=save;
    save=function(){baseSave();if(applyingCloud)return;localStorage.setItem(DIRTY,'1');queueCloudSave()};

    function injectUI(){
      if(!document.querySelector('#cloudStatusBtn')){
        const b=document.createElement('button');b.className='pill';b.id='cloudStatusBtn';b.type='button';b.textContent='☁ облако';document.querySelector('.topActions').prepend(b);b.addEventListener('click',openCloudDialog);
      }
      if(!document.querySelector('#cloudDialog')){
        const d=document.createElement('dialog');d.id='cloudDialog';d.innerHTML=`<div class="modal cloudModal"><h3>Общая память Профицита</h3><p id="cloudDialogText">Войди один раз на этом устройстве.</p><div id="cloudLoginBlock"><label>Email</label><input id="cloudEmailInput" type="email" autocomplete="username"><label>Пароль</label><input id="cloudPasswordInput" type="password" autocomplete="current-password"><div class="note" id="cloudLoginError" hidden></div><div class="modalActions"><button class="btn secondary" id="cloudLocalBtn" type="button">Пока локально</button><button class="btn" id="cloudLoginBtn" type="button">Войти</button></div></div><div id="cloudAccountBlock" hidden><div class="note" id="cloudAccountInfo"></div><div class="modalActions"><button class="btn secondary" id="cloudCloseBtn" type="button">Закрыть</button><button class="btn ghost" id="cloudSyncBtn" type="button">Синхронизировать сейчас</button><button class="btn ghost" id="cloudLogoutBtn" type="button">Выйти</button></div></div></div>`;document.body.appendChild(d);
        const style=document.createElement('style');style.id='profitlabCloudStyle';style.textContent=`#cloudStatusBtn[data-state="ok"]{opacity:.88}#cloudStatusBtn[data-state="saving"]{opacity:.72}#cloudStatusBtn[data-state="error"]{outline:1px solid rgba(160,80,60,.35)}.cloudModal .note{margin:10px 0}.cloudInitChoice{display:grid;gap:10px;margin-top:14px}.cloudInitChoice .btn{text-align:left}.cloudInitChoice small{display:block;margin-top:4px;color:var(--muted);font-weight:400}`;document.head.appendChild(style);
        $('#cloudLoginBtn').addEventListener('click',login);$('#cloudLocalBtn').addEventListener('click',()=>d.close());$('#cloudCloseBtn').addEventListener('click',()=>d.close());$('#cloudSyncBtn').addEventListener('click',()=>syncFromCloud(false));$('#cloudLogoutBtn').addEventListener('click',logout);$('#cloudPasswordInput').addEventListener('keydown',e=>{if(e.key==='Enter')login()});$('#cloudEmailInput').value=localStorage.getItem(EMAIL_HINT)||'';
      }
    }

    function setStatus(kind,text){
      const b=$('#cloudStatusBtn');if(!b)return;b.dataset.state=kind;b.textContent=`☁ ${text}`;const info=$('#cloudAccountInfo');if(info&&user){const when=lastCloudUpdated?new Date(lastCloudUpdated).toLocaleString('ru-RU'):'ещё не синхронизировано';info.innerHTML=`Вход: <b>${safe(user.email||'семейный аккаунт')}</b><br>Последняя облачная версия: ${safe(when)}.`}
    }
    function openCloudDialog(){const d=$('#cloudDialog');if(!d)return;const logged=!!user;$('#cloudLoginBlock').hidden=logged;$('#cloudAccountBlock').hidden=!logged;$('#cloudDialogText').textContent=logged?'Это общий семейный аккаунт. Сессия запомнена на этом устройстве.':'Войди семейным email и паролем. После этого данные будут общими для всех устройств.';if(logged)setStatus('ok','синхр.');d.showModal()}

    async function login(){
      const email=$('#cloudEmailInput').value.trim(),password=$('#cloudPasswordInput').value,err=$('#cloudLoginError');err.hidden=true;if(!email||!password){err.textContent='Нужны email и пароль.';err.hidden=false;return}$('#cloudLoginBtn').disabled=true;setStatus('saving','входим…');const {data,error}=await cloud.auth.signInWithPassword({email,password});$('#cloudLoginBtn').disabled=false;if(error){err.textContent='Не удалось войти. Проверь email и пароль.';err.hidden=false;setStatus('error','нет входа');return}localStorage.setItem(EMAIL_HINT,email);session=data.session;user=data.user;$('#cloudPasswordInput').value='';$('#cloudDialog')?.close();await syncFromCloud(false)
    }
    async function logout(){await cloud.auth.signOut();session=null;user=null;setStatus('local','вход');$('#cloudDialog')?.close()}
    function queueCloudSave(){if(!user){setStatus('local','локально');return}setStatus('saving','сохраняю…');clearTimeout(saveTimer);saveTimer=setTimeout(()=>pushCloud(),450)}

    async function pushCloud(){
      if(!user||syncing)return;syncing=true;const stamp=new Date().toISOString();try{const payload={user_id:user.id,data:clone(state),updated_at:stamp};const {data,error}=await cloud.from('family_state').upsert(payload,{onConflict:'user_id'}).select('updated_at').single();if(error)throw error;lastCloudUpdated=data?.updated_at||stamp;localStorage.setItem(LAST_SYNC,lastCloudUpdated);localStorage.removeItem(DIRTY);setStatus('ok','синхр.')}catch(e){console.error('Profitlab cloud save:',e);localStorage.setItem(DIRTY,'1');setStatus('error','не сохранено')}finally{syncing=false}
    }

    function applyCloud(raw,updatedAt){
      applyingCloud=true;try{const next=normalizeState(raw||{});if(!Array.isArray(next.goals))next.goals=[];if(!Array.isArray(next.goalMoves))next.goalMoves=[];if(!next.business)next.business=defaultBusiness();if(!Array.isArray(next.business.fixedAccruals))next.business.fixedAccruals=[];state=next;viewArchiveId=null;localStorage.setItem(KEY,JSON.stringify(state));lastCloudUpdated=updatedAt||new Date().toISOString();localStorage.setItem(LAST_SYNC,lastCloudUpdated);localStorage.removeItem(DIRTY);render();setStatus('ok','синхр.')}finally{applyingCloud=false}
    }
    async function getCloudRow(){const {data,error}=await cloud.from('family_state').select('data,updated_at').eq('user_id',user.id).maybeSingle();if(error)throw error;return data}

    async function syncFromCloud(quiet=true){
      if(!user||syncing)return;syncing=true;if(!quiet)setStatus('saving','сверяем…');try{const row=await getCloudRow();if(!row){if(localStorage.getItem(CLEAN_INIT)==='1'){localStorage.removeItem(CLEAN_INIT);syncing=false;await pushCloud();return}syncing=false;showFirstCloudChoice();return}const dirty=localStorage.getItem(DIRTY)==='1',cloudStamp=row.updated_at||'',cloudChangedSinceLast=!!(dirty&&lastCloudUpdated&&cloudStamp&&cloudStamp!==lastCloudUpdated);if(dirty&&cloudChangedSinceLast){const keepLocal=confirm('Профицит изменён и на этом устройстве, и в облаке.\n\nОК — оставить данные этого устройства и отправить их в облако.\nОтмена — взять облачную версию.');syncing=false;if(keepLocal)await pushCloud();else applyCloud(row.data,cloudStamp);return}if(dirty){syncing=false;await pushCloud();return}if(!lastCloudUpdated||cloudStamp!==lastCloudUpdated)applyCloud(row.data,cloudStamp);else setStatus('ok','синхр.')}catch(e){console.error('Profitlab cloud sync:',e);setStatus('error','нет связи')}finally{syncing=false}
    }

    function showFirstCloudChoice(){
      let d=$('#cloudInitDialog');if(!d){d=document.createElement('dialog');d.id='cloudInitDialog';d.innerHTML=`<div class="modal"><h3>Облако пока пустое</h3><p>Что положить туда первой версией Профицита?</p><div class="cloudInitChoice"><button class="btn" id="cloudStartClean" type="button">Начать с чистого листа<small>Удалим только локальные тестовые данные Профицита на этом устройстве и создадим новую пустую республику.</small></button><button class="btn secondary" id="cloudUseLocal" type="button">Взять данные с этого устройства<small>Текущее состояние станет общей облачной версией.</small></button></div></div>`;document.body.appendChild(d);$('#cloudStartClean').addEventListener('click',()=>{localStorage.setItem(CLEAN_INIT,'1');localStorage.removeItem(KEY);localStorage.removeItem(V5);localStorage.removeItem(V4);localStorage.removeItem(SNAP);localStorage.removeItem(DIRTY);localStorage.removeItem(LAST_SYNC);location.reload()});$('#cloudUseLocal').addEventListener('click',async()=>{d.close();await pushCloud()})}if(!d.open)d.showModal()
    }

    async function boot(){setStatus('saving','проверяем…');const {data,error}=await cloud.auth.getSession();if(error){console.error('Profitlab auth session:',error);setStatus('error','нет связи');return}session=data.session||null;user=session?.user||null;if(!user){setStatus('local','вход');setTimeout(()=>openCloudDialog(),150);return}setStatus('saving','сверяем…');await syncFromCloud(true)}
    cloud.auth.onAuthStateChange((event,newSession)=>{session=newSession||null;user=newSession?.user||null;if(event==='SIGNED_OUT')setStatus('local','вход')});
    window.addEventListener('focus',()=>{if(user)syncFromCloud(true)});window.addEventListener('online',()=>{if(user)syncFromCloud(true)});boot();
  }

  if(ready()){install();return}let tries=0;const timer=setInterval(()=>{if(ready()){clearInterval(timer);install();return}if(++tries>200){clearInterval(timer);console.error('Profitlab cloud: приложение не успело подготовиться к подключению.')}},50);
})();