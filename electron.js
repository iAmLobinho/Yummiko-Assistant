const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const banco = require("./database");

function criarJanela() {
    const janela = new BrowserWindow({
        width: 1200,
        height: 800,

        minWidth: 900,
        minHeight: 600,
        title: "Yummiko",
        icon: path.join(__dirname, "build", "icon.ico"),
        backgroundColor: "#160d25",
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    janela.loadFile(path.join(__dirname, "frontend", "index.html"));
}

// ---------- Canais IPC (a janela pede, o banco responde) ----------
// Lista de tudo que a interface pode pedir ao banco.
// Nome do canal  ->  função do database.js
const canais = {
    "db:settings:get":            (chave)  => banco.settings.get(chave),
    "db:settings:set":            (c, v)   => banco.settings.set(c, v),
    "db:settings:all":            ()       => banco.settings.all(),

    "db:commands:list":           ()       => banco.commands.list(),
    "db:commands:add":            (dados)  => banco.commands.add(dados),
    "db:commands:remove":         (id)     => banco.commands.remove(id),

    "db:reminders:list":          ()       => banco.reminders.list(),
    "db:reminders:add":           (dados)  => banco.reminders.add(dados),
    "db:reminders:markNotified":  (id)     => banco.reminders.markNotified(id),
    "db:reminders:remove":        (id)     => banco.reminders.remove(id),

    "db:chat:newConversation":    (titulo) => banco.chat.newConversation(titulo),
    "db:chat:addMessage":         (dados)  => banco.chat.addMessage(dados),
    "db:chat:listConversations":  ()       => banco.chat.listConversations(),
    "db:chat:getMessages":        (id)     => banco.chat.getMessages(id),
    "db:chat:deleteConversation": (id)     => banco.chat.deleteConversation(id)
};

app.whenReady().then(() => {
    // O banco fica na pasta de dados do usuário (não se perde ao atualizar o app).
    banco.iniciar(app.getPath("userData"));

    for (const [canal, funcao] of Object.entries(canais)) {
        ipcMain.handle(canal, (_evento, ...args) => funcao(...args));
    }

    criarJanela();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            criarJanela();
        }
    });
});

app.on("before-quit", () => banco.fechar());

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});