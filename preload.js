const { contextBridge, ipcRenderer } = require("electron");

const chamar = (canal) => (...args) => ipcRenderer.invoke(canal, ...args);

contextBridge.exposeInMainWorld("yummiko", {
    versao: "1.0.0",

    // Só estas funções ficam visíveis para a página (script.js).
    db: {
        settings: {
            get: chamar("db:settings:get"),
            set: chamar("db:settings:set"),
            all: chamar("db:settings:all")
        },
        commands: {
            list:   chamar("db:commands:list"),
            add:    chamar("db:commands:add"),
            remove: chamar("db:commands:remove")
        },
        reminders: {
            list:         chamar("db:reminders:list"),
            add:          chamar("db:reminders:add"),
            markNotified: chamar("db:reminders:markNotified"),
            remove:       chamar("db:reminders:remove")
        },
        chat: {
            newConversation:    chamar("db:chat:newConversation"),
            addMessage:         chamar("db:chat:addMessage"),
            listConversations:  chamar("db:chat:listConversations"),
            getMessages:        chamar("db:chat:getMessages"),
            deleteConversation: chamar("db:chat:deleteConversation")
        }
    }
});