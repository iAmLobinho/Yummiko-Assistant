const $ = (id) => document.getElementById(id);
const input = $("input"),
  messages = $("messages"),
  welcome = $("welcome");
let voices = [],
  recognition = null,
  listening = false;
let voiceEnabled = localStorage.getItem("yummiko-voice") !== "off";
let customCommands = JSON.parse(
  localStorage.getItem("yummiko-commands") || "[]",
);

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("toast").classList.remove("show"), 2400);
}
function addMessage(text, who) {
  welcome.hidden = true;
  const article = document.createElement("article");
  article.className = `message ${who}`;
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = who === "user" ? "EU" : "✦";
  const content = document.createElement("div");
  content.className = "message-content";
  const name = document.createElement("div");
  name.className = "message-name";
  name.textContent = who === "user" ? "Você" : "Yummiko";
  const body = document.createElement("div");
  body.className = "message-text";
  body.textContent = text;
  content.append(name, body);
  article.append(avatar, content);
  messages.append(article);
  article.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function speak(text) {
  if (!voiceEnabled || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pt-BR";
  utterance.rate = Number($("rate").value);
  utterance.pitch = Number($("pitch").value);
  const selected = $("voiceSelect").value;
  const voice = voices.find((v) => v.name === selected);
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}
function reply(text) {
  addMessage(text, "assistant");
  speak(text);
}
function openUrl(url) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw Error();
    window.open(parsed.href, "_blank", "noopener,noreferrer");
    return true;
  } catch (_) {
    toast("Informe um endereço válido começando com http:// ou https://");
    return false;
  }
}
function findCustomCommand(query) {
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  return customCommands.find(
    (c) => normalized === c.trigger.toLocaleLowerCase("pt-BR"),
  );
}
function runCustom(command) {
  if (command.type === "url") {
    if (openUrl(command.action))
      return `Executando seu comando “${command.trigger}”.`;
  }
  if (command.type === "search") {
    window.open(
      "https://www.google.com/search?q=" + encodeURIComponent(command.action),
      "_blank",
      "noopener,noreferrer",
    );
    return `Pesquisando por: ${command.action}`;
  }
  return command.action;
}
function processCommand(raw) {
  const text = raw.trim(),
    lower = text.toLocaleLowerCase("pt-BR");
  const custom = findCustomCommand(text);
  if (custom) return runCustom(custom);
  if (/^(oi|olá|ola|bom dia|boa tarde|boa noite)\b/.test(lower)) {
    const h = new Date().getHours();
    return `${h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"}! 😊 Estou aqui. O que vamos fazer?`;
  }
  if (lower.includes("que horas") || lower === "horas")
    return `Agora são ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`;
  if (lower.includes("que dia") || lower.includes("data de hoje"))
    return `Hoje é ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.`;
  if (
    lower === "ajuda" ||
    lower.includes("comandos disponíveis") ||
    lower.includes("o que você pode fazer")
  ) {
    return "Posso executar comandos locais e os seus comandos personalizados!\n\n• “Que horas são?” / “Que dia é hoje?”\n• “Calcule 12 * 8”\n• “Pesquisar por gatos”\n• “Abrir YouTube” ou “Abrir Google”\n• “WhatsApp para 5511999999999: Olá!”\n\nCrie comandos próprios no menu lateral. Para WhatsApp, confira a mensagem e envie no WhatsApp aberto. Diga uma frase exatamente igual à que cadastrou para executar seu comando.";
  }
  if (lower.includes("curiosidade")) {
    const facts = [
      "Polvos têm três corações e sangue azulado.",
      "Um dia em Vênus é mais longo que um ano venusiano.",
      "As abelhas podem aprender a reconhecer padrões.",
      "A luz do Sol leva cerca de 8 minutos e 20 segundos para chegar à Terra.",
      "Guardar embalagens de geleia maionese ou manteiga de amendoim viradas de cabeça para baixo ajuda a criar um vácuo parcial na tampa retardando a proliferação de mofo e aumentando a validade."
    ];
    return facts[Math.floor(Math.random() * facts.length)];
  }
  if (
    lower.startsWith("calcule ") ||
    lower.startsWith("quanto é ") ||
    lower.startsWith("quanto e ")
  ) {
    const expression = text
      .replace(/^(calcule|quanto é|quanto e)\s*/i, "")
      .replace(/,/g, ".");
    if (/^[\d\s.+\-*/()%]+$/.test(expression)) {
      try {
        const value = Function('"use strict";return (' + expression + ")")();
        if (Number.isFinite(value))
          return `O resultado é ${value.toLocaleString("pt-BR")}.`;
      } catch (_) {}
    }
    return "Não entendi a conta. Experimente “Calcule 25 * 4”.";
  }
  const wa = text.match(
    /^(?:enviar )?whats(?:app)? para (\+?\d{10,15})\s*:\s*(.+)$/i,
  );
  if (wa) {
    const phone = wa[1].replace(/\D/g, "");
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(wa[2])}`;
    openUrl(url);
    return "Preparei a mensagem no WhatsApp. Confira o contato e toque em enviar no aplicativo. (O envio não é automático.)";
  }
  const site = lower.match(
    /^(?:abrir|acessar|abrir o|open|ir para)\s+(google|youtube|gmail|wikipedia|wikipédia|maps|ifood)$/,
  );
  if (site) {
    const urls = {
      google: "https://google.com",
      youtube: "https://youtube.com",
      gmail: "https://mail.google.com",
      wikipedia: "https://pt.wikipedia.org",
      wikipédia: "https://pt.wikipedia.org",
      maps: "https://maps.google.com",
      ifood: "https://www.ifood.com.br/"
    };
    openUrl(urls[site[1]]);
    return `Abrindo ${site[1]}.`;
  }
  if (lower.startsWith("pesquisar por ") || lower.startsWith("pesquise ")) {
    const query = text.replace(/^pesquisar por |^pesquise /i, "");
    openUrl("https://www.google.com/search?q=" + encodeURIComponent(query));
    return `Pesquisando na web por “${query}”.`;
  }
  if (lower.includes("obrigad"))
    return "Por nada! Sempre que precisar, estarei por aqui. ✨";
  return "Ainda não tenho uma resposta programada para isso. Você pode criar um comando personalizado para essa frase, ou usar “Ajuda” para ver o que consigo fazer.";
}
function send() {
  const text = input.value.trim();
  if (!text) return;
  addMessage(text, "user");
  input.value = "";
  input.style.height = "auto";
  setTimeout(() => reply(processCommand(text)), 250);
}
$("send").addEventListener("click", send);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 150) + "px";
});
document.querySelectorAll("[data-command]").forEach((btn) =>
  btn.addEventListener("click", () => {
    input.value = btn.dataset.command;
    send();
    $("sidebar").classList.remove("open");
  }),
);
$("newChat").addEventListener("click", () => {
  messages.replaceChildren();
  welcome.hidden = false;
  $("sidebar").classList.remove("open");
  input.focus();
});
$("menu").addEventListener("click", () =>
  $("sidebar").classList.toggle("open"),
);

// Speech synthesis voices, voice selection and adjustable speech characteristics.
function loadVoices() {
  voices = speechSynthesis.getVoices();
  const select = $("voiceSelect"),
    previous = select.value;
  select.replaceChildren();
  const pt = voices.filter((v) => v.lang.toLowerCase().startsWith("pt"));
  (pt.length ? pt : voices).forEach((v) => {
    const option = document.createElement("option");
    option.value = v.name;
    option.textContent = `${v.name} — ${v.lang}${v.default ? " (padrão)" : ""}`;
    select.append(option);
  });
  if (previous && [...select.options].some((o) => o.value === previous))
    select.value = previous;
}
if ("speechSynthesis" in window) {
  loadVoices();
  speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
}
$("voiceToggle").classList.toggle("active", voiceEnabled);
$("voiceToggle").addEventListener("click", () => {
  voiceEnabled = !voiceEnabled;
  localStorage.setItem("yummiko-voice", voiceEnabled ? "on" : "off");
  $("voiceToggle").classList.toggle("active", voiceEnabled);
  toast(
    voiceEnabled ? "Resposta por voz ativada" : "Resposta por voz desativada",
  );
  if (!voiceEnabled && "speechSynthesis" in window) speechSynthesis.cancel();
});
$("voiceSettingsOpen").addEventListener("click", () => {
  $("voiceModal").classList.add("show");
  loadVoices();
});
$("rate").addEventListener(
  "input",
  () => ($("rateValue").textContent = Number($("rate").value).toFixed(2) + "×"),
);
$("pitch").addEventListener(
  "input",
  () => ($("pitchValue").textContent = Number($("pitch").value).toFixed(2)),
);
$("testVoice").addEventListener("click", () =>
  speak(
    "Olá! Eu sou a Yummiko, sua assistente virtual. Como posso ajudar você hoje?",
  ),
);

// Speech recognition with graceful support detection.
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "pt-BR";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 3;
  recognition.onstart = () => {
    listening = true;
    $("mic").classList.add("listening");
    toast("Estou ouvindo…");
  };
  recognition.onresult = (e) => {
    let interim = "",
      finalText = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    input.value = finalText || interim;
    if (finalText.trim()) send();
  };
  recognition.onerror = (e) => {
    toast(
      e.error === "not-allowed"
        ? "Permita o acesso ao microfone nas configurações do navegador."
        : "Falha no reconhecimento. Tente yummikomente.",
    );
  };
  recognition.onend = () => {
    listening = false;
    $("mic").classList.remove("listening");
  };
  $("mic").addEventListener("click", () => {
    if (listening) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
    } catch (_) {
      toast("O reconhecimento já está ativo.");
    }
  });
} else {
  $("mic").addEventListener("click", () =>
    toast("Reconhecimento de voz não suportado. Experimente Chrome ou Edge."),
  );
}

// Custom commands CRUD, stored in browser localStorage.
function renderCommands() {
  const list = $("savedCommands");
  list.replaceChildren();
  if (!customCommands.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Nenhum comando salvo ainda.";
    list.append(empty);
    return;
  }
  customCommands.forEach((command, index) => {
    const row = document.createElement("div");
    row.className = "command-row";
    const info = document.createElement("div");
    info.textContent = command.trigger;
    const detail = document.createElement("small");
    detail.textContent =
      (command.type === "url"
        ? "Abrir site"
        : command.type === "search"
          ? "Pesquisa Google"
          : "Resposta") +
      " · " +
      command.action;
    info.append(detail);
    const del = document.createElement("button");
    del.className = "delete-command";
    del.textContent = "Excluir";
    del.addEventListener("click", () => {
      customCommands.splice(index, 1);
      persistCommands();
      renderCommands();
    });
    row.append(info, del);
    list.append(row);
  });
}
function persistCommands() {
  localStorage.setItem("yummiko-commands", JSON.stringify(customCommands));
}
$("customOpen").addEventListener("click", () => {
  $("commandsModal").classList.add("show");
  renderCommands();
});
$("saveCommand").addEventListener("click", () => {
  const trigger = $("trigger").value.trim(),
    action = $("action").value.trim(),
    type = $("actionType").value;
  if (!trigger || !action) {
    toast("Preencha a frase e a ação.");
    return;
  }
  if (
    customCommands.some(
      (c) => c.trigger.toLowerCase() === trigger.toLowerCase(),
    )
  ) {
    toast("Já existe um comando com essa frase.");
    return;
  }
  customCommands.push({ trigger, action, type });
  persistCommands();
  renderCommands();
  $("trigger").value = "";
  $("action").value = "";
  toast("Comando personalizado salvo!");
});
document
  .querySelectorAll("[data-close]")
  .forEach((btn) =>
    btn.addEventListener("click", () =>
      $(btn.dataset.close).classList.remove("show"),
    ),
  );
document.querySelectorAll(".modal-backdrop").forEach((backdrop) =>
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.classList.remove("show");
  }),
);
