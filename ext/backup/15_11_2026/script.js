const input = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messages = document.getElementById('messages');
const welcome = document.getElementById('welcome');
const micBtn = document.getElementById('micBtn');
const sidebar = document.getElementById('sidebar');
const toast = document.getElementById('toast');

function notify(text) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove('show'), 2300);
}

function addMessage(text, who) {
  welcome.hidden = true;
  const item = document.createElement('article');
  item.className = `message ${who}`;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = who === 'user' ? 'EU' : '✦';
  const content = document.createElement('div');
  content.className = 'message-content';
  const name = document.createElement('div');
  name.className = 'message-name';
  name.textContent = who === 'user' ? 'Você' : 'Nova';
  const body = document.createElement('div');
  body.className = 'message-text';
  body.textContent = text;
  content.append(name, body);
  item.append(avatar, content);
  messages.appendChild(item);
  item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-BR';
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

function reply(text) {
  addMessage(text, 'assistant');
  if (localStorage.getItem('nova-voice') === 'on') speak(text);
}

function processCommand(raw) {
  const text = raw.trim();
  const lower = text.toLocaleLowerCase('pt-BR');

  if (/^(oi|olá|ola|bom dia|boa tarde|boa noite)\b/.test(lower)) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    return `${greeting}! 😊 Como posso ajudar você?`;
  }
  if (lower.includes('que horas') || lower === 'horas') {
    return `Agora são ${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}.`;
  }
  if (lower.includes('que dia') || lower.includes('data de hoje')) {
    return `Hoje é ${new Date().toLocaleDateString('pt-BR', {weekday:'long', day:'numeric', month:'long', year:'numeric'})}.`;
  }
  if (lower.includes('o que você pode fazer') || lower.includes('ajuda') || lower.includes('comandos')) {
    return 'Posso ajudar com alguns comandos locais:\n\n• “Que horas são?” — mostra o horário.\n• “Que dia é hoje?” — mostra a data.\n• “Calcule 25 * 4” — resolve contas básicas.\n• “Pesquisar por receitas” — abre uma pesquisa na web.\n• “Abrir YouTube” ou “Abrir Google” — abre um site.\n• “Enviar WhatsApp para 5511999999999: Olá!” — prepara uma mensagem no WhatsApp.\n\nTambém posso responder por voz usando o botão do microfone. Esta versão funciona sem uma API de inteligência artificial.';
  }
  if (lower.includes('curiosidade')) {
    const facts = [
      'Polvos têm três corações e sangue azulado.',
      'Um dia em Vênus é mais longo que um ano venusiano.',
      'As abelhas conseguem reconhecer padrões que lembram rostos.',
      'O coração de uma baleia-azul pode pesar tanto quanto um pequeno carro.'
      'O português é um dos únicos idiomas que não batizou os dias da semana com nomes de planetas ou deuses mitológicos.'
    ];
    return facts[Math.floor(Math.random() * facts.length)];
  }
  if (lower.startsWith('calcule ') || lower.startsWith('quanto é ') || lower.startsWith('quanto e ')) {
    const expression = text.replace(/^(calcule|quanto é|quanto e)\s*/i, '').replace(/,/g, '.');
    if (/^[\d\s.+\-*/()%]+$/.test(expression)) {
      try {
        const result = Function(`"use strict"; return (${expression})`)();
        if (Number.isFinite(result)) return `O resultado é ${result.toLocaleString('pt-BR')}.`;
      } catch (_) {}
    }
    return 'Não consegui interpretar essa conta. Tente algo como: Calcule 25 * 4.';
  }
  const whatsapp = text.match(/^(?:enviar )?whats(?:app)? para (\+?\d{10,15})\s*:\s*(.+)$/i);
  if (whatsapp) {
    const phone = whatsapp[1].replace(/\D/g, '');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(whatsapp[2])}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    return 'Abri o WhatsApp com a mensagem preparada. Confira o destinatário e toque em enviar por lá.';
  }
  const site = lower.match(/^(?:abrir|acessar)\s+(google|youtube|gmail|wikipedia|wikipédia)$/);
  if (site) {
    const urls = {google:'https://google.com', youtube:'https://youtube.com', gmail:'https://mail.google.com', wikipedia:'https://pt.wikipedia.org', 'wikipédia':'https://pt.wikipedia.org'};
    window.open(urls[site[1]], '_blank', 'noopener,noreferrer');
    return `Abrindo ${site[1]} em uma nova aba.`;
  }
  if (lower.startsWith('pesquisar por ') || lower.startsWith('pesquise ')) {
    const query = text.replace(/^pesquisar por |^pesquise /i, '');
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
    return `Pesquisando na web por “${query}”.`;
  }
  if (lower.includes('obrigad')) return 'Por nada! Estou aqui para ajudar. ✨';
  return 'Ainda estou aprendendo a lidar com esse tipo de pedido. Você pode dizer “ajuda” para ver os comandos disponíveis. Para conversar sobre qualquer assunto com respostas inteligentes, será necessário conectar um serviço de IA a esta interface.';
}

function sendMessage() {
  const text = input.value.trim();
  if (!text) return;
  addMessage(text, 'user');
  input.value = '';
  input.style.height = 'auto';
  // Pequena pausa para a resposta parecer mais natural.
  setTimeout(() => reply(processCommand(text)), 250);
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
});

document.querySelectorAll('[data-prompt]').forEach(button => {
  button.addEventListener('click', () => {
    input.value = button.dataset.prompt;
    sendMessage();
    sidebar.classList.remove('open');
  });
});

document.getElementById('newChatBtn').addEventListener('click', () => {
  messages.replaceChildren();
  welcome.hidden = false;
  sidebar.classList.remove('open');
  input.focus();
});
document.getElementById('menuBtn').addEventListener('click', () => sidebar.classList.toggle('open'));

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'pt-BR';
  recognition.interimResults = false;
  recognition.onresult = event => {
    input.value = event.results[0][0].transcript;
    sendMessage();
  };
  recognition.onerror = () => notify('Não consegui reconhecer sua voz. Tente novamente.');
  recognition.onend = () => micBtn.classList.remove('listening');
  micBtn.addEventListener('click', () => {
    try {
      micBtn.classList.add('listening');
      recognition.start();
      notify('Estou ouvindo...');
    } catch (_) {
      micBtn.classList.remove('listening');
      notify('O microfone já está em uso.');
    }
  });
} else {
  micBtn.addEventListener('click', () => notify('O reconhecimento de voz não é compatível com este navegador. Tente Chrome ou Edge.'));
}
