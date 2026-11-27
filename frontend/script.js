const $ = id => document.getElementById(id);
const input = $('input'), messages = $('messages'), welcome = $('welcome');
let voices = [], recognition = null, listening = false;
let voiceEnabled = true, customCommands = [], reminders = [], savedVoiceName = null, conversaPromise = null;

// ===== Banco de dados =====
// No Electron: usa o SQLite (window.yummiko.db, definido no preload.js).
// No navegador comum: usa o LocalStorage como plano B, com as mesmas funções.
function criarBancoLocal(){
  const ler=k=>JSON.parse(localStorage.getItem(k)||'[]');
  const gravar=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const comIds=k=>{const l=ler(k);let mudou=false;l.forEach((x,i)=>{if(x.id==null){x.id=Date.now()+i;mudou=true}});if(mudou)gravar(k,l);return l};
  return {
    settings:{
      get:async k=>localStorage.getItem('yummiko-'+k),
      set:async(k,v)=>{localStorage.setItem('yummiko-'+k,String(v));return true}
    },
    commands:{
      list:async()=>comIds('yummiko-commands'),
      add:async d=>{const l=comIds('yummiko-commands');if(l.some(c=>c.trigger.toLowerCase()===d.trigger.toLowerCase()))throw Error('Já existe um comando com essa frase.');const n={...d,id:Date.now()};l.push(n);gravar('yummiko-commands',l);return n},
      remove:async id=>{gravar('yummiko-commands',ler('yummiko-commands').filter(c=>c.id!==id));return true}
    },
    reminders:{
      list:async()=>comIds('yummiko-reminders'),
      add:async d=>{const l=comIds('yummiko-reminders');const n={text:d.text,when:d.when,notified:false,id:Date.now()};l.push(n);gravar('yummiko-reminders',l);return n},
      markNotified:async id=>{gravar('yummiko-reminders',ler('yummiko-reminders').map(r=>r.id===id?{...r,notified:true}:r));return true},
      remove:async id=>{gravar('yummiko-reminders',ler('yummiko-reminders').filter(r=>r.id!==id));return true}
    },
    chat:{newConversation:async()=>1,addMessage:async()=>true}
  };
}
const db = window.yummiko?.db || criarBancoLocal();
const msgErro = e => String(e?.message||e).replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/,'');
const guardar = (chave,valor) => db.settings.set(chave,valor).catch(()=>toast('Não foi possível salvar a configuração.'));
const garantirConversa = () => (conversaPromise ??= db.chat.newConversation());
function salvarMensagem(role,content){garantirConversa().then(id=>db.chat.addMessage({conversationId:id,role,content})).catch(()=>{})}

// Copia os dados antigos do LocalStorage para o banco (roda uma única vez).
async function migrarLocalStorage(){
  if(!window.yummiko?.db||(await db.settings.get('migrou_localstorage'))==='1')return;
  try{
    for(const c of JSON.parse(localStorage.getItem('yummiko-commands')||'[]')){try{await db.commands.add(c)}catch(_){}}
    for(const r of JSON.parse(localStorage.getItem('yummiko-reminders')||'[]')){try{const n=await db.reminders.add({text:r.text,when:r.when});if(r.notified)await db.reminders.markNotified(n.id)}catch(_){}}
    const voz=localStorage.getItem('yummiko-voice');if(voz)await db.settings.set('voice',voz);
  }catch(_){}
  await db.settings.set('migrou_localstorage','1');
}
// Carrega tudo do banco quando o app abre.
async function carregarDados(){
  try{
    await migrarLocalStorage();
    customCommands=await db.commands.list();
    reminders=await db.reminders.list();
    voiceEnabled=(await db.settings.get('voice'))!=='off';
    savedVoiceName=await db.settings.get('voice_name');
    const rate=await db.settings.get('voice_rate'),pitch=await db.settings.get('voice_pitch');
    if(rate){$('rate').value=rate;$('rateValue').textContent=Number(rate).toFixed(2)+'×'}
    if(pitch){$('pitch').value=pitch;$('pitchValue').textContent=Number(pitch).toFixed(2)}
    $('voiceToggle').classList.toggle('active',voiceEnabled);
    if('speechSynthesis' in window)loadVoices();
    renderReminders();checkReminders();
  }catch(e){toast('Não foi possível carregar os dados salvos.')}
}

function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),2400)}
function addMessage(text,who){
  welcome.hidden=true;salvarMensagem(who==='user'?'user':'assistant',text);
  const article=document.createElement('article');article.className=`message ${who}`;
  const avatar=document.createElement('div');avatar.className='avatar';avatar.textContent=who==='user'?'EU':'✦';
  const content=document.createElement('div');content.className='message-content';
  const name=document.createElement('div');name.className='message-name';name.textContent=who==='user'?'Você':'Yummiko';
  const body=document.createElement('div');body.className='message-text';body.textContent=text;
  content.append(name,body);article.append(avatar,content);messages.append(article);article.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function speak(text){
  if(!voiceEnabled || !('speechSynthesis' in window))return;
  speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(text);utterance.lang='pt-BR';
  utterance.rate=Number($('rate').value);utterance.pitch=Number($('pitch').value);
  const selected=$('voiceSelect').value;
  const voice=voices.find(v=>v.name===selected);
  if(voice)utterance.voice=voice;
  speechSynthesis.speak(utterance);
}
function reply(text){addMessage(text,'assistant');speak(text)}
function openUrl(url){
  try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))throw Error();window.open(parsed.href,'_blank','noopener,noreferrer');return true}
  catch(_){toast('Informe um endereço válido começando com http:// ou https://');return false}
}
function findCustomCommand(query){
  const normalized=query.trim().toLocaleLowerCase('pt-BR');
  return customCommands.find(c=>normalized===c.trigger.toLocaleLowerCase('pt-BR'));
}
function runCustom(command){
  if(command.type==='url'){if(openUrl(command.action))return `Executando seu comando “${command.trigger}”.`}
  if(command.type==='search'){window.open('https://www.google.com/search?q='+encodeURIComponent(command.action),'_blank','noopener,noreferrer');return `Pesquisando por: ${command.action}`}
  return command.action;
}
function processCommand(raw){
  const text=raw.trim(), lower=text.toLocaleLowerCase('pt-BR');
  const custom=findCustomCommand(text);if(custom)return runCustom(custom);
  if(/^(oi|olá|ola|bom dia|boa tarde|boa noite)\b/.test(lower)){
    const h=new Date().getHours();return `${h<12?'Bom dia':h<18?'Boa tarde':'Boa noite'}! 😊 Estou aqui. O que vamos fazer?`;
  }
  if(lower.includes('que horas')||lower==='horas')return `Agora são ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}.`;
  if(lower.includes('que dia')||lower.includes('data de hoje'))return `Hoje é ${new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}.`;
  if(lower==='ajuda'||lower.includes('comandos disponíveis')||lower.includes('o que você pode fazer')){
    return 'Posso consultar o clima, organizar lembretes, fazer cálculos e pesquisar na web.\n\n• “Clima em São Gonçalo”\n• Use a Agenda para salvar compromissos e lembretes\n• “Calcule 12 vezes 8”\n• “Pesquisar por notícias de tecnologia”\n• “Que horas são?” / “Que dia é hoje?”\n\nTambém aceito comandos personalizados. A pesquisa abre em uma nova aba.';
  }
  if(lower.includes('curiosidade')){
    const facts=['Polvos têm três corações e sangue azulado.','Um dia em Vênus é mais longo que um ano venusiano.','As abelhas podem aprender a reconhecer padrões.','A luz do Sol leva cerca de 8 minutos e 20 segundos para chegar à Terra.'];
    return facts[Math.floor(Math.random()*facts.length)];
  }
  if(lower.startsWith('calcule ')||lower.startsWith('quanto é ')||lower.startsWith('quanto e ')){
    const expression=text.replace(/^(calcule|quanto é|quanto e)\s*/i,'').replace(/,/g,'.');
    if(/^[\d\s.+\-*/()%]+$/.test(expression)){try{const value=Function('"use strict";return ('+expression+')')();if(Number.isFinite(value))return `O resultado é ${value.toLocaleString('pt-BR')}.`}catch(_){}}
    return 'Não entendi a conta. Experimente “Calcule 25 * 4”.';
  }
  const wa=text.match(/^(?:enviar )?whats(?:app)? para (\+?\d{10,15})\s*:\s*(.+)$/i);
  if(wa){
    const phone=wa[1].replace(/\D/g,'');const url=`https://wa.me/${phone}?text=${encodeURIComponent(wa[2])}`;
    openUrl(url);return 'Preparei a mensagem no WhatsApp. Confira o contato e toque em enviar no aplicativo. (O envio não é automático.)';
  }
  const site=lower.match(/^(?:abrir|acessar)\s+(google|youtube|gmail|wikipedia|wikipédia)$/);
  if(site){const urls={google:'https://google.com',youtube:'https://youtube.com',gmail:'https://mail.google.com',wikipedia:'https://pt.wikipedia.org','wikipédia':'https://pt.wikipedia.org'};openUrl(urls[site[1]]);return `Abrindo ${site[1]}.`}
  if(lower.startsWith('pesquisar por ')||lower.startsWith('pesquise ')){
    const query=text.replace(/^pesquisar por |^pesquise /i,'');openUrl('https://www.google.com/search?q='+encodeURIComponent(query));return `Pesquisando na web por “${query}”.`;
  }
  if(lower.includes('obrigad'))return 'Por nada! Sempre que precisar, estarei por aqui. ✨';
  return 'Ainda não tenho uma resposta programada para isso. Você pode criar um comando personalizado para essa frase, ou usar “Ajuda” para ver o que consigo fazer.';
}

function send(){
  const text=input.value.trim();if(!text)return;addMessage(text,'user');input.value='';input.style.height='auto';
  setTimeout(()=>reply(processCommand(text)),250);
}
$('send').addEventListener('click',send);
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
input.addEventListener('input',()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,150)+'px'});
document.querySelectorAll('[data-command]').forEach(btn=>btn.addEventListener('click',()=>{input.value=btn.dataset.command;send();$('sidebar').classList.remove('open')}));
$('newChat').addEventListener('click',()=>{conversaPromise=null;messages.replaceChildren();welcome.hidden=false;$('sidebar').classList.remove('open');input.focus()});
$('menu').addEventListener('click',()=>$('sidebar').classList.toggle('open'));

// Speech synthesis voices, voice selection and adjustable speech characteristics.
function loadVoices(){
  voices=speechSynthesis.getVoices();
  const select=$('voiceSelect'),previous=select.value||savedVoiceName;
  select.replaceChildren();
  const pt=voices.filter(v=>v.lang.toLowerCase().startsWith('pt'));
  (pt.length?pt:voices).forEach(v=>{const option=document.createElement('option');option.value=v.name;option.textContent=`${v.name} — ${v.lang}${v.default?' (padrão)':''}`;select.append(option)});
  if(previous&&[...select.options].some(o=>o.value===previous))select.value=previous;
}
if('speechSynthesis' in window){loadVoices();speechSynthesis.addEventListener?.('voiceschanged',loadVoices)}
$('voiceToggle').classList.toggle('active',voiceEnabled);
$('voiceToggle').addEventListener('click',()=>{voiceEnabled=!voiceEnabled;guardar('voice',voiceEnabled?'on':'off');$('voiceToggle').classList.toggle('active',voiceEnabled);toast(voiceEnabled?'Resposta por voz ativada':'Resposta por voz desativada');if(!voiceEnabled&&'speechSynthesis'in window)speechSynthesis.cancel()});
$('voiceSettingsOpen').addEventListener('click',()=>{$('voiceModal').classList.add('show');loadVoices()});
$('rate').addEventListener('input',()=>$('rateValue').textContent=Number($('rate').value).toFixed(2)+'×');
$('pitch').addEventListener('input',()=>$('pitchValue').textContent=Number($('pitch').value).toFixed(2));
$('voiceSelect').addEventListener('change',()=>guardar('voice_name',$('voiceSelect').value));
$('rate').addEventListener('change',()=>guardar('voice_rate',$('rate').value));
$('pitch').addEventListener('change',()=>guardar('voice_pitch',$('pitch').value));
$('testVoice').addEventListener('click',()=>speak('Olá! Eu sou a Yummiko, sua assistente virtual. Como posso ajudar você hoje?'));

// Speech recognition with graceful support detection.
const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
if(SpeechRecognition){
  recognition=new SpeechRecognition();recognition.lang='pt-BR';recognition.interimResults=true;recognition.continuous=false;recognition.maxAlternatives=3;
  recognition.onstart=()=>{listening=true;$('mic').classList.add('listening');toast('Estou ouvindo…')};
  recognition.onresult=e=>{let interim='',finalText='';for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)finalText+=e.results[i][0].transcript;else interim+=e.results[i][0].transcript}input.value=finalText||interim;if(finalText.trim())send()};
  recognition.onerror=e=>{toast(e.error==='not-allowed'?'Permita o acesso ao microfone nas configurações do navegador.':'Falha no reconhecimento. Tente novamente.');};
  recognition.onend=()=>{listening=false;$('mic').classList.remove('listening')};
  $('mic').addEventListener('click',()=>{if(listening){recognition.stop();return}try{recognition.start()}catch(_){toast('O reconhecimento já está ativo.')}});
}else{$('mic').addEventListener('click',()=>toast('Reconhecimento de voz não suportado. Experimente Chrome ou Edge.'))}

// Comandos personalizados (salvos no banco de dados).
function renderCommands(){
  const list=$('savedCommands');list.replaceChildren();
  if(!customCommands.length){const empty=document.createElement('p');empty.className='hint';empty.textContent='Nenhum comando salvo ainda.';list.append(empty);return}
  customCommands.forEach((command,index)=>{
    const row=document.createElement('div');row.className='command-row';
    const info=document.createElement('div');info.textContent=command.trigger;
    const detail=document.createElement('small');detail.textContent=(command.type==='url'?'Abrir site':command.type==='search'?'Pesquisa Google':'Resposta')+' · '+command.action;info.append(detail);
    const del=document.createElement('button');del.className='delete-command';del.textContent='Excluir';del.addEventListener('click',async()=>{try{await db.commands.remove(command.id);customCommands.splice(index,1);renderCommands()}catch(e){toast(msgErro(e))}});
    row.append(info,del);list.append(row);
  });
}
$('customOpen').addEventListener('click',()=>{$('commandsModal').classList.add('show');renderCommands()});
$('saveCommand').addEventListener('click',async()=>{
  const trigger=$('trigger').value.trim(),action=$('action').value.trim(),type=$('actionType').value;
  if(!trigger||!action){toast('Preencha a frase e a ação.');return}
  if(customCommands.some(c=>c.trigger.toLowerCase()===trigger.toLowerCase())){toast('Já existe um comando com essa frase.');return}
  try{customCommands.push(await db.commands.add({trigger,action,type}))}catch(e){toast(msgErro(e));return}
  renderCommands();$('trigger').value='';$('action').value='';toast('Comando personalizado salvo!');
});
document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>$(btn.dataset.close).classList.remove('show')));
document.querySelectorAll('.modal-backdrop').forEach(backdrop=>backdrop.addEventListener('click',e=>{if(e.target===backdrop)backdrop.classList.remove('show')}));

// Ferramentas principais: clima, agenda, calculadora e pesquisa na web.
const toolTitles = {
  weather: ['Clima', 'Consulte a temperatura e a previsão do tempo.'],
  agenda: ['Agenda e lembretes', 'Salve compromissos neste dispositivo.'],
  calculator: ['Calculadora', 'Digite uma conta ou use a voz para ditá-la.'],
  search: ['Pesquisa na web', 'Pesquise assuntos na internet.']
};
function openTool(name){
  if(!toolTitles[name]) return;
  $('toolTitle').textContent=toolTitles[name][0];
  $('toolSubtitle').textContent=toolTitles[name][1];
  document.querySelectorAll('[data-pane]').forEach(p=>p.hidden=p.dataset.pane!==name);
  $('toolsModal').classList.add('show');
  if(name==='agenda') renderReminders();
}
document.querySelectorAll('[data-tool]').forEach(btn=>btn.addEventListener('click',()=>{
  openTool(btn.dataset.tool);$('sidebar').classList.remove('open');
}));

// Clima com geocodificação e previsão da Open-Meteo (sem chave de API).
$('getWeather')?.addEventListener('click', async ()=>{
  const city=$('weatherCity').value.trim(), out=$('weatherResult');
  if(!city){out.textContent='Digite uma cidade para consultar.';return;}
  out.textContent='Consultando a previsão…';
  try{
    const geo=await fetch('https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(city)+'&count=1&language=pt&format=json');
    if(!geo.ok) throw Error('Não foi possível localizar a cidade.');
    const gd=await geo.json();if(!gd.results?.length)throw Error('Não encontrei essa cidade. Confira o nome e tente novamente.');
    const place=gd.results[0];
    const res=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3`);
    if(!res.ok)throw Error('Não foi possível obter a previsão agora.');
    const d=await res.json(), c=d.current, daily=d.daily;
    const codes={0:'Céu limpo',1:'Predominantemente limpo',2:'Parcialmente nublado',3:'Nublado',45:'Neblina',48:'Neblina com gelo',51:'Garoa leve',53:'Garoa moderada',55:'Garoa intensa',61:'Chuva leve',63:'Chuva moderada',65:'Chuva forte',71:'Neve leve',80:'Pancadas de chuva',81:'Pancadas moderadas',82:'Pancadas fortes',95:'Trovoadas'};
    const weather=codes[c.weather_code]||'Condição variável';
    const days=daily.time.map((day,i)=>`<p><strong>${new Date(day+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit'})}</strong>: ${Math.round(daily.temperature_2m_min[i])}° a ${Math.round(daily.temperature_2m_max[i])}° · chuva: ${daily.precipitation_probability_max[i]??'—'}%</p>`).join('');
    out.innerHTML=`<h3>${place.name}${place.admin1?', '+place.admin1:''}</h3><p><strong>${Math.round(c.temperature_2m)}°C</strong> · ${weather}</p><p>Sensação: ${Math.round(c.apparent_temperature)}°C · Umidade: ${c.relative_humidity_2m}% · Vento: ${Math.round(c.wind_speed_10m)} km/h</p><h3>Próximos dias</h3>${days}`;
    reply(`Em ${place.name}, agora faz ${Math.round(c.temperature_2m)} graus. ${weather}. Sensação térmica de ${Math.round(c.apparent_temperature)} graus.`);
  }catch(e){out.textContent=e.message||'Erro ao consultar o clima.';}
});

// Agenda local, persistida no navegador. Notificações dependem da permissão do usuário.
function renderReminders(){
  const list=$('reminderList');if(!list)return;list.replaceChildren();
  reminders.sort((a,b)=>a.when.localeCompare(b.when));
  if(!reminders.length){list.textContent='Nenhum compromisso salvo.';return;}
  reminders.forEach((r,i)=>{
    const row=document.createElement('div');row.className='command-row';
    const info=document.createElement('div');info.textContent=r.text;
    const detail=document.createElement('small');detail.textContent=new Date(r.when).toLocaleString('pt-BR');info.append(detail);
    const del=document.createElement('button');del.className='delete-command';del.textContent='Excluir';del.addEventListener('click',async()=>{try{await db.reminders.remove(r.id);reminders.splice(i,1);renderReminders()}catch(e){toast(msgErro(e))}});
    row.append(info,del);list.append(row);
  });
}
$('addReminder')?.addEventListener('click',async()=>{
  const text=$('reminderText').value.trim(),when=$('reminderDate').value;
  if(!text||!when){toast('Informe o compromisso e a data.');return;}
  if(new Date(when).getTime()<=Date.now()){toast('Escolha uma data futura.');return;}
  try{reminders.push(await db.reminders.add({text,when}))}catch(e){toast(msgErro(e));return}
  renderReminders();$('reminderText').value='';$('reminderDate').value='';
  if('Notification'in window&&Notification.permission==='default'){
    try{await Notification.requestPermission()}catch(_){/* indisponível */}
  }
  reply(`Lembrete salvo: ${text}, em ${new Date(when).toLocaleString('pt-BR')}.`);
});
function checkReminders(){
  const now=Date.now();
  reminders.forEach(r=>{if(!r.notified&&new Date(r.when).getTime()<=now){r.notified=true;db.reminders.markNotified(r.id).catch(()=>{});if('Notification'in window&&Notification.permission==='granted')new Notification('Yummiko — Lembrete',{body:r.text});else toast('Lembrete: '+r.text);}});
}
setInterval(checkReminders,15000);checkReminders();

// Calculadora com validação de caracteres permitidos.
function evaluateMath(raw){
  const exp=raw.replace(/,/g,'.').replace(/×/g,'*').replace(/÷/g,'/').replace(/\s+/g,'');
  if(!exp||!/^[0-9.+\-*/()%]+$/.test(exp))throw Error('Use números e operadores +, -, *, / e parênteses.');
  const result=Function('"use strict";return ('+exp+')')();
  if(!Number.isFinite(result))throw Error('Não foi possível calcular essa expressão.');
  return result;
}
$('calculate')?.addEventListener('click',()=>{
  try{const result=evaluateMath($('calcExpression').value);$('calcResult').textContent='Resultado: '+result.toLocaleString('pt-BR');reply('O resultado é '+result.toLocaleString('pt-BR')+'.');}
  catch(e){$('calcResult').textContent=e.message;}
});

// Pesquisa na web: abre resultados em nova aba, sem afirmar que páginas foram lidas.
function searchWeb(query){
  const q=query.trim();if(!q)return false;
  const url='https://www.google.com/search?q='+encodeURIComponent(q);
  window.open(url,'_blank','noopener,noreferrer');return true;
}
const searchButton=document.createElement('button');searchButton.className='nav';searchButton.dataset.tool='search';searchButton.innerHTML='⌕ <span>Pesquisa na web</span>';
const customButton=$('customOpen');customButton?.parentNode.insertBefore(searchButton,customButton.nextSibling);
searchButton.addEventListener('click',()=>{openTool('search');$('sidebar').classList.remove('open')});
const searchPane=document.createElement('section');searchPane.className='tool-pane';searchPane.dataset.pane='search';searchPane.hidden=true;
searchPane.innerHTML='<label for="webSearchQuery">O que deseja pesquisar?</label><input id="webSearchQuery" placeholder="Ex.: notícias de tecnologia"><div class="modal-actions"><button class="primary" id="webSearchButton">Pesquisar no Google</button></div><p class="hint">Os resultados serão abertos em uma nova aba do navegador.</p>';
document.querySelector('.tools-modal .tool-pane[data-pane="reader"]')?.after(searchPane);
$('webSearchButton')?.addEventListener('click',()=>{const q=$('webSearchQuery').value.trim();if(!q){toast('Digite o que deseja pesquisar.');return;}searchWeb(q);reply('Abri uma pesquisa na web sobre: '+q);});

// Comandos por texto ou voz para as ferramentas principais.
const originalProcessCommand=processCommand;
processCommand=function(raw){
  const t=raw.trim(),l=t.toLocaleLowerCase('pt-BR');
  if(/^(pesquisar|pesquise|pesquisa na web|buscar)\b/.test(l)){
    const q=t.replace(/^(pesquisar|pesquise|pesquisa na web|buscar)(\s+por)?\s*/i,'');
    if(q){searchWeb(q);return `Abri uma pesquisa na web sobre: ${q}.`;}
    openTool('search');return 'O que você gostaria de pesquisar?';
  }
  if(/\b(clima|previsão do tempo|temperatura)\b/.test(l)){openTool('weather');const city=t.match(/(?:em|para)\s+(.+)$/i);if(city)$('weatherCity').value=city[1];return 'Vamos consultar o clima. Informe a cidade e toque em Consultar previsão.';}
  if(/\b(agenda|lembrete|compromisso)\b/.test(l)){openTool('agenda');return 'Abri sua agenda. Você pode preencher o compromisso e a data para salvar.';}
  if(/^(calcule|calcular|quanto é|quanto e)\b/i.test(t)){
    const expr=t.replace(/^(calcule|calcular|quanto é|quanto e)\s*/i,'');
    try{const n=evaluateMath(expr);openTool('calculator');$('calcExpression').value=expr;$('calcResult').textContent='Resultado: '+n.toLocaleString('pt-BR');return 'O resultado é '+n.toLocaleString('pt-BR')+'.';}catch(_){openTool('calculator');$('calcExpression').value=expr;return 'Abri a calculadora. Confira a operação e toque em Calcular.';}
  }
  return originalProcessCommand(raw);
};

// Carrega os dados salvos assim que o app abre.
carregarDados();